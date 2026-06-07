import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Diagnostic } from "@agentscope/shared";
import { openCodexDb } from "./codex.js";
import { claudeHome, codexHome, userHome } from "./paths.js";
import { isWindows, listProcesses } from "./processes.js";

const require = createRequire(import.meta.url);

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
    checkOptionalFile("codex.logs.sqlite", path.join(codex, "logs_2.sqlite")),
    checkOptionalFile("codex.goals.sqlite", path.join(codex, "goals_1.sqlite")),
    checkOptionalFile("codex.memories.sqlite", path.join(codex, "memories_1.sqlite")),
    checkOptionalFile("codex.history", path.join(codex, "history.jsonl")),
    checkOptionalDir("claude.daemon", path.join(claude, "daemon")),
    checkOptionalDir("claude.jobs", path.join(claude, "jobs")),
    checkOptionalDir("claude.file_history", path.join(claude, "file-history")),
    checkOptionalDir("claude.session_env", path.join(claude, "session-env")),
    checkOptionalDir("claude.shell_snapshots", path.join(claude, "shell-snapshots")),
    nativeModuleCheck(),
    ...sqliteChecks(path.join(codex, "state_5.sqlite")),
    ...sqliteInventoryChecks(codex),
    check("codex.rollouts", countFiles(path.join(codex, "sessions"), /^rollout-.*\.jsonl$/i) > 0, `${countFiles(path.join(codex, "sessions"), /^rollout-.*\.jsonl$/i)} rollout jsonl files`),
    check("claude.transcripts", countFiles(path.join(claude, "projects"), /\.jsonl$/i) > 0, `${countFiles(path.join(claude, "projects"), /\.jsonl$/i)} transcript jsonl files`)
  ];
  const processes = await listProcesses(false);
  checks.push(check("win32.process.scan", isWindows(), `${processes.length} related process rows`));
  return checks;
}

function checkOptionalFile(name: string, filePath: string): Diagnostic {
  if (!fs.existsSync(filePath)) return check(name, false, `not found: ${filePath}`);
  const size = statSize(filePath);
  return check(name, true, size === undefined ? filePath : `${filePath} (${size} bytes)`);
}

function checkOptionalDir(name: string, dirPath: string): Diagnostic {
  if (!fs.existsSync(dirPath)) return check(name, false, `not found: ${dirPath}`);
  return check(name, true, `${countEntries(dirPath)} entries: ${dirPath}`);
}

function nativeModuleCheck(): Diagnostic {
  try {
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    const db = new Database(":memory:");
    db.close();
    return check("native.better_sqlite3", true, `available for Node ABI ${process.versions.modules}`);
  } catch (error) {
    return check("native.better_sqlite3", false, error instanceof Error ? error.message : String(error));
  }
}

function sqliteInventoryChecks(codex: string): Diagnostic[] {
  return [
    sqliteInventoryCheck("codex.logs.tables", path.join(codex, "logs_2.sqlite")),
    sqliteInventoryCheck("codex.goals.tables", path.join(codex, "goals_1.sqlite")),
    sqliteInventoryCheck("codex.memories.tables", path.join(codex, "memories_1.sqlite"))
  ];
}

function sqliteInventoryCheck(name: string, filePath: string): Diagnostic {
  if (!fs.existsSync(filePath)) return check(name, false, `not found: ${filePath}`);
  const opened = openCodexDb(filePath);
  if (!opened) return check(name, false, "unable to open read-only");
  try {
    const rows = opened.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
    return check(name, true, `${rows.map((row) => row.name).join(", ") || "no tables"}: ${opened.evidencePath}`);
  } catch (error) {
    return check(name, false, error instanceof Error ? error.message : String(error));
  } finally {
    opened.db.close();
  }
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

function countEntries(root: string): number {
  try {
    return fs.readdirSync(root).length;
  } catch {
    return 0;
  }
}

function statSize(filePath: string): number | undefined {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return undefined;
  }
}

function check(name: string, ok: boolean, detail: string): Diagnostic {
  return { name, status: ok ? "ok" : "warn", detail };
}
