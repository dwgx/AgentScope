import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentProcess, AgentSession, ScopeSnapshot } from "@agentscope/shared";
import { annotateProcessTree, classifyProcess, isRelatedProcess } from "./processes.js";
import { readRolloutMetadata } from "./codex.js";
import { buildSnapshot, heuristicSessionsForProcess, mergeSessions, sessionCandidatesForProcess, sessionsForPid } from "./scope.js";

describe("scope confidence", () => {
  it("returns indexed sessions when live process enumeration times out", async () => {
    const home = mkdtempSync(join(tmpdir(), "agentscope-scope-timeout-"));
    try {
      const sessionId = "11111111-1111-4111-8111-111111111111";
      const rollout = join(home, ".codex", "sessions", "2026", "06", "12", `rollout-2026-06-12T00-00-00-${sessionId}.jsonl`);
      mkdirSync(dirname(rollout), { recursive: true });
      writeFileSync(
        rollout,
        JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd: String.raw`D:\AgentScopeSmoke\Timeout` } }) + "\n",
        "utf8"
      );

      const snapshot = await buildSnapshot(home, {
        includeProcesses: true,
        includeRolloutActivity: false,
        processTimeoutMs: 20,
        processProvider: () => new Promise<AgentProcess[]>(() => undefined)
      });

      const session = snapshot.sessions.find((item) => item.sessionId === sessionId);
      expect(session).toBeTruthy();
      expect(session?.activity).toBeUndefined();
      expect(snapshot.processes).toHaveLength(0);
      expect(snapshot.diagnostics?.some((item) => item.name === "win32.process.scan" && item.status === "warn")).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("returns indexed sessions with diagnostics when live process enumeration fails", async () => {
    const home = mkdtempSync(join(tmpdir(), "agentscope-scope-process-failure-"));
    try {
      const sessionId = "22222222-2222-4222-8222-222222222222";
      const rollout = join(home, ".codex", "sessions", "2026", "06", "12", `rollout-2026-06-12T00-00-00-${sessionId}.jsonl`);
      mkdirSync(dirname(rollout), { recursive: true });
      writeFileSync(
        rollout,
        JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd: String.raw`D:\AgentScopeSmoke\Failure` } }) + "\n",
        "utf8"
      );

      const snapshot = await buildSnapshot(home, {
        includeProcesses: true,
        includeRolloutActivity: false,
        processProvider: () => Promise.reject(new Error("bad process JSON"))
      });

      expect(snapshot.sessions.some((item) => item.sessionId === sessionId)).toBe(true);
      expect(snapshot.processes).toHaveLength(0);
      expect(snapshot.diagnostics?.some((item) => item.name === "win32.process.scan" && item.detail.includes("bad process JSON"))).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

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

  it("does not mutate primary session fields when computing heuristic candidates", () => {
    const session = baseSession("runtime-thread", "indexed");
    session.cwd = String.raw`D:\Project\AgentScope`;
    const process: AgentProcess = {
      pid: 10,
      ppid: 1,
      processName: "codex.exe",
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

    expect(heuristicSessionsForProcess(snapshot, process, 5)).toHaveLength(1);
    expect(session.confidence).toBe("indexed");
    expect(session.pid).toBeUndefined();
    expect(session.commandLine).toBeUndefined();
  });

  it("returns process inspection matches with candidate confidence instead of naked sessions", () => {
    const session = baseSession("runtime-thread", "indexed");
    session.cwd = String.raw`D:\Project\AgentScope`;
    const process: AgentProcess = {
      pid: 10,
      ppid: 1,
      processName: "codex.exe",
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

    const [match] = sessionsForPid(snapshot, 10);

    expect(match?.session.sessionId).toBe("runtime-thread");
    expect(match?.session.confidence).toBe("indexed");
    expect(match?.candidate.confidence).toBe("heuristic");
    expect(match?.candidate.pid).toBe(10);
  });

  it("does not upgrade a stale pid to exact when the active process has a different agent", () => {
    const session = baseSession("stale-thread", "indexed");
    session.agent = "claude";
    session.pid = 9352;
    const process: AgentProcess = {
      pid: 9352,
      ppid: 1,
      processName: "codex.exe",
      commandLine: "codex",
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

    expect(sessionCandidatesForProcess(snapshot, process, 5)[0]?.confidence).not.toBe("exact");
    expect(sessionsForPid(snapshot, 9352).some((match) => match.candidate.confidence === "exact")).toBe(false);
  });

  it("does not treat executable paths under the user profile as cwd evidence", () => {
    const session = baseSession("profile-thread", "indexed");
    session.cwd = String.raw`C:\Users\dwgx1`;
    session.startedAt = "2026-06-08T08:00:00.000Z";
    const process: AgentProcess = {
      pid: 40576,
      ppid: 29828,
      processName: "codex.exe",
      executablePath: String.raw`C:\Users\dwgx1\AppData\Local\OpenAI\Codex\bin\codex.exe`,
      commandLine: String.raw`"C:\Users\dwgx1\AppData\Local\OpenAI\Codex\bin\codex.exe" app-server --listen stdio://`,
      startTime: "2026-06-08T08:02:00.000Z",
      agent: "codex",
      processRole: "codex_app_server",
      evidence: []
    };
    const snapshot: ScopeSnapshot = {
      processes: [process],
      sessions: [session],
      transcripts: [],
      indexRecords: [],
      relations: []
    };
    expect(sessionCandidatesForProcess(snapshot, process, 5)).toHaveLength(0);
    expect(heuristicSessionsForProcess(snapshot, process, 5)).toHaveLength(0);
  });

  it("suppresses helper process candidates unless they carry direct session evidence", () => {
    const session = baseSession("helper-thread", "indexed");
    session.cwd = String.raw`D:\Project\AgentScope`;
    session.startedAt = "2026-06-08T08:00:00.000Z";
    session.updatedAt = "2026-06-08T08:05:00.000Z";
    const process: AgentProcess = {
      pid: 4972,
      ppid: 36756,
      processName: "node_repl.exe",
      commandLine: String.raw`node_repl.exe --stdio`,
      startTime: "2026-06-08T08:04:00.000Z",
      agent: "codex",
      processRole: "codex_node_repl",
      evidence: []
    };
    const snapshot: ScopeSnapshot = {
      processes: [process],
      sessions: [session],
      transcripts: [],
      indexRecords: [],
      relations: []
    };
    expect(sessionCandidatesForProcess(snapshot, process, 5)).toHaveLength(0);
  });

  it("classifies Codex tool kernels and suppresses their cwd-only session candidates", () => {
    const [process] = annotateProcessTree([
      {
        pid: 5010,
        ppid: 100,
        processName: "node.exe",
        commandLine: String.raw`"C:\Program Files\nodejs\node.exe" "D:\tools\kernel.js" --session-id rt-123 --working-dir "D:\Project\AgentScope"`,
        agent: "codex",
        evidence: []
      }
    ]);
    const session = baseSession("codex-thread", "indexed");
    session.cwd = String.raw`D:\Project\AgentScope`;
    session.startedAt = "2026-06-08T08:00:00.000Z";
    const snapshot: ScopeSnapshot = {
      processes: [process!],
      sessions: [session],
      transcripts: [],
      indexRecords: [],
      relations: []
    };

    expect(process?.processRole).toBe("codex_tool_kernel");
    expect(process?.runtimeSessionId).toBe("rt-123");
    expect(process?.runtimeWorkingDir).toBe(String.raw`D:\Project\AgentScope`);
    expect(process?.evidence.map((item) => item.source)).toContain("process.runtime");
    expect(sessionCandidatesForProcess(snapshot, process!, 5)).toHaveLength(0);
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

describe("process role classification", () => {
  it("classifies a Codex CLI/helper tree without promoting node_repl as a root task", () => {
    const processes = annotateProcessTree([
      {
        pid: 100,
        ppid: 10,
        processName: "node.exe",
        commandLine: String.raw`"node" "C:\Users\dwgx1\AppData\Roaming\npm\node_modules\@openai\codex\bin\codex.js"`,
        agent: "codex",
        evidence: []
      },
      {
        pid: 110,
        ppid: 100,
        processName: "codex.exe",
        executablePath: String.raw`C:\Users\dwgx1\AppData\Local\OpenAI\Codex\bin\codex.exe`,
        commandLine: String.raw`codex.exe`,
        agent: "codex",
        evidence: []
      },
      {
        pid: 120,
        ppid: 110,
        processName: "node_repl.exe",
        commandLine: String.raw`node_repl.exe --stdio`,
        agent: "codex",
        evidence: []
      },
      {
        pid: 130,
        ppid: 120,
        processName: "codex.exe",
        commandLine: String.raw`codex.exe app-server --listen stdio://`,
        agent: "codex",
        evidence: []
      }
    ]);

    expect(processes.map((process) => process.processRole)).toEqual([
      "codex_cli",
      "codex_engine",
      "codex_node_repl",
      "codex_app_server"
    ]);
    expect(processes.map((process) => process.rootPid)).toEqual([100, 100, 100, 100]);
    expect(processes[2]?.parentAgentPid).toBe(110);
  });

  it("does not classify a Codex command prompt containing Claude text as Claude", () => {
    expect(
      classifyProcess(
        "codex.exe",
        "codex resume 019ea --note \"compare Claude behavior\"",
        String.raw`C:\Users\dwgx1\AppData\Local\OpenAI\Codex\bin\codex.exe`
      )
    ).toBe("codex");
  });

  it("does not treat unrelated Windows daemon processes as agent processes", () => {
    expect(
      isRelatedProcess({
        pid: 10,
        processName: "SearchProtocolHost.exe",
        executablePath: String.raw`C:\Windows\System32\SearchProtocolHost.exe`,
        commandLine: String.raw`"C:\Windows\System32\SearchProtocolHost.exe" "DownLevelDaemon"`,
        agent: "unknown",
        evidence: []
      })
    ).toBe(false);
    expect(
      isRelatedProcess({
        pid: 11,
        processName: "node.exe",
        commandLine: String.raw`node C:\Users\dwgx1\.claude\daemon\worker.js`,
        agent: "claude",
        evidence: []
      })
    ).toBe(true);
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
