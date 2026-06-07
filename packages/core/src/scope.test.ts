import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentProcess, AgentSession, ScopeSnapshot } from "@agentscope/shared";
import { readRolloutMetadata } from "./codex.js";
import {
  heuristicSessionsForProcess,
  mergeSessions,
  sessionCandidatesForProcess
} from "./scope.js";

describe("scope confidence", () => {
  it("merges to the best index confidence", () => {
    const sessions = mergeSessions([baseSession("t1", "heuristic"), baseSession("t1", "indexed")]);
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
    const snapshot: ScopeSnapshot = {
      processes: [process],
      sessions: [session],
      transcripts: [],
      indexRecords: [],
      relations: []
    };
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
    const snapshot: ScopeSnapshot = {
      processes: [process],
      sessions: [session],
      transcripts: [],
      indexRecords: [],
      relations: []
    };
    const [candidate] = sessionCandidatesForProcess(snapshot, process, 5);
    expect(candidate?.sessionId).toBe("t1");
    expect(candidate?.confidence).toBe("heuristic");
    expect(candidate?.reasons.map((reason) => reason.source)).toContain("process.match.cwd");
  });

  it("treats Claude PID matches as exact API-style runtime mapping", () => {
    const session = baseSession("claude-session", "indexed");
    session.agent = "claude";
    session.pid = 9352;
    session.cwd = String.raw`D:\Project\AgentScope`;
    const process: AgentProcess = {
      pid: 9352,
      ppid: 10168,
      processName: "claude.exe",
      commandLine: String.raw`claude --gpu-preferences=...`,
      startTime: "2026-06-07T08:09:00.000Z",
      windowTitle: "AgentScope - Claude",
      agent: "claude",
      evidence: []
    };
    const snapshot: ScopeSnapshot = {
      processes: [process],
      sessions: [session],
      transcripts: [],
      indexRecords: [],
      relations: []
    };
    const [candidate] = sessionCandidatesForProcess(snapshot, process, 5);
    expect(candidate).toMatchObject({
      agent: "claude",
      sessionId: "claude-session",
      confidence: "exact"
    });
    expect(candidate?.scoreParts?.map((part) => part.source)).toContain("process.match.pid");
  });

  it("uses window title evidence to rank simulated Codex desktop sessions", () => {
    const older = baseSession("older-thread", "indexed");
    older.title = "SteamVR driver cleanup";
    older.cwd = String.raw`D:\Project\AgentScope`;
    older.updatedAt = "2026-06-07T05:00:00.000Z";
    const newer = baseSession("newer-thread", "indexed");
    newer.title = "AgentScope process tracing UI";
    newer.cwd = String.raw`D:\Project\AgentScope`;
    newer.updatedAt = "2026-06-07T06:00:00.000Z";
    const process: AgentProcess = {
      pid: 33812,
      ppid: 23132,
      processName: "codex.exe",
      commandLine: String.raw`codex --cwd D:\Project\AgentScope`,
      startTime: "2026-06-07T06:03:00.000Z",
      windowTitle: "AgentScope process tracing UI - Codex",
      agent: "codex",
      evidence: []
    };
    const snapshot: ScopeSnapshot = {
      processes: [process],
      sessions: [older, newer],
      transcripts: [],
      indexRecords: [],
      relations: []
    };
    const [candidate] = sessionCandidatesForProcess(snapshot, process, 5);
    expect(candidate?.sessionId).toBe("newer-thread");
    expect(candidate?.scoreParts?.map((part) => part.source)).toContain(
      "process.match.window_title"
    );
  });
});

describe("codex rollout metadata", () => {
  it("scans beyond the startup header for model, cwd, sandbox, and token evidence", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agentscope-rollout-"));
    try {
      const filePath = join(dir, "rollout-2026-06-07T12-00-00-deep-thread.jsonl");
      const filler = Array.from({ length: 80 }, (_value, index) =>
        JSON.stringify({ type: "event_msg", payload: { index } })
      );
      const records = [
        ...filler,
        JSON.stringify({
          payload: {
            cwd: String.raw`D:\Project\AgentScope`,
            model: "gpt-5-codex",
            approval_policy: "never",
            sandbox_mode: "danger-full-access",
            usage: { input_tokens: 120, output_tokens: 30 }
          }
        }),
        JSON.stringify({ data: { title: "Deep metadata session" } })
      ];
      writeFileSync(filePath, records.join("\n"), "utf8");

      const metadata = await readRolloutMetadata(filePath);

      expect(metadata.cwd).toBe(String.raw`D:\Project\AgentScope`);
      expect(metadata.model).toBe("gpt-5-codex");
      expect(metadata.approval_policy).toBe("never");
      expect(metadata.sandbox_mode).toBe("danger-full-access");
      expect(metadata.total_tokens).toBe(150);
      expect(metadata.metadata_scan_lines).toBeGreaterThan(50);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
