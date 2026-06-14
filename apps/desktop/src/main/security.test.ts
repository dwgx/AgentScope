import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertTrustedIpcSender,
  isSafeOperationPath,
  isTrustedRendererUrl,
  type IpcSenderLike,
  type TrustedWindowLike
} from "./security.js";
import { launcherRuntimeTestInternals } from "./launcherRuntime.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("main process security helpers", () => {
  it("accepts IPC only from the AgentScope window and trusted file URL", () => {
    const rendererPath = tempFile("renderer", "index.html");
    const webContents = webContentsFor(pathToFileURL(rendererPath).toString());
    const windowRef: TrustedWindowLike = {
      isDestroyed: () => false,
      webContents
    };
    const event: IpcSenderLike = {
      sender: webContents,
      senderFrame: {
        url: pathToFileURL(rendererPath).toString(),
        top: { url: pathToFileURL(rendererPath).toString() }
      }
    };

    expect(() =>
      assertTrustedIpcSender(event, {
        mainWindow: windowRef,
        isDev: false,
        devServerUrl: undefined,
        rendererIndexPath: rendererPath
      })
    ).not.toThrow();
  });

  it("rejects IPC from another webContents even when the URL is trusted", () => {
    const rendererPath = tempFile("renderer", "index.html");
    const trustedWebContents = webContentsFor(pathToFileURL(rendererPath).toString());
    const attackerWebContents = webContentsFor(pathToFileURL(rendererPath).toString());
    const event: IpcSenderLike = {
      sender: attackerWebContents,
      senderFrame: {
        url: pathToFileURL(rendererPath).toString(),
        top: { url: pathToFileURL(rendererPath).toString() }
      }
    };

    expect(() =>
      assertTrustedIpcSender(event, {
        mainWindow: { isDestroyed: () => false, webContents: trustedWebContents },
        isDev: false,
        devServerUrl: undefined,
        rendererIndexPath: rendererPath
      })
    ).toThrow(/does not belong/);
  });

  it("rejects IPC from untrusted frame URLs", () => {
    const rendererPath = tempFile("renderer", "index.html");
    const webContents = webContentsFor(pathToFileURL(rendererPath).toString());
    const event: IpcSenderLike = {
      sender: webContents,
      senderFrame: {
        url: "https://example.invalid/app",
        top: { url: "https://example.invalid/app" }
      }
    };

    expect(() =>
      assertTrustedIpcSender(event, {
        mainWindow: { isDestroyed: () => false, webContents },
        isDev: false,
        devServerUrl: undefined,
        rendererIndexPath: rendererPath
      })
    ).toThrow(/frame URL/);
  });

  it("accepts the configured local dev server URL only in dev mode", () => {
    const rendererPath = tempFile("renderer", "index.html");

    expect(
      isTrustedRendererUrl("http://127.0.0.1:5173/settings", {
        isDev: true,
        devServerUrl: "http://127.0.0.1:5173",
        rendererIndexPath: rendererPath
      })
    ).toBe(true);
    expect(
      isTrustedRendererUrl("http://127.0.0.1:5174/settings", {
        isDev: true,
        devServerUrl: "http://127.0.0.1:5173",
        rendererIndexPath: rendererPath
      })
    ).toBe(false);
    expect(
      isTrustedRendererUrl("http://127.0.0.1:5173/settings", {
        isDev: false,
        devServerUrl: "http://127.0.0.1:5173",
        rendererIndexPath: rendererPath
      })
    ).toBe(false);
  });

  it("allows normal operation paths under an allowed root", async () => {
    const root = tempDir("agentscope");
    const backup = path.join(root, "backups", "backup-1");
    fs.mkdirSync(backup, { recursive: true });

    await expect(isSafeOperationPath(backup, [path.join(root, "backups")])).resolves.toBe(true);
  });

  it("rejects operation paths outside allowed roots", async () => {
    const root = tempDir("agentscope");
    const outside = tempDir("outside");
    fs.mkdirSync(path.join(root, "backups"), { recursive: true });

    await expect(isSafeOperationPath(outside, [path.join(root, "backups")])).resolves.toBe(false);
  });

  it("rejects operation paths that escape through symlinks or junctions", async () => {
    const root = tempDir("agentscope");
    const backupRoot = path.join(root, "backups");
    const outside = tempDir("outside");
    fs.mkdirSync(backupRoot, { recursive: true });
    const link = path.join(backupRoot, "linked");
    const created = createDirectoryLink(outside, link);
    if (!created) return;

    await expect(isSafeOperationPath(link, [backupRoot])).resolves.toBe(false);
  });

  it("uses AGENTSCOPE_LAUNCHER_APPDATA before APPDATA for trusted npm launchers", () => {
    const oldLauncherAppData = process.env.AGENTSCOPE_LAUNCHER_APPDATA;
    const oldAppData = process.env.APPDATA;
    const launcherAppData = tempDir("launcher-appdata");
    const appData = tempDir("appdata");
    try {
      process.env.AGENTSCOPE_LAUNCHER_APPDATA = launcherAppData;
      process.env.APPDATA = appData;

      const roots = launcherRuntimeTestInternals.trustedLauncherRoots().map((item) => path.resolve(item).toLowerCase());

      expect(launcherRuntimeTestInternals.npmAppDataRoot()).toBe(launcherAppData);
      expect(roots).toContain(path.resolve(path.join(launcherAppData, "npm")).toLowerCase());
      expect(roots).not.toContain(path.resolve(path.join(appData, "npm")).toLowerCase());
    } finally {
      restoreEnv("AGENTSCOPE_LAUNCHER_APPDATA", oldLauncherAppData);
      restoreEnv("APPDATA", oldAppData);
    }
  });
});

function tempDir(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `agentscope-${name}-`));
  tempRoots.push(root);
  return root;
}

function tempFile(name: string, fileName: string): string {
  const root = tempDir(name);
  fs.mkdirSync(root, { recursive: true });
  const filePath = path.join(root, fileName);
  fs.writeFileSync(filePath, "", "utf8");
  return filePath;
}

function webContentsFor(url: string) {
  return {
    isDestroyed: () => false,
    getURL: () => url
  };
}

function createDirectoryLink(target: string, linkPath: string): boolean {
  try {
    fs.symlinkSync(target, linkPath, process.platform === "win32" ? "junction" : "dir");
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EPERM" || code === "EACCES" || code === "EINVAL") return false;
    throw error;
  }
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
