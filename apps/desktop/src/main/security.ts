import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface IpcSenderLike {
  sender: unknown;
  senderFrame?: {
    url?: string;
    top?: { url?: string } | null;
  } | null;
}

export interface TrustedWebContentsLike {
  isDestroyed(): boolean;
  getURL(): string;
}

export interface TrustedWindowLike {
  isDestroyed(): boolean;
  webContents: TrustedWebContentsLike;
}

export interface TrustedIpcSenderOptions {
  mainWindow: TrustedWindowLike | undefined;
  isDev: boolean;
  devServerUrl: string | undefined;
  rendererIndexPath: string;
}

export function assertTrustedIpcSender(event: IpcSenderLike, options: TrustedIpcSenderOptions): void {
  const windowRef = options.mainWindow;
  if (!windowRef || windowRef.isDestroyed() || windowRef.webContents.isDestroyed()) {
    throw new Error("IPC sender rejected because the AgentScope window is not available.");
  }
  if (event.sender !== windowRef.webContents) {
    throw new Error("IPC sender rejected because it does not belong to the AgentScope window.");
  }

  const frameUrl = event.senderFrame?.url;
  const topUrl = event.senderFrame?.top?.url ?? frameUrl;
  if (!frameUrl || !isTrustedRendererUrl(frameUrl, options)) {
    throw new Error("IPC sender rejected because the frame URL is not trusted.");
  }
  if (!topUrl || !isTrustedRendererUrl(topUrl, options)) {
    throw new Error("IPC sender rejected because the top-level frame URL is not trusted.");
  }

  const senderUrl = windowRef.webContents.getURL();
  if (senderUrl && !isTrustedRendererUrl(senderUrl, options)) {
    throw new Error("IPC sender rejected because the window URL is not trusted.");
  }
}

export function isTrustedRendererUrl(url: string, options: Pick<TrustedIpcSenderOptions, "isDev" | "devServerUrl" | "rendererIndexPath">): boolean {
  try {
    const parsed = new URL(url);
    if (options.isDev && isTrustedDevServerUrl(parsed, options.devServerUrl)) return true;
    if (parsed.protocol !== "file:") return false;
    return samePath(fileURLToPath(parsed), options.rendererIndexPath);
  } catch {
    return false;
  }
}

export async function isSafeOperationPath(targetPath: string, roots: string[]): Promise<boolean> {
  const normalizedTarget = normalizeFsPath(targetPath);
  if (!normalizedTarget) return false;

  for (const root of roots) {
    const normalizedRoot = normalizeFsPath(root);
    if (!normalizedRoot || !pathInside(normalizedRoot, normalizedTarget)) continue;
    if (await pathContainsReparsePoint(normalizedRoot, normalizedTarget)) return false;
    if (!(await realPathInside(normalizedRoot, normalizedTarget))) return false;
    return true;
  }

  return false;
}

export function pathInside(root: string, targetPath: string): boolean {
  const normalizedRoot = normalizeFsPath(root);
  const normalizedTarget = normalizeFsPath(targetPath);
  if (!normalizedRoot || !normalizedTarget) return false;
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`);
}

export function normalizeFsPath(candidate: string | undefined): string | undefined {
  if (!candidate) return undefined;
  try {
    return path.resolve(candidate.replace(/^\\\\\?\\/, "")).toLowerCase();
  } catch {
    return undefined;
  }
}

async function realPathInside(root: string, targetPath: string): Promise<boolean> {
  const rootReal = await fs.promises.realpath(root).catch(() => undefined);
  const targetReal = await fs.promises.realpath(targetPath).catch(() => undefined);
  if (!rootReal || !targetReal) return false;
  return pathInside(rootReal, targetReal);
}

async function pathContainsReparsePoint(root: string, targetPath: string): Promise<boolean> {
  const relative = path.relative(root, targetPath);
  const segments = relative ? relative.split(path.sep).filter(Boolean) : [];
  let current = root;
  if (await isReparsePoint(current)) return true;
  for (const segment of segments) {
    current = path.join(current, segment);
    if (await isReparsePoint(current)) return true;
  }
  return false;
}

async function isReparsePoint(candidate: string): Promise<boolean> {
  const stat = await fs.promises.lstat(candidate).catch(() => undefined);
  if (!stat) return true;
  return stat.isSymbolicLink();
}

function isTrustedDevServerUrl(parsed: URL, devServerUrl: string | undefined): boolean {
  if (parsed.protocol !== "http:") return false;
  const trusted = new URL(devServerUrl || "http://localhost:5173");
  if (trusted.protocol !== "http:") return false;
  const trustedHostnames = new Set([trusted.hostname, "127.0.0.1", "localhost"]);
  return trustedHostnames.has(parsed.hostname) && parsed.port === trusted.port;
}

function samePath(left: string, right: string): boolean {
  const normalizedLeft = normalizeFsPath(left);
  const normalizedRight = normalizeFsPath(right);
  return !!normalizedLeft && !!normalizedRight && normalizedLeft === normalizedRight;
}
