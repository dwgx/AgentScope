import fs from "node:fs";
import path from "node:path";
import type { Diagnostic } from "@agentscope/shared";
import { openCodexDb } from "./codex.js";
import { claudeHome, codexHome, userHome } from "./paths.js";
import { isWindows, listProcesses } from "./processes.js";

export async function runDoctor(home = userHome()): Promise<Diagnostic[]> {
  const codex = codexHome(home);
  const claude = claudeHome(home);
  const checks: Diagnostic[] = [
    check("platform.windows", isWindows(), `platform=${process.platform}`),
    check("home.exists", fs.existsSync(home), home),
    check("codex.home", fs.existsSync(codex), codex),
    check("claude.home", fs.existsSync(claude), claude),
    check("codex.sqlite", fs.existsSync(path.join(codex, "state_5.sqlite")), path.join(codex, "state_5.sqlite")),
    check("codex.sessions", fs.existsSync(path.join(codex, "sessions")), path.join(codex, "sessions")),
    check("claude.sessions", fs.existsSync(path.join(claude, "sessions")), path.join(claude, "sessions")),
    check("claude.projects", fs.existsSync(path.join(claude, "projects")), path.join(claude, "projects")),
    ...sqliteChecks(path.join(codex, "state_5.sqlite")),
    check("codex.rollouts", countFiles(path.join(codex, "sessions"), /^rollout-.*\.jsonl$/i) > 0, `${countFiles(path.join(codex, "sessions"), /^rollout-.*\.jsonl$/i)} rollout jsonl files`),
    check("claude.transcripts", countFiles(path.join(claude, "projects"), /\.jsonl$/i) > 0, `${countFiles(path.join(claude, "projects"), /\.jsonl$/i)} transcript jsonl files`)
  ];
  const processes = await listProcesses(false);
  checks.push(check("win32.process.scan", isWindows(), `${processes.length} related process rows`));
  return checks;
}

function sqliteChecks(filePath: string): Diagnostic[] {
  if (!fs.existsSync(filePath)) return [];
  const opened = openCodexDb(filePath);
  if (!opened) return [check("codex.sqlite.readable", false, "unable to open directly or via WAL/SHM copy fallback")];
  const { db, evidencePath } = opened;
  try {
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
    const tables = new Set(rows.map((row) => row.name));
    return [
      check("codex.sqlite.readable", true, `opened read-only: ${evidencePath}`),
      check("codex.sqlite.threads", tables.has("threads"), "threads table"),
      check("codex.sqlite.thread_spawn_edges", tables.has("thread_spawn_edges"), "thread_spawn_edges table")
    ];
  } catch (error) {
    return [check("codex.sqlite.readable", false, error instanceof Error ? error.message : String(error))];
  } finally {
    db.close();
  }
}

function countFiles(root: string, pattern: RegExp): number {
  if (!fs.existsSync(root)) return 0;
  let count = 0;
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(filePath);
      else if (pattern.test(entry.name)) count += 1;
    }
  };
  walk(root);
  return count;
}

function check(name: string, ok: boolean, detail: string): Diagnostic {
  return { name, status: ok ? "ok" : "warn", detail };
}
