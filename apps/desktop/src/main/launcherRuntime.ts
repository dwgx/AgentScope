import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import {
  formatCommandForDisplay,
  resolveSessionLauncher,
  splitWindowsCommandLine,
  type LaunchFileCandidate,
  type SessionLaunchAction,
  type SessionLaunchContext,
  type SessionLaunchResolution,
  type SessionLaunchResult
} from "@agentscope/shared";
import type { AgentKind, ScopeSnapshot } from "@agentscope/shared";

const execFileAsync = promisify(execFile);

export async function resolveLaunchCommand(options: {
  agent: Exclude<AgentKind, "unknown">;
  action: SessionLaunchAction;
  sessionId: string;
  snapshot: ScopeSnapshot;
  context?: SessionLaunchContext | undefined;
  homeDir: string;
}): Promise<SessionLaunchResolution> {
  const resolution = resolveSessionLauncher(
    options.agent,
    options.action,
    options.sessionId,
    await launchResolverEnvironment(options.snapshot, options.homeDir),
    options.context
  );
  await assertLaunchResolutionSafe(resolution.filePath);
  return resolution;
}

export function launchResult(resolution: SessionLaunchResolution, cwd?: string | undefined): SessionLaunchResult {
  return {
    ok: true,
    ...resolution,
    command: formatCommandForDisplay(resolution.filePath, resolution.args),
    ...(cwd ? { cwd } : {})
  };
}

export async function waitForLaunchAccepted(child: ChildProcess): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const done = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("error", onError);
      child.off("exit", onExit);
      if (error) reject(error);
      else resolve();
    };
    const onError = (error: Error) => done(error);
    const onExit = (code: number | null) => {
      if (code === null || code === 0) done();
      else done(new Error(`Launcher exited before startup completed with code ${code}.`));
    };
    const timer = setTimeout(() => done(), 350);
    child.once("error", onError);
    child.once("exit", onExit);
  });
}

async function assertLaunchResolutionSafe(filePath: string): Promise<void> {
  if (!fs.existsSync(filePath)) throw new Error("Resolved launcher does not exist.");
  const ext = path.extname(filePath).toLowerCase();
  if ([".ps1", ".bat"].includes(ext)) throw new Error("Refusing to launch script entrypoints.");
  if (![".exe", ".cmd"].includes(ext)) throw new Error("Resolved launcher must be an executable or cmd shim.");
  if (!(await isTrustedLauncherPath(filePath))) throw new Error("Resolved launcher is not in a trusted realpath-safe install root.");
}

async function launchResolverEnvironment(snapshot: ScopeSnapshot, homeDir: string) {
  const existingFiles = new Set<string>();
  const candidates: Record<string, LaunchFileCandidate[]> = {};
  const appDataDir = npmAppDataRoot();
  const addFile = async (candidate: string | undefined) => {
    if (!candidate) return;
    if (!fs.existsSync(candidate)) return;
    if (!(await isTrustedLauncherPath(candidate).catch(() => false)) && !/\.js$/i.test(candidate)) return;
    existingFiles.add(path.resolve(candidate).toLowerCase());
  };
  const addCandidates = async (command: string) => {
    const trusted: LaunchFileCandidate[] = [];
    for (const candidate of await whereCommand(command)) {
      if (!(await isTrustedWhereLauncher(command, candidate.path))) continue;
      trusted.push(await withLauncherPathMetadata(candidate));
    }
    candidates[command] = trusted;
    for (const candidate of candidates[command] ?? []) await addFile(candidate.path);
  };
  const addDirectCandidate = async (command: string, candidatePath: string | undefined, source: string) => {
    if (!candidatePath || !fs.existsSync(candidatePath)) return;
    if (!(await isTrustedLauncherPath(candidatePath).catch(() => false))) return;
    const list = candidates[command] ?? [];
    list.push(await withLauncherPathMetadata({
      path: candidatePath,
      source,
      evidence: [{ source: "launcher.wellKnown", detail: source, path: candidatePath }]
    }));
    candidates[command] = list;
    await addFile(candidatePath);
  };
  for (const item of snapshot.processes) {
    await addFile(item.executablePath);
    for (const arg of item.commandLine ? splitWindowsCommandLine(item.commandLine) : []) {
      if (/\.js$/i.test(arg)) existingFiles.add(path.resolve(arg).toLowerCase());
    }
  }
  const codexJs = appDataDir ? path.join(appDataDir, "npm", "node_modules", "@openai", "codex", "bin", "codex.js") : undefined;
  if (codexJs && appDataDir && fs.existsSync(codexJs) && (await isPathRealpathSafe(codexJs, [path.join(appDataDir, "npm")]).catch(() => false))) {
    existingFiles.add(path.resolve(codexJs).toLowerCase());
  }
  await addFile(process.env.ProgramFiles ? path.join(process.env.ProgramFiles, "nodejs", "node.exe") : undefined);
  await addFile(process.env["ProgramFiles(x86)"] ? path.join(process.env["ProgramFiles(x86)"], "nodejs", "node.exe") : undefined);
  await Promise.all(["node.exe", "codex.cmd", "codex.exe", "claude.cmd", "claude.exe"].map(addCandidates));
  const npmBin = appDataDir ? path.join(appDataDir, "npm") : undefined;
  await addDirectCandidate("codex.cmd", npmBin ? path.join(npmBin, "codex.cmd") : undefined, "appdata.npm.codexCmd");
  await addDirectCandidate("codex.exe", npmBin ? path.join(npmBin, "codex.exe") : undefined, "appdata.npm.codexExe");
  await addDirectCandidate("claude.cmd", npmBin ? path.join(npmBin, "claude.cmd") : undefined, "appdata.npm.claudeCmd");
  await addDirectCandidate("claude.exe", npmBin ? path.join(npmBin, "claude.exe") : undefined, "appdata.npm.claudeExe");
  return {
    homeDir,
    ...(appDataDir ? { appDataDir } : {}),
    ...(process.env.ProgramFiles ? { programFilesDir: process.env.ProgramFiles } : {}),
    ...(process.env["ProgramFiles(x86)"] ? { programFilesX86Dir: process.env["ProgramFiles(x86)"] } : {}),
    pathCandidates: candidates,
    existingFiles,
    processes: snapshot.processes
  };
}

async function isTrustedWhereLauncher(command: string, candidatePath: string): Promise<boolean> {
  const normalized = normalizeFsPath(candidatePath);
  if (!normalized) return false;
  const appDataDir = npmAppDataRoot();
  const appDataNpm = appDataDir ? normalizeFsPath(path.join(appDataDir, "npm")) : undefined;
  const programFilesNode = process.env.ProgramFiles ? normalizeFsPath(path.join(process.env.ProgramFiles, "nodejs")) : undefined;
  const programFilesX86Node = process.env["ProgramFiles(x86)"] ? normalizeFsPath(path.join(process.env["ProgramFiles(x86)"], "nodejs")) : undefined;
  if (command.toLowerCase() === "node.exe") {
    return [programFilesNode, programFilesX86Node].some((root) => !!root && (normalized === root || normalized.startsWith(`${root}${path.sep}`))) &&
      await isPathRealpathSafe(candidatePath, trustedLauncherRoots());
  }
  if (/^(?:codex|claude)\.(?:cmd|exe)$/i.test(command)) {
    return !!appDataNpm && (normalized === appDataNpm || normalized.startsWith(`${appDataNpm}${path.sep}`)) &&
      await isPathRealpathSafe(candidatePath, trustedLauncherRoots());
  }
  return false;
}

async function withLauncherPathMetadata(candidate: LaunchFileCandidate): Promise<LaunchFileCandidate> {
  const realPath = await fs.promises.realpath(candidate.path).catch(() => undefined);
  return {
    ...candidate,
    ...(realPath ? { realPath } : {}),
    hasReparsePoint: await pathContainsReparsePoint(candidate.path)
  };
}

async function isTrustedLauncherPath(candidatePath: string): Promise<boolean> {
  const ext = path.extname(candidatePath).toLowerCase();
  if (![".exe", ".cmd"].includes(ext)) return false;
  return isPathRealpathSafe(candidatePath, trustedLauncherRoots());
}

function trustedLauncherRoots(): string[] {
  const roots = [
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, "nodejs") : undefined,
    process.env["ProgramFiles(x86)"] ? path.join(process.env["ProgramFiles(x86)"], "nodejs") : undefined,
    npmAppDataRoot() ? path.join(npmAppDataRoot()!, "npm") : undefined
  ].filter((root): root is string => !!root);
  return roots;
}

async function isPathRealpathSafe(candidatePath: string, roots: string[]): Promise<boolean> {
  if (!path.isAbsolute(candidatePath) || /^\\\\/.test(candidatePath) || /^\/\/+/.test(candidatePath)) return false;
  if (path.normalize(candidatePath).split(/[\\/]+/).includes("..")) return false;
  const normalizedCandidate = normalizeFsPath(candidatePath);
  if (!normalizedCandidate) return false;
  for (const root of roots) {
    const normalizedRoot = normalizeFsPath(root);
    if (!normalizedRoot || !(normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`))) continue;
    if (await pathContainsReparsePoint(candidatePath, root)) return false;
    const rootReal = await fs.promises.realpath(root).catch(() => undefined);
    const candidateReal = await fs.promises.realpath(candidatePath).catch(() => undefined);
    if (!rootReal || !candidateReal) return false;
    const normalizedRootReal = normalizeFsPath(rootReal);
    const normalizedCandidateReal = normalizeFsPath(candidateReal);
    if (!normalizedRootReal || !normalizedCandidateReal) return false;
    if (normalizedCandidateReal === normalizedRootReal || normalizedCandidateReal.startsWith(`${normalizedRootReal}${path.sep}`)) return true;
  }
  return false;
}

async function pathContainsReparsePoint(candidatePath: string, rootPath?: string): Promise<boolean> {
  const resolvedRoot = rootPath ? path.resolve(rootPath) : path.parse(path.resolve(candidatePath)).root;
  const resolvedCandidate = path.resolve(candidatePath);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return true;
  let current = resolvedRoot;
  if (await isReparsePoint(current)) return true;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (await isReparsePoint(current)) return true;
  }
  return false;
}

async function isReparsePoint(candidatePath: string): Promise<boolean> {
  const stat = await fs.promises.lstat(candidatePath).catch(() => undefined);
  if (!stat) return true;
  return stat.isSymbolicLink();
}

async function whereCommand(command: string): Promise<LaunchFileCandidate[]> {
  try {
    const { stdout } = await execFileAsync("where.exe", [command], {
      windowsHide: true,
      timeout: 5000,
      maxBuffer: 256 * 1024
    });
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && fs.existsSync(line))
      .map((line) => ({
        path: line,
        source: `where.${command}`,
        evidence: [{ source: "launcher.where", detail: `where.exe ${command}`, path: line }]
      }));
  } catch {
    return [];
  }
}

function npmAppDataRoot(): string | undefined {
  const launcherOverride = process.env.AGENTSCOPE_LAUNCHER_APPDATA?.trim();
  if (launcherOverride) return launcherOverride;
  const fromEnv = process.env.APPDATA;
  if (fromEnv) return fromEnv;
  return path.join(os.homedir(), "AppData", "Roaming");
}

function normalizeFsPath(candidate: string | undefined): string | undefined {
  if (!candidate) return undefined;
  try {
    return path.resolve(candidate.replace(/^\\\\\?\\/, "")).toLowerCase();
  } catch {
    return undefined;
  }
}

export const launcherRuntimeTestInternals = {
  npmAppDataRoot,
  trustedLauncherRoots
};
