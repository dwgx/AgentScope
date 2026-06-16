import fs from "node:fs";
import path from "node:path";
import type { AgentProcess, AgentProcessMcpIdentity, AgentProcessMcpServerKind, CodexMcpServerSummary, Confidence, Evidence } from "@agentscope/shared";
import { codexHome } from "./paths.js";

export interface ConfigInventory {
  exists: boolean;
  mcpServers: CodexMcpServerSummary[];
  pluginTables: string[];
  projectTables: string[];
  sensitiveLines: number[];
}

interface TomlTable {
  name: string;
  keys: Map<string, string>;
}

interface ProcessMcpMarker {
  displayName: string;
  serverKind: AgentProcessMcpServerKind;
  token: string;
  confidence: Confidence;
}

export function emptyConfigInventory(): ConfigInventory {
  return { exists: false, mcpServers: [], pluginTables: [], projectTables: [], sensitiveLines: [] };
}

export function loadCodexConfigInventory(home?: string): ConfigInventory {
  const root = codexHome(home);
  const configPath = path.join(root, "config.toml");
  let content: string;
  try {
    const stat = fs.statSync(configPath);
    if (!stat.isFile() || stat.size > 512 * 1024) return emptyConfigInventory();
    content = fs.readFileSync(configPath, "utf8");
  } catch {
    return emptyConfigInventory();
  }
  return inspectToml(content, configPath);
}

export function inspectToml(content: string, filePath: string): ConfigInventory {
  const tables = parseTomlTables(content);
  const mcpServers = new Map<string, CodexMcpServerSummary>();
  for (const table of tables) {
    const direct = /^mcp_servers\.([^.]+)$/.exec(table.name);
    if (direct) {
      const name = unquoteTomlKey(direct[1]!);
      mcpServers.set(name, mcpServerSummary(name, "user_config", table, filePath));
    }
    const plugin = /^plugins\.(.+)\.mcp_servers\.([^.]+)$/.exec(table.name);
    if (plugin) {
      const name = `${unquoteTomlKey(plugin[1]!)}:${unquoteTomlKey(plugin[2]!)}`;
      mcpServers.set(name, mcpServerSummary(name, "plugin_config", table, filePath));
    }
  }
  return {
    exists: true,
    mcpServers: [...mcpServers.values()].sort((left, right) => left.name.localeCompare(right.name)),
    pluginTables: tables.filter((table) => /^plugins\./.test(table.name)).map((table) => table.name),
    projectTables: tables.filter((table) => /^projects\./.test(table.name)).map((table) => table.name),
    sensitiveLines: sensitiveLineNumbers(content)
  };
}

export function decorateMcpProcessIdentity(processes: AgentProcess[], servers: CodexMcpServerSummary[]): void {
  const byPid = new Map(processes.map((process) => [process.pid, process]));
  promoteConfigBackedMcpProcesses(processes, servers);
  for (const process of processes) {
    if (process.processRole !== "codex_mcp_tool") continue;
    const parent = process.ppid === undefined ? undefined : byPid.get(process.ppid);
    if (parent?.processRole === "codex_mcp_tool") continue;
    const direct = identifyMcpProcess(process, servers);
    if (direct) {
      process.mcp = direct;
      process.evidence = appendEvidence(process.evidence, direct.evidence);
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const process of processes) {
      if (process.processRole !== "codex_mcp_tool" || process.mcp) continue;
      const parent = process.ppid === undefined ? undefined : byPid.get(process.ppid);
      if (parent?.mcp) {
        process.mcp = inheritedMcpIdentity(parent.mcp);
        process.evidence = appendEvidence(process.evidence, process.mcp.evidence);
        changed = true;
      }
    }
  }
}

function promoteConfigBackedMcpProcesses(processes: AgentProcess[], servers: CodexMcpServerSummary[]): void {
  if (!servers.length) return;
  const byPid = new Map(processes.map((process) => [process.pid, process]));
  for (const process of processes) {
    if (process.processRole === "codex_mcp_tool") continue;
    if (!hasCodexTreeEvidence(process, byPid)) continue;
    if (!isMcpConfigEligibleProcess(process)) continue;
    const matched = bestServerMatch(process, undefined, servers);
    if (!matched || mcpServerMatchScore(matched, processHaystack(process), undefined) < 70) continue;
    process.processRole = "codex_mcp_tool";
    process.processRoleDetail = `Codex-launched helper matched MCP config server ${matched.name}.`;
    process.evidence = appendEvidence(process.evidence, [
      {
        source: "process.role.mcp.config",
        detail: `Codex helper promoted to MCP tool because its command matched MCP config server ${matched.name}.`,
        field: matched.table
      }
    ]);
  }
}

function hasCodexTreeEvidence(process: AgentProcess, byPid: Map<number, AgentProcess>): boolean {
  if (process.agent === "codex") return true;
  let parent = process.ppid === undefined ? undefined : byPid.get(process.ppid);
  for (let depth = 0; parent && depth < 6; depth += 1) {
    if (parent.agent === "codex") return true;
    if (parent.processRole === "codex_cli" || parent.processRole === "codex_engine" || parent.processRole === "codex_app_server") return true;
    parent = parent.ppid === undefined ? undefined : byPid.get(parent.ppid);
  }
  return false;
}

function isMcpConfigEligibleProcess(process: AgentProcess): boolean {
  const name = process.processName.toLowerCase();
  if (!mcpConfigEligibleProcessNames.has(name)) return false;
  const haystack = processHaystack(process);
  return !haystack.includes("@openai\\codex") && !haystack.includes("@openai/codex") && !haystack.includes("@anthropic-ai");
}

const mcpConfigEligibleProcessNames = new Set([
  "node.exe",
  "node",
  "python.exe",
  "python",
  "python3.exe",
  "python3",
  "py.exe",
  "py",
  "uv.exe",
  "uv",
  "uvx.exe",
  "uvx",
  "npx.cmd",
  "npx.exe",
  "npx",
  "pnpm.cmd",
  "pnpm.exe",
  "pnpm",
  "yarn.cmd",
  "yarn.exe",
  "yarn",
  "bun.exe",
  "bun",
  "deno.exe",
  "deno",
  "cmd.exe",
  "cmd",
  "powershell.exe",
  "powershell",
  "pwsh.exe",
  "pwsh"
]);

function mcpServerSummary(
  name: string,
  source: "user_config" | "plugin_config",
  table: TomlTable,
  filePath: string
): CodexMcpServerSummary {
  const command = tomlScalar(table.keys.get("command"));
  const args = tomlStringArray(table.keys.get("args"));
  const knownKeys = new Set([
    "command",
    "args",
    "env",
    "env_vars",
    "cwd",
    "experimental_environment",
    "url",
    "bearer_token_env_var",
    "http_headers",
    "env_http_headers",
    "startup_timeout_sec",
    "tool_timeout_sec",
    "enabled",
    "required",
    "enabled_tools",
    "disabled_tools",
    "default_tools_approval_mode"
  ]);
  const transport =
    source === "plugin_config" ? "plugin" : table.keys.has("url") ? "http" : table.keys.has("command") ? "stdio" : "unknown";
  return {
    name,
    source,
    enabled: booleanValue(table.keys.get("enabled")),
    transport,
    table: table.name,
    command,
    args,
    cwd: tomlScalar(table.keys.get("cwd")),
    url: tomlScalar(table.keys.get("url")),
    startupTimeoutSec: numberValue(table.keys.get("startup_timeout_sec")),
    toolTimeoutSec: numberValue(table.keys.get("tool_timeout_sec")),
    required: booleanValue(table.keys.get("required")),
    defaultToolsApprovalMode: approvalModeValue(table.keys.get("default_tools_approval_mode")),
    enabledTools: tomlStringArray(table.keys.get("enabled_tools")),
    disabledTools: tomlStringArray(table.keys.get("disabled_tools")),
    unknownKeys: [...table.keys.keys()].filter((key) => !knownKeys.has(key) && !key.startsWith("tools.")).sort(),
    commandSummary: commandSummary(command, args),
    evidence: [
      {
        source: "codex.control.config.toml",
        detail: source === "plugin_config" ? "Plugin MCP server policy table found in user config." : "MCP server table found in user config.",
        path: filePath,
        field: table.name
      }
    ]
  };
}

function numberValue(value?: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function approvalModeValue(value?: string): "auto" | "prompt" | "approve" | undefined {
  const parsed = tomlScalar(value);
  return parsed === "auto" || parsed === "prompt" || parsed === "approve" ? parsed : undefined;
}

function identifyMcpProcess(process: AgentProcess, servers: CodexMcpServerSummary[]): AgentProcessMcpIdentity | undefined {
  const marker = markerFromProcess(process);
  const matched = bestServerMatch(process, marker, servers);
  if (!marker && !matched) return undefined;
  const evidence: Evidence[] = [];
  if (marker) {
    evidence.push({
      source: "process.mcp.marker",
      detail: `MCP server identity inferred from process command/path marker: ${marker.token}.`,
      field: "Name,ExecutablePath,CommandLine"
    });
  }
  if (matched) {
    evidence.push({
      source: "process.mcp.config",
      detail: `Live MCP process matched Codex config server ${matched.name}.`,
      field: matched.table
    });
  }
  const displayName = matched ? displayNameFromServer(matched, marker) : marker?.displayName ?? "Unknown";
  return {
    displayName,
    serverName: matched?.name,
    serverKind: marker?.serverKind ?? serverKindFromServer(matched) ?? "custom",
    transport: matched?.transport ?? "unknown",
    configSource: matched?.source ?? "process_only",
    configTable: matched?.table,
    commandSummary: matched?.commandSummary ?? commandSummaryFromProcess(process.commandLine),
    confidence: matched ? "heuristic" : marker?.confidence ?? "unknown",
    evidence
  };
}

function markerFromProcess(process: AgentProcess): ProcessMcpMarker | undefined {
  const haystack = `${process.processName} ${process.executablePath ?? ""} ${process.commandLine ?? ""}`.toLowerCase();
  if (haystack.includes("@playwright\\mcp") || haystack.includes("@playwright/mcp")) {
    return { displayName: "Playwright", serverKind: "playwright", token: "@playwright/mcp", confidence: "heuristic" };
  }
  if (haystack.includes("chrome-devtools-mcp")) {
    return { displayName: "Chrome DevTools", serverKind: "chrome_devtools", token: "chrome-devtools-mcp", confidence: "heuristic" };
  }
  if (haystack.includes("ida-pro-mcp")) {
    return { displayName: "IDA Pro", serverKind: "ida_pro", token: "ida-pro-mcp", confidence: "heuristic" };
  }
  const modelContextPackage = packageNameAfterMarker(haystack, "modelcontextprotocol/");
  if (modelContextPackage) {
    return {
      displayName: readableMcpPackageName(modelContextPackage),
      serverKind: "modelcontextprotocol",
      token: modelContextPackage,
      confidence: "heuristic"
    };
  }
  const mcpServerPackage = packageNameAfterMarker(haystack, "mcp-server");
  if (mcpServerPackage) {
    return {
      displayName: readableMcpPackageName(mcpServerPackage),
      serverKind: "custom",
      token: mcpServerPackage,
      confidence: "heuristic"
    };
  }
  if (haystack.includes("\\.codex\\mcp-node\\") || haystack.includes("/.codex/mcp-node/")) {
    return { displayName: "Codex MCP Node", serverKind: "codex_mcp_node", token: ".codex/mcp-node", confidence: "heuristic" };
  }
  if (haystack.includes("\\.codex\\mcp\\") || haystack.includes("/.codex/mcp/")) {
    return { displayName: "Codex MCP", serverKind: "custom", token: ".codex/mcp", confidence: "heuristic" };
  }
  return undefined;
}

function bestServerMatch(
  process: AgentProcess,
  marker: ProcessMcpMarker | undefined,
  servers: CodexMcpServerSummary[]
): CodexMcpServerSummary | undefined {
  const haystack = processHaystack(process);
  const scored = servers
    .map((server) => ({ server, score: mcpServerMatchScore(server, haystack, marker) }))
    .filter((entry) => entry.score >= 30)
    .sort((left, right) => right.score - left.score || left.server.name.localeCompare(right.server.name));
  return scored[0]?.server;
}

function mcpServerMatchScore(server: CodexMcpServerSummary, haystack: string, marker: ProcessMcpMarker | undefined): number {
  let score = 0;
  const command = server.command?.toLowerCase();
  if (command && haystack.includes(command)) {
    const commandBase = path.basename(command).toLowerCase();
    const commandPathLike = /[\\/]/.test(command) || /\.(?:mjs|cjs|js|py|cmd|ps1|exe)$/i.test(command);
    const genericRunner = isGenericMcpRunner(commandBase);
    score += isStrongMcpToken(command) ? 70 : commandPathLike ? 60 : genericRunner ? 5 : 60;
    if (commandPathLike && commandBase.length >= 5 && haystack.includes(commandBase)) score += isStrongMcpToken(commandBase) ? 45 : 18;
  }
  for (const arg of server.args ?? []) {
    const normalized = arg.toLowerCase();
    const pathLike = /[\\/]/.test(normalized) || /\.(?:mjs|cjs|js|py|cmd|ps1|exe)$/i.test(normalized);
    if (normalized.length >= 3 && haystack.includes(normalized)) score += isStrongMcpToken(normalized) ? 70 : pathLike ? 55 : 35;
    const basename = path.basename(normalized).toLowerCase();
    if (pathLike && basename.length >= 5 && haystack.includes(basename)) score += isStrongMcpToken(basename) ? 45 : 18;
  }
  const serverNameTokens = server.name.toLowerCase().split(/[:/\\._-]+/).filter((value) => value.length >= 3);
  const serverTokenScore = serverNameTokens.filter((token) => haystack.includes(token)).slice(0, 2).length * 15;
  score += serverTokenScore;
  if (marker && serverNameTokens.some((token) => marker.displayName.toLowerCase().includes(token) || marker.token.includes(token))) score += 30;
  if (marker && server.commandSummary?.toLowerCase().includes(marker.token)) score += 50;
  return score;
}

function isStrongMcpToken(value: string): boolean {
  return /mcp|modelcontextprotocol|playwright|chrome-devtools|ida-pro/i.test(value);
}

function isGenericMcpRunner(commandBase: string): boolean {
  const normalized = commandBase.replace(/\.(?:cmd|exe|ps1)$/i, "");
  return new Set(["node", "nodejs", "python", "python3", "py", "uv", "uvx", "npx", "pnpm", "yarn", "bun", "deno", "cmd", "powershell", "pwsh"]).has(normalized);
}

function processHaystack(process: AgentProcess): string {
  return `${process.processName} ${process.executablePath ?? ""} ${process.commandLine ?? ""}`.toLowerCase();
}

function inheritedMcpIdentity(parent: AgentProcessMcpIdentity): AgentProcessMcpIdentity {
  return {
    ...parent,
    confidence: parent.confidence === "exact" ? "heuristic" : parent.confidence,
    evidence: [
      {
        source: "process.mcp.parent_tree",
        detail: "MCP identity inherited from the parent MCP helper process.",
        field: "ParentProcessId,processRole,mcp"
      }
    ]
  };
}

function displayNameFromServer(server: CodexMcpServerSummary, marker: ProcessMcpMarker | undefined): string {
  return marker?.displayName ?? readableMcpPackageName(server.name.split(":").at(-1) ?? server.name);
}

function serverKindFromServer(server?: CodexMcpServerSummary): AgentProcessMcpServerKind | undefined {
  const text = `${server?.name ?? ""} ${server?.commandSummary ?? ""}`.toLowerCase();
  if (text.includes("playwright")) return "playwright";
  if (text.includes("chrome-devtools")) return "chrome_devtools";
  if (text.includes("ida-pro")) return "ida_pro";
  if (text.includes("modelcontextprotocol")) return "modelcontextprotocol";
  if (text.includes("mcp-node")) return "codex_mcp_node";
  return server ? "custom" : undefined;
}

function commandSummary(command: string | undefined, args: string[] | undefined): string | undefined {
  const parts = [command && !isSensitiveValue(command) ? command : undefined, ...sanitizeArguments(args ?? [])].filter(
    (value): value is string => !!value
  );
  if (!parts.length) return undefined;
  return truncate(parts.join(" "), 180);
}

function commandSummaryFromProcess(commandLine?: string): string | undefined {
  if (!commandLine) return undefined;
  const args = sanitizeArguments(tokenizeCommandLine(commandLine));
  return args.length ? truncate(args.join(" "), 180) : undefined;
}

function tomlScalar(value?: string): string | undefined {
  if (!value) return undefined;
  const quoted = /^"((?:\\"|[^"])*)"|'([^']*)'/.exec(value);
  const raw = quoted ? (quoted[1] ?? quoted[2] ?? "") : /^[^\s#,\]]+/.exec(value)?.[0] ?? "";
  const cleaned = decodeTomlString(raw, quoted?.[1] !== undefined).trim();
  return cleaned && !isSensitiveValue(cleaned) ? cleaned : undefined;
}

function tomlStringArray(value?: string): string[] | undefined {
  if (!value?.trim().startsWith("[")) return undefined;
  const out: string[] = [];
  for (const match of value.matchAll(/"((?:\\"|[^"])*)"|'([^']*)'/g)) {
    const item = decodeTomlString(match[1] ?? match[2] ?? "", match[1] !== undefined).trim();
    if (item) out.push(item);
  }
  const safe = sanitizeArguments(out);
  return safe.length ? safe : undefined;
}

function decodeTomlString(value: string, basicString: boolean): string {
  if (!basicString) return value;
  return value.replace(/\\\\/g, "\\").replace(/\\"/g, '"');
}

function parseTomlTables(content: string): TomlTable[] {
  const tables: TomlTable[] = [];
  let current: TomlTable | undefined;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;
    const tableMatch = /^\[+\s*([^\]]+?)\s*\]+$/.exec(line);
    if (tableMatch) {
      current = { name: tableMatch[1]!, keys: new Map() };
      tables.push(current);
      continue;
    }
    const keyMatch = /^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/.exec(line);
    if (keyMatch && current) current.keys.set(keyMatch[1]!, keyMatch[2]!.trim());
  }
  return tables;
}

function stripTomlComment(line: string): string {
  let quoted = false;
  let quote = "";
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if ((char === "'" || char === '"') && line[index - 1] !== "\\") {
      if (!quoted) {
        quoted = true;
        quote = char;
      } else if (quote === char) {
        quoted = false;
        quote = "";
      }
    }
    if (char === "#" && !quoted) return line.slice(0, index);
  }
  return line;
}

function unquoteTomlKey(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}

function booleanValue(value?: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (/^true\b/i.test(value)) return true;
  if (/^false\b/i.test(value)) return false;
  return undefined;
}

function sensitiveLineNumbers(content: string): number[] {
  const lines: number[] = [];
  content.split(/\r?\n/).forEach((rawLine, index) => {
    if (isSensitiveTomlLine(rawLine)) lines.push(index + 1);
  });
  return lines;
}

function isSensitiveTomlLine(rawLine: string): boolean {
  const line = stripTomlComment(rawLine).trim();
  if (!line) return false;
  const key = /(^|[\s{,])([A-Za-z0-9_.-]*(?:api[_-]?key|token|secret|password|credential|auth|bearer|cookie|session)[A-Za-z0-9_.-]*)\s*=/i.exec(line)?.[2];
  if (!key) return false;
  const [, value = ""] = line.split(/=(.*)/s);
  if (isSafeSensitiveReferenceTomlKey(key, value)) return false;
  return true;
}

function isSafeSensitiveReferenceTomlKey(key: string, rawValue: string): boolean {
  const tail = key.split(".").at(-1) ?? key;
  const trimmed = rawValue.trim();
  if (tail === "bearer_token_env_var") {
    const value = tomlScalar(trimmed);
    return !!value && /^[A-Z_][A-Z0-9_]{0,127}$/.test(value);
  }
  if (tail === "env_vars") {
    const values = tomlStringArray(trimmed);
    return !!values && values.every((value) => /^[A-Z_][A-Z0-9_]{0,127}$/.test(value));
  }
  if (tail === "env_http_headers") return trimmed.startsWith("{");
  return false;
}

function isSensitiveValue(value: string): boolean {
  return /(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{16,}|bearer\s+[A-Za-z0-9._-]{16,}|token=|api[_-]?key=|password=|secret=|credential=|cookie=|session=)/i.test(value);
}

function isSensitiveOption(value: string): boolean {
  return /^(?:--?|\/)?(?:api[-_]?key|token|secret|password|credential|auth|bearer|cookie|session)(?:$|[=:])/i.test(value);
}

function sanitizeArguments(values: string[]): string[] {
  const out: string[] = [];
  let skipNext = false;
  for (const value of values) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (isSensitiveValue(value)) continue;
    if (isSensitiveOption(value)) {
      if (!/[=:]/.test(value)) skipNext = true;
      continue;
    }
    out.push(value);
  }
  return out;
}

function packageNameAfterMarker(haystack: string, marker: string): string | undefined {
  const index = haystack.indexOf(marker);
  if (index < 0) return undefined;
  const rest = haystack.slice(index);
  return /^[a-z0-9@/_-]*(?:mcp|server)[a-z0-9@/_-]*/i.exec(rest)?.[0];
}

function readableMcpPackageName(value: string): string {
  const last = value.split(/[\\/:@]+/).filter(Boolean).at(-1) ?? value;
  const cleaned = last.replace(/^server[-_]?/i, "").replace(/[-_]+/g, " ").trim();
  if (!cleaned) return "MCP";
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
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

function appendEvidence(left: Evidence[], right: Evidence[]): Evidence[] {
  const out = [...left];
  for (const item of right) {
    if (out.some((existing) => existing.source === item.source && existing.detail === item.detail && existing.field === item.field)) continue;
    out.push(item);
  }
  return out;
}

function truncate(value: string, max: number): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 3)}...` : cleaned;
}
