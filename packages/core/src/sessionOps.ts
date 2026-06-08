import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type {
  AgentKind,
  AgentSession,
  Evidence,
  QuarantinedSession,
  SessionBackupResult,
  SessionDeleteResult,
  SessionImportResult,
  SessionOperationDatabaseChange,
  SessionOperationFile,
  SessionOperationPlan,
  SessionOperationPlanResult,
  SessionRestoreResult
} from "@agentscope/shared";
import { tableColumns } from "./codex.js";
import { buildSnapshot, findSession } from "./scope.js";
import { claudeHome, codexHome, encodeClaudeProjectPath, normalizeWindowsPath, userHome } from "./paths.js";

export interface SessionOperationOptions {
  home?: string | undefined;
  outputRoot?: string | undefined;
  now?: Date | undefined;
  allowActive?: boolean | undefined;
  includeProcesses?: boolean | undefined;
}

interface OperationDirectories {
  backupDir: string;
  quarantineDir: string;
  journalPath: string;
}

interface DeleteJournalStep {
  at?: string | undefined;
  phase: "backup" | "file" | "patch" | "sqlite_backup" | "sqlite_delete" | "operation";
  action: string;
  status: "started" | "succeeded" | "failed" | "skipped";
  role?: string | undefined;
  path?: string | undefined;
  targetPath?: string | undefined;
  database?: string | undefined;
  table?: string | undefined;
  where?: string | undefined;
  sha256?: string | undefined;
  estimatedRows?: number | undefined;
  detail?: string | undefined;
  error?: string | undefined;
  evidence?: Evidence[] | undefined;
}

interface DeleteJournal extends Record<string, unknown> {
  schemaVersion: 1;
  kind: "AgentScope Session Delete Journal";
  createdAt: string;
  updatedAt: string;
  agent: AgentKind;
  sessionId: string;
  backupDir: string;
  quarantineDir: string;
  journalPath: string;
  steps: DeleteJournalStep[];
}

interface RestoreJournal {
  schemaVersion: 1;
  kind: "AgentScope Session Restore Journal";
  createdAt: string;
  updatedAt: string;
  agent: AgentKind;
  sessionId: string;
  backupDir: string;
  quarantineDir: string;
  journalPath: string;
  restoreJournalPath: string;
  status: "succeeded" | "failed";
  importedFiles: SessionOperationFile[];
  databaseChanges: SessionOperationDatabaseChange[];
  error?: string | undefined;
}

interface CodexDatabaseBundleManifest {
  role: string;
  databaseName: string;
  table: string;
  relativePath: string;
  action: "restore" | "summary";
  rowCount: number;
  sha256?: string | undefined;
}

interface BackupManifest extends Record<string, unknown> {
  schemaVersion: 1;
  kind: "AgentScope Session Backup";
  createdAt: string;
  agent: AgentKind;
  sessionId: string;
  sourceHome: string;
  copiedFiles: Array<Record<string, unknown>>;
  databaseBundles?: CodexDatabaseBundleManifest[] | undefined;
  plan?: unknown;
}

const backupKind = "AgentScope Session Backup";
const deleteJournalKind = "AgentScope Session Delete Journal";
const restoreJournalKind = "AgentScope Session Restore Journal";

export async function planSessionDelete(
  sessionId: string,
  agent?: AgentKind,
  options: SessionOperationOptions = {}
): Promise<SessionOperationPlan> {
  const session = await resolveSession(sessionId, agent, options.home, options.includeProcesses);
  const plan = await buildSessionPlan("delete", session, options);
  plan.notes.push("This plan is a preview. Executing deleteSession writes an AgentScope backup and quarantine journal before row-level deletes, file moves, or reference patches.");
  return plan;
}

export async function writeSessionDeletePlan(
  sessionId: string,
  agent?: AgentKind,
  options: SessionOperationOptions = {}
): Promise<SessionOperationPlanResult> {
  const plan = await planSessionDelete(sessionId, agent, options);
  const root = operationRoot(options);
  const dir = path.join(root, "plans");
  await fs.promises.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${safeStamp(plan.createdAt)}-${plan.agent}-${safeName(plan.sessionId)}-delete-plan.json`);
  await writeJson(filePath, plan);
  const dirs = operationDirectories(plan, options);
  return { plan, path: filePath, backupDir: dirs.backupDir, quarantineDir: dirs.quarantineDir, journalPath: dirs.journalPath };
}

export async function backupSession(
  sessionId: string,
  agent?: AgentKind,
  options: SessionOperationOptions = {}
): Promise<SessionBackupResult> {
  const session = await resolveSession(sessionId, agent, options.home);
  const plan = await buildSessionPlan("backup", session, options);
  const { backupDir } = operationDirectories(plan, options);
  const filesRoot = path.join(backupDir, "files");
  await fs.promises.mkdir(filesRoot, { recursive: true });

  const copiedFiles: SessionOperationFile[] = [];
  const copiedManifestFiles: Array<SessionOperationFile & { backupRelativePath: string }> = [];
  for (const file of plan.files) {
    if (!file.exists || file.action !== "copy") continue;
    const relative = relativeBackupPath(file.path);
    const target = path.join(filesRoot, relative);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    const stat = await fs.promises.stat(file.path);
    if (stat.isDirectory()) {
      await fs.promises.cp(file.path, target, { recursive: true, force: false, errorOnExist: true });
    } else {
      await fs.promises.copyFile(file.path, target);
    }
    const copied = { ...file, sha256: await hashPath(file.path) };
    copiedFiles.push(copied);
    copiedManifestFiles.push({ ...copied, backupRelativePath: relative });
  }

  const databaseBundles = session.agent === "codex" ? await exportCodexDatabaseBundles(session.sessionId, options.home, backupDir) : [];
  const manifestPath = path.join(backupDir, "manifest.json");
  const manifest: BackupManifest = {
    schemaVersion: 1,
    kind: backupKind,
    createdAt: plan.createdAt,
    agent: session.agent,
    sessionId: session.sessionId,
    sourceHome: options.home ?? userHome(),
    copiedFiles: copiedManifestFiles.map((file) => ({ ...file })),
    databaseBundles,
    plan
  };
  await writeJson(manifestPath, manifest);
  return {
    plan: { ...plan, files: copiedFiles },
    backupDir,
    manifestPath,
    copiedFiles,
    databaseBundlePaths: databaseBundles.map((bundle) => path.join(backupDir, bundle.relativePath))
  };
}

export async function deleteSession(
  sessionId: string,
  agent?: AgentKind,
  options: SessionOperationOptions = {}
): Promise<SessionDeleteResult> {
  const session = await resolveSession(sessionId, agent, options.home, options.includeProcesses ?? true);
  const plan = await buildSessionPlan("delete", session, options);
  if (plan.blockers.length && !options.allowActive) {
    throw new Error(plan.blockers.join(" "));
  }
  const { backupDir, quarantineDir, journalPath } = operationDirectories(plan, options);
  await fs.promises.mkdir(quarantineDir, { recursive: true });
  const journal = await createDeleteJournal(plan, backupDir, quarantineDir, journalPath);
  const movedFiles: SessionOperationFile[] = [];
  const patchedFiles: SessionOperationFile[] = [];
  let backup: SessionBackupResult | undefined;
  const databaseChanges: SessionOperationDatabaseChange[] = [];
  try {
    await appendJournalStep(journal, { phase: "backup", action: "backupSession", status: "started", path: backupDir });
    backup = await backupSession(session.sessionId, session.agent, options);
    await appendJournalStep(journal, {
      phase: "backup",
      action: "backupSession",
      status: "succeeded",
      path: backup.manifestPath,
      detail: `Copied ${backup.copiedFiles.length} file(s).`
    });

    if (session.agent === "codex") {
      await backupCodexDatabases(options.home, quarantineDir, journal);
      databaseChanges.push(...applyCodexDatabaseDelete(plan, options.home, journal));
    }

    for (const file of plan.files) {
      if (!file.exists) continue;
      if (file.action === "delete") {
        const target = path.join(quarantineDir, relativeBackupPath(file.path));
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        await appendJournalStep(journal, {
          phase: "file",
          action: "move",
          status: "started",
          role: file.role,
          path: file.path,
          targetPath: target,
          evidence: file.evidence
        });
        await movePath(file.path, target);
        const moved: SessionOperationFile = { ...file, action: "move", sha256: await hashPath(target) };
        movedFiles.push(moved);
        await appendJournalStep(journal, {
          phase: "file",
          action: "move",
          status: "succeeded",
          role: file.role,
          path: file.path,
          targetPath: target,
          sha256: moved.sha256,
          evidence: file.evidence
        });
      } else if (file.action === "patch") {
        await appendJournalStep(journal, {
          phase: "patch",
          action: "patch",
          status: "started",
          role: file.role,
          path: file.path,
          evidence: file.evidence
        });
        const patched = await patchSessionReferenceFile(file, session);
        if (patched) {
          patchedFiles.push(patched);
          await appendJournalStep(journal, {
            phase: "patch",
            action: "patch",
            status: "succeeded",
            role: file.role,
            path: file.path,
            sha256: patched.sha256,
            evidence: patched.evidence
          });
        } else {
          await appendJournalStep(journal, {
            phase: "patch",
            action: "patch",
            status: "skipped",
            role: file.role,
            path: file.path,
            detail: "No exact session reference found to patch.",
            evidence: file.evidence
          });
        }
      }
    }
    return { plan, backup, quarantineDir, journalPath, movedFiles, patchedFiles, databaseChanges };
  } catch (error) {
    await appendJournalStep(journal, {
      phase: "operation",
      action: "deleteSession",
      status: "failed",
      error: error instanceof Error ? error.message : String(error)
    }).catch(() => undefined);
    throw withOperationPaths(error, backupDir, quarantineDir, journalPath);
  }
}

export async function importSessionBackup(
  backupDir: string,
  options: SessionOperationOptions = {}
): Promise<SessionImportResult> {
  const planResult = await planSessionImport(backupDir, options);
  const plan = planResult.plan;
  if (plan.blockers.length) throw new Error(plan.blockers.join(" "));
  const manifest = await readBackupManifest(backupDir);
  const copiedFiles = manifestCopiedFiles(manifest);
  if (!copiedFiles.length) throw new Error("Backup manifest has no copied files to import.");
  const importedFiles: SessionOperationFile[] = [];
  const filesRoot = path.join(backupDir, "files");
  await assertImportTargetsAbsent(copiedFiles);
  if (plan.target) throw new Error("A session with this id already exists locally; delete or archive it before importing.");
  for (const file of copiedFiles) {
    const originalPath = typeof file.path === "string" ? file.path : undefined;
    const backupRelativePath = typeof file.backupRelativePath === "string" ? file.backupRelativePath : undefined;
    if (!originalPath || !backupRelativePath) continue;
    const source = resolveSafeRelative(filesRoot, backupRelativePath);
    if (!(await pathExists(source))) throw new Error(`Backup file is missing: ${source}`);
    const expectedSha = typeof file.sha256 === "string" ? file.sha256 : undefined;
    const actualSha = await hashPath(source);
    if (expectedSha && actualSha && expectedSha !== actualSha) {
      throw new Error(`Backup checksum mismatch: ${source}`);
    }
    await fs.promises.mkdir(path.dirname(originalPath), { recursive: true });
    const stat = await fs.promises.stat(source);
    if (stat.isDirectory()) {
      await fs.promises.cp(source, originalPath, { recursive: true, force: false, errorOnExist: true });
    } else {
      await fs.promises.copyFile(source, originalPath);
    }
    importedFiles.push({
      role: typeof file.role === "string" ? file.role : "backup_file",
      path: originalPath,
      exists: true,
      bytes: stat.isDirectory() ? await directoryBytes(originalPath) : stat.size,
      sha256: await hashPath(originalPath),
      action: "copy",
      evidence: [
        {
          source: "agentscope.backup.import",
          detail: "File restored from AgentScope session backup manifest.",
          path: source
        }
      ]
    });
  }
  const databaseChanges = manifest.agent === "codex" ? importCodexDatabaseBundles(manifest, backupDir, options.home) : [];
  return { plan, backupDir, importedFiles, databaseChanges };
}

export async function listQuarantinedSessions(
  options: SessionOperationOptions = {}
): Promise<QuarantinedSession[]> {
  const quarantineRoot = path.join(operationRoot(options), "quarantine");
  const entries = await fs.promises.readdir(quarantineRoot, { withFileTypes: true }).catch(() => []);
  const items: QuarantinedSession[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const quarantineDir = path.join(quarantineRoot, entry.name);
    const journalPath = path.join(quarantineDir, "journal.json");
    const journal = await readDeleteJournal(journalPath).catch(() => undefined);
    if (!journal) continue;
    items.push(await quarantinedSessionFromJournal(journal, options));
  }
  return items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

export async function planSessionRestore(
  quarantineDirOrJournalPath: string,
  options: SessionOperationOptions = {}
): Promise<SessionOperationPlanResult> {
  const journal = await readQuarantineJournalPath(quarantineDirOrJournalPath, options);
  const restoreJournalPath = restoreJournalPathFor(journal.quarantineDir);
  const importPlanResult = await planSessionImport(journal.backupDir, options);
  const plan: SessionOperationPlan = {
    ...importPlanResult.plan,
    operation: "restore",
    notes: [
      "This restore plan is a preview. Executing restoreQuarantinedSession restores only from a validated AgentScope backup manifest referenced by quarantine/journal.json.",
      "The original quarantine directory is kept for evidence; logs_2.sqlite log bodies are not restored."
    ],
    evidence: [
      ...importPlanResult.plan.evidence,
      {
        source: "agentscope.quarantine.journal",
        detail: "Delete journal links the quarantine entry to the AgentScope backup used for restore.",
        path: journal.journalPath,
        field: "backupDir,quarantineDir,journalPath"
      }
    ],
    blockers: [...importPlanResult.plan.blockers],
    warnings: [...importPlanResult.plan.warnings]
  };
  if (!pathInside(path.join(operationRoot(options), "backups"), journal.backupDir)) {
    plan.blockers.push("Quarantine journal backupDir is outside the AgentScope backups directory.");
  }
  const manifest = await readBackupManifest(journal.backupDir).catch((error) => {
    plan.blockers.push(`Cannot validate restore backup manifest: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  });
  if (manifest && (manifest.agent !== journal.agent || manifest.sessionId !== journal.sessionId)) {
    plan.blockers.push("Quarantine journal and backup manifest refer to different sessions.");
  }
  if (plan.target) {
    plan.blockers.push("A session with this id already exists locally; restore would conflict.");
  }
  if (manifest) {
    for (const file of manifestCopiedFiles(manifest)) {
      const originalPath = typeof file.path === "string" ? file.path : undefined;
      if (originalPath && await pathExists(originalPath)) plan.blockers.push(`Restore target already exists: ${originalPath}`);
    }
  }
  if (await successfulRestoreJournalExists(restoreJournalPath)) {
    plan.blockers.push("This quarantined session already has a successful restore journal.");
  }
  plan.risk = plan.blockers.length ? "blocked" : plan.warnings.length ? "caution" : "safe";
  const outputDir = path.join(operationRoot(options), "plans");
  await fs.promises.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${safeStamp(plan.createdAt)}-${plan.agent}-${safeName(plan.sessionId)}-restore-plan.json`);
  await writeJson(outputPath, plan);
  return {
    plan,
    path: outputPath,
    backupDir: journal.backupDir,
    quarantineDir: journal.quarantineDir,
    journalPath: journal.journalPath,
    restoreJournalPath
  };
}

export async function restoreQuarantinedSession(
  quarantineDirOrJournalPath: string,
  options: SessionOperationOptions = {}
): Promise<SessionRestoreResult> {
  let journal: DeleteJournal | undefined;
  let restoreJournalPath: string | undefined;
  try {
    journal = await readQuarantineJournalPath(quarantineDirOrJournalPath, options);
    restoreJournalPath = restoreJournalPathFor(journal.quarantineDir);
    const planResult = await planSessionRestore(journal.journalPath, options);
    if (planResult.plan.blockers.length) throw new Error(planResult.plan.blockers.join(" "));
    const imported = await importSessionBackup(journal.backupDir, options);
    const databaseChanges = imported.databaseChanges ?? [];
    const restoreJournal: RestoreJournal = {
      schemaVersion: 1,
      kind: restoreJournalKind,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      agent: journal.agent,
      sessionId: journal.sessionId,
      backupDir: journal.backupDir,
      quarantineDir: journal.quarantineDir,
      journalPath: journal.journalPath,
      restoreJournalPath,
      status: "succeeded",
      importedFiles: imported.importedFiles,
      databaseChanges
    };
    await writeJson(restoreJournalPath, restoreJournal);
    return {
      plan: { ...planResult.plan, mode: "execute" },
      backupDir: journal.backupDir,
      quarantineDir: journal.quarantineDir,
      journalPath: journal.journalPath,
      restoreJournalPath,
      importedFiles: imported.importedFiles,
      databaseChanges
    };
  } catch (error) {
    if (journal) {
      restoreJournalPath ??= restoreJournalPathFor(journal.quarantineDir);
      const failedJournal: RestoreJournal = {
        schemaVersion: 1,
        kind: restoreJournalKind,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        agent: journal.agent,
        sessionId: journal.sessionId,
        backupDir: journal.backupDir,
        quarantineDir: journal.quarantineDir,
        journalPath: journal.journalPath,
        restoreJournalPath,
        status: "failed",
        importedFiles: [],
        databaseChanges: [],
        error: error instanceof Error ? error.message : String(error)
      };
      await writeJson(restoreJournalPath, failedJournal).catch(() => undefined);
      throw withRestoreOperationPaths(error, journal.backupDir, journal.quarantineDir, journal.journalPath, restoreJournalPath);
    }
    throw error;
  }
}

export async function planSessionImport(
  backupDir: string,
  options: SessionOperationOptions = {}
): Promise<SessionOperationPlanResult> {
  const manifestPath = path.join(backupDir, "manifest.json");
  const createdAt = (options.now ?? new Date()).toISOString();
  const warnings: string[] = [];
  const blockers: string[] = [];
  let agent: AgentKind = "unknown";
  let sessionId = path.basename(backupDir);
  let target: AgentSession | undefined;
  let manifest: Record<string, unknown> | undefined;

  try {
    manifest = JSON.parse(await fs.promises.readFile(manifestPath, "utf8")) as Record<string, unknown>;
    try {
      validateBackupManifest(manifest);
      agent = manifest.agent;
      sessionId = manifest.sessionId;
    } catch (error) {
      blockers.push(error instanceof Error ? error.message : String(error));
      agent = asAgent(manifest.agent) ?? "unknown";
      sessionId = typeof manifest.sessionId === "string" ? manifest.sessionId : sessionId;
    }
  } catch (error) {
    blockers.push(`Cannot read backup manifest: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (agent !== "unknown") {
    target = await resolveSession(sessionId, agent, options.home).catch(() => undefined);
    if (target) warnings.push("A session with this id already exists locally; import would conflict without a replace workflow.");
  }

  const files = await listBackupFiles(backupDir);
  const plan: SessionOperationPlan = {
    schemaVersion: 1,
    operation: "import",
    mode: "dry-run",
    risk: blockers.length ? "blocked" : warnings.length ? "caution" : "safe",
    agent,
    sessionId,
    createdAt,
    target,
    files,
    databaseChanges: importDatabasePlan(agent, sessionId, options.home),
    warnings,
    blockers,
    notes: [
      "This import plan is a preview. Executing importSessionBackup restores copied files from a validated AgentScope backup when targets do not already exist.",
      "Authentication, settings, and global history are never imported from a session backup."
    ],
    evidence: [
      {
        source: "agentscope.backup.manifest",
        detail: manifest ? "Backup manifest loaded for import planning." : "Backup manifest was missing or unreadable.",
        path: manifestPath
      }
    ],
    backupRequiredBeforeExecute: false
  };
  const outputDir = path.join(operationRoot(options), "plans");
  await fs.promises.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${safeStamp(createdAt)}-${agent}-${safeName(sessionId)}-import-plan.json`);
  await writeJson(outputPath, plan);
  return { plan, path: outputPath };
}

export async function researchLocalAgentStores(home = userHome()): Promise<Record<string, unknown>> {
  const codexRoot = codexHome(home);
  const claudeRoot = claudeHome(home);
  return {
    createdAt: new Date().toISOString(),
    home,
    codex: await describeTree(codexRoot, 2),
    claude: await describeTree(claudeRoot, 2),
    safety: {
      neverDelete: [
        path.join(codexRoot, "auth.json"),
        path.join(codexRoot, "config.toml"),
        path.join(codexRoot, "installation_id"),
        path.join(codexRoot, ".sandbox-secrets"),
        path.join(claudeRoot, ".credentials.json"),
        path.join(claudeRoot, "settings.json"),
        path.join(claudeRoot, "settings.local.json")
      ],
      destructiveActions: "AgentScope blocks active or child sessions by default; delete writes a backup, quarantine journal, row-level SQLite changes, and quarantined files."
    }
  };
}

async function buildSessionPlan(
  operation: "backup" | "delete",
  session: AgentSession,
  options: SessionOperationOptions
): Promise<SessionOperationPlan> {
  const createdAt = (options.now ?? new Date()).toISOString();
  const files = await discoverSessionFiles(session, options.home, operation);
  const databaseChanges = databasePlanForSession(session, options.home, operation);
  const blockers = operation === "delete" ? activeSessionBlockers(session) : [];
  const warnings = riskWarnings(session, operation);
  const notes = operation === "backup" ? backupNotes(session.agent) : deleteNotes(session.agent);
  return {
    schemaVersion: 1,
    operation,
    mode: operation === "backup" ? "execute" : "dry-run",
    risk: blockers.length ? "blocked" : warnings.length ? "caution" : "safe",
    agent: session.agent,
    sessionId: session.sessionId,
    createdAt,
    target: session,
    files,
    databaseChanges,
    warnings,
    blockers,
    notes,
    evidence: [
      {
        source: "agentscope.session.operation",
        detail: "Operation plan built from AgentScope unified session model.",
        field: "agent,sessionId,transcriptPath,indexSource,evidence"
      },
      ...session.evidence
    ],
    backupRequiredBeforeExecute: operation === "delete"
  };
}

async function resolveSession(
  sessionId: string,
  agent?: AgentKind,
  home?: string,
  includeProcesses = false
): Promise<AgentSession> {
  const snapshot = await buildSnapshot(home, includeProcesses);
  const exact = findSession(snapshot, sessionId, agent);
  if (exact) return exact;
  const lowered = sessionId.toLowerCase();
  const loose = snapshot.sessions.find(
    (session) => session.sessionId.toLowerCase().includes(lowered) && (!agent || session.agent === agent)
  );
  if (loose) return loose;
  throw new Error(`Session not found: ${agent ? `${agent}:` : ""}${sessionId}`);
}

async function discoverSessionFiles(
  session: AgentSession,
  home: string | undefined,
  operation: "backup" | "delete"
): Promise<SessionOperationFile[]> {
  const root = home ?? userHome();
  const action: SessionOperationFile["action"] = operation === "backup" ? "copy" : "delete";
  const files: SessionOperationFile[] = [];
  const add = async (
    role: string,
    filePath: string | undefined,
    evidence: Evidence[],
    overrideAction: SessionOperationFile["action"] = action
  ): Promise<void> => {
    if (!filePath) return;
    const normalized = normalizeWindowsPath(filePath) ?? filePath;
    files.push(await fileEntry(role, normalized, overrideAction, evidence));
  };

  await add("transcript", session.transcriptPath, [
    compactEvidence({
      source: "agentscope.session.transcriptPath",
      detail: "Transcript path from unified session model.",
      path: session.transcriptPath,
      field: "transcriptPath"
    })
  ]);

  if (session.agent === "claude") {
    const claudeRoot = claudeHome(root);
    await add("claude.active_session_pid_map", await findClaudePidMap(claudeRoot, session.sessionId), [
      {
        source: "claude.sessions",
        detail: "Claude PID/session map references this session id.",
        field: "sessionId,pid,cwd"
      }
    ]);
    await add("claude.session_sidecar", claudeSidecarPath(claudeRoot, session), [
      {
        source: "claude.projects.sidecar",
        detail: "Claude per-session directory may contain tool results and subagent transcripts.",
        field: "projects/<encoded-cwd>/<sessionId>"
      }
    ]);
    await add("claude.file_history", path.join(claudeRoot, "file-history", session.sessionId), [
      {
        source: "claude.file-history",
        detail: "Claude file history is keyed by session id.",
        field: "file-history/<sessionId>"
      }
    ]);
    await add("claude.session_env", path.join(claudeRoot, "session-env", session.sessionId), [
      {
        source: "claude.session-env",
        detail: "Claude session environment snapshots may be keyed by session id.",
        field: "session-env/<sessionId>"
      }
    ]);
    await add("claude.image_cache", path.join(claudeRoot, "image-cache", session.sessionId), [
      {
        source: "claude.image-cache",
        detail: "Claude image cache can be keyed by session id when image artifacts exist.",
        field: "image-cache/<sessionId>"
      }
    ]);
    await add("claude.history_jsonl_patch", path.join(claudeRoot, "history.jsonl"), [
      {
        source: "claude.history",
        detail: "Claude history may contain rows with this session id; delete/import edits must be line-filter patches.",
        field: "sessionId"
      }
    ], operation === "backup" ? "inspect" : "patch");
    await add("claude.global_state_patch", path.join(root, ".claude.json"), [
      {
        source: "claude.global-state",
        detail: "Claude global project state may contain lastSessionId references.",
        field: "lastSessionId"
      }
    ], operation === "backup" ? "inspect" : "patch");
    await add("claude.daemon_roster_patch", path.join(claudeRoot, "daemon", "roster.json"), [
      {
        source: "claude.daemon.roster",
        detail: "Claude daemon roster may contain worker references for this session.",
        field: "workers.*.sessionId"
      }
    ], operation === "backup" ? "inspect" : "patch");
    for (const jobPath of await findClaudeJobStateFiles(claudeRoot, session.sessionId)) {
      await add("claude.job_state", jobPath, [
        {
          source: "claude.jobs",
          detail: "Claude job state references this session id or resume session id.",
          path: jobPath,
          field: "sessionId,resumeSessionId"
        }
      ]);
    }
  }

  if (session.agent === "codex") {
    const codexRoot = codexHome(root);
    await add("codex.state_threads", path.join(codexRoot, "state_5.sqlite"), [
      {
        source: "codex.sqlite.threads",
        detail: "Codex thread row and spawn edges are indexed in state_5.sqlite.",
        field: "threads.id,thread_spawn_edges.parent_thread_id,thread_spawn_edges.child_thread_id"
      }
    ], "inspect");
    await add("codex.logs_metadata", path.join(codexRoot, "logs_2.sqlite"), [
      {
        source: "codex.sqlite.logs",
        detail: "Codex logs may contain rows keyed by thread_id; default backup does not copy global log bodies.",
        field: "logs.thread_id"
      }
    ], "inspect");
    await add("codex.history_jsonl_reference", path.join(codexRoot, "history.jsonl"), [
      {
        source: "codex.history",
        detail: "Codex history is global and may contain session references; delete should not remove it blindly.",
        field: "session_id"
      }
    ], "inspect");
  }

  return dedupeFiles(files);
}

function databasePlanForSession(
  session: AgentSession,
  home: string | undefined,
  operation: "backup" | "delete"
): SessionOperationDatabaseChange[] {
  if (session.agent === "codex") {
    const root = codexHome(home);
    const action = operation === "delete" ? "delete" : "inspect";
    return [
      dbChange(path.join(root, "state_5.sqlite"), "threads", `id = ${jsonQuote(session.sessionId)}`, action, "codex.sqlite.threads"),
      dbChange(
        path.join(root, "state_5.sqlite"),
        "thread_spawn_edges",
        `parent_thread_id = ${jsonQuote(session.sessionId)} OR child_thread_id = ${jsonQuote(session.sessionId)}`,
        action,
        "codex.sqlite.thread_spawn_edges"
      ),
      dbChange(path.join(root, "state_5.sqlite"), "thread_dynamic_tools", `thread_id = ${jsonQuote(session.sessionId)}`, action, "codex.sqlite.thread_dynamic_tools"),
      dbChange(path.join(root, "logs_2.sqlite"), "logs", `thread_id = ${jsonQuote(session.sessionId)}`, operation === "delete" ? "skip" : "inspect", "codex.sqlite.logs"),
      dbChange(path.join(root, "goals_1.sqlite"), "thread_goals", `thread_id = ${jsonQuote(session.sessionId)}`, action, "codex.sqlite.goals"),
      dbChange(path.join(root, "memories_1.sqlite"), "stage1_outputs", `thread_id = ${jsonQuote(session.sessionId)}`, action, "codex.sqlite.memories")
    ];
  }
  if (session.agent === "claude") {
    return [
      dbChange(path.join(claudeHome(home), "history.jsonl"), "jsonl_lines", `sessionId = ${jsonQuote(session.sessionId)}`, operation === "delete" ? "update" : "inspect", "claude.history"),
      dbChange(path.join(home ?? userHome(), ".claude.json"), "json_fields", `value = ${jsonQuote(session.sessionId)}`, operation === "delete" ? "update" : "inspect", "claude.global-state")
    ];
  }
  return [];
}

function importDatabasePlan(agent: AgentKind, sessionId: string, home: string | undefined): SessionOperationDatabaseChange[] {
  if (agent === "codex") {
    const root = codexHome(home);
    return [
      dbChange(path.join(root, "state_5.sqlite"), "threads", `id = ${jsonQuote(sessionId)}`, "insert", "agentscope.import.codex"),
      dbChange(path.join(root, "state_5.sqlite"), "thread_spawn_edges", `parent/child references ${jsonQuote(sessionId)}`, "insert", "agentscope.import.codex"),
      dbChange(path.join(root, "state_5.sqlite"), "thread_dynamic_tools", `thread_id = ${jsonQuote(sessionId)}`, "insert", "agentscope.import.codex"),
      dbChange(path.join(root, "goals_1.sqlite"), "thread_goals", `thread_id = ${jsonQuote(sessionId)}`, "insert", "agentscope.import.codex"),
      dbChange(path.join(root, "memories_1.sqlite"), "stage1_outputs", `thread_id = ${jsonQuote(sessionId)}`, "insert", "agentscope.import.codex"),
      dbChange(path.join(root, "logs_2.sqlite"), "logs", `thread_id = ${jsonQuote(sessionId)}`, "skip", "agentscope.import.codex")
    ];
  }
  if (agent === "claude") {
    const root = claudeHome(home);
    return [
      dbChange(path.join(root, "projects"), "jsonl_files", `filename = ${jsonQuote(`${sessionId}.jsonl`)}`, "insert", "agentscope.import.claude"),
      dbChange(path.join(root, "history.jsonl"), "jsonl_lines", `sessionId = ${jsonQuote(sessionId)}`, "skip", "agentscope.import.claude")
    ];
  }
  return [];
}

function dbChange(
  database: string,
  table: string,
  where: string,
  action: SessionOperationDatabaseChange["action"],
  source: string
): SessionOperationDatabaseChange {
  return {
    database,
    table,
    where,
    action,
    evidence: [
      {
        source,
        detail: "Database or structured file change is represented as a plan item only.",
        path: database,
        field: `${table}:${where}`
      }
    ]
  };
}

async function fileEntry(
  role: string,
  filePath: string,
  action: SessionOperationFile["action"],
  evidence: Evidence[]
): Promise<SessionOperationFile> {
  try {
    const stat = await fs.promises.stat(filePath);
    return { role, path: filePath, exists: true, bytes: stat.isDirectory() ? await directoryBytes(filePath) : stat.size, action, evidence };
  } catch {
    return { role, path: filePath, exists: false, action: "skip", evidence };
  }
}

async function findClaudePidMap(claudeRoot: string, sessionId: string): Promise<string | undefined> {
  const sessionsDir = path.join(claudeRoot, "sessions");
  try {
    const entries = await fs.promises.readdir(sessionsDir);
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const filePath = path.join(sessionsDir, entry);
      try {
        const payload = JSON.parse(await fs.promises.readFile(filePath, "utf8")) as Record<string, unknown>;
        if (payload.sessionId === sessionId) return filePath;
      } catch {
        continue;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function findClaudeJobStateFiles(claudeRoot: string, sessionId: string): Promise<string[]> {
  const jobsDir = path.join(claudeRoot, "jobs");
  const out: string[] = [];
  const entries = await fs.promises.readdir(jobsDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const statePath = path.join(jobsDir, entry.name, "state.json");
    try {
      const payload = JSON.parse(await fs.promises.readFile(statePath, "utf8")) as Record<string, unknown>;
      if (payload.sessionId === sessionId || payload.resumeSessionId === sessionId) out.push(statePath);
    } catch {
      continue;
    }
  }
  return out;
}

function claudeSidecarPath(claudeRoot: string, session: AgentSession): string | undefined {
  if (session.cwd) return path.join(claudeRoot, "projects", encodeClaudeProjectPath(session.cwd), session.sessionId);
  if (session.transcriptPath) return path.join(path.dirname(session.transcriptPath), session.sessionId);
  return undefined;
}

function activeSessionBlockers(session: AgentSession): string[] {
  const blockers: string[] = [];
  if (session.childSessionIds.length > 0) {
    blockers.push("Session has child sessions; destructive operations are blocked until an explicit include-children or detach workflow exists.");
  }
  const hasHeuristicActiveProcess = session.agent === "codex" && session.evidence.some((item) => item.source === "process.heuristic");
  const hasExactActivePid =
    session.pid !== undefined &&
    !hasHeuristicActiveProcess &&
    (session.processName !== undefined ||
      session.commandLine !== undefined ||
      session.path !== undefined ||
      session.evidence.some((item) => item.source === "process.match" && item.detail.includes("Active process matched")));
  if (hasExactActivePid) {
    blockers.push(`Session has an exact active PID mapping (${session.pid}); destructive operations must wait until the process exits.`);
  } else if (hasHeuristicActiveProcess) {
    blockers.push(`Session is attached to a high-confidence active Codex process candidate (${session.pid}); destructive operations are blocked because Codex PID-to-thread mapping is heuristic.`);
  }
  return blockers;
}

function riskWarnings(session: AgentSession, operation: "backup" | "delete"): string[] {
  const warnings: string[] = [];
  if (session.agent === "codex") {
    warnings.push("Codex has no reliable PID-to-thread exact map yet; process links may be heuristic.");
    if (operation === "delete") warnings.push("Codex SQLite writes use internal tables; delete backs up databases and journals each row-level step before quarantining files.");
  }
  if (session.agent === "claude" && operation === "delete") {
    warnings.push("Claude history, daemon, job, and global-state sidecars may reference the session; delete patches only exact session-id references and journals the result.");
  }
  if (operation === "backup" && session.pid !== undefined) {
    warnings.push("The session appears active; backup is point-in-time and may not include writes that happen after copying starts.");
  }
  if (!session.transcriptPath) warnings.push("No transcript path is indexed for this session.");
  return warnings;
}

async function patchSessionReferenceFile(
  file: SessionOperationFile,
  session: AgentSession
): Promise<SessionOperationFile | undefined> {
  if (file.role === "claude.history_jsonl_patch") {
    return patchJsonlLinesBySessionId(file, session.sessionId);
  }
  if (file.role === "claude.global_state_patch") {
    return patchClaudeGlobalState(file, session.sessionId);
  }
  if (file.role === "claude.daemon_roster_patch") {
    return patchClaudeDaemonRoster(file, session.sessionId);
  }
  return undefined;
}

async function patchJsonlLinesBySessionId(
  file: SessionOperationFile,
  sessionId: string
): Promise<SessionOperationFile | undefined> {
  const original = await fs.promises.readFile(file.path, "utf8");
  const lines = original.split(/\r?\n/);
  const kept: string[] = [];
  let removed = 0;
  for (const line of lines) {
    if (!line.trim()) {
      kept.push(line);
      continue;
    }
    try {
      const value = JSON.parse(line) as Record<string, unknown>;
      if (value.sessionId === sessionId || value.session_id === sessionId) {
        removed += 1;
        continue;
      }
    } catch {
      // Keep malformed lines; destructive cleanup must not drop data it cannot parse.
    }
    kept.push(line);
  }
  if (!removed) return undefined;
  await writePatchBackup(file.path, original);
  await fs.promises.writeFile(file.path, kept.join("\n"), "utf8");
  return {
    ...file,
    action: "patch",
    sha256: await hashPath(file.path),
    evidence: [
      ...file.evidence,
      {
        source: "agentscope.delete.patch",
        detail: `Removed ${removed} JSONL line(s) referencing this session id.`,
        path: file.path,
        field: "sessionId"
      }
    ]
  };
}

async function patchClaudeGlobalState(
  file: SessionOperationFile,
  sessionId: string
): Promise<SessionOperationFile | undefined> {
  const original = await fs.promises.readFile(file.path, "utf8");
  let payload: unknown;
  try {
    payload = JSON.parse(original) as unknown;
  } catch {
    return undefined;
  }
  const removed = removeMatchingJsonValues(payload, sessionId);
  if (!removed) return undefined;
  await writePatchBackup(file.path, original);
  await writeJson(file.path, payload);
  return patchedFile(file, `Removed ${removed} JSON field(s) equal to the session id.`, "lastSessionId");
}

async function patchClaudeDaemonRoster(
  file: SessionOperationFile,
  sessionId: string
): Promise<SessionOperationFile | undefined> {
  const original = await fs.promises.readFile(file.path, "utf8");
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(original) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  const workers = objectValue(payload.workers);
  if (!workers) return undefined;
  let removed = 0;
  for (const [key, worker] of Object.entries(workers)) {
    const workerObject = objectValue(worker);
    const dispatch = objectValue(workerObject?.dispatch);
    if (workerObject?.sessionId === sessionId || dispatch?.sessionId === sessionId) {
      delete workers[key];
      removed += 1;
    }
  }
  if (!removed) return undefined;
  await writePatchBackup(file.path, original);
  await writeJson(file.path, payload);
  return patchedFile(file, `Removed ${removed} daemon worker reference(s) for this session id.`, "workers.*.sessionId");
}

function applyCodexDatabaseDelete(
  plan: SessionOperationPlan,
  home: string | undefined,
  journal?: DeleteJournal | undefined
): SessionOperationDatabaseChange[] {
  const root = codexHome(home);
  const applied: SessionOperationDatabaseChange[] = [];
  const statePath = path.join(root, "state_5.sqlite");
  const stateDb = openWritableDb(statePath);
  if (stateDb) {
    try {
      const db = stateDb;
      db.pragma("busy_timeout = 5000");
      db.pragma("foreign_keys = ON");
      const transaction = db.transaction(() => {
        if (plannedDbAction(plan, statePath, "thread_spawn_edges") === "delete") {
          applied.push(deleteRows(db, statePath, "thread_spawn_edges", "parent_thread_id = ? OR child_thread_id = ?", [plan.sessionId, plan.sessionId], "codex.sqlite.thread_spawn_edges"));
        }
        if (plannedDbAction(plan, statePath, "thread_dynamic_tools") === "delete") {
          applied.push(deleteRows(db, statePath, "thread_dynamic_tools", "thread_id = ?", [plan.sessionId], "codex.sqlite.thread_dynamic_tools"));
        }
        if (plannedDbAction(plan, statePath, "threads") === "delete") {
          applied.push(deleteRows(db, statePath, "threads", "id = ?", [plan.sessionId], "codex.sqlite.threads"));
        }
      });
      appendJournalStepSync(journal, { phase: "sqlite_delete", action: "transaction", status: "started", database: statePath });
      transaction();
      appendJournalStepSync(journal, { phase: "sqlite_delete", action: "transaction", status: "succeeded", database: statePath });
    } catch (error) {
      appendJournalStepSync(journal, {
        phase: "sqlite_delete",
        action: "transaction",
        status: "failed",
        database: statePath,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    } finally {
      stateDb.close();
    }
  }
  for (const [dbName, table, where, source] of [
    ["goals_1.sqlite", "thread_goals", "thread_id = ?", "codex.sqlite.goals"],
    ["memories_1.sqlite", "stage1_outputs", "thread_id = ?", "codex.sqlite.memories"]
  ] as const) {
    const dbPath = path.join(root, dbName);
    const db = openWritableDb(dbPath);
    if (!db) continue;
    try {
      db.pragma("busy_timeout = 5000");
      if (plannedDbAction(plan, dbPath, table) !== "delete") continue;
      appendJournalStepSync(journal, { phase: "sqlite_delete", action: "transaction", status: "started", database: dbPath, table });
      const transaction = db.transaction(() => {
        applied.push(deleteRows(db, dbPath, table, where, [plan.sessionId], source));
      });
      transaction();
      appendJournalStepSync(journal, { phase: "sqlite_delete", action: "transaction", status: "succeeded", database: dbPath, table });
    } catch (error) {
      appendJournalStepSync(journal, {
        phase: "sqlite_delete",
        action: "transaction",
        status: "failed",
        database: dbPath,
        table,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    } finally {
      db.close();
    }
  }
  const result = applied.filter((change) => change.estimatedRows !== 0);
  for (const change of result) {
    appendJournalStepSync(journal, {
      phase: "sqlite_delete",
      action: change.action,
      status: change.action === "skip" ? "skipped" : "succeeded",
      database: change.database,
      table: change.table,
      where: change.where,
      estimatedRows: change.estimatedRows,
      evidence: change.evidence
    });
  }
  return result;
}

async function backupCodexDatabases(home: string | undefined, quarantineDir: string, journal?: DeleteJournal | undefined): Promise<void> {
  const root = codexHome(home);
  const backupDir = path.join(quarantineDir, "sqlite-backup");
  await fs.promises.mkdir(backupDir, { recursive: true });
  for (const name of ["state_5.sqlite", "goals_1.sqlite", "memories_1.sqlite", "logs_2.sqlite"]) {
    const source = path.join(root, name);
    for (const suffix of ["", "-wal", "-shm"]) {
      const candidate = `${source}${suffix}`;
      if (!(await pathExists(candidate))) continue;
      const target = path.join(backupDir, `${name}${suffix}`);
      await appendJournalStep(journal, {
        phase: "sqlite_backup",
        action: "copy",
        status: "started",
        path: candidate,
        targetPath: target
      });
      await fs.promises.copyFile(candidate, target);
      await appendJournalStep(journal, {
        phase: "sqlite_backup",
        action: "copy",
        status: "succeeded",
        path: candidate,
        targetPath: target,
        sha256: await hashPath(target)
      });
    }
  }
}

function deleteRows(
  db: Database.Database,
  dbPath: string,
  table: string,
  where: string,
  params: unknown[],
  source: string
): SessionOperationDatabaseChange {
  const columns = tableColumns(db, table);
  if (!columns.size) return dbChange(dbPath, table, where, "skip", source);
  if (!whereColumnsExist(columns, where)) return dbChange(dbPath, table, where, "skip", source);
  const before = countRows(db, table, where, params);
  if (before > 0) db.prepare(`DELETE FROM ${quoteIdentifier(table)} WHERE ${where}`).run(...params);
  return {
    ...dbChange(dbPath, table, where, "delete", source),
    estimatedRows: before
  };
}

function whereColumnsExist(columns: Set<string>, where: string): boolean {
  const matches = where.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*=/g);
  for (const match of matches) {
    const column = match[1];
    if (column && !columns.has(column)) return false;
  }
  return true;
}

function plannedDbAction(
  plan: SessionOperationPlan,
  dbPath: string,
  table: string
): SessionOperationDatabaseChange["action"] | undefined {
  const normalizedDbPath = path.resolve(dbPath).toLowerCase();
  return plan.databaseChanges.find(
    (change) => path.resolve(change.database).toLowerCase() === normalizedDbPath && change.table === table
  )?.action;
}

function operationDirectories(plan: SessionOperationPlan, options: SessionOperationOptions): OperationDirectories {
  const name = `${safeStamp(plan.createdAt)}-${plan.agent}-${safeName(plan.sessionId)}`;
  const root = operationRoot(options);
  const backupDir = path.join(root, "backups", name);
  const quarantineDir = path.join(root, "quarantine", name);
  return {
    backupDir,
    quarantineDir,
    journalPath: path.join(quarantineDir, "journal.json")
  };
}

async function createDeleteJournal(
  plan: SessionOperationPlan,
  backupDir: string,
  quarantineDir: string,
  journalPath: string
): Promise<DeleteJournal> {
  const journal: DeleteJournal = {
    schemaVersion: 1,
    kind: deleteJournalKind,
    createdAt: plan.createdAt,
    updatedAt: plan.createdAt,
    agent: plan.agent,
    sessionId: plan.sessionId,
    backupDir,
    quarantineDir,
    journalPath,
    steps: []
  };
  await writeJson(journalPath, journal);
  return journal;
}

async function appendJournalStep(journal: DeleteJournal | undefined, step: DeleteJournalStep): Promise<void> {
  if (!journal) return;
  journal.updatedAt = new Date().toISOString();
  journal.steps.push({ ...step, at: step.at ?? journal.updatedAt });
  await writeJson(journal.journalPath, journal);
}

function appendJournalStepSync(journal: DeleteJournal | undefined, step: DeleteJournalStep): void {
  if (!journal) return;
  journal.updatedAt = new Date().toISOString();
  journal.steps.push({ ...step, at: step.at ?? journal.updatedAt });
  fs.mkdirSync(path.dirname(journal.journalPath), { recursive: true });
  fs.writeFileSync(journal.journalPath, `${JSON.stringify(journal, null, 2)}\n`, "utf8");
}

function withOperationPaths(
  error: unknown,
  backupDir: string,
  quarantineDir: string,
  journalPath: string
): Error {
  const message = error instanceof Error ? error.message : String(error);
  const wrapped = new Error(`${message} backupDir=${backupDir} quarantineDir=${quarantineDir} journalPath=${journalPath}`);
  if (error instanceof Error && error.stack) wrapped.stack = error.stack;
  return wrapped;
}

function withRestoreOperationPaths(
  error: unknown,
  backupDir: string,
  quarantineDir: string,
  journalPath: string,
  restoreJournalPath: string
): Error {
  const message = error instanceof Error ? error.message : String(error);
  const wrapped = new Error(
    `${message} backupDir=${backupDir} quarantineDir=${quarantineDir} journalPath=${journalPath} restoreJournalPath=${restoreJournalPath}`
  );
  if (error instanceof Error && error.stack) wrapped.stack = error.stack;
  return wrapped;
}

async function readQuarantineJournalPath(
  quarantineDirOrJournalPath: string,
  options: SessionOperationOptions
): Promise<DeleteJournal> {
  const root = path.join(operationRoot(options), "quarantine");
  const stat = await fs.promises.stat(quarantineDirOrJournalPath).catch(() => undefined);
  const journalPath = stat?.isDirectory()
    ? path.join(quarantineDirOrJournalPath, "journal.json")
    : quarantineDirOrJournalPath;
  if (!pathInside(root, journalPath)) throw new Error("Restore is limited to AgentScope quarantine journals.");
  const journal = await readDeleteJournal(journalPath);
  if (!pathInside(root, journal.quarantineDir)) throw new Error("Delete journal quarantineDir is outside the AgentScope quarantine directory.");
  if (!samePath(journal.journalPath, journalPath)) throw new Error("Delete journal path does not match the selected quarantine journal.");
  return journal;
}

async function readDeleteJournal(journalPath: string): Promise<DeleteJournal> {
  const parsed = JSON.parse(await fs.promises.readFile(journalPath, "utf8")) as Record<string, unknown>;
  validateDeleteJournal(parsed, journalPath);
  return parsed;
}

function validateDeleteJournal(journal: Record<string, unknown>, journalPath: string): asserts journal is DeleteJournal {
  if (journal.schemaVersion !== 1) throw new Error("Delete journal has an unsupported schema version.");
  if (journal.kind !== deleteJournalKind) throw new Error("Journal is not an AgentScope delete journal.");
  const agent = asAgent(journal.agent);
  if (!agent) throw new Error("Delete journal does not contain a supported agent.");
  if (typeof journal.sessionId !== "string" || !journal.sessionId.trim()) throw new Error("Delete journal is missing a session id.");
  if (typeof journal.backupDir !== "string" || !journal.backupDir.trim()) throw new Error("Delete journal is missing backupDir.");
  if (typeof journal.quarantineDir !== "string" || !journal.quarantineDir.trim()) throw new Error("Delete journal is missing quarantineDir.");
  if (typeof journal.journalPath !== "string" || !journal.journalPath.trim()) journal.journalPath = journalPath;
  if (!Array.isArray(journal.steps)) throw new Error("Delete journal steps must be an array.");
}

async function quarantinedSessionFromJournal(
  journal: DeleteJournal,
  options: SessionOperationOptions
): Promise<QuarantinedSession> {
  const warnings: string[] = [];
  const blockers: string[] = [];
  let manifest: BackupManifest | undefined;
  const backupRoot = path.join(operationRoot(options), "backups");
  if (!pathInside(backupRoot, journal.backupDir)) {
    blockers.push("Quarantine journal backupDir is outside the AgentScope backups directory.");
  }
  try {
    manifest = await readBackupManifest(journal.backupDir);
    if (manifest.agent !== journal.agent || manifest.sessionId !== journal.sessionId) {
      blockers.push("Quarantine journal and backup manifest refer to different sessions.");
    }
  } catch (error) {
    blockers.push(`Cannot read restore backup manifest: ${error instanceof Error ? error.message : String(error)}`);
  }
  const restoreJournalPath = restoreJournalPathFor(journal.quarantineDir);
  const restored = await successfulRestoreJournalExists(restoreJournalPath);
  if (restored) blockers.push("This quarantined session already has a successful restore journal.");
  const target = await resolveSession(journal.sessionId, journal.agent, options.home).catch(() => undefined);
  if (target) blockers.push("A session with this id already exists locally; restore would conflict.");
  const copiedFiles = manifest ? manifestCopiedFiles(manifest) : [];
  for (const file of copiedFiles) {
    const originalPath = typeof file.path === "string" ? file.path : undefined;
    if (originalPath && await pathExists(originalPath)) blockers.push(`Restore target already exists: ${originalPath}`);
  }
  const summary = manifest ? backupManifestSessionSummary(manifest) : {};
  const movedFiles = journal.steps.filter((step) => step.phase === "file" && step.action === "move" && step.status === "succeeded").length;
  const databaseDeletes = journal.steps.filter((step) => step.phase === "sqlite_delete" && step.status === "succeeded").length;
  const restoreStatus: QuarantinedSession["restoreStatus"] = restored
    ? "restored"
    : !manifest
      ? "missing_backup"
      : blockers.length
        ? "blocked"
        : "restorable";
  return {
    schemaVersion: 1,
    agent: journal.agent,
    sessionId: journal.sessionId,
    deletedAt: journal.createdAt,
    updatedAt: journal.updatedAt,
    backupDir: journal.backupDir,
    quarantineDir: journal.quarantineDir,
    journalPath: journal.journalPath,
    restoreJournalPath,
    title: summary.title,
    cwd: summary.cwd,
    transcriptPath: summary.transcriptPath,
    parentSessionId: summary.parentSessionId,
    restoreStatus,
    restorePossible: restoreStatus === "restorable",
    movedFiles,
    databaseDeletes,
    warnings,
    blockers,
    evidence: [
      {
        source: "agentscope.quarantine.journal",
        detail: "Quarantine entry loaded from AgentScope delete journal.",
        path: journal.journalPath,
        field: "kind,sessionId,backupDir,steps"
      },
      ...(manifest
        ? [
            {
              source: "agentscope.backup.manifest",
              detail: "Restore will use the backup manifest referenced by the delete journal.",
              path: path.join(journal.backupDir, "manifest.json"),
              field: "kind,sessionId,copiedFiles,databaseBundles"
            }
          ]
        : [])
    ]
  };
}

function backupManifestSessionSummary(manifest: BackupManifest): {
  title?: string | undefined;
  cwd?: string | undefined;
  transcriptPath?: string | undefined;
  parentSessionId?: string | undefined;
} {
  const plan = objectValue(manifest.plan);
  const target = objectValue(plan?.target);
  const title = typeof target?.title === "string" ? target.title : undefined;
  const cwd = typeof target?.cwd === "string" ? target.cwd : undefined;
  const transcriptPath = typeof target?.transcriptPath === "string" ? target.transcriptPath : undefined;
  const parentSessionId = typeof target?.parentSessionId === "string" ? target.parentSessionId : undefined;
  return { title, cwd, transcriptPath, parentSessionId };
}

async function successfulRestoreJournalExists(restoreJournalPath: string): Promise<boolean> {
  const parsed = await fs.promises.readFile(restoreJournalPath, "utf8").then(
    (content) => JSON.parse(content) as Record<string, unknown>,
    () => undefined
  );
  return parsed?.kind === restoreJournalKind && parsed.status === "succeeded";
}

function restoreJournalPathFor(quarantineDir: string): string {
  return path.join(quarantineDir, "restore-journal.json");
}

function pathInside(root: string, targetPath: string): boolean {
  const normalizedRoot = path.resolve(root);
  const normalizedTarget = path.resolve(targetPath);
  const relative = path.relative(normalizedRoot, normalizedTarget);
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function samePath(left: string, right: string): boolean {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

async function exportCodexDatabaseBundles(
  sessionId: string,
  home: string | undefined,
  backupDir: string
): Promise<CodexDatabaseBundleManifest[]> {
  const bundles: CodexDatabaseBundleManifest[] = [];
  const dbRoot = path.join(backupDir, "db");
  const codexRoot = codexHome(home);
  const specs = codexBundleSpecs(sessionId, codexRoot);
  for (const spec of specs) {
    const rows = spec.summary ? exportCodexLogSummary(spec.dbPath, sessionId) : exportRows(spec.dbPath, spec.table, spec.where, spec.params);
    if (!rows.length) continue;
    const relativePath = path.join("db", `${spec.databaseName}-${spec.table}.json`);
    const target = path.join(backupDir, relativePath);
    const payload = {
      schemaVersion: 1,
      kind: "AgentScope Codex SQLite Row Bundle",
      createdAt: new Date().toISOString(),
      agent: "codex",
      sessionId,
      databaseName: spec.databaseName,
      table: spec.table,
      action: spec.summary ? "summary" : "restore",
      sourceDatabase: spec.dbPath,
      rows
    };
    await fs.promises.mkdir(dbRoot, { recursive: true });
    await writeJson(target, payload);
    bundles.push({
      role: spec.role,
      databaseName: spec.databaseName,
      table: spec.table,
      relativePath,
      action: spec.summary ? "summary" : "restore",
      rowCount: rows.length,
      sha256: await hashPath(target)
    });
  }
  return bundles;
}

function importCodexDatabaseBundles(
  manifest: BackupManifest,
  backupDir: string,
  home: string | undefined
): SessionOperationDatabaseChange[] {
  const bundles = manifest.databaseBundles ?? [];
  if (!bundles.length) return [];
  const codexRoot = codexHome(home);
  const changes: SessionOperationDatabaseChange[] = [];
  const grouped = new Map<string, CodexDatabaseBundleManifest[]>();
  for (const bundle of bundles) {
    if (bundle.action !== "restore") {
      changes.push(dbChange(path.join(codexRoot, bundle.databaseName), bundle.table, `session = ${jsonQuote(manifest.sessionId)}`, "skip", "agentscope.import.codex.logs-summary"));
      continue;
    }
    const existing = grouped.get(bundle.databaseName) ?? [];
    existing.push(bundle);
    grouped.set(bundle.databaseName, existing);
  }
  for (const [databaseName, databaseBundles] of grouped) {
    const dbPath = path.join(codexRoot, databaseName);
    const db = openWritableDb(dbPath);
    if (!db) {
      for (const bundle of databaseBundles) {
        changes.push(dbChange(dbPath, bundle.table, `session = ${jsonQuote(manifest.sessionId)}`, "skip", "agentscope.import.codex.missing-db"));
      }
      continue;
    }
    try {
      db.pragma("busy_timeout = 5000");
      db.pragma("foreign_keys = ON");
      const transaction = db.transaction(() => {
        for (const bundle of databaseBundles) {
          const source = resolveSafeRelative(backupDir, bundle.relativePath);
          const expectedSha = bundle.sha256;
          const actualSha = fs.existsSync(source) ? hashPathSync(source) : undefined;
          if (!fs.existsSync(source)) throw new Error(`Codex row bundle is missing: ${source}`);
          if (expectedSha && actualSha && expectedSha !== actualSha) throw new Error(`Codex row bundle checksum mismatch: ${source}`);
          const payload = JSON.parse(fs.readFileSync(source, "utf8")) as Record<string, unknown>;
          const rows = Array.isArray(payload.rows) ? payload.rows.filter(isObjectValue) : [];
          const inserted = insertBundleRows(db, bundle.table, rows, manifest.sessionId);
          changes.push({
            ...dbChange(dbPath, bundle.table, `session = ${jsonQuote(manifest.sessionId)}`, inserted ? "insert" : "skip", "agentscope.import.codex"),
            estimatedRows: inserted
          });
        }
      });
      transaction();
    } finally {
      db.close();
    }
  }
  return changes.filter((change) => change.estimatedRows !== 0 || change.action === "skip");
}

function codexBundleSpecs(sessionId: string, codexRoot: string): Array<{
  role: string;
  databaseName: string;
  dbPath: string;
  table: string;
  where: string;
  params: unknown[];
  summary?: boolean;
}> {
  return [
    {
      role: "codex.db.state_threads",
      databaseName: "state_5.sqlite",
      dbPath: path.join(codexRoot, "state_5.sqlite"),
      table: "threads",
      where: "id = ?",
      params: [sessionId]
    },
    {
      role: "codex.db.state_spawn_edges",
      databaseName: "state_5.sqlite",
      dbPath: path.join(codexRoot, "state_5.sqlite"),
      table: "thread_spawn_edges",
      where: "parent_thread_id = ? OR child_thread_id = ?",
      params: [sessionId, sessionId]
    },
    {
      role: "codex.db.state_dynamic_tools",
      databaseName: "state_5.sqlite",
      dbPath: path.join(codexRoot, "state_5.sqlite"),
      table: "thread_dynamic_tools",
      where: "thread_id = ?",
      params: [sessionId]
    },
    {
      role: "codex.db.goals_thread_goals",
      databaseName: "goals_1.sqlite",
      dbPath: path.join(codexRoot, "goals_1.sqlite"),
      table: "thread_goals",
      where: "thread_id = ?",
      params: [sessionId]
    },
    {
      role: "codex.db.memories_stage1_outputs",
      databaseName: "memories_1.sqlite",
      dbPath: path.join(codexRoot, "memories_1.sqlite"),
      table: "stage1_outputs",
      where: "thread_id = ?",
      params: [sessionId]
    },
    {
      role: "codex.db.logs_summary",
      databaseName: "logs_2.sqlite",
      dbPath: path.join(codexRoot, "logs_2.sqlite"),
      table: "logs",
      where: "thread_id = ?",
      params: [sessionId],
      summary: true
    }
  ];
}

function exportRows(
  dbPath: string,
  table: string,
  where: string,
  params: unknown[]
): Record<string, unknown>[] {
  const db = openReadableDb(dbPath);
  if (!db) return [];
  try {
    db.pragma("busy_timeout = 5000");
    const columns = tableColumns(db, table);
    if (!columns.size || !whereColumnsExist(columns, where)) return [];
    return db.prepare(`SELECT * FROM ${quoteIdentifier(table)} WHERE ${where}`).all(...params) as Record<string, unknown>[];
  } finally {
    db.close();
  }
}

function exportCodexLogSummary(dbPath: string, sessionId: string): Record<string, unknown>[] {
  const db = openReadableDb(dbPath);
  if (!db) return [];
  try {
    db.pragma("busy_timeout = 5000");
    const columns = tableColumns(db, "logs");
    if (!columns.has("thread_id")) return [];
    const selectParts = [
      "COUNT(*) AS row_count",
      columnAggregate(columns, "level", "SUM(CASE WHEN upper(level) = 'WARN' THEN 1 ELSE 0 END) AS warn_count"),
      columnAggregate(columns, "level", "SUM(CASE WHEN upper(level) = 'ERROR' THEN 1 ELSE 0 END) AS error_count"),
      columnAggregate(columns, "ts", "MIN(ts) AS first_ts"),
      columnAggregate(columns, "ts", "MAX(ts) AS last_ts"),
      columnAggregate(columns, "process_uuid", "COUNT(DISTINCT process_uuid) AS process_uuid_count")
    ].filter(Boolean).join(", ");
    const row = db.prepare(`SELECT ${selectParts} FROM ${quoteIdentifier("logs")} WHERE thread_id = ?`).get(sessionId) as Record<string, unknown> | undefined;
    const count = Number(row?.row_count ?? 0);
    return count > 0 && row ? [{ thread_id: sessionId, ...row }] : [];
  } finally {
    db.close();
  }
}

function columnAggregate(columns: Set<string>, column: string, expression: string): string {
  return columns.has(column) ? expression : `NULL AS ${column}_unavailable`;
}

function insertBundleRows(
  db: Database.Database,
  table: string,
  rows: Record<string, unknown>[],
  sessionId: string
): number {
  const tableColumnInfo = db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as Array<{ name: string; pk?: number }>;
  const columns = new Set(tableColumnInfo.map((row) => row.name));
  if (!columns.size || !rows.length) return 0;
  const identity = bundleIdentity(table, columns);
  if (identity && rowExists(db, table, identity, sessionId)) throw new Error(`Import target already exists in ${table}: ${sessionId}`);
  let inserted = 0;
  for (const row of rows) {
    const sourceColumns = Object.keys(row);
    const missingColumns = sourceColumns.filter((column) => !columns.has(column));
    if (missingColumns.length) {
      throw new Error(`Codex SQLite schema is incompatible for ${table}; missing column(s): ${missingColumns.join(", ")}`);
    }
    const rowColumns = sourceColumns.filter((column) => columns.has(column));
    if (!rowColumns.length) continue;
    const placeholders = rowColumns.map(() => "?").join(",");
    const sql = `INSERT INTO ${quoteIdentifier(table)} (${rowColumns.map(quoteIdentifier).join(",")}) VALUES (${placeholders})`;
    db.prepare(sql).run(...rowColumns.map((column) => row[column]));
    inserted += 1;
  }
  return inserted;
}

function bundleIdentity(table: string, columns: Set<string>): { where: string; params: unknown[] } | undefined {
  if (table === "threads" && columns.has("id")) return { where: "id = ?", params: [] };
  return undefined;
}

function rowExists(
  db: Database.Database,
  table: string,
  identity: { where: string; params: unknown[] },
  sessionId: string
): boolean {
  const params = identity.params.length ? identity.params : [sessionId];
  return countRows(db, table, identity.where, params) > 0;
}

function openReadableDb(dbPath: string): Database.Database | undefined {
  if (!fs.existsSync(dbPath)) return undefined;
  try {
    return new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch {
    return undefined;
  }
}

function openWritableDb(dbPath: string): Database.Database | undefined {
  if (!fs.existsSync(dbPath)) return undefined;
  try {
    return new Database(dbPath, { fileMustExist: true });
  } catch {
    return undefined;
  }
}

function countRows(db: Database.Database, table: string, where: string, params: unknown[]): number {
  try {
    const row = db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)} WHERE ${where}`).get(...params) as
      | { count?: unknown }
      | undefined;
    const count = Number(row?.count);
    return Number.isFinite(count) ? count : 0;
  } catch {
    return 0;
  }
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function writePatchBackup(filePath: string, original: string): Promise<void> {
  const backupPath = `${filePath}.agentscope-${safeStamp(new Date().toISOString())}.bak`;
  await fs.promises.writeFile(backupPath, original, "utf8");
}

function patchedFile(file: SessionOperationFile, detail: string, field: string): SessionOperationFile {
  return {
    ...file,
    action: "patch",
    evidence: [
      ...file.evidence,
      {
        source: "agentscope.delete.patch",
        detail,
        path: file.path,
        field
      }
    ]
  };
}

function removeMatchingJsonValues(value: unknown, target: string): number {
  if (!value || typeof value !== "object") return 0;
  let removed = 0;
  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      if (value[index] === target) {
        value.splice(index, 1);
        removed += 1;
      } else {
        removed += removeMatchingJsonValues(value[index], target);
      }
    }
    return removed;
  }
  const object = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(object)) {
    if (child === target) {
      delete object[key];
      removed += 1;
      continue;
    }
    removed += removeMatchingJsonValues(child, target);
  }
  return removed;
}

function backupNotes(agent: AgentKind): string[] {
  const common = ["Credentials, settings, and global config are excluded from session backups."];
  if (agent === "codex") return [...common, "Codex row-level SQLite bundles are exported for compatible restore; logs_2.sqlite is backed up as summary only."];
  if (agent === "claude") return [...common, "Claude session transcript and session-keyed sidecar directories are copied when present."];
  return common;
}

function deleteNotes(agent: AgentKind): string[] {
  const common = ["Delete writes an AgentScope backup first, then records each destructive step in quarantine/journal.json."];
  if (agent === "codex") return [...common, "Codex SQLite rows are deleted in transactions before rollout files are quarantined; logs_2.sqlite log bodies are not deleted."];
  if (agent === "claude") return [...common, "History and .claude.json changes are patch-based and exact session-id only."];
  return common;
}

async function listBackupFiles(backupDir: string): Promise<SessionOperationFile[]> {
  const filesRoot = path.join(backupDir, "files");
  const manifestPath = path.join(backupDir, "manifest.json");
  const out: SessionOperationFile[] = [
    await fileEntry("backup_manifest", manifestPath, "inspect", [
      {
        source: "agentscope.backup.manifest",
        detail: "AgentScope backup manifest describes the source session and copied files.",
        path: manifestPath
      }
    ])
  ];
  await walkMaybe(filesRoot, async (filePath) => {
    const stat = await fs.promises.stat(filePath);
    out.push({
      role: "backup_file",
      path: filePath,
      exists: true,
      bytes: stat.size,
      sha256: stat.isFile() ? await hashPath(filePath) : undefined,
      action: "inspect",
      evidence: [{ source: "agentscope.backup.files", detail: "File found inside AgentScope backup bundle.", path: filePath }]
    });
  });
  return out;
}

async function readBackupManifest(backupDir: string): Promise<BackupManifest> {
  const manifestPath = path.join(backupDir, "manifest.json");
  const manifest = JSON.parse(await fs.promises.readFile(manifestPath, "utf8")) as Record<string, unknown>;
  validateBackupManifest(manifest);
  return manifest;
}

function validateBackupManifest(manifest: Record<string, unknown>): asserts manifest is BackupManifest {
  if (manifest.schemaVersion !== 1) throw new Error("Backup manifest has an unsupported schema version.");
  if (manifest.kind !== backupKind) throw new Error("Backup manifest is not an AgentScope session backup.");
  if (!asAgent(manifest.agent)) throw new Error("Backup manifest does not contain a supported agent.");
  if (typeof manifest.sessionId !== "string" || !manifest.sessionId.trim()) throw new Error("Backup manifest is missing a session id.");
  if (!Array.isArray(manifest.copiedFiles)) throw new Error("Backup manifest copiedFiles must be an array.");
}

function manifestCopiedFiles(manifest: BackupManifest): Array<Record<string, unknown>> {
  const copiedFiles = manifest.copiedFiles;
  return Array.isArray(copiedFiles) ? copiedFiles.filter(isObjectValue) : [];
}

async function assertImportTargetsAbsent(copiedFiles: Array<Record<string, unknown>>): Promise<void> {
  for (const file of copiedFiles) {
    const originalPath = typeof file.path === "string" ? file.path : undefined;
    if (originalPath && await pathExists(originalPath)) throw new Error(`Import target already exists: ${originalPath}`);
  }
}

async function describeTree(root: string, depth: number): Promise<Record<string, unknown>> {
  const exists = await pathExists(root);
  if (!exists) return { root, exists: false };
  const summary = { root, exists: true, entries: [] as Array<Record<string, unknown>> };
  await describeTreeInto(root, depth, summary.entries);
  return summary;
}

async function describeTreeInto(root: string, depth: number, entries: Array<Record<string, unknown>>): Promise<void> {
  if (depth < 0) return;
  const list = await fs.promises.readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of list) {
    const filePath = path.join(root, entry.name);
    const stat = await fs.promises.stat(filePath).catch(() => undefined);
    entries.push({
      path: filePath,
      kind: entry.isDirectory() ? "directory" : "file",
      bytes: stat?.isFile() ? stat.size : undefined,
      mtime: stat?.mtime.toISOString()
    });
    if (entry.isDirectory()) await describeTreeInto(filePath, depth - 1, entries);
  }
}

async function walkMaybe(root: string, visitor: (filePath: string) => Promise<void>): Promise<void> {
  if (!(await pathExists(root))) return;
  const entries = await fs.promises.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) await walkMaybe(filePath, visitor);
    else await visitor(filePath);
  }
}

async function directoryBytes(root: string): Promise<number> {
  let total = 0;
  await walkMaybe(root, async (filePath) => {
    total += (await fs.promises.stat(filePath)).size;
  });
  return total;
}

async function movePath(source: string, target: string): Promise<void> {
  try {
    await fs.promises.rename(source, target);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
  }
  const stat = await fs.promises.stat(source);
  if (stat.isDirectory()) {
    await fs.promises.cp(source, target, { recursive: true, force: false, errorOnExist: true });
    await fs.promises.rm(source, { recursive: true, force: false });
  } else {
    await fs.promises.copyFile(source, target);
    await fs.promises.rm(source, { force: false });
  }
}

async function hashPath(filePath: string): Promise<string | undefined> {
  const stat = await fs.promises.stat(filePath).catch(() => undefined);
  if (!stat?.isFile()) return undefined;
  const hash = crypto.createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

function hashPathSync(filePath: string): string | undefined {
  const stat = fs.statSync(filePath, { throwIfNoEntry: false });
  if (!stat?.isFile()) return undefined;
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function resolveSafeRelative(root: string, relativePath: string): string {
  if (!relativePath || path.isAbsolute(relativePath)) throw new Error(`Unsafe backup relative path: ${relativePath}`);
  const normalizedRelative = path.normalize(relativePath);
  if (normalizedRelative === ".." || normalizedRelative.startsWith(`..${path.sep}`) || normalizedRelative.includes(`${path.sep}..${path.sep}`)) {
    throw new Error(`Unsafe backup relative path: ${relativePath}`);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, normalizedRelative);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Unsafe backup relative path: ${relativePath}`);
  }
  return resolved;
}

function relativeBackupPath(filePath: string): string {
  const normalized = normalizeWindowsPath(filePath) ?? filePath;
  const withoutRoot = normalized.replace(/^([A-Za-z]):\\/, "$1/").replace(/^\\\\/, "UNC/");
  return withoutRoot.replace(/[<>:"|?*]/g, "_");
}

function operationRoot(options: SessionOperationOptions): string {
  return options.outputRoot ?? path.join(os.homedir(), ".agentscope");
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function dedupeFiles(files: SessionOperationFile[]): SessionOperationFile[] {
  const seen = new Set<string>();
  return files.filter((file) => {
    const key = file.path.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function pathExists(filePath: string): Promise<boolean> {
  return fs.promises.stat(filePath).then(() => true, () => false);
}

function asAgent(value: unknown): AgentKind | undefined {
  return value === "codex" || value === "claude" ? value : undefined;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return isObjectValue(value) ? value : undefined;
}

function isObjectValue(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function compactEvidence(value: {
  source: string;
  detail: string;
  path?: string | undefined;
  field?: string | undefined;
}): Evidence {
  const evidence: Evidence = {
    source: value.source,
    detail: value.detail
  };
  if (value.path !== undefined) evidence.path = value.path;
  if (value.field !== undefined) evidence.field = value.field;
  return evidence;
}

function jsonQuote(value: string): string {
  return JSON.stringify(value);
}

function safeStamp(value: string): string {
  return value.replace(/[:.]/g, "-");
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}
