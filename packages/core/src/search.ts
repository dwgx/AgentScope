import fs from "node:fs";
import path from "node:path";
import { searchJsonl } from "./jsonl.js";
import { claudeHome, codexHome, userHome } from "./paths.js";
import { openCodexDb, rolloutThreadId } from "./codex.js";

export interface SearchOptions {
  includeSqlitePreview?: boolean | undefined;
}

export async function searchAll(query: string, home = userHome(), limit = 50, options: SearchOptions = {}): Promise<Record<string, unknown>[]> {
  const matches = [...searchCodexSqlite(query, home, limit, options)];
  if (matches.length >= limit) return matches.slice(0, limit);
  matches.push(...(await searchJsonlRoots(query, home, limit - matches.length)));
  return matches.slice(0, limit);
}

function searchCodexSqlite(query: string, home: string, limit: number, options: SearchOptions): Record<string, unknown>[] {
  const filePath = path.join(codexHome(home), "state_5.sqlite");
  if (!fs.existsSync(filePath)) return [];
  const opened = openCodexDb(filePath);
  if (!opened) return [];
  const { db } = opened;
  try {
    const rows = db
      .prepare(
        `SELECT id, title, preview, cwd, rollout_path, updated_at
         FROM threads
         WHERE lower(coalesce(title, '')) LIKE ?
            OR lower(coalesce(cwd, '')) LIKE ?
            OR lower(coalesce(rollout_path, '')) LIKE ?
            OR lower(coalesce(id, '')) LIKE ?
            ${options.includeSqlitePreview ? "OR lower(coalesce(preview, '')) LIKE ?" : ""}
         LIMIT ?`
      )
      .all(...sqliteSearchParams(query, limit, options)) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      agent: "codex",
      source: "codex.sqlite.threads",
      sessionId: row.id,
      path: row.rollout_path,
      title: row.title,
       matchedFields: sqliteMatchedFields(row, query, options),
      cwd: row.cwd,
      updatedAt: row.updated_at
    }));
  } catch {
    return [];
  } finally {
    db.close();
  }
}

function sqliteSearchParams(query: string, limit: number, options: SearchOptions): unknown[] {
  const pattern = `%${query.toLowerCase()}%`;
  const params: unknown[] = [pattern, pattern, pattern, pattern];
  if (options.includeSqlitePreview) params.push(pattern);
  params.push(limit);
  return params;
}

function sqliteMatchedFields(row: Record<string, unknown>, query: string, options: SearchOptions): string[] {
  const needle = query.toLowerCase();
  return ["title", "cwd", "rollout_path", "id", ...(options.includeSqlitePreview ? ["preview"] : [])]
    .filter((field) => String(row[field] ?? "").toLowerCase().includes(needle));
}

async function searchJsonlRoots(query: string, home: string, limit: number): Promise<Record<string, unknown>[]> {
  const files: string[] = [];
  collectFiles(path.join(codexHome(home), "sessions"), (filePath) => !!rolloutThreadId(filePath), files);
  collectFiles(path.join(claudeHome(home), "projects"), (filePath) => filePath.endsWith(".jsonl"), files);
  const matches: Record<string, unknown>[] = [];
  for (const filePath of files) {
    const remaining = limit - matches.length;
    if (remaining <= 0) break;
    const source = rolloutThreadId(filePath) ? "codex.sessions.rollout" : "claude.projects";
    const agent = source.startsWith("codex") ? "codex" : "claude";
    for (const match of await searchJsonl(filePath, query, remaining)) {
      matches.push({ ...match, source, agent, sessionId: sessionIdFromJsonlPath(filePath, agent) });
    }
  }
  return matches;
}

function sessionIdFromJsonlPath(filePath: string, agent: string): string | undefined {
  if (agent === "codex") return rolloutThreadId(filePath);
  const name = path.basename(filePath, ".jsonl");
  return name || undefined;
}

function collectFiles(root: string, include: (filePath: string) => boolean, out: string[]): void {
  if (!fs.existsSync(root)) return;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) collectFiles(filePath, include, out);
    else if (include(filePath)) out.push(filePath);
  }
}
