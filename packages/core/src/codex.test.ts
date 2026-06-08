import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { loadCodexIndex, rolloutStartedAt, rolloutThreadId } from "./codex.js";

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
});
