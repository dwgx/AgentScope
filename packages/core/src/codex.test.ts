import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { loadCodexIndex, rolloutStartedAt, rolloutThreadId, scanCodexRollouts } from "./codex.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Codex helpers", () => {
  it("extracts UUID tail from rollout filename", () => {
    expect(
      rolloutThreadId(String.raw`D:\x\rollout-2026-06-07T04-20-59-019e9e61-a40c-7e62-b98f-d80b7f96c5bf.jsonl`)
    ).toBe("019e9e61-a40c-7e62-b98f-d80b7f96c5bf");
  });

  it("extracts rollout start time from filename", () => {
    expect(rolloutStartedAt(String.raw`D:\x\rollout-2026-06-07T04-20-59-019e9e61-a40c-7e62-b98f-d80b7f96c5bf.jsonl`)).toBe(
      new Date("2026-06-07T04:20:59").toISOString()
    );
  });

  it("classifies Codex agent metadata as subagent evidence", () => {
    const home = mkdtempSync(join(tmpdir(), "agentscope-codex-kind-"));
    tempRoots.push(home);
    const codexRoot = join(home, ".codex");
    mkdirSync(codexRoot, { recursive: true });
    const db = new Database(join(codexRoot, "state_5.sqlite"));
    db.exec(`
      CREATE TABLE threads (
        id TEXT PRIMARY KEY,
        title TEXT,
        cwd TEXT,
        agent_nickname TEXT,
        agent_role TEXT,
        agent_path TEXT
      );
      CREATE TABLE thread_spawn_edges (parent_thread_id TEXT, child_thread_id TEXT);
    `);
    db.prepare("INSERT INTO threads (id, title, cwd) VALUES (?, ?, ?)").run("parent-thread", "Parent", String.raw`D:\work`);
    db.prepare("INSERT INTO threads (id, title, cwd, agent_nickname, agent_role, agent_path) VALUES (?, ?, ?, ?, ?, ?)").run(
      "child-thread",
      "Worker",
      String.raw`D:\work`,
      "worker",
      "research",
      String.raw`D:\Project\AgentScope\.codex\agents\worker.md`
    );
    db.prepare("INSERT INTO thread_spawn_edges (parent_thread_id, child_thread_id) VALUES (?, ?)").run("parent-thread", "child-thread");
    db.close();

    const snapshot = loadCodexIndex(home);
    const child = snapshot.sessions.find((session) => session.sessionId === "child-thread");
    expect(child?.parentSessionId).toBe("parent-thread");
    expect(child?.sessionKind).toBe("subagent");
    expect(child?.sessionKindEvidence?.map((item) => item.source)).toContain("codex.sqlite.threads.agent_metadata");
    expect(snapshot.relations.some((relation) => relation.kind === "subagent" && relation.targetId === "child-thread")).toBe(true);
  });

  it("can skip Codex log metadata for fast UI snapshots", () => {
    const home = mkdtempSync(join(tmpdir(), "agentscope-codex-log-skip-"));
    tempRoots.push(home);
    const codexRoot = join(home, ".codex");
    mkdirSync(codexRoot, { recursive: true });
    const stateDb = new Database(join(codexRoot, "state_5.sqlite"));
    stateDb.exec("CREATE TABLE threads (id TEXT PRIMARY KEY, title TEXT, cwd TEXT);");
    stateDb.prepare("INSERT INTO threads (id, title, cwd) VALUES (?, ?, ?)").run("thread-with-logs", "Logs", String.raw`D:\work`);
    stateDb.close();

    const logsDb = new Database(join(codexRoot, "logs_2.sqlite"));
    logsDb.exec("CREATE TABLE logs (thread_id TEXT, level TEXT, ts TEXT, process_uuid TEXT, target TEXT);");
    logsDb
      .prepare("INSERT INTO logs (thread_id, level, ts, process_uuid, target) VALUES (?, ?, ?, ?, ?)")
      .run("thread-with-logs", "WARN", "2026-06-12T00:00:00.000Z", "process-a", "target-a");
    logsDb.close();

    const fast = loadCodexIndex(home, { includeLogMetadata: false });
    const full = loadCodexIndex(home, { includeLogMetadata: true });

    expect(fast.sessions[0]?.indexMetadata?.log_count).toBeUndefined();
    expect(full.sessions[0]?.indexMetadata?.log_count).toBe(1);
  });

  it("keeps plain Codex spawn edges as child sessions rather than subagents", () => {
    const home = mkdtempSync(join(tmpdir(), "agentscope-codex-child-"));
    tempRoots.push(home);
    const codexRoot = join(home, ".codex");
    mkdirSync(codexRoot, { recursive: true });
    const db = new Database(join(codexRoot, "state_5.sqlite"));
    db.exec(`
      CREATE TABLE threads (id TEXT PRIMARY KEY, title TEXT, cwd TEXT);
      CREATE TABLE thread_spawn_edges (parent_thread_id TEXT, child_thread_id TEXT);
    `);
    db.prepare("INSERT INTO threads (id, title, cwd) VALUES (?, ?, ?)").run("parent-thread", "Parent", String.raw`D:\work`);
    db.prepare("INSERT INTO threads (id, title, cwd) VALUES (?, ?, ?)").run("child-thread", "Child", String.raw`D:\work`);
    db.prepare("INSERT INTO thread_spawn_edges (parent_thread_id, child_thread_id) VALUES (?, ?)").run("parent-thread", "child-thread");
    db.close();

    const child = loadCodexIndex(home).sessions.find((session) => session.sessionId === "child-thread");
    expect(child?.parentSessionId).toBe("parent-thread");
    expect(child?.sessionKind).toBe("child");
  });

  it("classifies official Codex thread source metadata as indexed subagent evidence", () => {
    const home = mkdtempSync(join(tmpdir(), "agentscope-codex-source-"));
    tempRoots.push(home);
    const codexRoot = join(home, ".codex");
    mkdirSync(codexRoot, { recursive: true });
    const db = new Database(join(codexRoot, "state_5.sqlite"));
    db.exec(`
      CREATE TABLE threads (
        id TEXT PRIMARY KEY,
        title TEXT,
        cwd TEXT,
        source TEXT
      );
      CREATE TABLE thread_spawn_edges (parent_thread_id TEXT, child_thread_id TEXT, status TEXT);
    `);
    db.prepare("INSERT INTO threads (id, title, cwd, source) VALUES (?, ?, ?, ?)").run(
      "parent-thread",
      "Parent",
      String.raw`D:\work`,
      "cli"
    );
    db.prepare("INSERT INTO threads (id, title, cwd, source) VALUES (?, ?, ?, ?)").run(
      "child-thread",
      "Worker",
      String.raw`D:\work`,
      JSON.stringify({
        subagent: {
          thread_spawn: {
            parent_thread_id: "parent-thread",
            depth: 2,
            agent_nickname: "Goodall",
            agent_role: "researcher",
            agent_path: String.raw`D:\work\.codex\agents\goodall.md`
          }
        }
      })
    );
    db.prepare("INSERT INTO thread_spawn_edges (parent_thread_id, child_thread_id, status) VALUES (?, ?, ?)").run(
      "parent-thread",
      "child-thread",
      "open"
    );
    db.close();

    const snapshot = loadCodexIndex(home);
    const child = snapshot.sessions.find((session) => session.sessionId === "child-thread");
    const relation = snapshot.relations.find((item) => item.kind === "subagent" && item.targetId === "child-thread");
    expect(child?.sessionKind).toBe("subagent");
    expect(child?.parentSessionId).toBe("parent-thread");
    expect(child?.indexMetadata).toMatchObject({
      parent_thread_id: "parent-thread",
      subagent_depth: 2,
      agent_nickname: "Goodall",
      agent_role: "researcher",
      spawn_status: "open"
    });
    expect(relation?.metadata).toMatchObject({
      sourceKind: "codex_thread_source",
      subagentDepth: 2,
      agentNickname: "Goodall",
      agentRole: "researcher",
      spawnStatus: "open"
    });
    expect(relation?.evidence.map((item) => item.source)).toContain("codex.sqlite.threads.thread_source");
    expect(relation?.evidence.map((item) => item.source)).toContain("codex.sqlite.threads.agent_metadata");
    expect(relation?.evidence.map((item) => item.source)).toContain("codex.sqlite.thread_spawn_edges");
  });

  it("does not treat ambiguous source strings as subagent candidates", () => {
    const home = mkdtempSync(join(tmpdir(), "agentscope-codex-plain-source-"));
    tempRoots.push(home);
    const codexRoot = join(home, ".codex");
    mkdirSync(codexRoot, { recursive: true });
    const db = new Database(join(codexRoot, "state_5.sqlite"));
    db.exec(`
      CREATE TABLE threads (
        id TEXT PRIMARY KEY,
        title TEXT,
        cwd TEXT,
        source TEXT,
        thread_source TEXT
      );
    `);
    db.prepare("INSERT INTO threads (id, title, cwd, source, thread_source) VALUES (?, ?, ?, ?, ?)").run(
      "plain-thread",
      "Plain",
      String.raw`D:\work`,
      "user agent discussion with child process notes",
      "cli"
    );
    db.close();

    const plain = loadCodexIndex(home).sessions.find((session) => session.sessionId === "plain-thread");
    expect(plain?.sessionKind).toBe("session");
    expect(plain?.sessionKindEvidence ?? []).toHaveLength(0);
  });

  it("uses configured sqlite_home instead of assuming the Codex home directory", () => {
    const home = mkdtempSync(join(tmpdir(), "agentscope-codex-sqlite-home-"));
    tempRoots.push(home);
    const codexRoot = join(home, ".codex");
    const sqliteRoot = join(home, "sqlite-state");
    mkdirSync(codexRoot, { recursive: true });
    mkdirSync(sqliteRoot, { recursive: true });
    writeFileSync(join(codexRoot, "config.toml"), `sqlite_home = "${sqliteRoot.replaceAll("\\", "\\\\")}"\n`);
    const db = new Database(join(sqliteRoot, "state_5.sqlite"));
    db.exec("CREATE TABLE threads (id TEXT PRIMARY KEY, title TEXT, cwd TEXT);");
    db.prepare("INSERT INTO threads (id, title, cwd) VALUES (?, ?, ?)").run("configured-thread", "Configured", String.raw`D:\work`);
    db.close();

    const snapshot = loadCodexIndex(home);
    const session = snapshot.sessions.find((item) => item.sessionId === "configured-thread");
    expect(session?.title).toBe("Configured");
    expect(session?.evidence[0]?.path).toContain("sqlite-state");
  });

  it("indexes archived Codex rollout files with explicit archived evidence", async () => {
    const home = mkdtempSync(join(tmpdir(), "agentscope-codex-archived-"));
    tempRoots.push(home);
    const sessionId = "019ea000-0000-7000-8000-000000000001";
    const archivedPath = join(
      home,
      ".codex",
      "archived_sessions",
      "2026",
      "06",
      "07",
      `rollout-2026-06-07T12-00-00-${sessionId}.jsonl`
    );
    mkdirSync(dirname(archivedPath), { recursive: true });
    writeFileSync(archivedPath, JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd: String.raw`D:\work`, title: "Archived" } }) + "\n");

    const snapshot = await scanCodexRollouts(home);
    const session = snapshot.sessions.find((item) => item.sessionId === sessionId);
    expect(session?.title).toBe("Archived");
    expect(session?.indexMetadata?.archived_rollout).toBe(true);
    expect(session?.evidence[0]?.detail).toContain("archived");
  });

  it("can index Codex rollout metadata without transcript activity analysis", async () => {
    const home = mkdtempSync(join(tmpdir(), "agentscope-codex-light-rollout-"));
    tempRoots.push(home);
    const sessionId = "019ea000-0000-7000-8000-000000000002";
    const rolloutPath = join(
      home,
      ".codex",
      "sessions",
      "2026",
      "06",
      "12",
      `rollout-2026-06-12T12-00-00-${sessionId}.jsonl`
    );
    mkdirSync(dirname(rolloutPath), { recursive: true });
    writeFileSync(
      rolloutPath,
      [
        JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd: String.raw`D:\work`, title: "Light" } }),
        JSON.stringify({ type: "turn_context", payload: { cwd: String.raw`D:\work` } })
      ].join("\n") + "\n"
    );

    const snapshot = await scanCodexRollouts(home, { includeActivity: false });
    const session = snapshot.sessions.find((item) => item.sessionId === sessionId);
    const transcript = snapshot.transcripts.find((item) => item.sessionId === sessionId);
    const record = snapshot.records.find((item) => item.sessionId === sessionId);
    expect(session?.title).toBe("Light");
    expect(session?.activity).toBeUndefined();
    expect(session?.indexMetadata?.activity_line_count).toBeUndefined();
    expect(transcript?.activity).toBeUndefined();
    expect(record?.metadata?.activity).toBeUndefined();
    expect(session?.evidence[0]?.source).toBe("codex.sessions.rollout");
  });

  it("marks rollout metadata scans as truncated when a max line cap stops early", async () => {
    const home = mkdtempSync(join(tmpdir(), "agentscope-codex-truncated-rollout-"));
    tempRoots.push(home);
    const sessionId = "019ea000-0000-7000-8000-000000000003";
    const rolloutPath = join(
      home,
      ".codex",
      "sessions",
      "2026",
      "06",
      "12",
      `rollout-2026-06-12T12-00-00-${sessionId}.jsonl`
    );
    mkdirSync(dirname(rolloutPath), { recursive: true });
    writeFileSync(
      rolloutPath,
      Array.from({ length: 80 }, (_value, index) =>
        JSON.stringify({ type: "turn_context", payload: { cwd: String.raw`D:\work`, index } })
      ).join("\n") + "\n"
    );

    const snapshot = await scanCodexRollouts(home, { includeActivity: false, metadataMaxLines: 12 });
    const session = snapshot.sessions.find((item) => item.sessionId === sessionId);
    expect(session?.indexMetadata?.metadata_scan_lines).toBe(12);
    expect(session?.indexMetadata?.metadata_scan_truncated).toBe(true);
  });
});
