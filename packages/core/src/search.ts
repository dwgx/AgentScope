import fs from "node:fs";
import path from "node:path";
import { searchJsonl } from "./jsonl.js";
import { claudeHome, codexHome, userHome } from "./paths.js";
import { openCodexDb, rolloutThreadId } from "./codex.js";

export async function searchAll(query: string, home = userHome(), limit = 50): Promise<Record<string, unknown>[]> {
  const matches = [...searchCodexSqlite(query, home, limit)];
  if (matches.length >= limit) return matches.slice(0, limit);
  matches.push(...(await searchJsonlRoots(query, home, limit - matches.length)));
  return matches.slice(0, limit);
}

function searchCodexSqlite(query: string, home: string, limit: number): Record<string, unknown>[] {
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
            OR lower(coalesce(preview, '')) LIKE ?
            OR lower(coalesce(cwd, '')) LIKE ?
         LIMIT ?`
      )
      .all(`%${query.toLowerCase()}%`, `%${query.toLowerCase()}%`, `%${query.toLowerCase()}%`, limit) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      agent: "codex",
      source: "codex.sqlite.threads",
      sessionId: row.id,
      path: row.rollout_path,
      title: row.title,
      preview: row.preview,
      cwd: row.cwd,
      updatedAt: row.updated_at
    }));
  } catch {
    return [];
  } finally {
    db.close();
  }
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
      matches.push({ ...match, source, agent });
    }
  }
  return matches;
}

function collectFiles(root: string, include: (filePath: string) => boolean, out: string[]): void {
  if (!fs.existsSync(root)) return;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) collectFiles(filePath, include, out);
    else if (include(filePath)) out.push(filePath);
  }
}
