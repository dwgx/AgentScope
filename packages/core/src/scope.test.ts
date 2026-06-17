import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentProcess, AgentSession, ScopeSnapshot } from "@agentscope/shared";
import { annotateProcessTree, classifyProcess, isRelatedProcess, selectRelatedProcesses } from "./processes.js";
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

  it("decorates live processes with display titles and last activity timestamps", async () => {
    const home = mkdtempSync(join(tmpdir(), "agentscope-process-decoration-"));
    try {
      const sessionId = "33333333-3333-4333-8333-333333333333";
      const rollout = join(home, ".codex", "sessions", "2026", "06", "15", `rollout-2026-06-15T10-00-00-${sessionId}.jsonl`);
      mkdirSync(dirname(rollout), { recursive: true });
      writeFileSync(
        rollout,
        [
          JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd: String.raw`D:\Workspace\AgentScopeFixture` } }),
          JSON.stringify({ type: "event_msg", payload: { timestamp: "2026-06-15T10:45:00.000Z" } })
        ].join("\n"),
        "utf8"
      );
      const activityTime = new Date("2026-06-15T10:45:00.000Z");
      utimesSync(rollout, activityTime, activityTime);

      const snapshot = await buildSnapshot(home, {
        includeProcesses: true,
        processProvider: async () =>
          annotateProcessTree([
            {
              pid: 101,
              ppid: 1,
              processName: "node.exe",
              commandLine: String.raw`node C:\Users\AgentScopeUser\AppData\Roaming\npm\node_modules\@openai\codex\bin\codex.js --cwd D:\Workspace\AgentScopeFixture`,
              startTime: "2026-06-15T10:10:00.000Z",
              agent: "codex",
              evidence: []
            }
          ])
      });

      expect(snapshot.processes[0]?.displayTitle).toBe("Codex CLI / AgentScopeFixture");
      expect(snapshot.processes[0]?.lastActivityAt).toBe("2026-06-15T10:45:00.000Z");
      expect(snapshot.processes[0]?.evidence.map((item) => item.source)).toContain("process.activity");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("uses strong session titles as live process display titles", async () => {
    const home = mkdtempSync(join(tmpdir(), "agentscope-process-title-"));
    try {
      const sessionId = "44444444-4444-4444-8444-444444444444";
      const rollout = join(home, ".codex", "sessions", "2026", "06", "15", `rollout-2026-06-15T10-20-00-${sessionId}.jsonl`);
      mkdirSync(dirname(rollout), { recursive: true });
      writeFileSync(
        rollout,
        [
          JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd: String.raw`D:\Workspace\AgentScopeFixture` } }),
          JSON.stringify({ data: { title: "AgentScope process title polish" } }),
          JSON.stringify({ type: "event_msg", payload: { timestamp: "2026-06-15T10:50:00.000Z" } })
        ].join("\n"),
        "utf8"
      );

      const snapshot = await buildSnapshot(home, {
        includeProcesses: true,
        processProvider: async () =>
          annotateProcessTree([
            {
              pid: 102,
              ppid: 1,
              processName: "node.exe",
              commandLine: String.raw`node C:\Users\AgentScopeUser\AppData\Roaming\npm\node_modules\@openai\codex\bin\codex.js --cwd D:\Workspace\AgentScopeFixture`,
              startTime: "2026-06-15T10:25:00.000Z",
              agent: "codex",
              evidence: []
            }
          ])
      });

      expect(snapshot.processes[0]?.sessionCandidates?.[0]?.confidence).toBe("heuristic");
      expect(snapshot.processes[0]?.displayTitle).toBe("AgentScope process title polish");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("keeps a role prefix when only weak session-title evidence is available", async () => {
    const home = mkdtempSync(join(tmpdir(), "agentscope-process-weak-title-"));
    try {
      const sessionId = "55555555-5555-4555-8555-555555555555";
      const rollout = join(home, ".codex", "sessions", "2026", "06", "15", `rollout-2026-06-15T11-00-00-${sessionId}.jsonl`);
      mkdirSync(dirname(rollout), { recursive: true });
      writeFileSync(
        rollout,
        [
          JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd: String.raw`D:\Project\Other` } }),
          JSON.stringify({ data: { title: "SteamVR driver settings audit" } }),
          JSON.stringify({ type: "event_msg", payload: { timestamp: "2026-06-15T11:05:00.000Z" } })
        ].join("\n"),
        "utf8"
      );

      const snapshot = await buildSnapshot(home, {
        includeProcesses: true,
        processProvider: async () =>
          annotateProcessTree([
            {
              pid: 103,
              ppid: 1,
              processName: "node.exe",
              commandLine: String.raw`node C:\Users\AgentScopeUser\AppData\Roaming\npm\node_modules\@openai\codex\bin\codex.js`,
              startTime: "2026-06-15T02:03:00.000Z",
              agent: "codex",
              evidence: []
            }
          ])
      });

      expect(snapshot.processes[0]?.sessionCandidates?.[0]?.confidence).toBe("unknown");
      expect(snapshot.processes[0]?.displayTitle).toBe("Codex CLI / SteamVR driver settings audit");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("decorates MCP tool processes with config-backed identity", async () => {
    const home = mkdtempSync(join(tmpdir(), "agentscope-mcp-identity-"));
    try {
      const configPath = join(home, ".codex", "config.toml");
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(
        configPath,
        [
          "[mcp_servers.playwright]",
          'command = "npx"',
          'args = ["@playwright/mcp"]',
          ""
        ].join("\n"),
        "utf8"
      );

      const snapshot = await buildSnapshot(home, {
        includeProcesses: true,
        processProvider: async () =>
          annotateProcessTree([
            {
              pid: 201,
              ppid: 100,
              processName: "node.exe",
              commandLine: String.raw`node C:\Users\AgentScopeUser\AppData\Roaming\npm\node_modules\@playwright\mcp\cli.js`,
              agent: "codex",
              evidence: []
            }
          ])
      });

      expect(snapshot.processes[0]).toMatchObject({
        processRole: "codex_mcp_tool",
        displayTitle: "MCP Tool / Playwright",
        mcp: {
          displayName: "Playwright",
          serverName: "playwright",
          serverKind: "playwright",
          transport: "stdio",
          configSource: "user_config",
          configTable: "mcp_servers.playwright",
          commandSummary: "npx @playwright/mcp",
          confidence: "heuristic"
        }
      });
      expect(snapshot.processes[0]?.evidence.map((item) => item.source)).toContain("process.mcp.config");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("inherits MCP identity to helper child processes without treating it as exact evidence", async () => {
    const home = mkdtempSync(join(tmpdir(), "agentscope-mcp-child-"));
    try {
      const snapshot = await buildSnapshot(home, {
        includeProcesses: true,
        processProvider: async () =>
          annotateProcessTree([
            {
              pid: 301,
              ppid: 100,
              processName: "ida-pro-mcp.exe",
              executablePath: String.raw`C:\Users\AgentScopeUser\.local\bin\ida-pro-mcp.exe`,
              commandLine: String.raw`"C:\Users\AgentScopeUser\.local\bin\ida-pro-mcp.exe"`,
              agent: "codex",
              evidence: []
            },
            {
              pid: 302,
              ppid: 301,
              processName: "python.exe",
              executablePath: String.raw`C:\Users\AgentScopeUser\AppData\Roaming\uv\tools\ida-pro-mcp\Scripts\python.exe`,
              commandLine: String.raw`python worker.py`,
              agent: "unknown",
              evidence: []
            },
            {
              pid: 303,
              ppid: 302,
              processName: "python.exe",
              executablePath: String.raw`C:\Users\AgentScopeUser\AppData\Roaming\uv\tools\ida-pro-mcp\Scripts\python.exe`,
              commandLine: String.raw`python child_worker.py`,
              agent: "unknown",
              evidence: []
            }
          ])
      });

      const child = snapshot.processes.find((process) => process.pid === 302);
      const grandchild = snapshot.processes.find((process) => process.pid === 303);
      expect(child).toMatchObject({
        processRole: "codex_mcp_tool",
        displayTitle: "MCP Tool / IDA Pro",
        mcp: {
          displayName: "IDA Pro",
          serverKind: "ida_pro",
          configSource: "process_only",
          confidence: "heuristic"
        }
      });
      expect(child?.mcp?.evidence.map((item) => item.source)).toContain("process.mcp.parent_tree");
      expect(grandchild).toMatchObject({
        processRole: "codex_mcp_tool",
        displayTitle: "MCP Tool / IDA Pro",
        mcp: {
          displayName: "IDA Pro",
          serverKind: "ida_pro",
          configSource: "process_only",
          confidence: "heuristic"
        }
      });
      expect(grandchild?.mcp?.evidence.map((item) => item.source)).toContain("process.mcp.parent_tree");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("extracts custom modelcontextprotocol MCP package names without leaking sensitive values", async () => {
    const home = mkdtempSync(join(tmpdir(), "agentscope-mcp-custom-"));
    try {
      const configPath = join(home, ".codex", "config.toml");
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(
        configPath,
        [
          "[mcp_servers.filesystem]",
          'command = "npx"',
          'args = ["@modelcontextprotocol/server-filesystem", "D:\\\\Project", "--token=secret-value"]',
          ""
        ].join("\n"),
        "utf8"
      );

      const snapshot = await buildSnapshot(home, {
        includeProcesses: true,
        processProvider: async () =>
          annotateProcessTree([
            {
              pid: 401,
              ppid: 100,
              processName: "node.exe",
              commandLine: String.raw`node @modelcontextprotocol/server-filesystem D:\Project`,
              agent: "codex",
              evidence: []
            }
          ])
      });

      expect(snapshot.processes[0]?.displayTitle).toBe("MCP Tool / Filesystem");
      expect(snapshot.processes[0]?.mcp?.serverName).toBe("filesystem");
      expect(snapshot.processes[0]?.mcp?.commandSummary).toBe("npx @modelcontextprotocol/server-filesystem D:\\Project");
      expect(JSON.stringify(snapshot.processes[0]?.mcp)).not.toContain("secret-value");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("redacts split sensitive MCP arguments from config-backed command summaries", async () => {
    const home = mkdtempSync(join(tmpdir(), "agentscope-mcp-sensitive-"));
    try {
      const configPath = join(home, ".codex", "config.toml");
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(
        configPath,
        [
          "[mcp_servers.filesystem]",
          'command = "npx"',
          'args = ["@modelcontextprotocol/server-filesystem", "D:\\\\Project", "--token", "split-secret-value", "--api-key=inline-secret-value"]',
          ""
        ].join("\n"),
        "utf8"
      );

      const snapshot = await buildSnapshot(home, {
        includeProcesses: true,
        processProvider: async () =>
          annotateProcessTree([
            {
              pid: 402,
              ppid: 100,
              processName: "node.exe",
              commandLine: String.raw`node @modelcontextprotocol/server-filesystem D:\Project --token split-secret-value`,
              agent: "codex",
              evidence: []
            }
          ])
      });

      expect(snapshot.processes[0]?.mcp?.commandSummary).toBe("npx @modelcontextprotocol/server-filesystem D:\\Project");
      expect(JSON.stringify(snapshot.processes[0]?.mcp)).not.toContain("split-secret-value");
      expect(JSON.stringify(snapshot.processes[0]?.mcp)).not.toContain("inline-secret-value");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("does not match an MCP config entry from a generic command alone", async () => {
    const home = mkdtempSync(join(tmpdir(), "agentscope-mcp-generic-command-"));
    try {
      const configPath = join(home, ".codex", "config.toml");
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(
        configPath,
        [
          "[mcp_servers.filesystem]",
          'command = "node"',
          'args = ["D:\\\\tools\\\\filesystem-server.js"]',
          ""
        ].join("\n"),
        "utf8"
      );

      const snapshot = await buildSnapshot(home, {
        includeProcesses: true,
        processProvider: async () =>
          annotateProcessTree([
            {
              pid: 403,
              ppid: 100,
              processName: "node.exe",
              commandLine: String.raw`node C:\Users\AgentScopeUser\AppData\Roaming\npm\node_modules\@playwright\mcp\cli.js`,
              agent: "codex",
              evidence: []
            }
          ])
      });

      expect(snapshot.processes[0]?.displayTitle).toBe("MCP Tool / Playwright");
      expect(snapshot.processes[0]?.mcp?.serverName).toBeUndefined();
      expect(snapshot.processes[0]?.mcp?.configSource).toBe("process_only");
      expect(snapshot.processes[0]?.evidence.map((item) => item.source)).not.toContain("process.mcp.config");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("promotes Codex helpers to MCP tools when they match a configured server", async () => {
    const home = mkdtempSync(join(tmpdir(), "agentscope-mcp-config-promotion-"));
    try {
      const configPath = join(home, ".codex", "config.toml");
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(
        configPath,
        [
          "[mcp_servers.debugger-router]",
          'command = "node"',
          'args = ["D:\\\\Tool\\\\debugger\\\\router.mjs"]',
          "enabled = true",
          ""
        ].join("\n"),
        "utf8"
      );

      const snapshot = await buildSnapshot(home, {
        includeProcesses: true,
        processProvider: async () =>
          annotateProcessTree([
            {
              pid: 100,
              processName: "codex.exe",
              commandLine: "codex",
              agent: "codex",
              evidence: []
            },
            {
              pid: 404,
              ppid: 100,
              processName: "node.exe",
              commandLine: String.raw`node D:\Tool\debugger\router.mjs`,
              agent: "codex",
              evidence: []
            }
          ])
      });

      const process = snapshot.processes.find((entry) => entry.pid === 404);
      expect(process).toMatchObject({
        processRole: "codex_mcp_tool",
        displayTitle: "MCP Tool / Debugger Router",
        mcp: {
          serverName: "debugger-router",
          configSource: "user_config",
          configTable: "mcp_servers.debugger-router",
          confidence: "heuristic"
        }
      });
      expect(process?.evidence.map((item) => item.source)).toContain("process.role.mcp.config");
      expect(process?.evidence.map((item) => item.source)).toContain("process.mcp.config");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("promotes Codex-launched MCP wrappers when the configured package token matches", async () => {
    const home = mkdtempSync(join(tmpdir(), "agentscope-mcp-wrapper-promotion-"));
    try {
      const configPath = join(home, ".codex", "config.toml");
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(
        configPath,
        [
          "[mcp_servers.filesystem]",
          'command = "npx"',
          'args = ["-y", "@modelcontextprotocol/server-filesystem", "D:\\\\Project"]',
          ""
        ].join("\n"),
        "utf8"
      );

      const snapshot = await buildSnapshot(home, {
        includeProcesses: true,
        processProvider: async () =>
          annotateProcessTree([
            {
              pid: 100,
              processName: "codex.exe",
              commandLine: "codex",
              agent: "codex",
              evidence: []
            },
            {
              pid: 406,
              ppid: 100,
              processName: "cmd.exe",
              commandLine: String.raw`C:\Windows\System32\cmd.exe /d /s /c npx -y @modelcontextprotocol/server-filesystem D:\Project`,
              agent: "unknown",
              evidence: []
            }
          ])
      });

      const process = snapshot.processes.find((entry) => entry.pid === 406);
      expect(process).toMatchObject({
        processRole: "codex_mcp_tool",
        displayTitle: "MCP Tool / Filesystem",
        mcp: {
          serverName: "filesystem",
          configSource: "user_config",
          configTable: "mcp_servers.filesystem",
          confidence: "heuristic"
        }
      });
      expect(process?.evidence.map((item) => item.source)).toContain("process.role.mcp.config");
      expect(process?.evidence.map((item) => item.source)).toContain("process.mcp.config");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("does not promote standalone helpers from MCP config without Codex tree evidence", async () => {
    const home = mkdtempSync(join(tmpdir(), "agentscope-mcp-config-no-tree-"));
    try {
      const configPath = join(home, ".codex", "config.toml");
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(
        configPath,
        [
          "[mcp_servers.debugger-router]",
          'command = "node"',
          'args = ["D:\\\\Tool\\\\debugger\\\\router.mjs"]',
          ""
        ].join("\n"),
        "utf8"
      );

      const snapshot = await buildSnapshot(home, {
        includeProcesses: true,
        processProvider: async () =>
          annotateProcessTree([
            {
              pid: 405,
              ppid: 999,
              processName: "node.exe",
              commandLine: String.raw`node D:\Tool\debugger\router.mjs`,
              agent: "unknown",
              evidence: []
            }
          ])
      });

      expect(snapshot.processes[0]?.processRole).toBe("unknown");
      expect(snapshot.processes[0]?.mcp).toBeUndefined();
      expect(snapshot.processes[0]?.evidence.map((item) => item.source)).not.toContain("process.role.mcp.config");
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
    session.cwd = String.raw`D:\Workspace\AgentScopeFixture`;
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
    session.cwd = String.raw`D:\Workspace\AgentScopeFixture`;
    session.transcriptPath = String.raw`C:\Users\AgentScopeUser\.codex\sessions\2026\06\07\rollout-2026-06-07T04-20-00-t1.jsonl`;
    const process: AgentProcess = {
      pid: 10,
      ppid: 1,
      processName: "Codex.exe",
      commandLine: String.raw`codex --cwd D:\Workspace\AgentScopeFixture`,
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
    session.cwd = String.raw`D:\Workspace\AgentScopeFixture`;
    const process: AgentProcess = {
      pid: 10,
      ppid: 1,
      processName: "codex.exe",
      commandLine: String.raw`codex --cwd D:\Workspace\AgentScopeFixture`,
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
    session.cwd = String.raw`D:\Workspace\AgentScopeFixture`;
    const process: AgentProcess = {
      pid: 10,
      ppid: 1,
      processName: "codex.exe",
      commandLine: String.raw`codex --cwd D:\Workspace\AgentScopeFixture`,
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
    session.cwd = String.raw`C:\Users\AgentScopeUser`;
    session.startedAt = "2026-06-08T08:00:00.000Z";
    const process: AgentProcess = {
      pid: 40576,
      ppid: 29828,
      processName: "codex.exe",
      executablePath: String.raw`C:\Users\AgentScopeUser\AppData\Local\OpenAI\Codex\bin\codex.exe`,
      commandLine: String.raw`"C:\Users\AgentScopeUser\AppData\Local\OpenAI\Codex\bin\codex.exe" app-server --listen stdio://`,
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
    session.cwd = String.raw`D:\Workspace\AgentScopeFixture`;
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
        commandLine: String.raw`"C:\Program Files\nodejs\node.exe" "D:\tools\kernel.js" --session-id rt-123 --working-dir "D:\Workspace\AgentScopeFixture"`,
        agent: "codex",
        evidence: []
      }
    ]);
    const session = baseSession("codex-thread", "indexed");
    session.cwd = String.raw`D:\Workspace\AgentScopeFixture`;
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
    expect(process?.runtimeWorkingDir).toBe(String.raw`D:\Workspace\AgentScopeFixture`);
    expect(process?.evidence.map((item) => item.source)).toContain("process.runtime");
    expect(sessionCandidatesForProcess(snapshot, process!, 5)).toHaveLength(0);
  });

  it("treats Claude PID matches as exact API-style runtime mapping", () => {
    const session = baseSession("claude-session", "indexed");
    session.agent = "claude";
    session.pid = 9352;
    session.cwd = String.raw`D:\Workspace\AgentScopeFixture`;
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
    older.cwd = String.raw`D:\Workspace\AgentScopeFixture`;
    older.updatedAt = "2026-06-07T05:00:00.000Z";
    const newer = baseSession("newer-thread", "indexed");
    newer.title = "AgentScope process tracing UI";
    newer.cwd = String.raw`D:\Workspace\AgentScopeFixture`;
    newer.updatedAt = "2026-06-07T06:00:00.000Z";
    const process: AgentProcess = {
      pid: 33812,
      ppid: 23132,
      processName: "codex.exe",
      commandLine: String.raw`codex --cwd D:\Workspace\AgentScopeFixture`,
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
        commandLine: String.raw`"node" "C:\Users\AgentScopeUser\AppData\Roaming\npm\node_modules\@openai\codex\bin\codex.js"`,
        agent: "codex",
        evidence: []
      },
      {
        pid: 110,
        ppid: 100,
        processName: "codex.exe",
        executablePath: String.raw`C:\Users\AgentScopeUser\AppData\Local\OpenAI\Codex\bin\codex.exe`,
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

  it("retains Codex-launched IDA MCP and Python helper descendants with tree evidence", () => {
    const processes = annotateProcessTree([
      {
        pid: 100,
        ppid: 10,
        processName: "node.exe",
        commandLine: String.raw`"node" "C:\Users\AgentScopeUser\AppData\Roaming\npm\node_modules\@openai\codex\bin\codex.js"`,
        agent: "codex",
        evidence: []
      },
      {
        pid: 110,
        ppid: 100,
        processName: "codex.exe",
        executablePath: String.raw`C:\Users\AgentScopeUser\AppData\Roaming\npm\node_modules\@openai\codex\node_modules\@openai\codex-win32-x64\vendor\x86_64-pc-windows-msvc\bin\codex.exe`,
        commandLine: String.raw`C:\Users\AgentScopeUser\AppData\Roaming\npm\node_modules\@openai\codex\node_modules\@openai\codex-win32-x64\vendor\x86_64-pc-windows-msvc\bin\codex.exe`,
        agent: "codex",
        evidence: []
      },
      {
        pid: 120,
        ppid: 110,
        processName: "ida-pro-mcp.exe",
        executablePath: String.raw`C:\Users\AgentScopeUser\.local\bin\ida-pro-mcp.exe`,
        commandLine: String.raw`"C:\Users\AgentScopeUser\.local\bin\ida-pro-mcp.exe"`,
        agent: "unknown",
        evidence: []
      },
      {
        pid: 130,
        ppid: 120,
        processName: "python.exe",
        executablePath: String.raw`C:\Users\AgentScopeUser\AppData\Roaming\uv\tools\ida-pro-mcp\Scripts\python.exe`,
        commandLine: String.raw`"C:\Users\AgentScopeUser\AppData\Roaming\uv\tools\ida-pro-mcp\Scripts\python.exe" "C:\Users\AgentScopeUser\.local\bin\ida-pro-mcp.exe"`,
        agent: "unknown",
        evidence: []
      }
    ]);
    const selected = selectRelatedProcesses(processes);

    expect(selected.map((process) => process.pid)).toEqual([100, 110, 120, 130]);
    expect(processes[2]).toMatchObject({
      agent: "codex",
      processRole: "codex_mcp_tool",
      parentAgentPid: 110,
      rootPid: 100
    });
    expect(processes[3]).toMatchObject({
      agent: "codex",
      processRole: "codex_mcp_tool",
      parentAgentPid: 120,
      rootPid: 100
    });
    expect(processes[2]?.evidence.map((item) => item.source)).toContain("process.parent_tree");
  });

  it("retains Codex tool kernels from the parent tree without requiring Codex text in the command", () => {
    const processes = annotateProcessTree([
      {
        pid: 200,
        ppid: 10,
        processName: "codex.exe",
        executablePath: String.raw`C:\Users\AgentScopeUser\AppData\Roaming\npm\node_modules\@openai\codex\node_modules\@openai\codex-win32-x64\vendor\x86_64-pc-windows-msvc\bin\codex.exe`,
        commandLine: "codex.exe",
        agent: "codex",
        evidence: []
      },
      {
        pid: 210,
        ppid: 200,
        processName: "node.exe",
        executablePath: String.raw`C:\Program Files\nodejs\node.exe`,
        commandLine: String.raw`"C:\Program Files\nodejs\node.exe" "C:\Temp\kernel.js" --session-id rt-123 --working-dir "D:\Workspace\AgentScopeFixture"`,
        agent: "unknown",
        evidence: []
      }
    ]);

    expect(selectRelatedProcesses(processes).map((process) => process.pid)).toEqual([200, 210]);
    expect(processes[1]).toMatchObject({
      agent: "codex",
      processRole: "codex_tool_kernel",
      parentAgentPid: 200,
      rootPid: 200,
      runtimeSessionId: "rt-123",
      runtimeWorkingDir: String.raw`D:\Workspace\AgentScopeFixture`
    });
  });

  it("classifies known MCP server entrypoints but not arbitrary node processes", () => {
    const processes = annotateProcessTree([
      {
        pid: 300,
        ppid: 10,
        processName: "node.exe",
        commandLine: String.raw`node C:\Users\AgentScopeUser\AppData\Roaming\npm\node_modules\@playwright\mcp\cli.js`,
        agent: "codex",
        evidence: []
      },
      {
        pid: 310,
        ppid: 10,
        processName: "node.exe",
        commandLine: String.raw`node D:\Project\plain-script.js`,
        agent: "unknown",
        evidence: []
      }
    ]);

    expect(processes[0]?.processRole).toBe("codex_mcp_tool");
    expect(processes[1]?.processRole).toBe("unknown");
    expect(selectRelatedProcesses(processes).map((process) => process.pid)).toEqual([300]);
  });

  it("does not classify arbitrary commands containing app-server text as Codex app servers", () => {
    const [process] = annotateProcessTree([
      {
        pid: 300,
        ppid: 10,
        processName: "powershell.exe",
        commandLine: String.raw`powershell -Command "Write-Output 'codex.exe app-server --listen stdio://'"`,
        agent: classifyProcess(
          "powershell.exe",
          String.raw`powershell -Command "Write-Output 'codex.exe app-server --listen stdio://'"`,
          String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`
        ),
        evidence: []
      }
    ]);

    expect(process?.agent).toBe("unknown");
    expect(process?.processRole).toBe("unknown");
    expect(isRelatedProcess(process!)).toBe(false);
  });

  it("classifies Claude browser native hosts as helpers rather than CLI roots", () => {
    const [process] = annotateProcessTree([
      {
        pid: 400,
        ppid: 390,
        processName: "chrome-native-host.exe",
        executablePath: String.raw`C:\Users\AgentScopeUser\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\ChromeNativeHost\chrome-native-host.exe`,
        commandLine: String.raw`"C:\Users\AgentScopeUser\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\ChromeNativeHost\chrome-native-host.exe"`,
        agent: classifyProcess(
          "chrome-native-host.exe",
          String.raw`"C:\Users\AgentScopeUser\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\ChromeNativeHost\chrome-native-host.exe"`,
          String.raw`C:\Users\AgentScopeUser\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\ChromeNativeHost\chrome-native-host.exe`
        ),
        evidence: []
      }
    ]);

    expect(process?.agent).toBe("claude");
    expect(process?.processRole).toBe("agent_helper");
  });

  it("does not promote helper PID matches to exact session associations", () => {
    const [process] = annotateProcessTree([
      {
        pid: 500,
        ppid: 100,
        processName: "codex.exe",
        commandLine: String.raw`codex.exe app-server --listen stdio://`,
        agent: "codex",
        evidence: []
      }
    ]);
    const session = baseSession("helper-pid-thread", "indexed");
    session.pid = 500;
    session.cwd = String.raw`D:\Workspace\AgentScopeFixture`;
    const snapshot: ScopeSnapshot = {
      processes: [process!],
      sessions: [session],
      transcripts: [],
      indexRecords: [],
      relations: []
    };

    expect(process?.processRole).toBe("codex_app_server");
    expect(sessionsForPid(snapshot, 500).some((match) => match.candidate.confidence === "exact")).toBe(false);
    expect(sessionCandidatesForProcess(snapshot, process!, 5)).toHaveLength(0);
  });

  it("does not classify a Codex command prompt containing Claude text as Claude", () => {
    expect(
      classifyProcess(
        "codex.exe",
        "codex resume 019ea --note \"compare Claude behavior\"",
        String.raw`C:\Users\AgentScopeUser\AppData\Local\OpenAI\Codex\bin\codex.exe`
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
        commandLine: String.raw`node C:\Users\AgentScopeUser\.claude\daemon\worker.js`,
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
            cwd: String.raw`D:\Workspace\AgentScopeFixture`,
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

      expect(metadata.cwd).toBe(String.raw`D:\Workspace\AgentScopeFixture`);
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
