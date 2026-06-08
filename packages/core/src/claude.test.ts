import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadClaudeSessions, loadClaudeTranscripts } from "./claude.js";

describe("Claude indexes", () => {
  it("loads daemon roster PID as stored evidence until a process row confirms it", () => {
    const home = tempHome();
    const daemon = path.join(home, ".claude", "daemon");
    fs.mkdirSync(daemon, { recursive: true });
    fs.writeFileSync(
      path.join(daemon, "roster.json"),
      JSON.stringify({
        proto: 1,
        supervisorPid: 11,
        updatedAt: 1770000000000,
        workers: {
          abc12345: {
            pid: 222,
            sessionId: "session-1",
            cwd: String.raw`D:\Project\AgentScope`,
            cliVersion: "2.1.163",
            startedAt: 1770000001000,
            attempt: 1
          }
        }
      })
    );

    const [session] = loadClaudeSessions(home);
    expect(session?.sessionId).toBe("session-1");
    expect(session?.pid).toBeUndefined();
    expect(session?.indexMetadata?.storedPid).toBe(222);
    expect(session?.confidence).toBe("indexed");
    expect(session?.indexSource).toBe("claude.daemon.roster");
    expect(session?.indexMetadata?.daemon_worker).toBe("abc12345");
  });

  it("keeps subagent transcripts as relations instead of top-level sessions", async () => {
    const home = tempHome();
    const subagents = path.join(home, ".claude", "projects", "D--Project-AgentScope", "parent-1", "subagents");
    fs.mkdirSync(subagents, { recursive: true });
    fs.writeFileSync(path.join(home, ".claude", "projects", "D--Project-AgentScope", "parent-1.jsonl"), "{}\n");
    fs.writeFileSync(path.join(subagents, "agent-child.jsonl"), "{}\n");

    const result = await loadClaudeTranscripts(home);
    expect(result.transcripts).toHaveLength(2);
    expect(result.transcripts.find((item) => item.sessionId === "agent-child")?.transcriptKind).toBe("subagent");
    expect(result.relations[0]).toMatchObject({
      kind: "subagent",
      sourceId: "parent-1",
      targetId: "agent-child"
    });
  });
});

function tempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-claude-"));
}
