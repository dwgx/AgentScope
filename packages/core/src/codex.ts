import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { AgentSession, IndexRecord, Relation, Transcript } from "@agentscope/shared";
import { codexHome, normalizeWindowsPath } from "./paths.js";
import { iterateJsonl } from "./jsonl.js";

const rolloutNameRe = /^rollout-(.+)\.jsonl$/i;
const rolloutStartRe = /^rollout-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-/i;
const uuidTailRe = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

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
    const rows = selectExistingColumns(db, "threads", [
      "id",
      "rollout_path",
      "cwd",
      "title",
      "source",
      "updated_at",
      "cli_version",
      "agent_nickname",
      "agent_path",
      "thread_source",
      "preview"
    ]);
    const sessions: AgentSession[] = [];
    const records: IndexRecord[] = [];
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
          field: "id,rollout_path,cwd,title,source,updated_at,cli_version,agent_nickname,agent_path,thread_source,preview"
        }
      ];
      sessions.push({
        agent: "codex",
        sessionId,
        cwd,
        transcriptPath: rolloutPath,
        indexSource: "codex.sqlite.threads",
        childSessionIds: [],
        confidence: "indexed",
        title: stringValue(row.title),
        startedAt,
        updatedAt: stringValue(row.updated_at),
        evidence
      });
      records.push({
        agent: "codex",
        sessionId,
        source: "codex.sqlite.threads",
        path: rolloutPath,
        cwd,
        title: stringValue(row.title),
        startedAt,
        updatedAt: stringValue(row.updated_at),
        preview: stringValue(row.preview),
        metadata: {
          source: row.source,
          cli_version: row.cli_version,
          agent_nickname: row.agent_nickname,
          agent_path: row.agent_path,
          thread_source: row.thread_source
        },
        evidence
      });
    }
    const relations = loadSpawnEdges(db, evidencePath);
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
}> {
  const root = path.join(codexHome(home), "sessions");
  if (!fs.existsSync(root)) return { transcripts: [], sessions: [], records: [] };
  const files: string[] = [];
  walk(root, (filePath) => {
    if (rolloutThreadId(filePath)) files.push(filePath);
  });
  files.sort();
  const transcripts: Transcript[] = [];
  const sessions: AgentSession[] = [];
  const records: IndexRecord[] = [];
  for (const filePath of files) {
    const sessionId = rolloutThreadId(filePath);
    if (!sessionId) continue;
    const metadata = await readRolloutMetadata(filePath);
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
    transcripts.push({ agent: "codex", sessionId, path: filePath, cwd, updatedAt, evidence });
    sessions.push({
      agent: "codex",
      sessionId,
      cwd,
      transcriptPath: filePath,
      indexSource: "codex.sessions.rollout",
      childSessionIds: [],
      confidence: "indexed",
      title: stringValue(metadata.title),
      startedAt,
      updatedAt,
      evidence
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
      metadata,
      evidence
    });
  }
  return { transcripts, sessions, records };
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
  let seen = 0;
  await iterateJsonl(filePath, (_line, _raw, value) => {
    seen += 1;
    collectMetadata(value, metadata);
    return seen < 50 && !(metadata.cwd && metadata.title);
  }).catch(() => undefined);
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

function loadSpawnEdges(db: Database.Database, dbPath: string): Relation[] {
  const existing = tableColumns(db, "thread_spawn_edges");
  const parentCol = firstExisting(existing, ["parent_thread_id", "parent_id", "source_thread_id", "source_id", "parent"]);
  const childCol = firstExisting(existing, ["child_thread_id", "child_id", "target_thread_id", "target_id", "child"]);
  if (!parentCol || !childCol) return [];
  try {
    const rows = db
      .prepare(`SELECT ${quoteIdentifier(parentCol)} parent_id, ${quoteIdentifier(childCol)} child_id FROM ${quoteIdentifier("thread_spawn_edges")}`)
      .all() as Array<{ parent_id?: unknown; child_id?: unknown }>;
    return rows.flatMap((row) => {
      const parentId = stringValue(row.parent_id);
      const childId = stringValue(row.child_id);
      if (!parentId || !childId) return [];
      return [
        {
          kind: "parent_child" as const,
          sourceId: parentId,
          targetId: childId,
          confidence: "indexed" as const,
          evidence: [
            {
              source: "codex.sqlite.thread_spawn_edges",
              detail: "Parent/child thread relation from thread_spawn_edges table.",
              path: dbPath,
              field: `${parentCol},${childCol}`
            }
          ]
        }
      ];
    });
  } catch {
    return [];
  }
}

function applyRelationsToSessions(sessions: AgentSession[], relations: Relation[]): void {
  const byId = new Map(sessions.map((session) => [session.sessionId, session]));
  for (const relation of relations) {
    if (relation.kind !== "parent_child") continue;
    const parent = byId.get(relation.sourceId);
    const child = byId.get(relation.targetId);
    if (parent && !parent.childSessionIds.includes(relation.targetId)) parent.childSessionIds.push(relation.targetId);
    if (child) {
      child.parentSessionId = relation.sourceId;
      child.evidence = appendEvidenceUnique(child.evidence, relation.evidence);
    }
  }
}

function collectMetadata(value: Record<string, unknown>, metadata: Record<string, unknown>): void {
  for (const key of ["cwd", "title", "session_id", "thread_id"]) {
    if (metadata[key] === undefined && value[key] !== undefined) metadata[key] = value[key];
  }
  for (const key of ["payload", "message", "data"]) {
    const nested = value[key];
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) continue;
    for (const nestedKey of ["cwd", "title", "session_id", "thread_id"]) {
      const nestedValue = (nested as Record<string, unknown>)[nestedKey];
      if (metadata[nestedKey] === undefined && nestedValue !== undefined) metadata[nestedKey] = nestedValue;
    }
  }
  if (metadata.title === undefined) {
    const text = extractText(value);
    if (text) metadata.title = text.slice(0, 120);
  }
}

function extractText(value: Record<string, unknown>): string | undefined {
  for (const key of ["text", "content", "preview"]) {
    const text = stringValue(value[key]);
    if (text) return text.trim();
  }
  const payload = value.payload;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    for (const key of ["text", "content", "preview"]) {
      const text = stringValue((payload as Record<string, unknown>)[key]);
      if (text) return text.trim();
    }
  }
  return undefined;
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
