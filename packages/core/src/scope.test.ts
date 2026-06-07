import { describe, expect, it } from "vitest";
import type { AgentProcess, AgentSession, ScopeSnapshot } from "@agentscope/shared";
import { heuristicSessionsForProcess, mergeSessions } from "./scope.js";

describe("scope confidence", () => {
  it("merges to the best index confidence", () => {
    const sessions = mergeSessions([
      baseSession("t1", "heuristic"),
      baseSession("t1", "indexed")
    ]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.confidence).toBe("indexed");
  });

  it("requires cwd or transcript evidence for heuristic process matching", () => {
    const session = baseSession("t1", "indexed");
    session.cwd = String.raw`D:\Project\AgentScope`;
    const process: AgentProcess = {
      pid: 10,
      ppid: 1,
      processName: "Codex.exe",
      commandLine: String.raw`"C:\Program Files\WindowsApps\OpenAI.Codex\Codex.exe"`,
      agent: "codex",
      evidence: []
    };
    const snapshot: ScopeSnapshot = { processes: [process], sessions: [session], transcripts: [], indexRecords: [], relations: [] };
    expect(heuristicSessionsForProcess(snapshot, process, 5)).toHaveLength(0);
  });
});

function baseSession(sessionId: string, confidence: AgentSession["confidence"]): AgentSession {
  return {
    agent: "codex",
    sessionId,
    confidence,
    childSessionIds: [],
    evidence: []
  };
}
