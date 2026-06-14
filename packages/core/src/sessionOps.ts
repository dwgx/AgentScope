import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type {
  AgentKind,
  AgentProcess,
  AgentSession,
  Evidence,
  QuarantinedSession,
  SessionBackupResult,
  SessionChildDeleteMode,
  SessionChildDeleteResult,
  SessionDeleteResult,
  SessionDetachedRelation,
  SessionImportResult,
  SessionOperationDatabaseChange,
  SessionOperationFile,
  SessionOperationPlan,
  SessionOperationPlanResult,
  SessionRestoreResult
} from "@agentscope/shared";
import { tableColumns } from "./codex.js";
import { buildSnapshot, findSession } from "./scope.js";
import { agentScopeHome, claudeHome, codexHome, codexSqliteHome, encodeClaudeProjectPath, normalizeWindowsPath, userHome } from "./paths.js";

export interface SessionOperationOptions {
  home?: string | undefined;
  outputRoot?: string | undefined;
  now?: Date | undefined;
  allowActive?: boolean | undefined;
  childMode?: SessionChildDeleteMode | undefined;
  includeProcesses?: boolean | undefined;
  processProvider?: (() => Promise<AgentProcess[]>) | undefined;
}

interface DeleteSessionContext {
  stack: Set<string>;
  completedChildren: Map<string, SessionChildDeleteResult>;
  depth: number;
}

interface OperationDirectories {
  backupDir: string;
  quarantineDir: string;
  journalPath: string;
}

interface DeleteJournalStep {
  at?: string | undefined;
  phase: "backup" | "file" | "patch" | "sqlite_backup" | "sqlite_delete" | "relation" | "child_delete" | "operation";
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
  parentSessionId?: string | undefined;
  childSessionId?: string | undefined;
  rollbackRows?: Array<Record<string, string | number | boolean | null>> | undefined;
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

interface MovedFileTarget {
  file: SessionOperationFile;
  sourcePath: string;
  targetPath: string;
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
  steps: RestoreJournalStep[];
  error?: string | undefined;
}

interface RestoreJournalStep {
  at?: string | undefined;
  phase: "plan" | "preflight" | "file" | "sqlite_import" | "rollback" | "operation";
  action: string;
  status: "started" | "succeeded" | "failed" | "skipped";
  role?: string | undefined;
  path?: string | undefined;
  targetPath?: string | undefined;
  database?: string | undefined;
  table?: string | undefined;
  sha256?: string | undefined;
  bytes?: number | undefined;
  estimatedRows?: number | undefined;
  sourceRole?: string | undefined;
  relativePath?: string | undefined;
  detail?: string | undefined;
  error?: string | undefined;
  evidence?: Evidence[] | undefined;
}

interface DetachedRelationTarget extends SessionDetachedRelation {
  rows: Record<string, unknown>[];
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

interface DirectoryManifestEntry {
  relativePath: string;
  kind: "file";
  bytes: number;
  sha256: string;
}

interface DirectoryManifest {
  schemaVersion: 1;
  kind: "AgentScope Directory Tree";
  rootRole: string;
  entries: DirectoryManifestEntry[];
  treeHash: string;
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
  const session = await resolveSession(sessionId, agent, options.home, options.includeProcesses, options.processProvider);
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
  const session = await resolveSession(sessionId, agent, options.home, undefined, options.processProvider);
  const plan = await buildSessionPlan("backup", session, options);
  const { backupDir } = operationDirectories(plan, options);
  const filesRoot = path.join(backupDir, "files");
  await fs.promises.mkdir(filesRoot, { recursive: true });

  const copiedFiles: SessionOperationFile[] = [];
  const copiedManifestFiles: Array<SessionOperationFile & { backupRelativePath: string; directoryTree?: DirectoryManifest | undefined }> = [];
  for (const file of plan.files) {
    if (!file.exists || file.action !== "copy") continue;
    const relative = relativeBackupPath(file.path);
    const target = path.join(filesRoot, relative);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    const stat = await fs.promises.stat(file.path);
    let directoryTree: DirectoryManifest | undefined;
    if (stat.isDirectory()) {
      directoryTree = await directoryManifest(file.path, file.role);
      await fs.promises.cp(file.path, target, { recursive: true, force: false, errorOnExist: true });
    } else {
      await fs.promises.copyFile(file.path, target);
    }
    const copied = { ...file, sha256: await hashPath(file.path) };
    copiedFiles.push(copied);
    copiedManifestFiles.push({ ...copied, backupRelativePath: relative, ...(directoryTree ? { directoryTree } : {}) });
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
  return deleteSessionInternal(sessionId, agent, options, {
    stack: new Set<string>(),
    completedChildren: new Map<string, SessionChildDeleteResult>(),
    depth: 0
  });
}

async function deleteSessionInternal(
  sessionId: string,
  agent: AgentKind | undefined,
  options: SessionOperationOptions,
  context: DeleteSessionContext
): Promise<SessionDeleteResult> {
  const session = await resolveSession(sessionId, agent, options.home, options.includeProcesses ?? true, options.processProvider);
  const sessionKey = `${session.agent}:${session.sessionId}`.toLowerCase();
  if (context.stack.has(sessionKey)) {
    throw new Error(`Child session delete cycle detected at ${session.agent}:${session.sessionId}.`);
  }
  context.stack.add(sessionKey);
  const plan = await buildSessionPlan("delete", session, options);
  const childMode = normalizedChildMode(options);
  const childResults: SessionChildDeleteResult[] = [];
  let detachedRelationTargets: DetachedRelationTarget[] = [];
  let detachedRelations: SessionDetachedRelation[] = [];
  try {
    if (plan.blockers.length && !canBypassDeleteBlockers(plan.blockers, options)) {
      throw new Error(plan.blockers.join(" "));
    }
    if (session.childSessionIds.length > 0 && childMode === "includeChildren") {
      const childClosure = await resolveChildSessionClosure(session, options, context);
      plan.affectedChildSessionIds = childClosure.map((child) => child.sessionId);
      for (const child of childClosure) {
        const childKey = `${child.agent}:${child.sessionId}`.toLowerCase();
        const completed = context.completedChildren.get(childKey);
        if (completed) {
          childResults.push(completed);
          continue;
        }
        const result = await deleteSessionInternal(
          child.sessionId,
          child.agent,
          { ...options, childMode: "includeChildren" },
          { stack: new Set(context.stack), completedChildren: context.completedChildren, depth: context.depth + 1 }
        );
        const summary: SessionChildDeleteResult = {
          agent: result.plan.agent,
          sessionId: result.plan.sessionId,
          backupDir: result.backup.backupDir,
          quarantineDir: result.quarantineDir,
          journalPath: result.journalPath
        };
        context.completedChildren.set(childKey, summary);
        childResults.push(summary);
      }
    }
  } finally {
    context.stack.delete(sessionKey);
  }
  const { backupDir, quarantineDir, journalPath } = operationDirectories(plan, options);
  await fs.promises.mkdir(quarantineDir, { recursive: true });
  const journal = await createDeleteJournal(plan, backupDir, quarantineDir, journalPath);
  for (const childResult of childResults) {
    await appendJournalStep(journal, {
      phase: "child_delete",
      action: "include_child_delete",
      status: "succeeded",
      parentSessionId: session.sessionId,
      childSessionId: childResult.sessionId,
      path: childResult.backupDir,
      targetPath: childResult.quarantineDir,
      detail: childResult.journalPath
    });
  }
  const movedFiles: SessionOperationFile[] = [];
  const movedFileTargets: MovedFileTarget[] = [];
  const patchedFiles: SessionOperationFile[] = [];
  let backup: SessionBackupResult | undefined;
  const databaseChanges: SessionOperationDatabaseChange[] = [];
  const backupOptions = { ...options, now: new Date(plan.createdAt) };
  try {
    await appendJournalStep(journal, { phase: "backup", action: "backupSession", status: "started", path: backupDir });
    backup = await backupSession(session.sessionId, session.agent, backupOptions);
    journal.backupDir = backup.backupDir;
    await writeJson(journal.journalPath, journal);
    await appendJournalStep(journal, {
      phase: "backup",
      action: "backupSession",
      status: "succeeded",
      path: backup.manifestPath,
      detail: `Copied ${backup.copiedFiles.length} file(s).`
    });

    if (session.agent === "codex") {
      if (session.childSessionIds.length > 0 && childMode === "detach") {
        detachedRelationTargets = detachChildRelations(session, options, journal);
        detachedRelations = detachedRelationTargets.map(publicDetachedRelation);
      }
      await backupCodexDatabases(options.home, quarantineDir, journal);
      databaseChanges.push(...applyCodexDatabaseDelete(plan, options.home, quarantineDir, journal));
    }

    for (const file of plan.files) {
      if (!file.exists) continue;
      if (file.action === "delete") {
        const target = path.join(quarantineDir, relativeBackupPath(file.path));
        await appendJournalStep(journal, {
          phase: "file",
          action: "move",
          status: "started",
          role: file.role,
          path: file.path,
          targetPath: target,
          evidence: file.evidence
        });
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        await movePath(file.path, target);
        const moved: SessionOperationFile = { ...file, action: "move", sha256: await hashPath(target) };
        movedFiles.push(moved);
        movedFileTargets.push({ file: moved, sourcePath: file.path, targetPath: target });
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
          status: "failed",
          role: file.role,
          path: file.path,
          detail: "Patch actions are disabled until reversible restore support exists.",
          evidence: file.evidence
        });
        throw new Error(`Patch action is disabled until reversible restore is implemented: ${file.role}`);
      }
  }
    await appendJournalStep(journal, {
      phase: "operation",
      action: "deleteSession",
      status: "succeeded",
      detail: `Moved ${movedFiles.length} file(s); applied ${databaseChanges.length} database change(s).`
    });
    return { plan, backup, quarantineDir, journalPath, childMode, childResults, detachedRelations, movedFiles, patchedFiles, databaseChanges };
  } catch (error) {
    if (detachedRelationTargets.length) {
      try {
        rollbackDetachedRelations(detachedRelationTargets, journal);
      } catch {
        // rollbackDetachedRelations journals its own failures; keep the original operation error visible.
      }
    }
    await rollbackMovedFiles(movedFileTargets, journal);
    if (session.agent === "codex" && databaseChanges.some((change) => change.action === "delete" && (change.estimatedRows ?? 0) > 0)) {
      try {
        rollbackCodexDatabaseDeletes(databaseChanges, quarantineDir, journal, "Restoring SQLite database from delete-time backup after file quarantine failed.");
      } catch {
        // rollbackCodexDatabaseDeletes already journals the rollback failure; preserve the original operation error.
      }
    }
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
  options: SessionOperationOptions = {},
  restoreJournal?: RestoreJournal | undefined
): Promise<SessionImportResult> {
  try {
    await appendRestoreJournalStep(restoreJournal, { phase: "plan", action: "manifest_read", status: "started", path: path.join(backupDir, "manifest.json") });
    await appendRestoreJournalStep(restoreJournal, { phase: "plan", action: "planSessionImport", status: "started", path: backupDir });
    const planResult = await planSessionImport(backupDir, options);
    await appendRestoreJournalStep(restoreJournal, {
      phase: "plan",
      action: "planSessionImport",
      status: planResult.plan.blockers.length ? "failed" : "succeeded",
      path: planResult.path,
      detail: planResult.plan.blockers.length ? planResult.plan.blockers.join(" ") : undefined
    });
    const plan = planResult.plan;
    if (plan.blockers.length) throw new Error(plan.blockers.join(" "));
    const manifest = await readBackupManifest(backupDir);
    await appendRestoreJournalStep(restoreJournal, {
      phase: "plan",
      action: "manifest_validate",
      status: "succeeded",
      path: path.join(backupDir, "manifest.json"),
      detail: `${manifest.agent}:${manifest.sessionId}`
    });
    const copiedFiles = manifestCopiedFiles(manifest);
    if (!copiedFiles.length) throw new Error("Backup manifest has no copied files to import.");
    await appendRestoreJournalStep(restoreJournal, { phase: "preflight", action: "target_preflight", status: "started", path: backupDir });
    await preflightImportFiles(manifest, backupDir, options.home);
    preflightCodexDatabaseBundles(manifest, backupDir, options.home);
    await appendRestoreJournalStep(restoreJournal, {
      phase: "preflight",
      action: "target_preflight",
      status: "succeeded",
      path: backupDir,
      detail: `Validated ${copiedFiles.length} file(s) and ${(manifest.databaseBundles ?? []).length} database bundle(s).`
    });
    const importedFiles: SessionOperationFile[] = [];
    const filesRoot = path.join(backupDir, "files");
    await assertImportTargetsAbsent(copiedFiles);
    if (plan.target) throw new Error("A session with this id already exists locally; delete or archive it before importing.");
    try {
      for (const file of copiedFiles) {
        const originalPath = typeof file.path === "string" ? file.path : undefined;
        const backupRelativePath = typeof file.backupRelativePath === "string" ? file.backupRelativePath : undefined;
        if (!originalPath || !backupRelativePath) continue;
        const source = resolveSafeRelative(filesRoot, backupRelativePath);
        const role = typeof file.role === "string" ? file.role : "backup_file";
        try {
        if (!(await pathExists(source))) throw new Error(`Backup file is missing: ${source}`);
        await appendRestoreJournalStep(restoreJournal, {
          phase: "file",
          action: "copy_file_started",
          status: "started",
          role,
          sourceRole: role,
          relativePath: backupRelativePath,
          path: source,
          targetPath: originalPath
        });
        const expectedSha = typeof file.sha256 === "string" ? file.sha256 : undefined;
        const actualSha = await hashPath(source);
        if (actualSha) {
          if (!expectedSha) throw new Error(`Backup checksum is missing from manifest: ${source}`);
          if (expectedSha !== actualSha) throw new Error(`Backup checksum mismatch: ${source}`);
        }
        await appendRestoreJournalStep(restoreJournal, {
          phase: "file",
          action: "verify_sha256",
          status: "succeeded",
          role,
          sourceRole: role,
          relativePath: backupRelativePath,
          path: source,
          targetPath: originalPath,
          sha256: actualSha ?? expectedSha
        });
        validateBackupSourceTree(file, source);
        await appendRestoreJournalStep(restoreJournal, {
          phase: "file",
          action: "mkdir_parent",
          status: "started",
          role,
          path: path.dirname(originalPath),
          targetPath: originalPath
        });
        await fs.promises.mkdir(path.dirname(originalPath), { recursive: true });
        await appendRestoreJournalStep(restoreJournal, {
          phase: "file",
          action: "mkdir_parent",
          status: "succeeded",
          role,
          path: path.dirname(originalPath),
          targetPath: originalPath
        });
        const stat = await fs.promises.stat(source);
        if (stat.isDirectory()) {
          await fs.promises.cp(source, originalPath, { recursive: true, force: false, errorOnExist: true });
        } else {
          await fs.promises.copyFile(source, originalPath);
        }
        importedFiles.push({
          role,
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
        await appendRestoreJournalStep(restoreJournal, {
          phase: "file",
          action: "copy_file_succeeded",
          status: "succeeded",
          role,
          sourceRole: role,
          relativePath: backupRelativePath,
          path: source,
          targetPath: originalPath,
          sha256: importedFiles[importedFiles.length - 1]?.sha256,
          bytes: importedFiles[importedFiles.length - 1]?.bytes
        });
        } catch (error) {
          await appendRestoreJournalStep(restoreJournal, {
            phase: "file",
            action: "copy_file_failed",
            status: "failed",
            role,
            sourceRole: role,
            relativePath: backupRelativePath,
            path: source,
            targetPath: originalPath,
            error: error instanceof Error ? error.message : String(error)
          }).catch(() => undefined);
          throw error;
        }
      }
      const databaseChanges = manifest.agent === "codex" ? importCodexDatabaseBundles(manifest, backupDir, options.home, restoreJournal) : [];
      return { plan, backupDir, importedFiles, databaseChanges };
    } catch (error) {
      await appendRestoreJournalStep(restoreJournal, {
        phase: "rollback",
        action: "rollback_remove_imported_files",
        status: "started",
        detail: `Removing ${importedFiles.length} file(s) copied before import failed.`
      }).catch(() => undefined);
      try {
        await removeImportedFiles(importedFiles, restoreJournal);
        await appendRestoreJournalStep(restoreJournal, {
          phase: "rollback",
          action: "rollback_remove_imported_files",
          status: "succeeded",
          detail: `Removed ${importedFiles.length} copied file(s).`
        }).catch(() => undefined);
      } catch (rollbackError) {
        await appendRestoreJournalStep(restoreJournal, {
          phase: "rollback",
          action: "rollback_remove_imported_files",
          status: "failed",
          detail: `Failed to remove all copied file(s) after import failure.`,
          error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
        }).catch(() => undefined);
      }
      throw error;
    }
  } catch (error) {
    await appendRestoreJournalStep(restoreJournal, {
      phase: "operation",
      action: "importSessionBackup",
      status: "failed",
      path: backupDir,
      error: error instanceof Error ? error.message : String(error)
    }).catch(() => undefined);
    throw withImportOperationPaths(error, backupDir);
  }
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
  let restoreJournal: RestoreJournal | undefined;
  let restoreJournalPath: string | undefined;
  try {
    journal = await readQuarantineJournalPath(quarantineDirOrJournalPath, options);
    restoreJournalPath = restoreJournalPathFor(journal.quarantineDir);
    restoreJournal = {
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
      steps: []
    };
    await writeJson(restoreJournalPath, restoreJournal);
    await appendRestoreJournalStep(restoreJournal, { phase: "plan", action: "planSessionRestore", status: "started", path: journal.journalPath });
    const planResult = await planSessionRestore(journal.journalPath, options);
    await appendRestoreJournalStep(restoreJournal, {
      phase: "plan",
      action: "planSessionRestore",
      status: planResult.plan.blockers.length ? "failed" : "succeeded",
      path: journal.journalPath,
      detail: planResult.plan.blockers.length ? planResult.plan.blockers.join(" ") : undefined
    });
    if (planResult.plan.blockers.length) throw new Error(planResult.plan.blockers.join(" "));
    const imported = await importSessionBackup(journal.backupDir, options, restoreJournal);
    const databaseChanges = imported.databaseChanges ?? [];
    restoreJournal.status = "succeeded";
    restoreJournal.updatedAt = new Date().toISOString();
    restoreJournal.importedFiles = imported.importedFiles;
    restoreJournal.databaseChanges = databaseChanges;
    await appendRestoreJournalStep(restoreJournal, {
      phase: "operation",
      action: "restoreQuarantinedSession",
      status: "succeeded",
      detail: `Restored ${imported.importedFiles.length} file(s) and ${databaseChanges.length} database change(s).`
    });
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
      restoreJournal ??= {
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
        steps: []
      };
      restoreJournal.status = "failed";
      restoreJournal.updatedAt = new Date().toISOString();
      restoreJournal.error = error instanceof Error ? error.message : String(error);
      await appendRestoreJournalStep(restoreJournal, {
        phase: "operation",
        action: "restoreQuarantinedSession",
        status: "failed",
        error: restoreJournal.error
      }).catch(() => undefined);
      await writeJson(restoreJournalPath, restoreJournal).catch(() => undefined);
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
  const childMode = normalizedChildMode(options);
  if (operation === "delete" && session.childSessionIds.length > 0 && childMode === "detach" && session.agent !== "codex") {
    blockers.push("Detach child delete mode is currently supported only for Codex SQLite parent/child edges.");
  }
  const warnings = riskWarnings(session, operation);
  const notes = operation === "backup" ? backupNotes(session.agent) : deleteNotes(session.agent);
  return {
    schemaVersion: 1,
    operation,
    mode: operation === "backup" ? "execute" : "dry-run",
    risk: blockers.length ? "blocked" : warnings.length ? "caution" : "safe",
    ...(operation === "delete" ? { childMode, affectedChildSessionIds: session.childSessionIds } : {}),
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
  includeProcesses = false,
  processProvider?: (() => Promise<AgentProcess[]>) | undefined
): Promise<AgentSession> {
  const snapshot = await buildSnapshot(home, {
    includeProcesses,
    includeRolloutActivity: false,
    includeCodexLogMetadata: false,
    processProvider
  });
  const exact = findSession(snapshot, sessionId, agent);
  if (exact) return exact;
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
        detail: "Claude history may contain rows with this session id; AgentScope inspects it but does not patch global history during reversible delete.",
        field: "sessionId"
      }
    ], "inspect");
    await add("claude.global_state_patch", path.join(root, ".claude.json"), [
      {
        source: "claude.global-state",
        detail: "Claude global project state may contain lastSessionId references; AgentScope inspects it but does not patch global state during reversible delete.",
        field: "lastSessionId"
      }
    ], "inspect");
    await add("claude.daemon_roster_patch", path.join(claudeRoot, "daemon", "roster.json"), [
      {
        source: "claude.daemon.roster",
        detail: "Claude daemon roster may contain worker references for this session; AgentScope inspects it but does not patch daemon state during reversible delete.",
        field: "workers.*.sessionId"
      }
    ], "inspect");
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
    const sqliteRoot = codexSqliteHome(root);
    await add("codex.state_threads", path.join(sqliteRoot, "state_5.sqlite"), [
      {
        source: "codex.sqlite.threads",
        detail: "Codex thread row and spawn edges are indexed in state_5.sqlite.",
        field: "threads.id,thread_spawn_edges.parent_thread_id,thread_spawn_edges.child_thread_id"
      }
    ], "inspect");
    await add("codex.logs_metadata", path.join(sqliteRoot, "logs_2.sqlite"), [
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
    const root = codexSqliteHome(home);
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
      dbChange(path.join(claudeHome(home), "history.jsonl"), "jsonl_lines", `sessionId = ${jsonQuote(session.sessionId)}`, "inspect", "claude.history"),
      dbChange(path.join(home ?? userHome(), ".claude.json"), "json_fields", `value = ${jsonQuote(session.sessionId)}`, "inspect", "claude.global-state")
    ];
  }
  return [];
}

function importDatabasePlan(agent: AgentKind, sessionId: string, home: string | undefined): SessionOperationDatabaseChange[] {
  if (agent === "codex") {
    const root = codexSqliteHome(home);
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
    blockers.push("Session has child sessions; destructive operations are blocked unless childMode is explicitly includeChildren or detach.");
  }
  const heuristicCandidate = session.runtimeCandidates?.find((candidate) => candidate.confidence === "heuristic" && candidate.score >= 100);
  const hasHeuristicActiveProcess = session.agent === "codex" && (session.evidence.some((item) => item.source === "process.heuristic") || !!heuristicCandidate);
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
    blockers.push(`Session is attached to a high-confidence active Codex process candidate (${session.pid ?? heuristicCandidate?.score}); destructive operations are blocked because Codex PID-to-thread mapping is heuristic.`);
  }
  return blockers;
}

function canBypassDeleteBlockers(blockers: string[], options: SessionOperationOptions): boolean {
  if (!blockers.length) return true;
  const childMode = normalizedChildMode(options);
  return blockers.every((blocker) => {
    if (blocker.includes("child sessions")) return childMode === "includeChildren" || childMode === "detach";
    if (blocker.includes("active PID mapping") || blocker.includes("active Codex process candidate")) return options.allowActive === true;
    return false;
  });
}

function normalizedChildMode(options: SessionOperationOptions): SessionChildDeleteMode {
  return options.childMode === "includeChildren" || options.childMode === "detach" ? options.childMode : "block";
}

function riskWarnings(session: AgentSession, operation: "backup" | "delete"): string[] {
  const warnings: string[] = [];
  if (session.agent === "codex") {
    warnings.push("Codex has no reliable PID-to-thread exact map yet; process links may be heuristic.");
    if (operation === "delete") warnings.push("Codex SQLite writes use internal tables; delete backs up databases and journals each row-level step before quarantining files.");
  }
  if (session.agent === "claude" && operation === "delete") {
    warnings.push("Claude global history, daemon roster, and .claude.json may reference the session; delete only inspects those global files until reversible patch restore is implemented.");
  }
  if (operation === "backup" && session.pid !== undefined) {
    warnings.push("The session appears active; backup is point-in-time and may not include writes that happen after copying starts.");
  }
  if (!session.transcriptPath) warnings.push("No transcript path is indexed for this session.");
  return warnings;
}

async function resolveChildSessionClosure(
  parent: AgentSession,
  options: SessionOperationOptions,
  context: DeleteSessionContext
): Promise<AgentSession[]> {
  const out: AgentSession[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = async (session: AgentSession, isRoot = false): Promise<void> => {
    const key = `${session.agent}:${session.sessionId}`.toLowerCase();
    if (visited.has(key)) return;
    if (visiting.has(key) || (!isRoot && context.stack.has(key))) {
      throw new Error(`Child session delete cycle detected at ${session.agent}:${session.sessionId}.`);
    }
    visiting.add(key);
    for (const childId of session.childSessionIds) {
      const child = await resolveSession(childId, session.agent, options.home, options.includeProcesses ?? true, options.processProvider).catch(
        () => undefined
      );
      if (!child) {
        throw new Error(`Child session is referenced but cannot be resolved for includeChildren delete: ${childId}`);
      }
      await visit(child);
      out.push(child);
    }
    visiting.delete(key);
    visited.add(key);
  };

  await visit(parent, true);
  return dedupeSessions(out);
}

function dedupeSessions(sessions: AgentSession[]): AgentSession[] {
  const seen = new Set<string>();
  return sessions.filter((session) => {
    const key = `${session.agent}:${session.sessionId}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function detachChildRelations(
  session: AgentSession,
  options: SessionOperationOptions,
  journal?: DeleteJournal | undefined
): DetachedRelationTarget[] {
  if (session.agent !== "codex") {
    throw new Error("Detach child delete mode is currently supported only for Codex SQLite parent/child edges.");
  }
  const statePath = path.join(codexSqliteHome(options.home), "state_5.sqlite");
  const db = openWritableDb(statePath);
  if (!db) throw new Error(`Cannot detach child sessions because Codex state database is missing: ${statePath}`);
  const detached: DetachedRelationTarget[] = [];
  try {
    db.pragma("busy_timeout = 5000");
    const columns = tableColumns(db, "thread_spawn_edges");
    if (!columns.has("parent_thread_id") || !columns.has("child_thread_id")) {
      throw new Error("Cannot detach child sessions because thread_spawn_edges schema is incompatible.");
    }
    for (const childId of session.childSessionIds) {
      appendJournalStepSync(journal, {
        phase: "relation",
        action: "detach_child_relation",
        status: "started",
        parentSessionId: session.sessionId,
        childSessionId: childId,
        database: statePath,
        table: "thread_spawn_edges"
      });
      const rows = db
        .prepare("SELECT * FROM thread_spawn_edges WHERE parent_thread_id = ? AND child_thread_id = ?")
        .all(session.sessionId, childId) as Record<string, unknown>[];
      if (!rows.length) {
        appendJournalStepSync(journal, {
          phase: "relation",
          action: "detach_child_relation",
          status: "failed",
          parentSessionId: session.sessionId,
          childSessionId: childId,
          database: statePath,
          table: "thread_spawn_edges",
          error: "No reversible Codex parent/child edge exists for this child session."
        });
        throw new Error(`No reversible Codex parent/child edge exists for child session: ${childId}`);
      }
      const result = db
        .prepare("DELETE FROM thread_spawn_edges WHERE parent_thread_id = ? AND child_thread_id = ?")
        .run(session.sessionId, childId);
      const removedRows = Number(result.changes ?? 0);
      const relation: DetachedRelationTarget = {
        agent: "codex",
        parentSessionId: session.sessionId,
        childSessionId: childId,
        source: "codex.sqlite.thread_spawn_edges",
        database: statePath,
        table: "thread_spawn_edges",
        removedRows,
        rows,
        evidence: [
          {
            source: "codex.sqlite.thread_spawn_edges",
            detail: "Parent/child edge was detached before deleting the parent session.",
            path: statePath,
            field: "parent_thread_id,child_thread_id"
          }
        ]
      };
      detached.push(relation);
      appendJournalStepSync(journal, {
        phase: "relation",
        action: "detach_child_relation",
        status: removedRows ? "succeeded" : "skipped",
        parentSessionId: session.sessionId,
        childSessionId: childId,
        database: statePath,
        table: "thread_spawn_edges",
        estimatedRows: removedRows,
        rollbackRows: safeJournalRows(rows),
        evidence: relation.evidence
      });
    }
  } catch (error) {
    appendJournalStepSync(journal, {
      phase: "relation",
      action: "detach_child_relation",
      status: "failed",
      parentSessionId: session.sessionId,
      database: statePath,
      table: "thread_spawn_edges",
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  } finally {
    db.close();
  }
  return detached;
}

function safeJournalRows(rows: Record<string, unknown>[]): Array<Record<string, string | number | boolean | null>> {
  return rows.map((row) => {
    const safe: Record<string, string | number | boolean | null> = {};
    for (const [key, value] of Object.entries(row)) {
      if (!/^[A-Za-z0-9_]{1,80}$/.test(key)) continue;
      if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        safe[key] = value;
      }
    }
    return safe;
  });
}

function rollbackDetachedRelations(detachedRelations: DetachedRelationTarget[], journal?: DeleteJournal | undefined): void {
  const grouped = new Map<string, DetachedRelationTarget[]>();
  for (const relation of detachedRelations) {
    if (!relation.database || !relation.table || !relation.rows.length) continue;
    const key = `${path.resolve(relation.database).toLowerCase()}\0${relation.table}`;
    grouped.set(key, [...(grouped.get(key) ?? []), relation]);
  }
  for (const relations of grouped.values()) {
    const first = relations[0];
    if (!first?.database || !first.table) continue;
    const db = openWritableDb(first.database);
    if (!db) continue;
    try {
      db.pragma("busy_timeout = 5000");
      const columns = [...tableColumns(db, first.table)];
      if (!columns.length) throw new Error(`Cannot rollback detached relations because table is missing: ${first.table}`);
      appendJournalStepSync(journal, {
        phase: "relation",
        action: "rollback_detach_child_relation",
        status: "started",
        database: first.database,
        table: first.table
      });
      const insertColumns = columns.filter((column) => relations.some((relation) => relation.rows.some((row) => column in row)));
      const insert = db.prepare(
        `INSERT OR IGNORE INTO ${quoteIdentifier(first.table)} (${insertColumns.map(quoteIdentifier).join(", ")}) VALUES (${insertColumns.map(() => "?").join(", ")})`
      );
      const transaction = db.transaction(() => {
        let inserted = 0;
        for (const relation of relations) {
          for (const row of relation.rows) {
            const result = insert.run(...insertColumns.map((column) => row[column]));
            inserted += Number(result.changes ?? 0);
          }
        }
        return inserted;
      });
      const inserted = Number(transaction());
      appendJournalStepSync(journal, {
        phase: "relation",
        action: "rollback_detach_child_relation",
        status: "succeeded",
        database: first.database,
        table: first.table,
        estimatedRows: inserted
      });
    } catch (error) {
      appendJournalStepSync(journal, {
        phase: "relation",
        action: "rollback_detach_child_relation",
        status: "failed",
        database: first.database,
        table: first.table,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    } finally {
      db.close();
    }
  }
}

function publicDetachedRelation(relation: DetachedRelationTarget): SessionDetachedRelation {
  const { rows: _rows, ...publicRelation } = relation;
  return publicRelation;
}

function applyCodexDatabaseDelete(
  plan: SessionOperationPlan,
  home: string | undefined,
  quarantineDir: string,
  journal?: DeleteJournal | undefined
): SessionOperationDatabaseChange[] {
  const root = codexSqliteHome(home);
  const applied: SessionOperationDatabaseChange[] = [];
  const recordApplied = (changes: SessionOperationDatabaseChange[]) => {
    for (const change of changes.filter((item) => item.estimatedRows !== 0)) {
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
  };
  const statePath = path.join(root, "state_5.sqlite");
  const stateDb = openWritableDb(statePath);
  if (stateDb) {
    try {
      const db = stateDb;
      db.pragma("busy_timeout = 5000");
      db.pragma("foreign_keys = ON");
      const stateChanges: SessionOperationDatabaseChange[] = [];
      const transaction = db.transaction(() => {
        if (plannedDbAction(plan, statePath, "thread_spawn_edges") === "delete") {
          stateChanges.push(deleteRows(db, statePath, "thread_spawn_edges", "parent_thread_id = ? OR child_thread_id = ?", [plan.sessionId, plan.sessionId], "codex.sqlite.thread_spawn_edges"));
        }
        if (plannedDbAction(plan, statePath, "thread_dynamic_tools") === "delete") {
          stateChanges.push(deleteRows(db, statePath, "thread_dynamic_tools", "thread_id = ?", [plan.sessionId], "codex.sqlite.thread_dynamic_tools"));
        }
        if (plannedDbAction(plan, statePath, "threads") === "delete") {
          stateChanges.push(deleteRows(db, statePath, "threads", "id = ?", [plan.sessionId], "codex.sqlite.threads"));
        }
      });
      appendJournalStepSync(journal, { phase: "sqlite_delete", action: "transaction", status: "started", database: statePath });
      transaction();
      applied.push(...stateChanges);
      appendJournalStepSync(journal, { phase: "sqlite_delete", action: "transaction", status: "succeeded", database: statePath });
      recordApplied(stateChanges);
    } catch (error) {
      appendJournalStepSync(journal, {
        phase: "sqlite_delete",
        action: "transaction",
        status: "failed",
        database: statePath,
        error: error instanceof Error ? error.message : String(error)
      });
      rollbackCodexDatabaseDeletes(applied, quarantineDir, journal);
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
      const dbChanges: SessionOperationDatabaseChange[] = [];
      const transaction = db.transaction(() => {
        dbChanges.push(deleteRows(db, dbPath, table, where, [plan.sessionId], source));
      });
      transaction();
      applied.push(...dbChanges);
      appendJournalStepSync(journal, { phase: "sqlite_delete", action: "transaction", status: "succeeded", database: dbPath, table });
      recordApplied(dbChanges);
    } catch (error) {
      appendJournalStepSync(journal, {
        phase: "sqlite_delete",
        action: "transaction",
        status: "failed",
        database: dbPath,
        table,
        error: error instanceof Error ? error.message : String(error)
      });
      rollbackCodexDatabaseDeletes(applied, quarantineDir, journal);
      throw error;
    } finally {
      db.close();
    }
  }
  return applied.filter((change) => change.estimatedRows !== 0);
}

function rollbackCodexDatabaseDeletes(
  applied: SessionOperationDatabaseChange[],
  quarantineDir: string,
  journal?: DeleteJournal | undefined,
  detail = "Restoring SQLite database from delete-time backup after a later Codex DB delete failed."
): void {
  const seen = new Set<string>();
  for (const change of [...applied].reverse()) {
    if (change.action !== "delete" || !change.estimatedRows) continue;
    const database = path.resolve(change.database);
    const key = database.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const backupPath = path.join(quarantineDir, "sqlite-backup", path.basename(database));
    appendJournalStepSync(journal, {
      phase: "sqlite_delete",
      action: "rollback_restore",
      status: "started",
      database,
      path: backupPath,
      targetPath: database,
      detail
    });
    try {
      const restoredRows = restoreDeletedRowsFromSqliteBackup(backupPath, database, change);
      appendJournalStepSync(journal, {
        phase: "sqlite_delete",
        action: "rollback_restore",
        status: "succeeded",
        database,
        path: backupPath,
        targetPath: database,
        estimatedRows: restoredRows,
        sha256: hashPathSync(database)
      });
    } catch (error) {
      appendJournalStepSync(journal, {
        phase: "sqlite_delete",
        action: "rollback_restore",
        status: "failed",
        database,
        path: backupPath,
        targetPath: database,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}

function restoreDeletedRowsFromSqliteBackup(
  backupPath: string,
  targetPath: string,
  change: SessionOperationDatabaseChange
): number {
  if (!fs.existsSync(backupPath)) throw new Error(`SQLite backup is missing: ${backupPath}`);
  const backupDb = openReadableDb(backupPath);
  const targetDb = openWritableDb(targetPath);
  if (!backupDb) throw new Error(`Could not open SQLite backup: ${backupPath}`);
  if (!targetDb) {
    backupDb.close();
    throw new Error(`Could not open SQLite database for rollback: ${targetPath}`);
  }
  try {
    backupDb.pragma("busy_timeout = 5000");
    targetDb.pragma("busy_timeout = 5000");
    const backupColumns = tableColumns(backupDb, change.table);
    const targetColumns = tableColumns(targetDb, change.table);
    const columns = [...backupColumns].filter((column) => targetColumns.has(column));
    if (!columns.length) throw new Error(`SQLite rollback table has no compatible columns: ${change.table}`);
    if (!whereColumnsExist(targetColumns, change.where)) {
      throw new Error(`SQLite rollback table is missing where columns: ${change.table}`);
    }
    const params = change.rollbackParams;
    if (!params) throw new Error(`SQLite rollback parameters are missing for ${change.table}.`);
    const rows = backupDb.prepare(`SELECT ${columns.map(quoteIdentifier).join(", ")} FROM ${quoteIdentifier(change.table)} WHERE ${change.where}`).all(...params);
    const placeholders = columns.map(() => "?").join(", ");
    const insert = targetDb.prepare(`INSERT OR IGNORE INTO ${quoteIdentifier(change.table)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${placeholders})`);
    const transaction = targetDb.transaction((items: Record<string, unknown>[]) => {
      let inserted = 0;
      for (const row of items) {
        const result = insert.run(...columns.map((column) => row[column]));
        inserted += Number(result.changes ?? 0);
      }
      return inserted;
    });
    return Number(transaction(rows as Record<string, unknown>[]));
  } finally {
    backupDb.close();
    targetDb.close();
  }
}

async function backupCodexDatabases(home: string | undefined, quarantineDir: string, journal?: DeleteJournal | undefined): Promise<void> {
  const root = codexSqliteHome(home);
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
    estimatedRows: before,
    rollbackParams: params
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

async function rollbackMovedFiles(movedFiles: MovedFileTarget[], journal: DeleteJournal): Promise<void> {
  for (const moved of [...movedFiles].reverse()) {
    await appendJournalStep(journal, {
      phase: "file",
      action: "rollback_move",
      status: "started",
      role: moved.file.role,
      path: moved.targetPath,
      targetPath: moved.sourcePath,
      evidence: moved.file.evidence
    }).catch(() => undefined);
    try {
      const targetExists = await pathExists(moved.targetPath);
      const sourceExists = await pathExists(moved.sourcePath);
      if (!targetExists) {
        await appendJournalStep(journal, {
          phase: "file",
          action: "rollback_move",
          status: "skipped",
          role: moved.file.role,
          path: moved.targetPath,
          targetPath: moved.sourcePath,
          detail: "Quarantined file is already missing; no rollback move was possible.",
          evidence: moved.file.evidence
        });
        continue;
      }
      if (sourceExists) {
        await appendJournalStep(journal, {
          phase: "file",
          action: "rollback_move",
          status: "skipped",
          role: moved.file.role,
          path: moved.targetPath,
          targetPath: moved.sourcePath,
          detail: "Original path already exists; AgentScope did not overwrite it during rollback.",
          evidence: moved.file.evidence
        });
        continue;
      }
      await fs.promises.mkdir(path.dirname(moved.sourcePath), { recursive: true });
      await movePath(moved.targetPath, moved.sourcePath);
      await appendJournalStep(journal, {
        phase: "file",
        action: "rollback_move",
        status: "succeeded",
        role: moved.file.role,
        path: moved.targetPath,
        targetPath: moved.sourcePath,
        sha256: await hashPath(moved.sourcePath),
        evidence: moved.file.evidence
      });
    } catch (rollbackError) {
      await appendJournalStep(journal, {
        phase: "file",
        action: "rollback_move",
        status: "failed",
        role: moved.file.role,
        path: moved.targetPath,
        targetPath: moved.sourcePath,
        error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        evidence: moved.file.evidence
      }).catch(() => undefined);
    }
  }
}

async function appendRestoreJournalStep(journal: RestoreJournal | undefined, step: RestoreJournalStep): Promise<void> {
  if (!journal) return;
  journal.updatedAt = new Date().toISOString();
  journal.steps.push({ ...step, at: step.at ?? journal.updatedAt });
  await writeJson(journal.restoreJournalPath, journal);
}

function appendRestoreJournalStepSync(journal: RestoreJournal | undefined, step: RestoreJournalStep): void {
  if (!journal) return;
  journal.updatedAt = new Date().toISOString();
  journal.steps.push({ ...step, at: step.at ?? journal.updatedAt });
  fs.mkdirSync(path.dirname(journal.restoreJournalPath), { recursive: true });
  fs.writeFileSync(journal.restoreJournalPath, `${JSON.stringify(journal, null, 2)}\n`, "utf8");
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

function withImportOperationPaths(error: unknown, backupDir: string): Error {
  const message = error instanceof Error ? error.message : String(error);
  const wrapped = new Error(`${message} backupDir=${backupDir}`);
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
  const codexRoot = codexSqliteHome(home);
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
  home: string | undefined,
  restoreJournal?: RestoreJournal | undefined
): SessionOperationDatabaseChange[] {
  const bundles = manifest.databaseBundles ?? [];
  if (!bundles.length) return [];
  const codexRoot = codexSqliteHome(home);
  const changes: SessionOperationDatabaseChange[] = [];
  const grouped = new Map<string, CodexDatabaseBundleManifest[]>();
  for (const bundle of bundles) {
    assertAllowedCodexBundleManifest(bundle, manifest.sessionId);
    if (bundle.action !== "restore") {
      changes.push(dbChange(path.join(codexRoot, bundle.databaseName), bundle.table, `session = ${jsonQuote(manifest.sessionId)}`, "skip", "agentscope.import.codex.logs-summary"));
      continue;
    }
    const existing = grouped.get(bundle.databaseName) ?? [];
    existing.push(bundle);
    grouped.set(bundle.databaseName, existing);
  }
  try {
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
        const transactionChanges: SessionOperationDatabaseChange[] = [];
        const transactionSteps: RestoreJournalStep[] = [];
        appendRestoreJournalStepSync(restoreJournal, {
          phase: "sqlite_import",
          action: "sqlite_transaction_started",
          status: "started",
          database: dbPath
        });
        const transaction = db.transaction(() => {
          for (const bundle of databaseBundles) {
            const source = resolveSafeRelative(backupDir, bundle.relativePath);
            const expectedSha = bundle.sha256;
            const actualSha = fs.existsSync(source) ? hashPathSync(source) : undefined;
            if (!fs.existsSync(source)) throw new Error(`Codex row bundle is missing: ${source}`);
            if (expectedSha && actualSha && expectedSha !== actualSha) throw new Error(`Codex row bundle checksum mismatch: ${source}`);
            const payload = JSON.parse(fs.readFileSync(source, "utf8")) as Record<string, unknown>;
            validateCodexBundlePayload(payload, bundle, manifest.sessionId);
            const rows = Array.isArray(payload.rows) ? payload.rows.filter(isObjectValue) : [];
            validateCodexBundleRows(bundle.table, rows, manifest.sessionId, bundle.action);
            appendRestoreJournalStepSync(restoreJournal, {
              phase: "sqlite_import",
              action: "sqlite_insert_rows",
              status: "started",
              database: dbPath,
              table: bundle.table,
              path: source,
              estimatedRows: rows.length
            });
            const inserted = insertBundleRows(db, bundle.table, rows, manifest.sessionId);
            const change = {
              ...dbChange(dbPath, bundle.table, `session = ${jsonQuote(manifest.sessionId)}`, inserted ? "insert" : "skip", "agentscope.import.codex"),
              estimatedRows: inserted
            };
            transactionChanges.push(change);
            transactionSteps.push({
              phase: "sqlite_import",
              action: inserted ? "sqlite_insert_rows" : "sqlite_insert_rows",
              status: inserted ? "succeeded" : "skipped",
              database: dbPath,
              table: bundle.table,
              path: source,
              estimatedRows: inserted
            });
          }
        });
        transaction();
        changes.push(...transactionChanges);
        for (const step of transactionSteps) appendRestoreJournalStepSync(restoreJournal, step);
        appendRestoreJournalStepSync(restoreJournal, {
          phase: "sqlite_import",
          action: "sqlite_transaction_committed",
          status: "succeeded",
          database: dbPath
        });
      } finally {
        db.close();
      }
    }
  } catch (error) {
    appendRestoreJournalStepSync(restoreJournal, {
      phase: "sqlite_import",
      action: "sqlite_transaction_failed",
      status: "failed",
      error: error instanceof Error ? error.message : String(error)
    });
    const rollbackError = rollbackCodexDatabaseImports(changes, manifest.sessionId, restoreJournal);
    if (rollbackError) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${message}; Codex SQLite import rollback failed: ${rollbackError.message}`);
    }
    throw error;
  }
  return changes.filter((change) => change.estimatedRows !== 0 || change.action === "skip");
}

function rollbackCodexDatabaseImports(
  changes: SessionOperationDatabaseChange[],
  sessionId: string,
  restoreJournal?: RestoreJournal | undefined
): Error | undefined {
  const seen = new Set<string>();
  for (const change of [...changes].reverse()) {
    if (change.action !== "insert" || !change.estimatedRows) continue;
    const key = `${path.resolve(change.database).toLowerCase()}\0${change.table}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const where = codexRollbackWhere(change.table);
    if (!where) continue;
    const db = openWritableDb(change.database);
    if (!db) continue;
    try {
      appendRestoreJournalStepSync(restoreJournal, {
        phase: "rollback",
        action: "rollback_sqlite_delete_rows",
        status: "started",
        database: change.database,
        table: change.table,
        estimatedRows: change.estimatedRows
      });
      db.pragma("busy_timeout = 5000");
      db.pragma("foreign_keys = ON");
      const transaction = db.transaction(() => {
        const columns = tableColumns(db, change.table);
        if (!columns.size || !whereColumnsExist(columns, where)) return;
        db.prepare(`DELETE FROM ${quoteIdentifier(change.table)} WHERE ${where}`).run(...rollbackWhereParams(where, sessionId));
      });
      transaction();
      appendRestoreJournalStepSync(restoreJournal, {
        phase: "rollback",
        action: "rollback_sqlite_delete_rows",
        status: "succeeded",
        database: change.database,
        table: change.table,
        estimatedRows: change.estimatedRows
      });
    } catch (error) {
      appendRestoreJournalStepSync(restoreJournal, {
        phase: "rollback",
        action: "rollback_sqlite_delete_rows",
        status: "failed",
        database: change.database,
        table: change.table,
        estimatedRows: change.estimatedRows,
        error: error instanceof Error ? error.message : String(error)
      });
      return error instanceof Error ? error : new Error(String(error));
    } finally {
      db.close();
    }
  }
  return undefined;
}

function codexRollbackWhere(table: string): string | undefined {
  if (table === "threads") return "id = ?";
  if (table === "thread_spawn_edges") return "parent_thread_id = ? OR child_thread_id = ?";
  if (["thread_dynamic_tools", "thread_goals", "stage1_outputs"].includes(table)) return "thread_id = ?";
  return undefined;
}

function rollbackWhereParams(where: string, sessionId: string): unknown[] {
  return Array(Math.max(1, where.match(/\?/g)?.length ?? 1)).fill(sessionId);
}

function preflightCodexDatabaseBundles(manifest: BackupManifest, backupDir: string, home: string | undefined): void {
  if (manifest.agent !== "codex") return;
  const bundles = manifest.databaseBundles ?? [];
  const codexRoot = codexSqliteHome(home);
  for (const bundle of bundles) {
    assertAllowedCodexBundleManifest(bundle, manifest.sessionId);
    const source = resolveSafeRelative(backupDir, bundle.relativePath);
    if (!fs.existsSync(source)) throw new Error(`Codex row bundle is missing: ${source}`);
    const actualSha = hashPathSync(source);
    if (bundle.sha256 && actualSha && bundle.sha256 !== actualSha) throw new Error(`Codex row bundle checksum mismatch: ${source}`);
    const payload = JSON.parse(fs.readFileSync(source, "utf8")) as Record<string, unknown>;
    validateCodexBundlePayload(payload, bundle, manifest.sessionId);
    const rows = Array.isArray(payload.rows) ? payload.rows.filter(isObjectValue) : [];
    validateCodexBundleRows(bundle.table, rows, manifest.sessionId, bundle.action);
    if (bundle.action !== "restore") continue;
    const dbPath = path.join(codexRoot, bundle.databaseName);
    const db = openWritableDb(dbPath);
    if (!db) continue;
    try {
      db.pragma("busy_timeout = 5000");
      const columns = tableColumns(db, bundle.table);
      if (!columns.size) continue;
      const identity = bundleIdentity(bundle.table, columns);
      if (identity && rowExists(db, bundle.table, identity, manifest.sessionId)) {
        throw new Error(`Import target already exists in ${bundle.table}: ${manifest.sessionId}`);
      }
    } finally {
      db.close();
    }
  }
}

function assertAllowedCodexBundleManifest(bundle: CodexDatabaseBundleManifest, sessionId: string): void {
  const spec = codexBundleSpecs(sessionId, "").find(
    (item) => item.databaseName === bundle.databaseName && item.table === bundle.table
  );
  if (!spec) throw new Error(`Unsupported Codex SQLite row bundle target: ${bundle.databaseName}:${bundle.table}`);
  const expectedAction = spec.summary ? "summary" : "restore";
  if (bundle.action !== expectedAction) throw new Error(`Unsupported Codex SQLite row bundle action for ${bundle.table}: ${bundle.action}`);
  const expectedRelative = path.join("db", `${bundle.databaseName}-${bundle.table}.json`);
  if (path.normalize(bundle.relativePath) !== path.normalize(expectedRelative)) {
    throw new Error(`Unsafe Codex row bundle relative path: ${bundle.relativePath}`);
  }
}

function validateCodexBundlePayload(
  payload: Record<string, unknown>,
  bundle: CodexDatabaseBundleManifest,
  sessionId: string
): void {
  if (payload.schemaVersion !== 1 || payload.kind !== "AgentScope Codex SQLite Row Bundle") {
    throw new Error("Codex row bundle is not an AgentScope SQLite row bundle.");
  }
  if (payload.agent !== "codex") throw new Error("Codex row bundle agent mismatch.");
  if (payload.sessionId !== sessionId) throw new Error("Codex row bundle session id mismatch.");
  if (payload.databaseName !== bundle.databaseName) throw new Error("Codex row bundle database mismatch.");
  if (payload.table !== bundle.table) throw new Error("Codex row bundle table mismatch.");
  if (payload.action !== bundle.action) throw new Error("Codex row bundle action mismatch.");
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  if (rows.length !== bundle.rowCount) throw new Error(`Codex row bundle row count mismatch for ${bundle.table}.`);
}

function validateCodexBundleRows(
  table: string,
  rows: Record<string, unknown>[],
  sessionId: string,
  action: CodexDatabaseBundleManifest["action"]
): void {
  for (const row of rows) {
    if (table === "logs") {
      if (action !== "summary" || row.thread_id !== sessionId) {
        throw new Error("Codex logs summary bundle row does not belong to this session.");
      }
      continue;
    }
    if (table === "threads" && row.id !== sessionId) throw new Error("Codex threads bundle row does not belong to this session.");
    if (["thread_dynamic_tools", "thread_goals", "stage1_outputs"].includes(table) && row.thread_id !== sessionId) {
      throw new Error(`Codex ${table} bundle row does not belong to this session.`);
    }
    if (table === "thread_spawn_edges" && row.parent_thread_id !== sessionId && row.child_thread_id !== sessionId) {
      throw new Error("Codex thread_spawn_edges bundle row does not reference this session.");
    }
  }
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
  if (table === "thread_dynamic_tools" && columns.has("thread_id")) return { where: "thread_id = ?", params: [] };
  if (table === "thread_goals" && columns.has("thread_id")) return { where: "thread_id = ?", params: [] };
  if (table === "stage1_outputs" && columns.has("thread_id")) return { where: "thread_id = ?", params: [] };
  if (table === "thread_spawn_edges" && columns.has("parent_thread_id") && columns.has("child_thread_id")) {
    return { where: "parent_thread_id = ? OR child_thread_id = ?", params: [] };
  }
  return undefined;
}

function rowExists(
  db: Database.Database,
  table: string,
  identity: { where: string; params: unknown[] },
  sessionId: string
): boolean {
  const params = identity.params.length ? identity.params : Array(Math.max(1, identity.where.match(/\?/g)?.length ?? 1)).fill(sessionId);
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

function backupNotes(agent: AgentKind): string[] {
  const common = ["Credentials, settings, and global config are excluded from session backups."];
  if (agent === "codex") return [...common, "Codex row-level SQLite bundles are exported for compatible restore; logs_2.sqlite is backed up as summary only."];
  if (agent === "claude") return [...common, "Claude session transcript and session-keyed sidecar directories are copied when present."];
  return common;
}

function deleteNotes(agent: AgentKind): string[] {
  const common = ["Delete writes an AgentScope backup first, then records each destructive step in quarantine/journal.json."];
  if (agent === "codex") return [...common, "Codex SQLite rows are deleted in transactions before rollout files are quarantined; logs_2.sqlite log bodies are not deleted."];
  if (agent === "claude") return [...common, "Global history, daemon roster, and .claude.json are inspected but not modified until reversible patch restore is implemented."];
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

async function directoryManifest(root: string, role: string): Promise<DirectoryManifest> {
  const entries: DirectoryManifestEntry[] = [];
  await walkMaybe(root, async (filePath) => {
    const stat = await fs.promises.stat(filePath);
    const relativePath = path.relative(root, filePath).split(path.sep).join("/");
    if (!relativePath || relativePath.startsWith("../") || path.isAbsolute(relativePath)) {
      throw new Error(`Unsafe directory backup path: ${filePath}`);
    }
    const fileHash = await hashPath(filePath);
    if (!fileHash) return;
    entries.push({
      relativePath,
      kind: "file",
      bytes: stat.size,
      sha256: fileHash
    });
  });
  entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return {
    schemaVersion: 1,
    kind: "AgentScope Directory Tree",
    rootRole: role,
    entries,
    treeHash: hashDirectoryEntries(entries)
  };
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

async function preflightImportFiles(manifest: BackupManifest, backupDir: string, home: string | undefined): Promise<void> {
  const filesRoot = path.join(backupDir, "files");
  for (const file of manifestCopiedFiles(manifest)) {
    const role = typeof file.role === "string" ? file.role : "";
    const originalPath = typeof file.path === "string" ? file.path : undefined;
    const backupRelativePath = typeof file.backupRelativePath === "string" ? file.backupRelativePath : undefined;
    if (!originalPath || !backupRelativePath) throw new Error("Backup manifest copied file is missing path or backupRelativePath.");
    assertSafeImportTarget(manifest.agent, role, originalPath, manifest.sessionId, home, file);
    const source = resolveSafeRelative(filesRoot, backupRelativePath);
    if (!(await pathExists(source))) throw new Error(`Backup file is missing: ${source}`);
    const stat = await fs.promises.stat(source);
    if (stat.isDirectory()) {
      if (!isDirectoryManifest(file.directoryTree)) throw new Error(`Backup directory tree manifest is missing for ${role}: ${source}`);
      validateBackupSourceTree(file, source);
    } else {
      const expectedSha = typeof file.sha256 === "string" ? file.sha256 : undefined;
      const actualSha = await hashPath(source);
      if (!actualSha) throw new Error(`Backup file cannot be hashed: ${source}`);
      if (!expectedSha) throw new Error(`Backup checksum is missing from manifest: ${source}`);
      if (expectedSha !== actualSha) throw new Error(`Backup checksum mismatch: ${source}`);
    }
  }
}

async function assertImportTargetsAbsent(copiedFiles: Array<Record<string, unknown>>): Promise<void> {
  for (const file of copiedFiles) {
    const originalPath = typeof file.path === "string" ? file.path : undefined;
    if (originalPath && await pathExists(originalPath)) throw new Error(`Import target already exists: ${originalPath}`);
  }
}

function assertSafeImportTarget(
  agent: AgentKind,
  role: string,
  targetPath: string,
  sessionId: string,
  home: string | undefined,
  manifestFile?: Record<string, unknown> | undefined
): void {
  const root = home ?? userHome();
  const normalized = path.resolve(targetPath).toLowerCase();
  const forbiddenNames = [
    "auth.json",
    "auth",
    ".auth",
    "credentials",
    ".credentials",
    "credentials.json",
    ".credentials.json",
    "credential.json",
    ".credential.json",
    "settings.json",
    "settings.local.json",
    "settings.local.toml",
    "settings.toml",
    "config.toml",
    "config.json",
    "plugins",
    "skills",
    "rules",
    ".claude.json",
    "history.jsonl"
  ];
  const parts = normalized.split(/[\\/]+/);
  if (forbiddenNames.some((name) => parts.includes(name) || normalized.endsWith(`\\${name}`) || normalized.endsWith(`/${name}`))) {
    throw new Error(`Unsafe import target is a protected agent file or directory: ${targetPath}`);
  }
  if (agent === "codex") {
    const codexRoot = codexHome(root);
    const sessionsRoots = [path.join(codexRoot, "sessions"), path.join(codexRoot, "archived_sessions")];
    const name = path.basename(targetPath);
    if (
      role !== "transcript" ||
      !sessionsRoots.some((sessionsRoot) => pathInside(sessionsRoot, targetPath)) ||
      !name.startsWith("rollout-") ||
      !name.endsWith(".jsonl") ||
      !name.includes(sessionId)
    ) {
      throw new Error(`Unsafe Codex import target for ${role}: ${targetPath}`);
    }
    return;
  }
  if (agent === "claude") {
    const claudeRoot = claudeHome(root);
    const jobsRoot = path.join(claudeRoot, "jobs");
    const allowedByRole: Record<string, string[]> = {
      transcript: [path.join(claudeRoot, "projects")],
      "claude.active_session_pid_map": [path.join(claudeRoot, "sessions")],
      "claude.session_sidecar": [path.join(claudeRoot, "projects")],
      "claude.file_history": [path.join(claudeRoot, "file-history", sessionId)],
      "claude.session_env": [path.join(claudeRoot, "session-env", sessionId)],
      "claude.image_cache": [path.join(claudeRoot, "image-cache", sessionId)],
      "claude.job_state": [jobsRoot]
    };
    const roots = allowedByRole[role];
    if (!roots || !roots.some((allowedRoot) => pathInside(allowedRoot, targetPath))) {
      throw new Error(`Unsafe Claude import target for ${role}: ${targetPath}`);
    }
    const basename = path.basename(targetPath).toLowerCase();
    if (role === "transcript" && !basename.endsWith(".jsonl")) {
      throw new Error(`Unsafe Claude import target extension for ${role}: ${targetPath}`);
    }
    if ((role === "claude.active_session_pid_map" || role === "claude.job_state") && !basename.endsWith(".json")) {
      throw new Error(`Unsafe Claude import target extension for ${role}: ${targetPath}`);
    }
    if (role === "claude.job_state") {
      if (basename !== "state.json" || path.dirname(path.resolve(targetPath)).toLowerCase() === path.resolve(jobsRoot).toLowerCase()) {
        throw new Error(`Unsafe Claude job state import target for ${role}: ${targetPath}`);
      }
      if (!manifestEvidenceReferencesSession(manifestFile)) {
        throw new Error(`Unsafe Claude job state import target is missing session evidence: ${targetPath}`);
      }
    }
    if ((role === "transcript" || role === "claude.session_sidecar" || role === "claude.file_history" || role === "claude.session_env" || role === "claude.image_cache") && !targetPath.toLowerCase().includes(sessionId.toLowerCase())) {
      throw new Error(`Unsafe Claude import target is not keyed by this session id: ${targetPath}`);
    }
    return;
  }
  throw new Error(`Unsupported backup agent for import target validation: ${agent}`);
}

function manifestEvidenceReferencesSession(file: Record<string, unknown> | undefined): boolean {
  const evidence = Array.isArray(file?.evidence) ? file.evidence : [];
  return evidence.some((item) => {
    if (!isObjectValue(item)) return false;
    const source = typeof item.source === "string" ? item.source : "";
    const field = typeof item.field === "string" ? item.field : "";
    return source === "claude.jobs" && /(?:^|,)resumeSessionId(?:,|$)|(?:^|,)sessionId(?:,|$)/i.test(field.replace(/\s/g, ""));
  });
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
    if (entry.isSymbolicLink()) throw new Error(`Unsafe symbolic link in session directory backup: ${filePath}`);
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

function validateBackupSourceTree(file: Record<string, unknown>, source: string): void {
  const tree = file.directoryTree;
  if (!isDirectoryManifest(tree)) return;
  const expected = new Map(tree.entries.map((entry) => [entry.relativePath, entry]));
  const seen = new Set<string>();
  const actualEntries: DirectoryManifestEntry[] = [];
  walkMaybeSync(source, (filePath) => {
    const relativePath = path.relative(source, filePath).split(path.sep).join("/");
    if (!relativePath || relativePath.startsWith("../") || path.isAbsolute(relativePath)) {
      throw new Error(`Unsafe backup directory entry: ${filePath}`);
    }
    const expectedEntry = expected.get(relativePath);
    if (!expectedEntry) throw new Error(`Unexpected file in backup directory: ${relativePath}`);
    const stat = fs.statSync(filePath);
    const actualSha = hashPathSync(filePath);
    if (!actualSha || actualSha !== expectedEntry.sha256 || stat.size !== expectedEntry.bytes) {
      throw new Error(`Backup directory checksum mismatch: ${relativePath}`);
    }
    seen.add(relativePath);
    actualEntries.push({
      relativePath,
      kind: "file",
      bytes: stat.size,
      sha256: actualSha
    });
  });
  for (const relativePath of expected.keys()) {
    if (!seen.has(relativePath)) throw new Error(`Backup directory file is missing: ${relativePath}`);
  }
  actualEntries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  if (hashDirectoryEntries(actualEntries) !== tree.treeHash) throw new Error(`Backup directory tree hash mismatch: ${source}`);
}

function isDirectoryManifest(value: unknown): value is DirectoryManifest {
  if (!isObjectValue(value)) return false;
  if (value.schemaVersion !== 1 || value.kind !== "AgentScope Directory Tree") return false;
  if (typeof value.rootRole !== "string" || typeof value.treeHash !== "string") return false;
  if (!Array.isArray(value.entries)) return false;
  return value.entries.every((entry) => {
    if (!isObjectValue(entry)) return false;
    return typeof entry.relativePath === "string" &&
      entry.kind === "file" &&
      typeof entry.bytes === "number" &&
      Number.isFinite(entry.bytes) &&
      typeof entry.sha256 === "string" &&
      !entry.relativePath.startsWith("../") &&
      !entry.relativePath.startsWith("..\\") &&
      !entry.relativePath.includes("/../") &&
      !entry.relativePath.includes("\\..\\") &&
      !path.isAbsolute(entry.relativePath);
  });
}

function hashDirectoryEntries(entries: DirectoryManifestEntry[]): string {
  return crypto.createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}

function hashPathSync(filePath: string): string | undefined {
  const stat = fs.statSync(filePath, { throwIfNoEntry: false });
  if (!stat?.isFile()) return undefined;
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function walkMaybeSync(root: string, visitor: (filePath: string) => void): void {
  if (!fs.existsSync(root)) return;
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const filePath = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Unsafe symbolic link in backup directory: ${filePath}`);
    if (entry.isDirectory()) walkMaybeSync(filePath, visitor);
    else visitor(filePath);
  }
}

async function removeImportedFiles(importedFiles: SessionOperationFile[], restoreJournal?: RestoreJournal | undefined): Promise<void> {
  for (const file of [...importedFiles].reverse()) {
    await appendRestoreJournalStep(restoreJournal, {
      phase: "rollback",
      action: "rollback_remove_imported_file",
      status: "started",
      role: file.role,
      path: file.path
    });
    try {
      await fs.promises.rm(file.path, { recursive: true, force: true });
      await appendRestoreJournalStep(restoreJournal, {
        phase: "rollback",
        action: "rollback_remove_imported_file",
        status: "succeeded",
        role: file.role,
        path: file.path
      });
    } catch (error) {
      await appendRestoreJournalStep(restoreJournal, {
        phase: "rollback",
        action: "rollback_remove_imported_file",
        status: "failed",
        role: file.role,
        path: file.path,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
    await appendRestoreJournalStep(restoreJournal, {
      phase: "rollback",
      action: "cleanup_parent_dir",
      status: "started",
      path: path.dirname(file.path)
    });
    await pruneEmptyParents(path.dirname(file.path), 3);
    await appendRestoreJournalStep(restoreJournal, {
      phase: "rollback",
      action: "cleanup_parent_dir",
      status: "succeeded",
      path: path.dirname(file.path)
    });
  }
}

async function pruneEmptyParents(start: string, maxDepth: number): Promise<void> {
  let current = start;
  for (let index = 0; index < maxDepth; index += 1) {
    const entries = await fs.promises.readdir(current).catch(() => undefined);
    if (!entries || entries.length) return;
    await fs.promises.rmdir(current).catch(() => undefined);
    current = path.dirname(current);
  }
}

function resolveSafeRelative(root: string, relativePath: string): string {
  if (!relativePath || path.isAbsolute(relativePath)) throw new Error(`Unsafe backup relative path: ${relativePath}`);
  if (relativePath.split(/[\\/]+/).some((part) => part === "..")) throw new Error(`Unsafe backup relative path: ${relativePath}`);
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
  return options.outputRoot ?? agentScopeHome(options.home);
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
