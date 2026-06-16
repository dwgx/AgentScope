import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { searchAll } from "./search.js";

describe("search privacy", () => {
  it("does not match JSONL body or hidden reasoning fields", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-search-"));
    const dir = path.join(home, ".codex", "sessions", "2026", "06", "07");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "rollout-2026-06-07T04-20-59-thread-1.jsonl"),
      JSON.stringify({
        type: "event_msg",
        payload: {
          type: "agent_message",
          message: "secret AgentScope raw text",
          reasoning: "AgentScope hidden chain"
        }
      }) + "\n"
    );

    const matches = await searchAll("AgentScope", home, 5);
    expect(matches).toHaveLength(0);
  });

  it("returns JSONL safe-field match location without raw excerpt", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-search-safe-"));
    const dir = path.join(home, ".codex", "sessions", "2026", "06", "07");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "rollout-2026-06-07T04-20-59-thread-1.jsonl"),
      JSON.stringify({
        type: "session_meta",
        payload: { type: "metadata", cwd: String.raw`D:\AgentScopeProject`, message: "do not show AgentScope body" }
      }) + "\n"
    );

    const [match] = await searchAll("AgentScopeProject", home, 5);
    expect(match?.source).toBe("codex.sessions.rollout");
    expect(match).not.toHaveProperty("text");
    expect(match).not.toHaveProperty("excerpt");
    expect(match?.matchedFields).toEqual(["payload.cwd"]);
    expect(JSON.stringify(match)).not.toContain("do not show AgentScope body");
  });

  it("does not match token-shaped or oversized JSONL metadata values", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-search-metadata-"));
    const dir = path.join(home, ".codex", "sessions", "2026", "06", "07");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "rollout-2026-06-07T04-20-59-thread-1.jsonl"),
      [
        JSON.stringify({
          type: "session_meta",
          payload: {
            type: "metadata",
            cwd: String.raw`D:\AgentScopeProject`,
            title: `sk-proj_${"agentscope_search_token_1234567890"}`,
            model: "gpt-5"
          }
        }),
        JSON.stringify({
          type: "session_meta",
          payload: {
            type: "metadata",
            title: `${"AgentScopeOversized ".repeat(40)}tail`
          }
        })
      ].join("\n") + "\n"
    );

    expect(await searchAll("agentscope_search_token", home, 5)).toHaveLength(0);
    expect(await searchAll("AgentScopeOversized", home, 5)).toHaveLength(0);
    const [match] = await searchAll("AgentScopeProject", home, 5);
    expect(match?.matchedFields).toEqual(["payload.cwd"]);
    expect(JSON.stringify(match)).not.toContain("agentscope_search_token");
  });

  it("does not search SQLite preview unless explicitly enabled", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-search-sqlite-"));
    const codexRoot = path.join(home, ".codex");
    fs.mkdirSync(codexRoot, { recursive: true });
    const Database = await import("better-sqlite3");
    const db = new Database.default(path.join(codexRoot, "state_5.sqlite"));
    db.exec("CREATE TABLE threads (id TEXT PRIMARY KEY, title TEXT, preview TEXT, cwd TEXT, rollout_path TEXT, updated_at TEXT);");
    db.prepare("INSERT INTO threads (id, title, preview, cwd, rollout_path) VALUES (?, ?, ?, ?, ?)").run(
      "preview-thread",
      "safe title",
      "private AgentScope preview",
      String.raw`D:\work`,
      String.raw`C:\Users\dwgx1\.codex\sessions\rollout-preview-thread.jsonl`
    );
    db.close();

    expect(await searchAll("private AgentScope", home, 5)).toHaveLength(0);
    const [match] = await searchAll("private AgentScope", home, 5, { includeSqlitePreview: true });
    expect(match?.matchedFields).toEqual(["preview"]);
    expect(JSON.stringify(match)).not.toContain("private AgentScope preview");
  });

  it("searches compatible versioned Codex state sqlite databases", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-search-versioned-sqlite-"));
    const codexRoot = path.join(home, ".codex");
    fs.mkdirSync(codexRoot, { recursive: true });
    const Database = await import("better-sqlite3");
    const db = new Database.default(path.join(codexRoot, "state_6.sqlite"));
    db.exec("CREATE TABLE threads (id TEXT PRIMARY KEY, title TEXT, preview TEXT, cwd TEXT, rollout_path TEXT, updated_at TEXT);");
    db.prepare("INSERT INTO threads (id, title, preview, cwd, rollout_path) VALUES (?, ?, ?, ?, ?)").run(
      "versioned-search-thread",
      "AgentScope versioned search",
      "private preview",
      String.raw`D:\work`,
      String.raw`C:\Users\dwgx1\.codex\rollouts\rollout-versioned-search-thread.jsonl`
    );
    db.close();

    const [match] = await searchAll("versioned search", home, 5);
    expect(match?.sessionId).toBe("versioned-search-thread");
    expect(match?.matchedFields).toEqual(["title"]);
  });
});
