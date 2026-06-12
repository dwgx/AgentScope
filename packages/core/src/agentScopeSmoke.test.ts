import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { resolveSessionLauncher } from "@agentscope/shared";
import { afterEach, describe, expect, it } from "vitest";
import { buildSnapshot } from "./scope.js";
import { searchAll } from "./search.js";
import {
  backupSession,
  deleteSession,
  importSessionBackup,
  listQuarantinedSessions,
  restoreQuarantinedSession
} from "./sessionOps.js";
import { getCodexControlCenterSnapshot } from "./codexControl.js";

const smokeEnabled = process.env.AGENTSCOPE_APP_SMOKE === "1";
const describeSmoke = smokeEnabled ? describe : describe.skip;
const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describeSmoke("AgentScope app smoke", () => {
  it("indexes synthetic Codex and Claude stores with evidence and confidence", async () => {
    const home = tempHome("agentscope-app-smoke-index-");
    const codexParentId = "11111111-1111-4111-8111-111111111111";
    const codexChildId = "22222222-2222-4222-8222-222222222222";
    const claudeParentId = "33333333-3333-4333-8333-333333333333";
    const claudeChildId = "44444444-4444-4444-8444-444444444444";

    createCodexIndexFixture(home, codexParentId, codexChildId);
    createClaudeIndexFixture(home, claudeParentId, claudeChildId);

    const snapshot = await buildSnapshot(home, false);
    const codexParent = snapshot.sessions.find((session) => session.agent === "codex" && session.sessionId === codexParentId);
    const codexChild = snapshot.sessions.find((session) => session.agent === "codex" && session.sessionId === codexChildId);
    const claudeParent = snapshot.sessions.find((session) => session.agent === "claude" && session.sessionId === claudeParentId);

    expect(snapshot.processes).toHaveLength(0);
    expect(codexParent?.confidence).toBe("indexed");
    expect(codexParent?.evidence.some((item) => item.source.startsWith("codex."))).toBe(true);
    expect(codexChild?.parentSessionId).toBe(codexParentId);
    expect(codexChild?.sessionKind).toBe("subagent");
    expect(claudeParent?.confidence).toBe("indexed");
    expect(claudeParent?.indexMetadata?.storedPid).toBe(123456);
    expect(claudeParent?.childSessionIds).toContain(claudeChildId);
    expect(snapshot.relations.some((relation) => relation.kind === "subagent" && relation.sourceId === claudeParentId && relation.targetId === claudeChildId && relation.confidence === "indexed")).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain("body-leak-marker");
  });

  it("searches only safe metadata fields and returns no raw JSONL excerpts", async () => {
    const home = tempHome("agentscope-app-smoke-search-");
    const sessionId = "55555555-5555-4555-8555-555555555555";
    const rollout = codexRolloutPath(home, sessionId);
    fs.mkdirSync(path.dirname(rollout), { recursive: true });
    fs.writeFileSync(
      rollout,
      [
        JSON.stringify({
          type: "session_meta",
          payload: {
            id: sessionId,
            cwd: String.raw`D:\AgentScopeSmokeProject`,
            message: "body-leak-marker"
          }
        }),
        JSON.stringify({
          type: "event_msg",
          payload: {
            message: "AgentScopePrivateBodyMarker",
            reasoning: "AgentScopePrivateReasoningMarker"
          }
        })
      ].join("\n") + "\n",
      "utf8"
    );

    expect(await searchAll("AgentScopePrivateBodyMarker", home, 5)).toHaveLength(0);
    expect(await searchAll("AgentScopePrivateReasoningMarker", home, 5)).toHaveLength(0);

    const [match] = await searchAll("AgentScopeSmokeProject", home, 5);
    expect(match?.source).toBe("codex.sessions.rollout");
    expect(match?.matchedFields).toEqual(["payload.cwd"]);
    expect(match).not.toHaveProperty("text");
    expect(match).not.toHaveProperty("excerpt");
    expect(JSON.stringify(match)).not.toContain("body-leak-marker");
  });

  it("backs up, deletes, quarantines, and restores a synthetic Codex session", async () => {
    const home = tempHome("agentscope-app-smoke-sessionops-");
    const outputRoot = tempHome("agentscope-app-smoke-output-");
    const sessionId = "66666666-6666-4666-8666-666666666666";
    const rollout = codexRolloutPath(home, sessionId);
    fs.mkdirSync(path.dirname(rollout), { recursive: true });
    fs.writeFileSync(rollout, JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd: String.raw`D:\AgentScopeSmoke\Workspace` } }) + "\n", "utf8");
    createCodexBundleFixture(home, sessionId, rollout);

    const deleted = await deleteSession(sessionId, "codex", {
      home,
      outputRoot,
      includeProcesses: false,
      now: new Date("2026-06-11T00:00:00Z")
    });

    expect(fs.existsSync(deleted.backup.manifestPath)).toBe(true);
    expect(fs.existsSync(rollout)).toBe(false);
    expect(fs.existsSync(deleted.journalPath)).toBe(true);
    const journal = JSON.parse(fs.readFileSync(deleted.journalPath, "utf8")) as { steps?: Array<Record<string, unknown>> };
    expect(journal.steps?.[0]?.phase).toBe("backup");
    expect(journal.steps?.some((step) => step.phase === "sqlite_backup" && step.status === "succeeded")).toBe(true);
    expect(journal.steps?.some((step) => step.phase === "sqlite_delete" && step.status === "succeeded")).toBe(true);

    const quarantined = await listQuarantinedSessions({ home, outputRoot });
    expect(quarantined).toHaveLength(1);
    expect(quarantined[0]?.restorePossible).toBe(true);

    const restored = await restoreQuarantinedSession(deleted.quarantineDir, { home, outputRoot });

    expect(fs.existsSync(rollout)).toBe(true);
    expect(restored.restoreJournalPath).toBe(path.join(deleted.quarantineDir, "restore-journal.json"));
    expect(restored.databaseChanges?.some((change) => change.table === "threads" && change.action === "insert")).toBe(true);
    expect(restored.databaseChanges?.some((change) => change.table === "logs" && change.action === "skip")).toBe(true);
    expect(readSqliteCount(path.join(home, ".codex", "state_5.sqlite"), "threads", "id", sessionId)).toBe(1);
  });

  it("imports an AgentScope backup into absent targets and rejects target conflicts", async () => {
    const home = tempHome("agentscope-app-smoke-import-");
    const outputRoot = tempHome("agentscope-app-smoke-import-output-");
    const sessionId = "77777777-7777-4777-8777-777777777777";
    const encoded = "D--Project-AgentScope";
    const transcript = path.join(home, ".claude", "projects", encoded, `${sessionId}.jsonl`);
    fs.mkdirSync(path.dirname(transcript), { recursive: true });
    fs.writeFileSync(transcript, JSON.stringify({ type: "system", cwd: String.raw`D:\AgentScopeSmoke\Workspace` }) + "\n", "utf8");
    const backup = await backupSession(sessionId, "claude", {
      home,
      outputRoot,
      now: new Date("2026-06-11T00:10:00Z")
    });
    fs.rmSync(transcript, { force: true });

    const imported = await importSessionBackup(backup.backupDir, { home, outputRoot });

    expect(fs.existsSync(transcript)).toBe(true);
    expect(imported.importedFiles.some((file) => file.path === transcript)).toBe(true);
    await expect(importSessionBackup(backup.backupDir, { home, outputRoot })).rejects.toThrow(/target already exists|already exists locally/);
  });

  it("keeps Codex Control auth metadata-only on synthetic auth material", async () => {
    const home = tempHome("agentscope-app-smoke-control-");
    const codexRoot = path.join(home, ".codex");
    fs.mkdirSync(codexRoot, { recursive: true });
    fs.writeFileSync(path.join(codexRoot, "config.toml"), ['model = "gpt-5.5"', 'cli_auth_credentials_store = "file"'].join("\n"), "utf8");
    fs.writeFileSync(path.join(codexRoot, "auth.json"), '{"tokens":"fake-local-agentscope-smoke-token"}\n', "utf8");

    const snapshot = await getCodexControlCenterSnapshot(home);

    expect(snapshot.auth.exists).toBe(true);
    expect(snapshot.auth.sha256).toBeUndefined();
    expect(JSON.stringify(snapshot)).not.toContain("fake-local-agentscope-smoke-token");
    expect(snapshot.items.find((item) => item.id === "config.model")?.value).toBe("gpt-5.5");
  });

  it("resolves resume and fork launchers without ps1 or bare command launch targets", () => {
    const nodePath = String.raw`C:\Program Files\nodejs\node.exe`;
    const codexJs = String.raw`C:\Users\AgentScopeSmoke\AppData\Roaming\npm\node_modules\@openai\codex\bin\codex.js`;
    const claudeCmd = String.raw`C:\Users\AgentScopeSmoke\AppData\Roaming\npm\claude.cmd`;

    const codex = resolveSessionLauncher("codex", "resume", "88888888-8888-4888-8888-888888888888", {
      homeDir: String.raw`C:\Users\AgentScopeSmoke`,
      appDataDir: String.raw`C:\Users\AgentScopeSmoke\AppData\Roaming`,
      programFilesDir: String.raw`C:\Program Files`,
      pathCandidates: {},
      existingFiles: new Set([path.resolve(nodePath).toLowerCase(), path.resolve(codexJs).toLowerCase()]),
      processes: [
        {
          pid: 100,
          processName: "node.exe",
          executablePath: nodePath,
          commandLine: `"${nodePath}" "${codexJs}"`,
          agent: "codex",
          evidence: []
        }
      ]
    });
    const claude = resolveSessionLauncher("claude", "fork", "claude-session-123", {
      homeDir: String.raw`C:\Users\AgentScopeSmoke`,
      appDataDir: String.raw`C:\Users\AgentScopeSmoke\AppData\Roaming`,
      pathCandidates: {
        "claude.ps1": [{ path: String.raw`C:\Users\AgentScopeSmoke\AppData\Roaming\npm\claude.ps1`, source: "where.claude" }],
        "claude.cmd": [{ path: claudeCmd, source: "where.claude" }]
      },
      existingFiles: new Set([path.resolve(claudeCmd).toLowerCase()])
    });

    expect(codex.filePath).toBe(nodePath);
    expect(codex.args).toEqual([codexJs, "resume", "88888888-8888-4888-8888-888888888888"]);
    expect(codex.source).toBe("process.commandLine.codexJs");
    expect(codex.command.startsWith("codex ")).toBe(false);
    expect(claude.filePath).toBe(claudeCmd);
    expect(claude.args).toEqual(["--resume", "claude-session-123", "--fork-session"]);
    expect(claude.command.startsWith("claude ")).toBe(false);
  });
});

function tempHome(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

function createCodexIndexFixture(home: string, parentId: string, childId: string): void {
  const parentRollout = codexRolloutPath(home, parentId);
  const childRollout = codexRolloutPath(home, childId);
  fs.mkdirSync(path.dirname(parentRollout), { recursive: true });
  fs.writeFileSync(
    parentRollout,
    JSON.stringify({
      type: "session_meta",
      payload: { id: parentId, cwd: String.raw`D:\AgentScopeSmoke\Workspace`, title: "AgentScope parent", message: "body-leak-marker" }
    }) + "\n",
    "utf8"
  );
  fs.writeFileSync(
    childRollout,
    JSON.stringify({
      type: "session_meta",
      payload: {
        id: childId,
        cwd: String.raw`D:\AgentScopeSmoke\Workspace`,
        parent_thread_id: parentId,
        thread_source: "subagent",
        agent_nickname: "Hume",
        agent_role: "explorer"
      }
    }) + "\n",
    "utf8"
  );

  const dbPath = path.join(home, ".codex", "state_5.sqlite");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE threads (
      id TEXT PRIMARY KEY,
      rollout_path TEXT,
      cwd TEXT,
      title TEXT,
      source TEXT,
      created_at TEXT,
      updated_at TEXT,
      agent_nickname TEXT,
      agent_role TEXT,
      agent_path TEXT,
      thread_source TEXT
    );
    CREATE TABLE thread_spawn_edges (parent_thread_id TEXT, child_thread_id TEXT, status TEXT);
  `);
  db.prepare("INSERT INTO threads (id, rollout_path, cwd, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    parentId,
    parentRollout,
    String.raw`D:\AgentScopeSmoke\Workspace`,
    "AgentScope parent",
    "2026-06-11T00:00:00.000Z",
    "2026-06-11T00:01:00.000Z"
  );
  db.prepare("INSERT INTO threads (id, rollout_path, cwd, title, source, created_at, updated_at, agent_nickname, agent_role, agent_path, thread_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    childId,
    childRollout,
    String.raw`D:\AgentScopeSmoke\Workspace`,
    "AgentScope subagent",
    JSON.stringify({ subagent: { thread_spawn: { parent_thread_id: parentId, depth: 1, agent_nickname: "Hume", agent_role: "explorer", agent_path: "019-smoke" } } }),
    "2026-06-11T00:01:00.000Z",
    "2026-06-11T00:02:00.000Z",
    "Hume",
    "explorer",
    "019-smoke",
    "subagent"
  );
  db.prepare("INSERT INTO thread_spawn_edges (parent_thread_id, child_thread_id, status) VALUES (?, ?, ?)").run(parentId, childId, "running");
  db.close();
}

function createClaudeIndexFixture(home: string, parentId: string, childId: string): void {
  const cwd = String.raw`D:\AgentScopeSmoke\Workspace`;
  const encoded = "D--Project-AgentScope";
  const claudeRoot = path.join(home, ".claude");
  const parentTranscript = path.join(claudeRoot, "projects", encoded, `${parentId}.jsonl`);
  const childTranscript = path.join(claudeRoot, "projects", encoded, parentId, "subagents", `${childId}.jsonl`);
  fs.mkdirSync(path.join(claudeRoot, "sessions"), { recursive: true });
  fs.mkdirSync(path.dirname(childTranscript), { recursive: true });
  fs.writeFileSync(
    path.join(claudeRoot, "sessions", "parent.json"),
    JSON.stringify({
      pid: 123456,
      sessionId: parentId,
      cwd,
      status: "running",
      startedAt: "2026-06-11T00:00:00.000Z",
      updatedAt: "2026-06-11T00:05:00.000Z"
    }),
    "utf8"
  );
  fs.writeFileSync(parentTranscript, JSON.stringify({ type: "system", cwd }) + "\n", "utf8");
  fs.writeFileSync(childTranscript, JSON.stringify({ type: "assistant", cwd, isSidechain: true }) + "\n", "utf8");
}

function createCodexBundleFixture(home: string, sessionId: string, rollout: string): void {
  recreateCodexEmptySchema(home);
  const state = new Database(path.join(home, ".codex", "state_5.sqlite"));
  state.prepare("INSERT INTO threads (id, rollout_path, cwd, title) VALUES (?, ?, ?, ?)").run(sessionId, rollout, String.raw`D:\AgentScopeSmoke\Workspace`, "smoke session");
  state.prepare("INSERT INTO thread_spawn_edges (parent_thread_id, child_thread_id) VALUES (?, ?)").run("parent-thread", sessionId);
  state.prepare("INSERT INTO thread_dynamic_tools (thread_id, name, value) VALUES (?, ?, ?)").run(sessionId, "shell", "enabled");
  state.close();

  const goals = new Database(path.join(home, ".codex", "goals_1.sqlite"));
  goals.prepare("INSERT INTO thread_goals (thread_id, goal) VALUES (?, ?)").run(sessionId, "smoke-goal");
  goals.close();

  const memories = new Database(path.join(home, ".codex", "memories_1.sqlite"));
  memories.prepare("INSERT INTO stage1_outputs (thread_id, output) VALUES (?, ?)").run(sessionId, "smoke-memory");
  memories.close();

  const logs = new Database(path.join(home, ".codex", "logs_2.sqlite"));
  logs.prepare("INSERT INTO logs (thread_id, level, ts, body) VALUES (?, ?, ?, ?)").run(sessionId, "INFO", "2026-06-11T00:00:00Z", "do not restore body");
  logs.close();
}

function recreateCodexEmptySchema(home: string): void {
  const codexRoot = path.join(home, ".codex");
  fs.mkdirSync(codexRoot, { recursive: true });
  for (const name of ["state_5.sqlite", "goals_1.sqlite", "memories_1.sqlite", "logs_2.sqlite"]) {
    fs.rmSync(path.join(codexRoot, name), { force: true });
  }
  const state = new Database(path.join(codexRoot, "state_5.sqlite"));
  state.exec(`
    CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT, cwd TEXT, title TEXT);
    CREATE TABLE thread_spawn_edges (parent_thread_id TEXT, child_thread_id TEXT);
    CREATE TABLE thread_dynamic_tools (thread_id TEXT, name TEXT, value TEXT);
  `);
  state.close();
  const goals = new Database(path.join(codexRoot, "goals_1.sqlite"));
  goals.exec("CREATE TABLE thread_goals (thread_id TEXT, goal TEXT);");
  goals.close();
  const memories = new Database(path.join(codexRoot, "memories_1.sqlite"));
  memories.exec("CREATE TABLE stage1_outputs (thread_id TEXT, output TEXT);");
  memories.close();
  const logs = new Database(path.join(codexRoot, "logs_2.sqlite"));
  logs.exec("CREATE TABLE logs (thread_id TEXT, level TEXT, ts TEXT, body TEXT);");
  logs.close();
}

function codexRolloutPath(home: string, sessionId: string): string {
  return path.join(home, ".codex", "sessions", "2026", "06", "11", `rollout-2026-06-11T00-00-00-${sessionId}.jsonl`);
}

function readSqliteCount(dbPath: string, table: string, key: string, value: string): number {
  const db = new Database(dbPath, { readonly: true });
  try {
    const row = db.prepare(`SELECT COUNT(*) AS count FROM "${table}" WHERE "${key}" = ?`).get(value) as { count: number };
    return Number(row.count);
  } finally {
    db.close();
  }
}
