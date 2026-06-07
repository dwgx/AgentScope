import { describe, expect, it } from "vitest";
import type { AgentProcess, AgentSession, ScopeSnapshot } from "@agentscope/shared";
import { heuristicSessionsForProcess, mergeSessions, sessionCandidatesForProcess } from "./scope.js";

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
    session.startedAt = "2026-06-07T04:20:00.000Z";
    const process: AgentProcess = {
      pid: 10,
      ppid: 1,
      processName: "Codex.exe",
      commandLine: String.raw`"C:\Program Files\WindowsApps\OpenAI.Codex\Codex.exe"`,
      startTime: "2026-06-07T04:25:00.000Z",
      agent: "codex",
      evidence: []
    };
    const snapshot: ScopeSnapshot = { processes: [process], sessions: [session], transcripts: [], indexRecords: [], relations: [] };
    expect(heuristicSessionsForProcess(snapshot, process, 5)).toHaveLength(0);
    expect(sessionCandidatesForProcess(snapshot, process, 5)[0]?.score).toBeGreaterThan(0);
  });

  it("scores cwd-backed process candidates with evidence reasons", () => {
    const session = baseSession("t1", "indexed");
    session.cwd = String.raw`D:\Project\AgentScope`;
    session.transcriptPath = String.raw`C:\Users\dwgx1\.codex\sessions\2026\06\07\rollout-2026-06-07T04-20-00-t1.jsonl`;
    const process: AgentProcess = {
      pid: 10,
      ppid: 1,
      processName: "Codex.exe",
      commandLine: String.raw`codex --cwd D:\Project\AgentScope`,
      agent: "codex",
      evidence: []
    };
    const snapshot: ScopeSnapshot = { processes: [process], sessions: [session], transcripts: [], indexRecords: [], relations: [] };
    const [candidate] = sessionCandidatesForProcess(snapshot, process, 5);
    expect(candidate?.sessionId).toBe("t1");
    expect(candidate?.confidence).toBe("heuristic");
    expect(candidate?.reasons.map((reason) => reason.source)).toContain("process.match.cwd");
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
