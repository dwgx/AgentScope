import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { AgentSession, AgentSessionKind, Evidence, IndexRecord, Relation, Transcript } from "@agentscope/shared";
import { analyzeTranscriptActivity } from "./activity.js";
import { codexHome, normalizeWindowsPath } from "./paths.js";
import { iterateJsonl } from "./jsonl.js";

const rolloutNameRe = /^rollout-(.+)\.jsonl$/i;
const rolloutStartRe = /^rollout-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-/i;
const uuidTailRe = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

interface CodexThreadSourceMetadata {
  parentThreadId?: string;
  depth?: number;
  agentPath?: string;
  agentNickname?: string;
  agentRole?: string;
  kind?: "subagent";
}

export function loadCodexIndex(home?: string): {
  sessions: AgentSession[];
  records: IndexRecord[];
  relations: Relation[];
} {
  const dbPath = path.join(codexHome(home), "state_5.sqlite");
  if (!fs.existsSync(dbPath)) return { sessions: [], records: [], relations: [] };
  const opened = openCodexDb(dbPath);
  if (!opened) return { sessions: [], records: [], relations: [] };
  const { db, evidencePath } = opened;
  try {
    const logMetadata = loadCodexLogMetadata(codexHome(home));
    const rows = selectExistingColumns(db, "threads", [
      "id",
      "rollout_path",
      "cwd",
      "title",
      "source",
      "created_at",
      "created_at_ms",
      "updated_at",
      "updated_at_ms",
      "cli_version",
      "model_provider",
      "model",
      "reasoning_effort",
      "tokens_used",
      "sandbox_policy",
      "approval_mode",
      "git_sha",
      "git_branch",
      "archived",
      "archived_at",
      "has_user_event",
      "memory_mode",
      "agent_nickname",
      "agent_role",
      "agent_path",
      "thread_source"
    ]);
    const sessions: AgentSession[] = [];
    const records: IndexRecord[] = [];
    const sourceRelations: Relation[] = [];
    for (const row of rows) {
      const sessionId = stringValue(row.id);
      if (!sessionId) continue;
      const rolloutPath = normalizeWindowsPath(stringValue(row.rollout_path));
      const cwd = normalizeWindowsPath(stringValue(row.cwd));
      const startedAt = rolloutPath ? rolloutStartedAt(rolloutPath) : undefined;
      const evidence = [
        {
          source: "codex.sqlite.threads",
          detail: "Codex thread record loaded from state_5.sqlite threads table.",
          path: evidencePath,
          field: Object.keys(row).join(",")
        }
      ];
      const metadata = safeCodexThreadMetadata(row);
      const sourceMetadata = parseCodexThreadSource(row.source);
      const mergedMetadata = compactMetadata({
        ...metadata,
        ...codexThreadSourceMetadata(sourceMetadata),
        ...(logMetadata.get(sessionId) ?? {})
      });
      const kindEvidence = codexSessionKindEvidence(mergedMetadata, sourceMetadata);
      sessions.push({
        agent: "codex",
        sessionId,
        cwd,
        transcriptPath: rolloutPath,
        indexSource: "codex.sqlite.threads",
        childSessionIds: [],
        sessionKind: kindEvidence.kind,
        sessionKindEvidence: kindEvidence.evidence,
        confidence: "indexed",
        title: stringValue(row.title),
        startedAt: stringValue(row.created_at) ?? startedAt,
        updatedAt: stringValue(row.updated_at),
        indexMetadata: mergedMetadata,
        evidence: appendEvidenceUnique(evidence, kindEvidence.evidence)
      });
      records.push({
        agent: "codex",
        sessionId,
        source: "codex.sqlite.threads",
        path: rolloutPath,
        cwd,
        title: stringValue(row.title),
        startedAt: stringValue(row.created_at) ?? startedAt,
        updatedAt: stringValue(row.updated_at),
        metadata: mergedMetadata,
        evidence
      });
      const sourceParentId = sourceMetadata?.parentThreadId;
      if (sourceParentId && sourceParentId !== sessionId) {
        sourceRelations.push({
          kind: "parent_child",
          sourceId: sourceParentId,
          targetId: sessionId,
          confidence: "indexed",
          metadata: compactMetadata({
            sourceKind: "codex_thread_source",
            subagentDepth: sourceMetadata.depth,
            agentNickname: sourceMetadata.agentNickname,
            agentRole: sourceMetadata.agentRole,
            agentPath: sourceMetadata.agentPath
          }),
          evidence: [
            {
              source: "codex.sqlite.threads.source",
              detail: "Parent thread inferred from structured Codex thread source metadata.",
              path: evidencePath,
              field: "threads.source"
            }
          ]
        });
      }
    }
    const relations = classifyRelationsWithSessions(mergeRelations([...loadSpawnEdges(db, evidencePath), ...sourceRelations]), sessions);
    applyRelationsToSessions(sessions, relations);
    return { sessions, records, relations };
  } finally {
    db.close();
  }
}

export async function scanCodexRollouts(home?: string): Promise<{
  transcripts: Transcript[];
  sessions: AgentSession[];
  records: IndexRecord[];
  relations: Relation[];
}> {
  const root = path.join(codexHome(home), "sessions");
  if (!fs.existsSync(root)) return { transcripts: [], sessions: [], records: [], relations: [] };
  const files: string[] = [];
  walk(root, (filePath) => {
    if (rolloutThreadId(filePath)) files.push(filePath);
  });
  files.sort();
  const transcripts: Transcript[] = [];
  const sessions: AgentSession[] = [];
  const records: IndexRecord[] = [];
  const relations: Relation[] = [];
  for (const filePath of files) {
    const sessionId = rolloutThreadId(filePath);
    if (!sessionId) continue;
    const metadata = await readRolloutMetadata(filePath);
    const activity = await analyzeTranscriptActivity("codex", filePath);
    const cwd = normalizeWindowsPath(stringValue(metadata.cwd));
    const startedAt = rolloutStartedAt(filePath);
    const updatedAt = fs.statSync(filePath).mtime.toISOString();
    const evidence = [
      {
        source: "codex.sessions.rollout",
        detail: "Codex rollout JSONL discovered under .codex/sessions/YYYY/MM/DD.",
        path: filePath,
        field: "filename,cwd,jsonl"
      }
    ];
    const kindEvidence = codexSessionKindEvidence(metadata);
    transcripts.push({ agent: "codex", sessionId, path: filePath, cwd, updatedAt, activity, evidence });
    sessions.push({
      agent: "codex",
      sessionId,
      cwd,
      transcriptPath: filePath,
      indexSource: "codex.sessions.rollout",
      childSessionIds: [],
      sessionKind: kindEvidence.kind,
      sessionKindEvidence: kindEvidence.evidence,
      confidence: "indexed",
      title: stringValue(metadata.title),
      startedAt,
      updatedAt,
      indexMetadata: compactMetadata({ ...metadata, activity_line_count: activity.lineCount }),
      activity,
      evidence: appendEvidenceUnique(evidence, kindEvidence.evidence)
    });
    records.push({
      agent: "codex",
      sessionId,
      source: "codex.sessions.rollout",
      path: filePath,
      cwd,
      title: stringValue(metadata.title),
      startedAt,
      updatedAt,
      metadata: { ...metadata, activity },
      evidence
    });
    const parentSessionId = stringValue(metadata.parent_thread_id) ?? stringValue(metadata.parent_id);
    if (parentSessionId && parentSessionId !== sessionId) {
      relations.push({
        kind: kindEvidence.kind === "subagent" ? "subagent" : "parent_child",
        sourceId: parentSessionId,
        targetId: sessionId,
        confidence: "indexed",
        evidence: appendEvidenceUnique(
          [
            {
              source: "codex.sessions.rollout.parent",
              detail: "Parent/child relation inferred from Codex rollout JSONL metadata.",
              path: filePath,
              field: "parent_thread_id,parent_id"
            }
          ],
          kindEvidence.evidence
        )
      });
    }
  }
  return { transcripts, sessions, records, relations: mergeRelations(relations) };
}

export function rolloutThreadId(filePath: string): string | undefined {
  const match = rolloutNameRe.exec(path.basename(filePath));
  if (!match) return undefined;
  const value = match[1]!;
  return uuidTailRe.exec(value)?.[1] ?? value;
}

export function rolloutStartedAt(filePath: string): string | undefined {
  const match = rolloutStartRe.exec(path.basename(filePath));
  if (!match) return undefined;
  const [, day, hour, minute, second] = match;
  const date = new Date(`${day}T${hour}:${minute}:${second}`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export async function readRolloutMetadata(filePath: string): Promise<Record<string, unknown>> {
  const metadata: Record<string, unknown> = {};
  let parsed = 0;
  await iterateJsonl(filePath, (_line, _raw, value) => {
    parsed += 1;
    collectMetadata(value, metadata);
    return parsed < 2500 && (parsed < 250 || missingImportantRolloutMetadata(metadata));
  }).catch(() => undefined);
  metadata.metadata_scan_lines = parsed;
  return metadata;
}

export function openCodexDb(dbPath: string): { db: Database.Database; evidencePath: string } | undefined {
  try {
    return { db: new Database(dbPath, { readonly: true, fileMustExist: true }), evidencePath: dbPath };
  } catch {
    try {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-sqlite-"));
      const target = path.join(tempDir, "state_5.sqlite");
      fs.copyFileSync(dbPath, target);
      for (const suffix of ["-wal", "-shm"]) {
        if (fs.existsSync(dbPath + suffix)) fs.copyFileSync(dbPath + suffix, target + suffix);
      }
      return { db: new Database(target, { readonly: true, fileMustExist: true }), evidencePath: target };
    } catch {
      return undefined;
    }
  }
}

export function tableColumns(db: Database.Database, table: string): Set<string> {
  try {
    const rows = db.prepare(`PRAGMA table_info("${table.replaceAll('"', '""')}")`).all() as Array<{ name: string }>;
    return new Set(rows.map((row) => row.name));
  } catch {
    return new Set();
  }
}

function selectExistingColumns(
  db: Database.Database,
  table: string,
  requested: string[]
): Record<string, unknown>[] {
  const existing = tableColumns(db, table);
  const columns = requested.filter((column) => existing.has(column));
  if (!columns.length) return [];
  const quoted = columns.map(quoteIdentifier).join(",");
  try {
    return db.prepare(`SELECT ${quoted} FROM ${quoteIdentifier(table)}`).all() as Record<string, unknown>[];
  } catch {
    return [];
  }
}

function safeCodexThreadMetadata(row: Record<string, unknown>): Record<string, unknown> {
  return compactMetadata({
    source: row.source,
    cli_version: row.cli_version,
    model_provider: row.model_provider,
    model: row.model,
    reasoning_effort: row.reasoning_effort,
    tokens_used: row.tokens_used,
    sandbox_policy: row.sandbox_policy,
    approval_mode: row.approval_mode,
    git_sha: row.git_sha,
    git_branch: row.git_branch,
    archived: row.archived,
    archived_at: row.archived_at,
    has_user_event: row.has_user_event,
    memory_mode: row.memory_mode,
    agent_nickname: row.agent_nickname,
    agent_role: row.agent_role,
    agent_path: row.agent_path,
    thread_source: row.thread_source,
    created_at_ms: row.created_at_ms,
    updated_at_ms: row.updated_at_ms
  });
}

function compactMetadata(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

function loadCodexLogMetadata(codexRoot: string): Map<string, Record<string, unknown>> {
  const dbPath = path.join(codexRoot, "logs_2.sqlite");
  if (!fs.existsSync(dbPath)) return new Map();
  const opened = openCodexDb(dbPath);
  if (!opened) return new Map();
  try {
    const rows = opened.db
      .prepare(
        `SELECT thread_id,
                COUNT(*) AS log_count,
                SUM(CASE WHEN upper(level) = 'WARN' THEN 1 ELSE 0 END) AS warn_count,
                SUM(CASE WHEN upper(level) = 'ERROR' THEN 1 ELSE 0 END) AS error_count,
                MIN(ts) AS first_log_ts,
                MAX(ts) AS last_log_ts,
                COUNT(DISTINCT process_uuid) AS process_uuid_count
         FROM logs
         WHERE thread_id IS NOT NULL AND thread_id != ''
         GROUP BY thread_id`
      )
      .all() as Array<Record<string, unknown>>;
    const targetRows = opened.db
      .prepare(
        `SELECT thread_id, target, COUNT(*) AS count
         FROM logs
         WHERE thread_id IS NOT NULL AND thread_id != '' AND target IS NOT NULL AND target != ''
         GROUP BY thread_id, target
         ORDER BY thread_id, count DESC`
      )
      .all() as Array<Record<string, unknown>>;
    const targets = new Map<string, string>();
    for (const row of targetRows) {
      const threadId = stringValue(row.thread_id);
      if (threadId && !targets.has(threadId)) targets.set(threadId, stringValue(row.target) ?? "");
    }
    return new Map(
      rows.flatMap((row) => {
        const threadId = stringValue(row.thread_id);
        if (!threadId) return [];
        return [
          [
            threadId,
            compactMetadata({
              log_count: row.log_count,
              log_warn_count: row.warn_count,
              log_error_count: row.error_count,
              log_first_ts: row.first_log_ts,
              log_last_ts: row.last_log_ts,
              log_process_uuid_count: row.process_uuid_count,
              log_top_target: targets.get(threadId)
            })
          ] as const
        ];
      })
    );
  } catch {
    return new Map();
  } finally {
    opened.db.close();
  }
}

function loadSpawnEdges(db: Database.Database, dbPath: string): Relation[] {
  const existing = tableColumns(db, "thread_spawn_edges");
  const parentCol = firstExisting(existing, ["parent_thread_id", "parent_id", "source_thread_id", "source_id", "parent"]);
  const childCol = firstExisting(existing, ["child_thread_id", "child_id", "target_thread_id", "target_id", "child"]);
  const statusCol = firstExisting(existing, ["status", "state"]);
  if (!parentCol || !childCol) return [];
  try {
    const selectColumns = [
      `${quoteIdentifier(parentCol)} parent_id`,
      `${quoteIdentifier(childCol)} child_id`,
      statusCol ? `${quoteIdentifier(statusCol)} status` : undefined
    ].filter(Boolean).join(", ");
    const rows = db
      .prepare(`SELECT ${selectColumns} FROM ${quoteIdentifier("thread_spawn_edges")}`)
      .all() as Array<{ parent_id?: unknown; child_id?: unknown; status?: unknown }>;
    return rows.flatMap((row) => {
      const parentId = stringValue(row.parent_id);
      const childId = stringValue(row.child_id);
      if (!parentId || !childId) return [];
      const status = stringValue(row.status);
      return [
        {
          kind: "parent_child" as const,
          sourceId: parentId,
          targetId: childId,
          confidence: "indexed" as const,
          metadata: compactMetadata({
            sourceKind: "codex_thread_spawn_edges",
            spawnStatus: status
          }),
          evidence: [
            {
              source: "codex.sqlite.thread_spawn_edges",
              detail: status
                ? `Parent/child thread relation from thread_spawn_edges table; Codex spawn status is ${status}.`
                : "Parent/child thread relation from thread_spawn_edges table.",
              path: dbPath,
              field: [parentCol, childCol, statusCol].filter(Boolean).join(",")
            }
          ]
        }
      ];
    });
  } catch {
    return [];
  }
}

function mergeRelations(relations: Relation[]): Relation[] {
  const merged = new Map<string, Relation>();
  for (const relation of relations) {
    const key = `${relation.kind}\0${relation.sourceId}\0${relation.targetId}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...relation, metadata: relation.metadata ? { ...relation.metadata } : undefined, evidence: [...relation.evidence] });
      continue;
    }
    existing.confidence = bestConfidence(existing.confidence, relation.confidence);
    existing.metadata = mergeRelationMetadata(existing.metadata, relation.metadata);
    existing.evidence = appendEvidenceUnique(existing.evidence, relation.evidence);
  }
  return [...merged.values()];
}

function classifyRelationsWithSessions(relations: Relation[], sessions: AgentSession[]): Relation[] {
  const byId = new Map(sessions.map((session) => [session.sessionId, session]));
  return relations.map((relation) => {
    if (relation.kind !== "parent_child") return relation;
    const target = byId.get(relation.targetId);
    if (target?.sessionKind !== "subagent") return relation;
    return {
      ...relation,
      kind: "subagent" as const,
      metadata: mergeRelationMetadata(relation.metadata, relationMetadataFromSession(target)),
      evidence: appendEvidenceUnique(relation.evidence, target.sessionKindEvidence ?? [])
    };
  });
}

function mergeRelationMetadata(
  left?: Record<string, unknown>,
  right?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!left) return right ? { ...right } : undefined;
  if (!right) return { ...left };
  return compactMetadata({ ...left, ...right });
}

function relationMetadataFromSession(session: AgentSession): Record<string, unknown> | undefined {
  const metadata = session.indexMetadata ?? {};
  return compactMetadata({
    sourceKind: metadata.sourceKind,
    subagentDepth: metadata.subagent_depth ?? metadata.subagentDepth,
    agentNickname: metadata.agent_nickname ?? metadata.agentNickname,
    agentRole: metadata.agent_role ?? metadata.agentRole,
    agentPath: metadata.agent_path ?? metadata.agentPath,
    spawnStatus: metadata.spawn_status ?? metadata.spawnStatus
  });
}

function bestConfidence(left: Relation["confidence"], right: Relation["confidence"]): Relation["confidence"] {
  const rank: Record<Relation["confidence"], number> = {
    unknown: 0,
    heuristic: 1,
    indexed: 2,
    exact: 3
  };
  return rank[left] >= rank[right] ? left : right;
}

function parseCodexThreadSource(value: unknown): CodexThreadSourceMetadata | undefined {
  const direct = objectValue(value);
  if (direct) return codexThreadSourceFromObject(direct);
  const text = stringValue(value);
  if (!text) return undefined;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return codexThreadSourceFromObject(parsed as Record<string, unknown>);
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function codexThreadSourceFromObject(value: Record<string, unknown>): CodexThreadSourceMetadata | undefined {
  const subagent = objectValue(value.subagent) ?? objectValue(value.subAgent);
  const spawn = subagent ? objectValue(subagent.thread_spawn) ?? objectValue(subagent.threadSpawn) : undefined;
  if (!subagent || !spawn) return undefined;
  const direct =
    stringValue(spawn.parent_thread_id) ??
    stringValue(spawn.parentThreadId) ??
    stringValue(spawn.parent_id) ??
    stringValue(spawn.parentId);
  return compactMetadata({
    parentThreadId: direct,
    depth: numberValue(spawn.depth),
    agentPath: stringValue(spawn.agent_path) ?? stringValue(spawn.agentPath),
    agentNickname: stringValue(spawn.agent_nickname) ?? stringValue(spawn.agentNickname),
    agentRole: stringValue(spawn.agent_role) ?? stringValue(spawn.agentRole),
    kind: "subagent"
  }) as CodexThreadSourceMetadata;
}

function codexThreadSourceMetadata(source?: CodexThreadSourceMetadata): Record<string, unknown> {
  if (!source) return {};
  return compactMetadata({
    sourceKind: "codex_thread_source",
    parent_thread_id: source.parentThreadId,
    subagent_depth: source.depth,
    agent_path: source.agentPath,
    agent_nickname: source.agentNickname,
    agent_role: source.agentRole,
    thread_source: source.kind
  });
}

function applyRelationsToSessions(sessions: AgentSession[], relations: Relation[]): void {
  const byId = new Map(sessions.map((session) => [session.sessionId, session]));
  for (const relation of relations) {
    if (relation.kind !== "parent_child" && relation.kind !== "subagent") continue;
    const parent = byId.get(relation.sourceId);
    const child = byId.get(relation.targetId);
    if (parent && !parent.childSessionIds.includes(relation.targetId)) parent.childSessionIds.push(relation.targetId);
    if (child) {
      child.parentSessionId = relation.sourceId;
      child.indexMetadata = compactMetadata({
        ...(child.indexMetadata ?? {}),
        ...compactMetadata({
          spawn_status: relation.metadata?.spawnStatus,
          subagent_depth: relation.metadata?.subagentDepth,
          agent_nickname: relation.metadata?.agentNickname,
          agent_role: relation.metadata?.agentRole,
          agent_path: relation.metadata?.agentPath
        })
      });
      child.evidence = appendEvidenceUnique(child.evidence, relation.evidence);
      const nextKind = relation.kind === "subagent" ? "subagent" : child.sessionKind === "subagent" ? "subagent" : "child";
      setSessionKind(child, nextKind, relation.evidence);
    }
  }
}

function codexSessionKindEvidence(metadata: Record<string, unknown>, sourceMetadata?: CodexThreadSourceMetadata): {
  kind: AgentSessionKind;
  evidence: Evidence[];
} {
  const evidence: Evidence[] = [];
  const agentNickname = stringValue(metadata.agent_nickname);
  const agentRole = stringValue(metadata.agent_role);
  const agentPath = stringValue(metadata.agent_path);
  const threadSource = stringValue(metadata.thread_source) ?? stringValue(metadata.source);
  if (sourceMetadata?.kind === "subagent" || threadSource === "subagent") {
    evidence.push({
      source: "codex.sqlite.threads.thread_source",
      detail: "Codex thread source metadata identifies this as a subagent thread.",
      field: "thread_source,source"
    });
  }
  if (agentNickname || agentRole || agentPath) {
    evidence.push({
      source: "codex.sqlite.threads.agent_metadata",
      detail: "Codex thread has agent_nickname, agent_role, or agent_path metadata; AgentScope classifies it as a subagent.",
      field: "agent_nickname,agent_role,agent_path"
    });
  }
  if (evidence.length) {
    return { kind: "subagent", evidence };
  }
  return { kind: "session", evidence };
}

function setSessionKind(session: AgentSession, kind: AgentSessionKind, evidence: Evidence[]): void {
  const current = session.sessionKind ?? "session";
  session.sessionKind = strongerSessionKind(current, kind);
  session.sessionKindEvidence = appendEvidenceUnique(session.sessionKindEvidence ?? [], evidence);
}

function strongerSessionKind(left: AgentSessionKind, right: AgentSessionKind): AgentSessionKind {
  const rank: Record<AgentSessionKind, number> = {
    session: 0,
    child: 1,
    subagent_candidate: 2,
    subagent: 3
  };
  return rank[left] >= rank[right] ? left : right;
}

function collectMetadata(value: Record<string, unknown>, metadata: Record<string, unknown>): void {
  collectMetadataFromObject(value, metadata);
  for (const key of ["payload", "message", "data", "event", "turn", "context", "config"]) {
    const nested = value[key];
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) continue;
    collectMetadataFromObject(nested as Record<string, unknown>, metadata);
  }
}

function collectMetadataFromObject(value: Record<string, unknown>, metadata: Record<string, unknown>): void {
  const scalarKeys = [
    "cwd",
    "title",
    "session_id",
    "thread_id",
    "parent_thread_id",
    "parent_id",
    "child_thread_id",
    "model_provider",
    "model",
    "reasoning_effort",
    "approval_mode",
    "approval_policy",
    "sandbox_policy",
    "sandbox_mode",
    "cli_version",
    "agent_nickname",
    "agent_role",
    "agent_path",
    "git_branch",
    "git_sha",
    "entrypoint",
    "source",
    "thread_source"
  ];
  for (const key of scalarKeys) {
    const nextValue = safeMetadataScalar(value[key]);
    if (metadata[key] === undefined && nextValue !== undefined) metadata[key] = nextValue;
  }
  const workspaceRoots = value.workspace_roots ?? value.workspaceRoots;
  if (metadata.workspace_roots_count === undefined && Array.isArray(workspaceRoots)) {
    metadata.workspace_roots_count = workspaceRoots.length;
  }
  const tokenUsage = objectValue(value.usage) ?? objectValue(value.token_usage) ?? objectValue(value.tokenUsage);
  if (tokenUsage) collectTokenMetadata(tokenUsage, metadata);
}

function collectTokenMetadata(value: Record<string, unknown>, metadata: Record<string, unknown>): void {
  const total =
    numberValue(value.total_tokens) ??
    numberValue(value.totalTokens) ??
    sumNumbers([
      value.input_tokens,
      value.output_tokens,
      value.cache_read_input_tokens,
      value.cache_creation_input_tokens,
      value.inputTokens,
      value.outputTokens
    ]);
  if (metadata.total_tokens === undefined && total !== undefined) metadata.total_tokens = total;
  for (const [sourceKey, targetKey] of [
    ["input_tokens", "input_tokens"],
    ["output_tokens", "output_tokens"],
    ["cache_read_input_tokens", "cache_read_input_tokens"],
    ["cache_creation_input_tokens", "cache_creation_input_tokens"],
    ["inputTokens", "input_tokens"],
    ["outputTokens", "output_tokens"]
  ] as const) {
    const nextValue = numberValue(value[sourceKey]);
    if (metadata[targetKey] === undefined && nextValue !== undefined) metadata[targetKey] = nextValue;
  }
}

function missingImportantRolloutMetadata(metadata: Record<string, unknown>): boolean {
  return !(
    metadata.cwd &&
    metadata.title &&
    metadata.model &&
    (metadata.approval_mode || metadata.approval_policy) &&
    (metadata.sandbox_policy || metadata.sandbox_mode)
  );
}

function safeMetadataScalar(value: unknown): string | number | boolean | undefined {
  if (typeof value === "string") return value || undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  return undefined;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function sumNumbers(values: unknown[]): number | undefined {
  let total = 0;
  let found = false;
  for (const value of values) {
    const parsed = numberValue(value);
    if (parsed === undefined) continue;
    total += parsed;
    found = true;
  }
  return found ? total : undefined;
}

function walk(root: string, visitor: (filePath: string) => void): void {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) walk(filePath, visitor);
    else visitor(filePath);
  }
}

function firstExisting(existing: Set<string>, candidates: string[]): string | undefined {
  return candidates.find((candidate) => existing.has(candidate));
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function stringValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value || undefined;
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function appendEvidenceUnique<T extends { source: string; detail: string; path?: string; field?: string }>(
  existing: T[],
  incoming: T[]
): T[] {
  const seen = new Set(existing.map(evidenceKey));
  const merged = [...existing];
  for (const item of incoming) {
    const key = evidenceKey(item);
    if (seen.has(key)) continue;
    merged.push(item);
    seen.add(key);
  }
  return merged;
}

function evidenceKey(item: { source: string; detail: string; path?: string; field?: string }): string {
  return `${item.source}\0${item.detail}\0${item.path ?? ""}\0${item.field ?? ""}`;
}
