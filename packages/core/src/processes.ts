import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AgentKind, AgentProcess, AgentProcessRole } from "@agentscope/shared";
import { normalizeWindowsPath } from "./paths.js";

const execFileAsync = promisify(execFile);

const relatedNames = new Set(["codex.exe", "codex", "claude.exe", "claude", "node_repl.exe", "node_repl"]);
const codexPathMarkers = [
  "@openai\\codex",
  "@openai/codex",
  "\\openai\\codex\\",
  "/openai/codex/",
  "codex-win32",
  "node_repl",
  "\\.codex\\mcp",
  "/.codex/mcp"
];
const claudePathMarkers = [
  "@anthropic-ai\\claude-code",
  "@anthropic-ai/claude-code",
  "\\.claude\\",
  "/.claude/",
  "\\claude\\",
  "/claude/",
  "claude_"
];

interface Win32ProcessRow {
  ProcessId?: number;
  ParentProcessId?: number;
  Name?: string;
  ExecutablePath?: string | null;
  CommandLine?: string | null;
  CreationDate?: string | null;
  StartTime?: string | null;
  MainWindowTitle?: string | null;
  WorkingSet64?: number | null;
  PrivateMemorySize64?: number | null;
  CPU?: number | null;
}

export interface ListProcessOptions {
  timeoutMs?: number | undefined;
  throwOnTimeout?: boolean | undefined;
  throwOnFailure?: boolean | undefined;
}

export function isWindows(): boolean {
  return process.platform === "win32";
}

export async function listProcesses(includeAll = false, options: ListProcessOptions = {}): Promise<AgentProcess[]> {
  if (!isWindows()) return [];
  const script = `
$ErrorActionPreference = 'Stop'
try {
  $utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
  [Console]::OutputEncoding = $utf8NoBom
  $OutputEncoding = $utf8NoBom
} catch {}
function Clean-JsonString($value) {
  if ($null -eq $value) { return $null }
  $chars = ([string]$value).ToCharArray()
  for ($index = 0; $index -lt $chars.Length; $index++) {
    if ([int][char]$chars[$index] -lt 32) { $chars[$index] = [char]32 }
  }
  return -join $chars
}
$processMap = @{}
Get-Process | ForEach-Object {
  $startTime = $null
  try {
    if ($_.StartTime) { $startTime = $_.StartTime.ToString('o') }
  } catch {}
  $processMap[[int]$_.Id] = [pscustomobject]@{
    MainWindowTitle = Clean-JsonString ($_.MainWindowTitle)
    StartTime = Clean-JsonString ($startTime)
    WorkingSet64 = $_.WorkingSet64
    PrivateMemorySize64 = $_.PrivateMemorySize64
    CPU = $_.CPU
  }
}
Get-CimInstance Win32_Process | ForEach-Object {
  $runtime = $processMap[[int]$_.ProcessId]
  [pscustomobject]@{
    ProcessId = $_.ProcessId
    ParentProcessId = $_.ParentProcessId
    Name = Clean-JsonString ($_.Name)
    ExecutablePath = Clean-JsonString ($_.ExecutablePath)
    CommandLine = Clean-JsonString ($_.CommandLine)
    CreationDate = if ($_.CreationDate) { Clean-JsonString ($_.CreationDate.ToString('o')) } else { $null }
    StartTime = if ($runtime) { $runtime.StartTime } else { $null }
    MainWindowTitle = if ($runtime) { $runtime.MainWindowTitle } else { $null }
    WorkingSet64 = if ($runtime) { $runtime.WorkingSet64 } else { $null }
    PrivateMemorySize64 = if ($runtime) { $runtime.PrivateMemorySize64 } else { $null }
    CPU = if ($runtime) { $runtime.CPU } else { $null }
  } | ConvertTo-Json -Depth 3 -Compress
}
`;
  try {
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
      timeout: options.timeoutMs ?? 5000
    });
    const rows = parseProcessRows(stdout);
    const processes = annotateProcessTree(rows.map(processFromRow));
    return includeAll ? processes : selectRelatedProcesses(processes);
  } catch (error) {
    if (options.throwOnTimeout && isProcessScanTimeout(error)) {
      throw new Error(`win32.process.scan timed out after ${Math.round((options.timeoutMs ?? 5000) / 1000)}s`);
    }
    if (options.throwOnFailure) {
      throw new Error(`win32.process.scan failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    return [];
  }
}

function parseProcessRows(stdout: string): Win32ProcessRow[] {
  const rows: Win32ProcessRow[] = [];
  const failures: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as Win32ProcessRow;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) rows.push(parsed);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (!rows.length && stdout.trim()) {
    throw new Error(`PowerShell process JSON parse failed: ${failures[0] ?? "no process rows parsed"}`);
  }
  return rows;
}

function isProcessScanTimeout(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { killed?: boolean; signal?: string | null; code?: string | number | null; message?: string };
  return candidate.killed === true || candidate.signal === "SIGTERM" || candidate.code === "ETIMEDOUT" || /timed out/i.test(candidate.message ?? "");
}

export function classifyProcess(name = "", commandLine = "", executablePath = ""): AgentKind {
  const lowerName = name.toLowerCase();
  const lowerPath = executablePath.toLowerCase();
  const lowerCommand = commandLine.toLowerCase();
  const pathAndName = `${lowerName} ${lowerPath}`;
  if (pathAndName.includes("codex") || hasCodexPathMarker(lowerCommand) || lowerName.includes("node_repl")) {
    return "codex";
  }
  if (pathAndName.includes("claude") || hasClaudePathMarker(lowerCommand)) {
    return "claude";
  }
  const haystack = `${pathAndName} ${lowerCommand}`;
  if (haystack.includes("node_repl")) return "codex";
  return "unknown";
}

export function isRelatedProcess(process: AgentProcess): boolean {
  const name = process.processName.toLowerCase();
  if (process.agent !== "unknown") return true;
  if (isHelperProcessRole(process.processRole)) return true;
  if (relatedNames.has(name)) return true;
  const commandLine = (process.commandLine ?? "").toLowerCase();
  const executablePath = (process.executablePath ?? "").toLowerCase();
  const haystack = `${name} ${commandLine} ${executablePath}`;
  if (isCodexAppServer(name, commandLine, executablePath)) return true;
  if (isCodexMcpTool(name, haystack)) return true;
  if (isCodexToolKernel(name, commandLine)) return true;
  if (hasCodexPathMarker(haystack) || hasClaudePathMarker(haystack) || isCodexExtensionHost(name, haystack)) return true;
  return haystack.includes("daemon") && (hasCodexPathMarker(haystack) || hasClaudePathMarker(haystack));
}

export function selectRelatedProcesses(processes: AgentProcess[]): AgentProcess[] {
  const byPid = new Map(processes.map((process) => [process.pid, process]));
  const keep = new Set<number>();
  for (const process of processes) {
    if (isRelatedProcess(process)) keep.add(process.pid);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const process of processes) {
      if (keep.has(process.pid)) continue;
      const parent = process.ppid === undefined ? undefined : byPid.get(process.ppid);
      if (!parent || !keep.has(parent.pid)) continue;
      if (!shouldKeepRelatedChild(process, parent)) continue;
      keep.add(process.pid);
      changed = true;
    }
  }
  return processes.filter((process) => keep.has(process.pid));
}

function processFromRow(row: Win32ProcessRow): AgentProcess {
  const executablePath = normalizeWindowsPath(row.ExecutablePath);
  const commandLine = row.CommandLine ?? undefined;
  const runtimeArgs = parseRuntimeArgs(commandLine);
  const runtimeEvidence = runtimeArgs.sessionId || runtimeArgs.workingDir
    ? [
        {
          source: "process.runtime",
          detail: "Runtime helper arguments parsed from command line. This id identifies a Codex tool kernel, not a Codex thread/session id.",
          field: "--session-id,--working-dir"
        }
      ]
    : [];
  return {
    pid: Number(row.ProcessId ?? 0),
    ppid: row.ParentProcessId === undefined ? undefined : Number(row.ParentProcessId),
    processName: row.Name ?? "",
    executablePath,
    commandLine,
    creationDate: row.CreationDate ?? undefined,
    startTime: row.StartTime ?? row.CreationDate ?? undefined,
    windowTitle: row.MainWindowTitle?.trim() || undefined,
    workingSetBytes: numberValue(row.WorkingSet64),
    privateMemoryBytes: numberValue(row.PrivateMemorySize64),
    cpuSeconds: numberValue(row.CPU),
    agent: classifyProcess(row.Name, commandLine, executablePath),
    runtimeSessionId: runtimeArgs.sessionId,
    runtimeWorkingDir: runtimeArgs.workingDir,
    evidence: [
      {
        source: "Win32_Process",
        detail: "Process metadata from Get-CimInstance Win32_Process plus Get-Process runtime title/start time.",
        field: "ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine,CreationDate,StartTime,MainWindowTitle"
      },
      ...runtimeEvidence
    ]
  };
}

export function annotateProcessTree(processes: AgentProcess[]): AgentProcess[] {
  const byPid = new Map(processes.map((process) => [process.pid, process]));
  for (const process of processes) {
    const runtimeArgs = parseRuntimeArgs(process.commandLine);
    process.runtimeSessionId ??= runtimeArgs.sessionId;
    process.runtimeWorkingDir ??= runtimeArgs.workingDir;
    if ((process.runtimeSessionId || process.runtimeWorkingDir) && !process.evidence.some((item) => item.source === "process.runtime")) {
      process.evidence.push({
        source: "process.runtime",
        detail: "Runtime helper arguments parsed from command line. This id identifies a Codex tool kernel, not a Codex thread/session id.",
        field: "--session-id,--working-dir"
      });
    }
  }
  for (let pass = 0; pass < 3; pass += 1) {
    for (const process of processes) {
      const role = classifyProcessRole(process, byPid);
      process.processRole = role.role;
      process.processRoleDetail = role.detail;
    }
  }
  inferAgentKindsFromProcessTree(processes, byPid);
  for (const process of processes) {
    if (process.ppid !== undefined && byPid.has(process.ppid) && isRelatedProcess(byPid.get(process.ppid)!)) {
      process.parentAgentPid = process.ppid;
    }
    process.rootPid = processRootPid(process, byPid);
    process.evidence = [
      ...process.evidence,
      {
        source: "process.role",
        detail: process.processRoleDetail ?? "No specific agent process role identified.",
        field: "Name,ExecutablePath,CommandLine,ParentProcessId"
      }
    ];
  }
  return processes;
}

function classifyProcessRole(
  process: AgentProcess,
  byPid: Map<number, AgentProcess>
): { role: AgentProcessRole; detail: string } {
  const name = process.processName.toLowerCase();
  const commandLine = (process.commandLine ?? "").toLowerCase();
  const executablePath = (process.executablePath ?? "").toLowerCase();
  const haystack = `${name} ${commandLine} ${executablePath}`;
  const pathAndName = `${name} ${executablePath}`;
  const parent = process.ppid === undefined ? undefined : byPid.get(process.ppid);
  const parentRole = parent?.processRole;

  if (isClaudeCli(name, commandLine, executablePath)) {
    return { role: "claude_cli", detail: "Claude CLI process identified from name or Anthropic Claude Code entrypoint markers." };
  }

  if (process.agent === "claude" || (process.agent === "unknown" && pathAndName.includes("claude"))) {
    if (haystack.includes("daemon")) {
      return { role: "claude_daemon", detail: "Claude daemon or background helper identified from command line/path markers." };
    }
    return { role: "agent_helper", detail: "Claude-related helper process identified from command line/path markers; it is not treated as a Claude CLI root." };
  }

  if (name === "node_repl.exe" || name === "node_repl") {
    return { role: "codex_node_repl", detail: "Codex node_repl runtime helper; it belongs to a Codex process tree and is not a standalone session." };
  }

  if (isCodexAppServer(name, commandLine, executablePath)) {
    return { role: "codex_app_server", detail: "Codex app-server helper; it belongs to a Codex process tree and should not be treated as a root task." };
  }

  if (isCodexToolKernel(name, commandLine)) {
    return { role: "codex_tool_kernel", detail: "Codex runtime tool kernel identified by --session-id and --working-dir helper arguments; it is not a standalone Codex thread." };
  }

  if (isCodexMcpTool(name, haystack)) {
    return { role: "codex_mcp_tool", detail: "Codex-launched MCP/tool helper identified from command line markers." };
  }

  if (parentRole === "codex_mcp_tool" && isMcpToolChildProcess(name, haystack)) {
    return { role: "codex_mcp_tool", detail: "Child process of a Codex MCP/tool helper; kept as part of the tool process tree." };
  }

  if ((name === "node.exe" || name === "node") && haystack.includes("@openai\\codex") && haystack.includes("\\bin\\codex")) {
    return { role: "codex_cli", detail: "Codex CLI Node entrypoint identified from @openai/codex bin path." };
  }

  if (name === "codex.exe" || name === "codex") {
    if (parentRole === "codex_cli" || executablePath.includes("@openai\\codex-win32")) {
      return { role: "codex_engine", detail: "Codex native engine process under the CLI tree." };
    }
    return { role: "codex_engine", detail: "Codex native process identified by process name." };
  }

  if (hasCodexPathMarker(haystack) || hasClaudePathMarker(haystack) || isCodexExtensionHost(name, haystack)) {
    return { role: "agent_helper", detail: "Agent-related helper process identified by Codex/node_repl markers." };
  }

  return { role: "unknown", detail: "No specific agent process role identified." };
}

function isCodexMcpTool(name: string, haystack: string): boolean {
  if (name.includes("mcp") && (haystack.includes("ida-pro-mcp") || haystack.includes("\\.codex\\") || haystack.includes("/.codex/"))) return true;
  if ((name === "node.exe" || name === "node") && !isNodeMcpEntrypoint(haystack)) return false;
  if (name === "powershell.exe" || name === "powershell" || name === "cmd.exe" || name === "cmd") return false;
  return [
    "@playwright/mcp",
    "@playwright\\mcp",
    "chrome-devtools-mcp",
    "ida-pro-mcp",
    "\\.codex\\mcp",
    "/.codex/mcp",
    "mcp-server",
    "modelcontextprotocol"
  ].some((marker) => haystack.includes(marker));
}

function isNodeMcpEntrypoint(haystack: string): boolean {
  return (
    haystack.includes("\\.codex\\mcp-node\\") ||
    haystack.includes("/.codex/mcp-node/") ||
    haystack.includes("@playwright\\mcp\\cli") ||
    haystack.includes("@playwright/mcp/cli") ||
    haystack.includes("chrome-devtools-mcp") ||
    haystack.includes("mcp-server") ||
    haystack.includes("modelcontextprotocol")
  );
}

function isCodexExtensionHost(name: string, haystack: string): boolean {
  return name === "extension-host.exe" && (haystack.includes("\\.codex\\plugins\\") || haystack.includes("/.codex/plugins/"));
}

function isCodexToolKernel(name: string, commandLine: string): boolean {
  if (name !== "node.exe" && name !== "node") return false;
  return commandLine.includes("--session-id") && commandLine.includes("--working-dir");
}

function isCodexAppServer(name: string, commandLine: string, executablePath: string): boolean {
  if (name !== "codex.exe" && name !== "codex") return false;
  if (!commandLine.includes("app-server")) return false;
  return commandLine.includes("app-server") || executablePath.includes("\\openai\\codex\\") || executablePath.includes("/openai/codex/");
}

function isClaudeCli(name: string, commandLine: string, executablePath: string): boolean {
  if (name === "claude.exe" || name === "claude") return true;
  const haystack = `${name} ${commandLine} ${executablePath}`;
  if (name !== "node.exe" && name !== "node") return false;
  return haystack.includes("@anthropic-ai\\claude-code") || haystack.includes("@anthropic-ai/claude-code");
}

function hasCodexPathMarker(haystack: string): boolean {
  return codexPathMarkers.some((marker) => haystack.includes(marker));
}

function hasClaudePathMarker(haystack: string): boolean {
  return claudePathMarkers.some((marker) => haystack.includes(marker));
}

function isMcpToolChildProcess(name: string, haystack: string): boolean {
  if (name === "python.exe" || name === "python" || name.endsWith("python.exe")) return true;
  return haystack.includes("ida-pro-mcp") || haystack.includes("modelcontextprotocol") || haystack.includes("mcp");
}

function isHelperProcessRole(role?: AgentProcessRole): boolean {
  return role === "codex_node_repl" || role === "codex_app_server" || role === "codex_mcp_tool" || role === "codex_tool_kernel" || role === "agent_helper";
}

function shouldKeepRelatedChild(process: AgentProcess, parent: AgentProcess): boolean {
  if (isRelatedProcess(process)) return true;
  if (isHelperProcessRole(process.processRole)) return true;
  if (parent.processRole === "codex_mcp_tool" && process.processRole === "codex_mcp_tool") return true;
  if (parent.agent !== "unknown" && process.agent === parent.agent && isHelperProcessRole(parent.processRole)) return true;
  return false;
}

function inferAgentKindsFromProcessTree(processes: AgentProcess[], byPid: Map<number, AgentProcess>): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const process of processes) {
      if (process.agent !== "unknown" || !isHelperProcessRole(process.processRole)) continue;
      const parent = process.ppid === undefined ? undefined : byPid.get(process.ppid);
      if (!parent || parent.agent === "unknown") continue;
      process.agent = parent.agent;
      process.evidence.push({
        source: "process.parent_tree",
        detail: "Agent kind inferred from a Win32 parent process and helper role. This is process-tree evidence only, not an exact session association.",
        field: "ParentProcessId,processRole,agent"
      });
      changed = true;
    }
  }
}

function parseRuntimeArgs(commandLine?: string): { sessionId?: string; workingDir?: string } {
  const args = tokenizeCommandLine(commandLine);
  const sessionId = commandArgValue(args, "--session-id");
  const workingDir = normalizeWindowsPath(commandArgValue(args, "--working-dir"));
  return compactRuntimeArgs({ sessionId, workingDir });
}

function compactRuntimeArgs(values: { sessionId?: string | undefined; workingDir?: string | undefined }): { sessionId?: string; workingDir?: string } {
  const out: { sessionId?: string; workingDir?: string } = {};
  if (values.sessionId) out.sessionId = values.sessionId;
  if (values.workingDir) out.workingDir = values.workingDir;
  return out;
}

function commandArgValue(args: string[], name: string): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === name) return args[index + 1] || undefined;
    if (arg?.startsWith(`${name}=`)) return arg.slice(name.length + 1) || undefined;
  }
  return undefined;
}

function tokenizeCommandLine(commandLine?: string): string[] {
  if (!commandLine) return [];
  const args: string[] = [];
  let current = "";
  let quote: string | undefined;
  for (let index = 0; index < commandLine.length; index += 1) {
    const char = commandLine[index]!;
    if ((char === `"` || char === "'") && (!quote || quote === char)) {
      quote = quote ? undefined : char;
      continue;
    }
    if (!quote && /\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) args.push(current);
  return args;
}

function processRootPid(process: AgentProcess, byPid: Map<number, AgentProcess>): number | undefined {
  let current: AgentProcess | undefined = process;
  const seen = new Set<number>();
  while (current && !seen.has(current.pid)) {
    seen.add(current.pid);
    const parent: AgentProcess | undefined = current.ppid === undefined ? undefined : byPid.get(current.ppid);
    if (!parent || !isRelatedProcess(parent)) return current.pid;
    if (parent.agent !== process.agent && process.agent !== "unknown" && parent.agent !== "unknown") return current.pid;
    current = parent;
  }
  return process.pid;
}

function numberValue(value: unknown): number | undefined {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numeric) ? numeric : undefined;
}
