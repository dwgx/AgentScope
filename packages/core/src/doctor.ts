import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Diagnostic } from "@agentscope/shared";
import { openCodexDb } from "./codex.js";
import { claudeHome, codexHome, codexSqliteHome, userHome } from "./paths.js";
import { isWindows, listProcesses } from "./processes.js";

const require = createRequire(import.meta.url);

export async function runDoctor(home = userHome()): Promise<Diagnostic[]> {
  const codex = codexHome(home);
  const codexSqlite = codexSqliteHome(home);
  const claude = claudeHome(home);
  const checks: Diagnostic[] = [
    check("platform.windows", isWindows(), `platform=${process.platform}`),
    check("home.exists", fs.existsSync(home), home),
    check("codex.home", fs.existsSync(codex), codex),
    check("claude.home", fs.existsSync(claude), claude),
    check("codex.sqlite_home", fs.existsSync(codexSqlite), codexSqlite),
    check("codex.sqlite", fs.existsSync(path.join(codexSqlite, "state_5.sqlite")), path.join(codexSqlite, "state_5.sqlite")),
    check("codex.sessions", fs.existsSync(path.join(codex, "sessions")), path.join(codex, "sessions")),
    checkOptionalDir(
      "codex.archived_sessions",
      path.join(codex, "archived_sessions"),
      "optional; Codex Desktop or archived conversation workflows create this directory when used"
    ),
    check("claude.sessions", fs.existsSync(path.join(claude, "sessions")), path.join(claude, "sessions")),
    check("claude.projects", fs.existsSync(path.join(claude, "projects")), path.join(claude, "projects")),
    checkOptionalFile("codex.logs.sqlite", path.join(codexSqlite, "logs_2.sqlite")),
    checkOptionalFile("codex.goals.sqlite", path.join(codexSqlite, "goals_1.sqlite")),
    checkOptionalFile("codex.memories.sqlite", path.join(codexSqlite, "memories_1.sqlite")),
    checkOptionalFile("codex.history", path.join(codex, "history.jsonl")),
    checkOptionalDir("claude.daemon", path.join(claude, "daemon")),
    checkOptionalDir("claude.jobs", path.join(claude, "jobs")),
    checkOptionalDir("claude.file_history", path.join(claude, "file-history")),
    checkOptionalDir("claude.session_env", path.join(claude, "session-env")),
    checkOptionalDir("claude.shell_snapshots", path.join(claude, "shell-snapshots")),
    check("codex.rollouts", countFiles(path.join(codex, "sessions"), /^rollout-.*\.jsonl$/i) > 0, `${countFiles(path.join(codex, "sessions"), /^rollout-.*\.jsonl$/i)} rollout jsonl files`),
    check("claude.transcripts", countFiles(path.join(claude, "projects"), /\.jsonl$/i) > 0, `${countFiles(path.join(claude, "projects"), /\.jsonl$/i)} transcript jsonl files`)
  ];
  const native = nativeModuleCheck();
  checks.push(native);
  checks.push(
    ...(native.status === "ok"
      ? [...sqliteChecks(path.join(codexSqlite, "state_5.sqlite")), ...sqliteInventoryChecks(codexSqlite)]
      : sqliteBlockedByNativeChecks(codexSqlite, native.detail))
  );
  const processScan = await withTimeout(listProcesses(false, { timeoutMs: 5000, throwOnTimeout: true }), 6000, "win32.process.scan");
  checks.push(
    processScan.ok
      ? check("win32.process.scan", isWindows(), `${processScan.value.length} related process rows`)
      : check("win32.process.scan", false, processScan.error)
  );
  return checks;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const value = await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs);
      })
    ]);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function checkOptionalFile(name: string, filePath: string): Diagnostic {
  if (!fs.existsSync(filePath)) return check(name, false, `not found: ${filePath}`);
  const size = statSize(filePath);
  return check(name, true, size === undefined ? filePath : `${filePath} (${size} bytes)`);
}

function checkOptionalDir(name: string, dirPath: string, missingDetail?: string): Diagnostic {
  if (!fs.existsSync(dirPath)) {
    return check(
      name,
      Boolean(missingDetail),
      `${missingDetail ?? "optional directory not found"}: ${dirPath}`
    );
  }
  return check(name, true, `${countEntries(dirPath)} entries: ${dirPath}`);
}

function nativeModuleCheck(): Diagnostic {
  try {
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    const db = new Database(":memory:");
    db.close();
    return check("native.better_sqlite3", true, `available for Node ABI ${process.versions.modules}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return check(
      "native.better_sqlite3",
      false,
      `better-sqlite3 native addon failed for runtime ABI ${process.versions.modules}; SQLite checks are blocked until AgentScope is rebuilt for this Electron runtime. ${message}`
    );
  }
}

function sqliteBlockedByNativeChecks(codexSqlite: string, detail: string): Diagnostic[] {
  const blocked = `blocked by native.better_sqlite3: ${detail}`;
  return [
    check("codex.sqlite.readable", false, blocked),
    check("codex.logs.tables", false, fs.existsSync(path.join(codexSqlite, "logs_2.sqlite")) ? blocked : `not found: ${path.join(codexSqlite, "logs_2.sqlite")}`),
    check("codex.goals.tables", false, fs.existsSync(path.join(codexSqlite, "goals_1.sqlite")) ? blocked : `not found: ${path.join(codexSqlite, "goals_1.sqlite")}`),
    check("codex.memories.tables", false, fs.existsSync(path.join(codexSqlite, "memories_1.sqlite")) ? blocked : `not found: ${path.join(codexSqlite, "memories_1.sqlite")}`)
  ];
}

function sqliteInventoryChecks(codexSqlite: string): Diagnostic[] {
  return [
    sqliteInventoryCheck("codex.logs.tables", path.join(codexSqlite, "logs_2.sqlite")),
    sqliteInventoryCheck("codex.goals.tables", path.join(codexSqlite, "goals_1.sqlite")),
    sqliteInventoryCheck("codex.memories.tables", path.join(codexSqlite, "memories_1.sqlite"))
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
