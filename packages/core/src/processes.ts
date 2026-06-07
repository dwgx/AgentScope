import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AgentKind, AgentProcess } from "@agentscope/shared";
import { normalizeWindowsPath } from "./paths.js";

const execFileAsync = promisify(execFile);

const relatedNames = new Set(["codex.exe", "codex", "claude.exe", "claude", "node_repl.exe", "node_repl"]);
const relatedMarkers = ["codex", "claude", "node_repl", "app-server", "daemon"];

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

export function isWindows(): boolean {
  return process.platform === "win32";
}

export async function listProcesses(includeAll = false): Promise<AgentProcess[]> {
  if (!isWindows()) return [];
  const script = `
$ErrorActionPreference = 'Stop'
$processMap = @{}
Get-Process | ForEach-Object {
  $startTime = $null
  try {
    if ($_.StartTime) { $startTime = $_.StartTime.ToString('o') }
  } catch {}
  $processMap[[int]$_.Id] = [pscustomobject]@{
    MainWindowTitle = $_.MainWindowTitle
    StartTime = $startTime
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
    Name = $_.Name
    ExecutablePath = $_.ExecutablePath
    CommandLine = $_.CommandLine
    CreationDate = if ($_.CreationDate) { $_.CreationDate.ToString('o') } else { $null }
    StartTime = if ($runtime) { $runtime.StartTime } else { $null }
    MainWindowTitle = if ($runtime) { $runtime.MainWindowTitle } else { $null }
    WorkingSet64 = if ($runtime) { $runtime.WorkingSet64 } else { $null }
    PrivateMemorySize64 = if ($runtime) { $runtime.PrivateMemorySize64 } else { $null }
    CPU = if ($runtime) { $runtime.CPU } else { $null }
  }
} | ConvertTo-Json -Depth 3
`;
  try {
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true
    });
    const parsed = JSON.parse(stdout.trim()) as Win32ProcessRow[] | Win32ProcessRow;
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    const processes = rows.map(processFromRow);
    return includeAll ? processes : processes.filter(isRelatedProcess);
  } catch {
    return [];
  }
}

export function classifyProcess(name = "", commandLine = "", executablePath = ""): AgentKind {
  const haystack = `${name} ${commandLine} ${executablePath}`.toLowerCase();
  if (haystack.includes("claude")) return "claude";
  if (haystack.includes("codex") || haystack.includes("node_repl")) return "codex";
  return "unknown";
}

export function isRelatedProcess(process: AgentProcess): boolean {
  const name = process.processName.toLowerCase();
  if (relatedNames.has(name)) return true;
  const haystack = `${process.commandLine ?? ""} ${process.executablePath ?? ""}`.toLowerCase();
  if (name === "node.exe" || name === "node") return relatedMarkers.some((marker) => haystack.includes(marker));
  return relatedMarkers.some((marker) => haystack.includes(marker));
}

function processFromRow(row: Win32ProcessRow): AgentProcess {
  const executablePath = normalizeWindowsPath(row.ExecutablePath);
  const commandLine = row.CommandLine ?? undefined;
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
    evidence: [
      {
        source: "Win32_Process",
        detail: "Process metadata from Get-CimInstance Win32_Process plus Get-Process runtime title/start time.",
        field: "ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine,CreationDate,StartTime,MainWindowTitle"
      }
    ]
  };
}

function numberValue(value: unknown): number | undefined {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numeric) ? numeric : undefined;
}
