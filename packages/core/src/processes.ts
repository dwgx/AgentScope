import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AgentKind, AgentProcess } from "@agentscope/shared";
import { normalizeWindowsPath } from "./paths.js";

const execFileAsync = promisify(execFile);

const relatedNames = new Set(["codex.exe", "codex", "claude.exe", "claude", "node.exe", "node", "node_repl.exe", "node_repl"]);
const relatedMarkers = ["codex", "claude", "node_repl", "app-server", "daemon"];

interface Win32ProcessRow {
  ProcessId?: number;
  ParentProcessId?: number;
  Name?: string;
  ExecutablePath?: string | null;
  CommandLine?: string | null;
  CreationDate?: string | null;
}

export function isWindows(): boolean {
  return process.platform === "win32";
}

export async function listProcesses(includeAll = false): Promise<AgentProcess[]> {
  if (!isWindows()) return [];
  const script = `
$ErrorActionPreference = 'Stop'
Get-CimInstance Win32_Process |
  Select-Object `
    + "`" + `
    @{Name='ProcessId';Expression={$_.ProcessId}},
    @{Name='ParentProcessId';Expression={$_.ParentProcessId}},
    @{Name='Name';Expression={$_.Name}},
    @{Name='ExecutablePath';Expression={$_.ExecutablePath}},
    @{Name='CommandLine';Expression={$_.CommandLine}},
    @{Name='CreationDate';Expression={ if ($_.CreationDate) { $_.CreationDate.ToString('o') } else { $null } }} |
  ConvertTo-Json -Depth 3
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
    agent: classifyProcess(row.Name, commandLine, executablePath),
    evidence: [
      {
        source: "Win32_Process",
        detail: "Process metadata from Get-CimInstance Win32_Process.",
        field: "ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine,CreationDate"
      }
    ]
  };
}
