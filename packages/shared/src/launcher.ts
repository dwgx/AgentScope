import path from "node:path";
import type { AgentKind, AgentProcess, Evidence } from "./index.js";

export type SessionLaunchAction = "resume" | "fork";

export interface SessionLaunchContext {
  cwd?: string | undefined;
  sessionPath?: string | undefined;
  executablePath?: string | undefined;
  commandLine?: string | undefined;
  pid?: number | undefined;
}

export interface LaunchFileCandidate {
  path: string;
  source: string;
  evidence?: Evidence[] | undefined;
}

export interface LaunchResolverEnvironment {
  homeDir: string;
  appDataDir?: string | undefined;
  programFilesDir?: string | undefined;
  programFilesX86Dir?: string | undefined;
  pathCandidates: Record<string, LaunchFileCandidate[] | undefined>;
  existingFiles: Set<string>;
  processes?: AgentProcess[] | undefined;
}

export interface SessionLaunchResolution {
  agent: Extract<AgentKind, "codex" | "claude">;
  action: SessionLaunchAction;
  sessionId: string;
  filePath: string;
  args: string[];
  command: string;
  source: string;
  evidence: Evidence[];
}

export interface SessionLaunchResult extends SessionLaunchResolution {
  ok: true;
  cwd?: string | undefined;
}

const CODEX_JS_RELATIVE = ["npm", "node_modules", "@openai", "codex", "bin", "codex.js"];
const CLAUDE_JS_PATTERNS = [
  /node_modules[\\/](?:@anthropic-ai[\\/])?claude(?:-code)?[\\/].*\.js$/i,
  /node_modules[\\/]@anthropic-ai[\\/]claude-code[\\/].*\.js$/i
];

export function resolveSessionLauncher(
  agent: Extract<AgentKind, "codex" | "claude">,
  action: SessionLaunchAction,
  sessionId: string,
  env: LaunchResolverEnvironment,
  context?: SessionLaunchContext | undefined
): SessionLaunchResolution {
  if (!isSafeSessionId(sessionId)) throw new Error("Session id contains unsupported characters.");
  const args = sessionLaunchArgs(agent, action, sessionId);
  const candidates = agent === "codex"
    ? codexLaunchCandidates(env, context)
    : claudeLaunchCandidates(env, context);
  const selected = candidates.find((candidate) => isLaunchCandidateAllowed(candidate, agent, env) && launchCandidateExists(env, candidate));
  if (!selected) {
    throw new Error(
      agent === "codex"
        ? "Unable to find a safe Codex launcher. Expected trusted node.exe + @openai/codex/bin/codex.js or codex.cmd; refusing .ps1/.bat and untrusted process paths."
        : "Unable to find a safe Claude launcher. Expected trusted claude.exe/claude.cmd or node.exe + Claude JS entrypoint; refusing .ps1/.bat and untrusted process paths."
    );
  }
  const launcherArgs = selected.extraArgs ? [...selected.extraArgs, ...args] : args;
  return {
    agent,
    action,
    sessionId,
    filePath: selected.path,
    args: launcherArgs,
    command: formatCommandForDisplay(selected.path, launcherArgs),
    source: selected.source,
    evidence: selected.evidence ?? []
  };
}

export function sessionLaunchArgs(
  agent: Extract<AgentKind, "codex" | "claude">,
  action: SessionLaunchAction,
  sessionId: string
): string[] {
  if (agent === "codex") return [action, sessionId];
  return action === "fork" ? ["--resume", sessionId, "--fork-session"] : ["--resume", sessionId];
}

export function isSafeSessionId(sessionId: string): boolean {
  return /^[A-Za-z0-9._:-]{3,160}$/.test(sessionId);
}

export function splitWindowsCommandLine(commandLine: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < commandLine.length; index += 1) {
    const char = commandLine[index]!;
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && /\s/.test(char)) {
      if (current) {
        out.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) out.push(current);
  return out;
}

export function formatCommandForDisplay(filePath: string, args: string[]): string {
  return [filePath, ...args].map(quoteArg).join(" ");
}

interface InternalLaunchCandidate extends LaunchFileCandidate {
  extraArgs?: string[] | undefined;
}

function codexLaunchCandidates(
  env: LaunchResolverEnvironment,
  context?: SessionLaunchContext | undefined
): InternalLaunchCandidate[] {
  const candidates: InternalLaunchCandidate[] = [];
  for (const process of relevantProcesses(env, "codex", context)) {
    const parsed = codexNodeEntrypoint(process.commandLine, process.executablePath);
    if (parsed) {
      candidates.push({
        path: parsed.nodePath,
        extraArgs: [parsed.codexJsPath],
        source: "process.commandLine.codexJs",
        evidence: [
          ...processEvidence(process),
          { source: "launcher.resolve", detail: "Codex Node entrypoint identified from a running process command line.", path: parsed.codexJsPath }
        ]
      });
    }
  }
  const defaultCodexJs = env.appDataDir ? path.join(env.appDataDir, ...CODEX_JS_RELATIVE) : undefined;
  for (const nodePath of nodeExeCandidates(env)) {
    if (defaultCodexJs) {
      candidates.push({
        path: nodePath.path,
        extraArgs: [defaultCodexJs],
        source: `${nodePath.source}+appdata.codexJs`,
        evidence: [
          ...(nodePath.evidence ?? []),
          { source: "launcher.resolve", detail: "Default Codex npm JS entrypoint under APPDATA.", path: defaultCodexJs }
        ]
      });
    }
  }
  for (const candidate of commandCandidates(env, ["codex.cmd", "codex.exe"])) {
    candidates.push({ ...candidate, source: `${candidate.source}.codexCommand` });
  }
  return candidates;
}

function claudeLaunchCandidates(
  env: LaunchResolverEnvironment,
  context?: SessionLaunchContext | undefined
): InternalLaunchCandidate[] {
  const candidates: InternalLaunchCandidate[] = [];
  for (const process of relevantProcesses(env, "claude", context)) {
    const parsed = claudeNodeEntrypoint(process.commandLine, process.executablePath);
    if (parsed) {
      candidates.push({
        path: parsed.nodePath,
        extraArgs: [parsed.claudeJsPath],
        source: "process.commandLine.claudeJs",
        evidence: [
          ...processEvidence(process),
          { source: "launcher.resolve", detail: "Claude Node entrypoint identified from a running process command line.", path: parsed.claudeJsPath }
        ]
      });
    }
    if (process.executablePath && /\.(?:exe|cmd)$/i.test(process.executablePath) && /claude/i.test(path.basename(process.executablePath))) {
      candidates.push({
        path: process.executablePath,
        source: "process.executablePath.claude",
        evidence: processEvidence(process)
      });
    }
  }
  for (const candidate of commandCandidates(env, ["claude.cmd", "claude.exe"])) {
    candidates.push({ ...candidate, source: `${candidate.source}.claudeCommand` });
  }
  return candidates;
}

function relevantProcesses(
  env: LaunchResolverEnvironment,
  agent: Extract<AgentKind, "codex" | "claude">,
  context?: SessionLaunchContext | undefined
): AgentProcess[] {
  const out: AgentProcess[] = [];
  const contextProcess = contextToProcess(agent, context);
  if (contextProcess) out.push(contextProcess);
  const processes = env.processes ?? [];
  const matchingPid = context?.pid;
  for (const process of processes) {
    if (matchingPid !== undefined && process.pid !== matchingPid) continue;
    if (process.agent !== agent) continue;
    out.push(process);
  }
  for (const process of processes) {
    if (matchingPid !== undefined && process.pid === matchingPid) continue;
    if (process.agent !== agent) continue;
    out.push(process);
  }
  return dedupeProcesses(out);
}

function contextToProcess(
  agent: Extract<AgentKind, "codex" | "claude">,
  context?: SessionLaunchContext | undefined
): AgentProcess | undefined {
  if (!context?.commandLine && !context?.executablePath) return undefined;
  const evidence: Evidence[] = [
    {
      source: "renderer.session",
      detail: "Launch context supplied by the selected session.",
      ...(context.sessionPath ? { path: context.sessionPath } : {})
    },
    ...(context.executablePath
      ? [{ source: "renderer.session", detail: "Executable path supplied by selected session.", path: context.executablePath }]
      : [])
  ];
  return {
    pid: context.pid ?? -1,
    processName: context.executablePath ? path.basename(context.executablePath) : agent,
    ...(context.executablePath ? { executablePath: context.executablePath } : {}),
    ...(context.commandLine ? { commandLine: context.commandLine } : {}),
    agent,
    evidence
  };
}

function dedupeProcesses(processes: AgentProcess[]): AgentProcess[] {
  const seen = new Set<string>();
  const out: AgentProcess[] = [];
  for (const process of processes) {
    const key = `${process.pid}:${process.executablePath ?? ""}:${process.commandLine ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(process);
  }
  return out;
}

function codexNodeEntrypoint(commandLine?: string | undefined, executablePath?: string | undefined): { nodePath: string; codexJsPath: string } | undefined {
  const jsPath = findCommandArg(commandLine, (arg) => /@openai[\\/]codex[\\/]bin[\\/]codex\.js$/i.test(arg));
  if (!jsPath) return undefined;
  const nodePath = nodePathFromCommand(commandLine, executablePath);
  if (!nodePath) return undefined;
  return { nodePath, codexJsPath: jsPath };
}

function claudeNodeEntrypoint(commandLine?: string | undefined, executablePath?: string | undefined): { nodePath: string; claudeJsPath: string } | undefined {
  const jsPath = findCommandArg(commandLine, (arg) => CLAUDE_JS_PATTERNS.some((pattern) => pattern.test(arg)));
  if (!jsPath) return undefined;
  const nodePath = nodePathFromCommand(commandLine, executablePath);
  if (!nodePath) return undefined;
  return { nodePath, claudeJsPath: jsPath };
}

function nodePathFromCommand(commandLine?: string | undefined, executablePath?: string | undefined): string | undefined {
  if (executablePath && isNodeExecutable(executablePath)) return executablePath;
  const first = commandLine ? splitWindowsCommandLine(commandLine)[0] : undefined;
  return first && isNodeExecutable(first) ? first : undefined;
}

function findCommandArg(commandLine: string | undefined, predicate: (arg: string) => boolean): string | undefined {
  if (!commandLine) return undefined;
  return splitWindowsCommandLine(commandLine).find((arg) => predicate(arg.replace(/^file:\/\//i, "")));
}

function nodeExeCandidates(env: LaunchResolverEnvironment): LaunchFileCandidate[] {
  const candidates: LaunchFileCandidate[] = [];
  for (const candidate of [
    env.programFilesDir ? path.join(env.programFilesDir, "nodejs", "node.exe") : undefined,
    env.programFilesX86Dir ? path.join(env.programFilesX86Dir, "nodejs", "node.exe") : undefined
  ]) {
    if (candidate) {
      candidates.push({
        path: candidate,
        source: "wellKnown.nodeExe",
        evidence: [{ source: "launcher.resolve", detail: "Node.js executable in Program Files.", path: candidate }]
      });
    }
  }
  candidates.push(...commandCandidates(env, ["node.exe"]));
  return dedupeCandidates(candidates);
}

function commandCandidates(env: LaunchResolverEnvironment, commands: string[]): LaunchFileCandidate[] {
  const candidates: LaunchFileCandidate[] = [];
  for (const command of commands) {
    for (const candidate of env.pathCandidates[command] ?? []) {
      candidates.push(candidate);
    }
  }
  return dedupeCandidates(candidates);
}

function dedupeCandidates<T extends LaunchFileCandidate>(candidates: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const candidate of candidates) {
    const key = normalizePathKey(candidate.path);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

function processEvidence(process: AgentProcess): Evidence[] {
  return [
    {
      source: "process.snapshot",
      detail: `PID ${process.pid} ${process.processName}`,
      ...(process.executablePath ? { path: process.executablePath } : {})
    },
    ...(process.commandLine
      ? [
          {
            source: "process.commandLine",
            detail: process.commandLine,
            ...(process.executablePath ? { path: process.executablePath } : {})
          }
        ]
      : []),
    ...process.evidence
  ];
}

function isLaunchCandidateAllowed(
  candidate: InternalLaunchCandidate,
  agent: Extract<AgentKind, "codex" | "claude">,
  env: LaunchResolverEnvironment
): boolean {
  if (/\.(?:ps1|bat)$/i.test(candidate.path)) return false;
  if (isNodeExecutable(candidate.path)) {
    return isTrustedNodeExecutable(candidate.path, env) && (candidate.extraArgs ?? []).every((arg) => isTrustedJsEntrypoint(arg, agent, env));
  }
  return isTrustedAgentCommand(candidate.path, agent, env);
}

function isNodeExecutable(filePath: string): boolean {
  return /(?:^|[\\/])node(?:\.exe)?$/i.test(filePath);
}

function isTrustedNodeExecutable(filePath: string, env: LaunchResolverEnvironment): boolean {
  return [env.programFilesDir, env.programFilesX86Dir]
    .map((root) => root ? path.join(root, "nodejs") : undefined)
    .some((root) => !!root && pathInsideOrEqual(root, filePath));
}

function isTrustedJsEntrypoint(
  filePath: string,
  agent: Extract<AgentKind, "codex" | "claude">,
  env: LaunchResolverEnvironment
): boolean {
  if (!/\.js$/i.test(filePath) || !env.appDataDir) return false;
  const npmRoot = path.join(env.appDataDir, "npm");
  if (agent === "codex") {
    return pathEquals(filePath, path.join(env.appDataDir, ...CODEX_JS_RELATIVE));
  }
  return pathInsideOrEqual(path.join(npmRoot, "node_modules"), filePath) && CLAUDE_JS_PATTERNS.some((pattern) => pattern.test(filePath));
}

function isTrustedAgentCommand(
  filePath: string,
  agent: Extract<AgentKind, "codex" | "claude">,
  env: LaunchResolverEnvironment
): boolean {
  if (!env.appDataDir) return false;
  const extension = path.extname(filePath).toLowerCase();
  if (extension !== ".cmd" && extension !== ".exe") return false;
  const namePattern = agent === "codex" ? /^codex\.(?:cmd|exe)$/i : /^claude\.(?:cmd|exe)$/i;
  return namePattern.test(path.basename(filePath)) && pathInsideOrEqual(path.join(env.appDataDir, "npm"), filePath);
}

function fileExists(env: LaunchResolverEnvironment, candidate: string): boolean {
  return env.existingFiles.has(normalizePathKey(candidate));
}

function launchCandidateExists(env: LaunchResolverEnvironment, candidate: InternalLaunchCandidate): boolean {
  if (!fileExists(env, candidate.path)) return false;
  return (candidate.extraArgs ?? []).every((arg) => !/\.js$/i.test(arg) || fileExists(env, arg));
}

function normalizePathKey(candidate: string): string {
  return path.resolve(candidate).toLowerCase();
}

function pathInsideOrEqual(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function pathEquals(left: string, right: string): boolean {
  return normalizePathKey(left) === normalizePathKey(right);
}

function quoteArg(arg: string): string {
  return /\s|"/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}
