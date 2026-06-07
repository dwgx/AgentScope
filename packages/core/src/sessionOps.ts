import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type {
  AgentKind,
  AgentSession,
  Evidence,
  SessionBackupResult,
  SessionDeleteResult,
  SessionImportResult,
  SessionOperationDatabaseChange,
  SessionOperationFile,
  SessionOperationPlan,
  SessionOperationPlanResult
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

export async function planSessionDelete(
  sessionId: string,
  agent?: AgentKind,
  options: SessionOperationOptions = {}
): Promise<SessionOperationPlan> {
  const session = await resolveSession(sessionId, agent, options.home, options.includeProcesses);
  const plan = await buildSessionPlan("delete", session, options);
  plan.notes.push("This plan is a preview. Executing deleteSession first writes an AgentScope backup, then moves removable files to quarantine and patches only known session references.");
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
  return { plan, path: filePath };
}

export async function backupSession(
  sessionId: string,
  agent?: AgentKind,
  options: SessionOperationOptions = {}
): Promise<SessionBackupResult> {
  const session = await resolveSession(sessionId, agent, options.home);
  const plan = await buildSessionPlan("backup", session, options);
  const root = operationRoot(options);
  const backupDir = path.join(root, "backups", `${safeStamp(plan.createdAt)}-${session.agent}-${safeName(session.sessionId)}`);
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

  const manifestPath = path.join(backupDir, "manifest.json");
  const manifest = {
    schemaVersion: 1,
    kind: "AgentScope Session Backup",
    createdAt: plan.createdAt,
    agent: session.agent,
    sessionId: session.sessionId,
    sourceHome: options.home ?? userHome(),
    copiedFiles: copiedManifestFiles,
    plan
  };
  await writeJson(manifestPath, manifest);
  return { plan: { ...plan, files: copiedFiles }, backupDir, manifestPath, copiedFiles };
}

export async function deleteSession(
  sessionId: string,
  agent?: AgentKind,
  options: SessionOperationOptions = {}
): Promise<SessionDeleteResult> {
  const session = await resolveSession(sessionId, agent, options.home, true);
  const plan = await buildSessionPlan("delete", session, options);
  if (plan.blockers.length && !options.allowActive) {
    throw new Error(plan.blockers.join(" "));
  }
  const backup = await backupSession(session.sessionId, session.agent, options);
  const quarantineDir = path.join(
    operationRoot(options),
    "quarantine",
    `${safeStamp(plan.createdAt)}-${session.agent}-${safeName(session.sessionId)}`
  );
  await fs.promises.mkdir(quarantineDir, { recursive: true });
  const movedFiles: SessionOperationFile[] = [];
  const patchedFiles: SessionOperationFile[] = [];
  for (const file of plan.files) {
    if (!file.exists) continue;
    if (file.action === "delete") {
      const target = path.join(quarantineDir, relativeBackupPath(file.path));
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await movePath(file.path, target);
      movedFiles.push({ ...file, action: "move", sha256: await hashPath(target) });
    } else if (file.action === "patch") {
      const patched = await patchSessionReferenceFile(file, session);
      if (patched) patchedFiles.push(patched);
    }
  }
  if (session.agent === "codex") await backupCodexDatabases(options.home, quarantineDir);
  const databaseChanges = session.agent === "codex" ? applyCodexDatabaseDelete(plan, options.home) : [];
  return { plan, backup, quarantineDir, movedFiles, patchedFiles, databaseChanges };
}

export async function importSessionBackup(
  backupDir: string,
  options: SessionOperationOptions = {}
): Promise<SessionImportResult> {
  const planResult = await planSessionImport(backupDir, options);
  const plan = planResult.plan;
  if (plan.blockers.length) throw new Error(plan.blockers.join(" "));
  if (plan.target) throw new Error("A session with this id already exists locally; delete or archive it before importing.");
  const manifest = await readBackupManifest(backupDir);
  const copiedFiles = manifestCopiedFiles(manifest);
  if (!copiedFiles.length) throw new Error("Backup manifest has no copied files to import.");
  const importedFiles: SessionOperationFile[] = [];
  const filesRoot = path.join(backupDir, "files");
  for (const file of copiedFiles) {
    const originalPath = typeof file.path === "string" ? file.path : undefined;
    const backupRelativePath = typeof file.backupRelativePath === "string" ? file.backupRelativePath : undefined;
    if (!originalPath || !backupRelativePath) continue;
    if (backupRelativePath.includes("..") || path.isAbsolute(backupRelativePath)) {
      throw new Error(`Unsafe backup relative path: ${backupRelativePath}`);
    }
    const source = path.join(filesRoot, backupRelativePath);
    if (!(await pathExists(source))) throw new Error(`Backup file is missing: ${source}`);
    const expectedSha = typeof file.sha256 === "string" ? file.sha256 : undefined;
    const actualSha = await hashPath(source);
    if (expectedSha && actualSha && expectedSha !== actualSha) {
      throw new Error(`Backup checksum mismatch: ${source}`);
    }
    if (await pathExists(originalPath)) throw new Error(`Import target already exists: ${originalPath}`);
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
  return { plan, backupDir, importedFiles };
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
    agent = asAgent(manifest.agent) ?? "unknown";
    sessionId = typeof manifest.sessionId === "string" ? manifest.sessionId : sessionId;
    if (agent === "unknown") blockers.push("Backup manifest does not contain a supported agent.");
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
      "Import is dry-run only in this version. AgentScope verifies backup shape and reports local conflicts.",
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
      destructiveActions: "AgentScope generates plans only unless a future explicit --force workflow is added."
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
      dbChange(path.join(root, "state_5.sqlite"), "thread_spawn_edges", `parent/child references ${jsonQuote(sessionId)}`, "insert", "agentscope.import.codex")
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
  if (session.pid !== undefined && (session.processName || session.commandLine || session.path)) {
    blockers.push(`Session has an exact active PID mapping (${session.pid}); destructive operations must wait until the process exits.`);
  }
  return blockers;
}

function riskWarnings(session: AgentSession, operation: "backup" | "delete"): string[] {
  const warnings: string[] = [];
  if (session.agent === "codex") {
    warnings.push("Codex has no reliable PID-to-thread exact map yet; process links may be heuristic.");
    if (operation === "delete") warnings.push("Codex SQLite writes are internal and risky while Codex is running; this version only plans them.");
  }
  if (session.agent === "claude" && operation === "delete") {
    warnings.push("Claude history, daemon, job, and global-state sidecars may reference the session; plan lists patch targets but does not edit them.");
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
  home: string | undefined
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
        applied.push(deleteRows(db, statePath, "thread_spawn_edges", "parent_thread_id = ? OR child_thread_id = ?", [plan.sessionId, plan.sessionId], "codex.sqlite.thread_spawn_edges"));
        applied.push(deleteRows(db, statePath, "thread_dynamic_tools", "thread_id = ?", [plan.sessionId], "codex.sqlite.thread_dynamic_tools"));
        applied.push(deleteRows(db, statePath, "threads", "id = ?", [plan.sessionId], "codex.sqlite.threads"));
      });
      transaction();
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
      applied.push(deleteRows(db, dbPath, table, where, [plan.sessionId], source));
    } finally {
      db.close();
    }
  }
  return applied.filter((change) => change.estimatedRows !== 0);
}

async function backupCodexDatabases(home: string | undefined, quarantineDir: string): Promise<void> {
  const root = codexHome(home);
  const backupDir = path.join(quarantineDir, "sqlite-backup");
  await fs.promises.mkdir(backupDir, { recursive: true });
  for (const name of ["state_5.sqlite", "goals_1.sqlite", "memories_1.sqlite", "logs_2.sqlite"]) {
    const source = path.join(root, name);
    for (const suffix of ["", "-wal", "-shm"]) {
      const candidate = `${source}${suffix}`;
      if (!(await pathExists(candidate))) continue;
      await fs.promises.copyFile(candidate, path.join(backupDir, `${name}${suffix}`));
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
  const before = countRows(db, table, where, params);
  if (before > 0) db.prepare(`DELETE FROM ${quoteIdentifier(table)} WHERE ${where}`).run(...params);
  return {
    ...dbChange(dbPath, table, where, "delete", source),
    estimatedRows: before
  };
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
  if (agent === "codex") return [...common, "Codex global SQLite databases are inspected but not copied by default; manifest records planned row-level references."];
  if (agent === "claude") return [...common, "Claude session transcript and session-keyed sidecar directories are copied when present."];
  return common;
}

function deleteNotes(agent: AgentKind): string[] {
  const common = ["Delete is plan-only. Future execute mode must require an explicit force flag and a verified backup."];
  if (agent === "codex") return [...common, "Rollout JSONL should be quarantined after SQLite transaction commit, never permanently removed first."];
  if (agent === "claude") return [...common, "History and .claude.json changes must be patch-based and hash-guarded."];
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

async function readBackupManifest(backupDir: string): Promise<Record<string, unknown>> {
  const manifestPath = path.join(backupDir, "manifest.json");
  return JSON.parse(await fs.promises.readFile(manifestPath, "utf8")) as Record<string, unknown>;
}

function manifestCopiedFiles(manifest: Record<string, unknown>): Array<Record<string, unknown>> {
  const copiedFiles = manifest.copiedFiles;
  return Array.isArray(copiedFiles) ? copiedFiles.filter(isObjectValue) : [];
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
