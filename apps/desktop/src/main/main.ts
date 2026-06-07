import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { Evidence, ScopeSnapshot } from "@agentscope/shared";
import type * as AgentScopeCore from "@agentscope/core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "development" || process.env.VITE_DEV_SERVER_URL;
const execFileAsync = promisify(execFile);

let mainWindow: BrowserWindow | undefined;
let corePromise: Promise<typeof AgentScopeCore> | undefined;
let lastCoreError: string | undefined;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 860,
    minWidth: 1040,
    minHeight: 680,
    title: "AgentScope",
    autoHideMenuBar: true,
    backgroundColor: "#f7f5f0",
    show: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  log("browser window created");
  mainWindow.setMenuBarVisibility(false);

  const showWindow = (): void => {
    mainWindow?.show();
    mainWindow?.focus();
  };

  mainWindow.once("ready-to-show", () => {
    log("browser window ready-to-show");
    showWindow();
  });

  mainWindow.webContents.on("did-finish-load", () => {
    log("renderer did-finish-load");
    showWindow();
  });

  setTimeout(showWindow, 1500);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    log(`renderer did-fail-load ${errorCode} ${errorDescription} ${validatedURL}`);
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    log(`renderer process gone ${JSON.stringify(details)}`);
  });

  mainWindow.webContents.on("console-message", (_event, level, message) => {
    log(`renderer console level=${level} ${message}`);
  });

  if (isDev) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173");
  } else {
    await mainWindow.loadFile(rendererIndexPath());
  }
}

ipcMain.handle("snapshot:get", async () => buildSnapshot());
ipcMain.handle("doctor:get", async () => runDoctor());
ipcMain.handle("search:run", async (_event, query: string, limit = 50) => searchAll(query, undefined, limit));
ipcMain.handle("snapshot:export", async () => exportSnapshot());
ipcMain.handle("app:info", async () => appInfo());
ipcMain.handle("fonts:list", async () => listInstalledFonts());
ipcMain.handle("app:reload", async () => {
  mainWindow?.reload();
  return true;
});
ipcMain.handle("app:quit", async () => {
  app.quit();
  return true;
});
ipcMain.handle("shell:openExternal", async (_event, url: string) => {
  if (!isAllowedExternalUrl(url)) return false;
  await shell.openExternal(url);
  return true;
});
ipcMain.handle("shell:openPath", async (_event, targetPath: string) => {
  if (!(await isAllowedLocalPath(targetPath))) return "Path is not in AgentScope's local trace allowlist";
  return shell.openPath(targetPath);
});
ipcMain.handle("shell:revealPath", async (_event, targetPath: string) => {
  if (!(await isAllowedLocalPath(targetPath))) return false;
  shell.showItemInFolder(targetPath);
  return true;
});
ipcMain.handle("inspect:pid", async (_event, pid: number) => {
  const snapshot = await buildSnapshot();
  return {
    process: await findProcess(snapshot, pid),
    sessions: await sessionsForPid(snapshot, pid)
  };
});
ipcMain.handle("inspect:session", async (_event, sessionId: string) => {
  const snapshot = await buildSnapshot();
  const session = await findSession(snapshot, sessionId);
  return {
    session,
    process: session?.pid === undefined ? undefined : await findProcess(snapshot, session.pid),
    relations: snapshot.relations.filter((relation) => relation.sourceId === sessionId || relation.targetId === sessionId),
    indexRecords: snapshot.indexRecords.filter((record) => record.sessionId.toLowerCase() === sessionId.toLowerCase())
  };
});
ipcMain.handle("session:backup", async (_event, agent: string, sessionId: string) => {
  const core = await loadCore();
  return core.backupSession(sessionId, asAgent(agent));
});
ipcMain.handle("session:deletePlan", async (_event, agent: string, sessionId: string) => {
  const core = await loadCore();
  return core.writeSessionDeletePlan(sessionId, asAgent(agent));
});
ipcMain.handle("session:importPlan", async (_event, backupDir: string) => {
  if (!(await isAllowedAgentScopeOperationPath(backupDir))) {
    throw new Error("Import planning is limited to AgentScope backup directories.");
  }
  const core = await loadCore();
  return core.planSessionImport(backupDir);
});
ipcMain.handle("session:chooseImportPlan", async () => {
  const backupRoot = path.join(os.homedir(), ".agentscope", "backups");
  await fs.promises.mkdir(backupRoot, { recursive: true });
  const options = {
    title: "Choose AgentScope backup directory",
    defaultPath: backupRoot,
    properties: ["openDirectory"] as Array<"openDirectory">
  };
  const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  if (!(await isAllowedAgentScopeOperationPath(result.filePaths[0]))) {
    throw new Error("Import planning is limited to AgentScope backup directories.");
  }
  const core = await loadCore();
  return core.planSessionImport(result.filePaths[0]);
});

process.on("uncaughtException", (error) => {
  log(`uncaughtException ${error.stack ?? error.message}`);
});

process.on("unhandledRejection", (reason) => {
  log(`unhandledRejection ${reason instanceof Error ? reason.stack ?? reason.message : String(reason)}`);
});

log("main module loaded");
void bootstrap();

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});

async function bootstrap(): Promise<void> {
  await app.whenReady();
  log(`app ready packaged=${app.isPackaged} appPath=${app.getAppPath()} dirname=${__dirname}`);
  await createWindow().catch((error: unknown) => {
    log(`createWindow failed ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  });
}

function preloadPath(): string {
  return app.isPackaged ? path.join(app.getAppPath(), "src", "preload", "preload.cjs") : path.join(__dirname, "..", "..", "src", "preload", "preload.cjs");
}

function rendererIndexPath(): string {
  return app.isPackaged ? path.join(app.getAppPath(), "dist", "renderer", "index.html") : path.join(__dirname, "..", "renderer", "index.html");
}

async function loadCore(): Promise<typeof AgentScopeCore> {
  corePromise ??= import("@agentscope/core");
  return corePromise;
}

async function buildSnapshot(): Promise<ScopeSnapshot> {
  try {
    const core = await loadCore();
    const snapshot = await core.buildSnapshot();
    lastCoreError = undefined;
    return snapshot;
  } catch (error) {
    log(`buildSnapshot failed ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    lastCoreError = error instanceof Error ? error.message : String(error);
    return { processes: [], sessions: [], transcripts: [], indexRecords: [], relations: [] };
  }
}

async function runDoctor() {
  try {
    const core = await loadCore();
    const checks = await core.runDoctor();
    return lastCoreError ? [{ name: "core.load", status: "warn" as const, detail: lastCoreError }, ...checks] : checks;
  } catch (error) {
    log(`runDoctor failed ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    lastCoreError = error instanceof Error ? error.message : String(error);
    return [{ name: "core.load", status: "warn" as const, detail: lastCoreError }];
  }
}

async function searchAll(query: string, home?: string, limit?: number) {
  try {
    const core = await loadCore();
    return core.searchAll(query, home, limit);
  } catch (error) {
    log(`searchAll failed ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    lastCoreError = error instanceof Error ? error.message : String(error);
    return [];
  }
}

async function exportSnapshot() {
  const filename = `AgentScope-snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const options = {
    title: "Export AgentScope Snapshot",
    defaultPath: path.join(app.getPath("documents"), filename),
    filters: [{ name: "JSON", extensions: ["json"] }]
  };
  const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return { canceled: true };
  const snapshot = await buildSnapshot();
  fs.writeFileSync(result.filePath, JSON.stringify(snapshot, null, 2), "utf8");
  return { canceled: false, path: result.filePath };
}

function appInfo() {
  const home = process.env.USERPROFILE || os.homedir();
  return {
    userData: app.getPath("userData"),
    locale: app.getLocale(),
    home,
    codexHome: path.join(home, ".codex"),
    claudeHome: path.join(home, ".claude"),
    githubUrl: "https://github.com/dwgx/AgentScope",
    actionsUrl: "https://github.com/dwgx/AgentScope/actions",
    issuesUrl: "https://github.com/dwgx/AgentScope/issues",
    readmeUrl: "https://github.com/dwgx/AgentScope#readme"
  };
}

async function listInstalledFonts(): Promise<string[]> {
  const script = [
    "Add-Type -AssemblyName System.Drawing",
    "$fonts = New-Object System.Drawing.Text.InstalledFontCollection",
    "$fonts.Families | ForEach-Object { $_.Name } | Sort-Object -Unique | ConvertTo-Json -Compress"
  ].join("; ");
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true, timeout: 6000, maxBuffer: 1024 * 1024 }
    );
    const parsed = JSON.parse(stdout.trim() || "[]") as unknown;
    const values = Array.isArray(parsed) ? parsed : typeof parsed === "string" ? [parsed] : [];
    return values.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  } catch (error) {
    log(`listInstalledFonts failed ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

function isAllowedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (parsed.hostname !== "github.com") return false;
    return parsed.pathname === "/dwgx/AgentScope" || parsed.pathname.startsWith("/dwgx/AgentScope/");
  } catch {
    return false;
  }
}

async function isAllowedLocalPath(targetPath: string): Promise<boolean> {
  const normalizedTarget = normalizeFsPath(targetPath);
  if (!normalizedTarget) return false;
  const allowedPaths = await allowedLocalPaths();
  return allowedPaths.includes(normalizedTarget);
}

async function allowedLocalPaths(): Promise<string[]> {
  const info = appInfo();
  const paths = new Set<string>();
  addAllowedPath(paths, info.userData);
  addAllowedPath(paths, info.codexHome);
  addAllowedPath(paths, info.claudeHome);
  addAllowedPath(paths, path.join(os.homedir(), ".agentscope"));
  addAllowedPath(paths, path.join(info.codexHome, "state_5.sqlite"));

  const snapshot = await buildSnapshot();
  for (const session of snapshot.sessions) {
    addAllowedPath(paths, session.path);
    addAllowedPath(paths, session.cwd);
    addAllowedPath(paths, session.transcriptPath);
    addEvidencePaths(paths, session.evidence);
  }
  for (const process of snapshot.processes) {
    addAllowedPath(paths, process.executablePath);
    addAllowedPath(paths, process.cwdHint);
    addEvidencePaths(paths, process.evidence);
    for (const candidate of process.sessionCandidates ?? []) {
      addAllowedPath(paths, candidate.cwd);
      addAllowedPath(paths, candidate.transcriptPath);
      addEvidencePaths(paths, candidate.reasons);
    }
  }
  for (const transcript of snapshot.transcripts) {
    addAllowedPath(paths, transcript.path);
    addAllowedPath(paths, transcript.cwd);
    addEvidencePaths(paths, transcript.evidence);
  }
  for (const record of snapshot.indexRecords) {
    addAllowedPath(paths, record.path);
    addAllowedPath(paths, record.cwd);
    addEvidencePaths(paths, record.evidence);
  }
  for (const relation of snapshot.relations) {
    addEvidencePaths(paths, relation.evidence);
  }
  return [...paths];
}

function addEvidencePaths(paths: Set<string>, evidence: Evidence[] | undefined): void {
  for (const item of evidence ?? []) {
    addAllowedPath(paths, item.path);
  }
}

function addAllowedPath(paths: Set<string>, candidate: string | undefined): void {
  const normalized = normalizeFsPath(candidate);
  if (normalized) paths.add(normalized);
}

function normalizeFsPath(candidate: string | undefined): string | undefined {
  if (!candidate) return undefined;
  try {
    return path.resolve(candidate.replace(/^\\\\\?\\/, "")).toLowerCase();
  } catch {
    return undefined;
  }
}

async function isAllowedAgentScopeOperationPath(targetPath: string): Promise<boolean> {
  const normalizedTarget = normalizeFsPath(targetPath);
  if (!normalizedTarget) return false;
  const operationRoots = [
    normalizeFsPath(path.join(os.homedir(), ".agentscope", "backups")),
    normalizeFsPath(path.join(app.getPath("userData"), "backups"))
  ].filter((item): item is string => !!item);
  return operationRoots.some((root) => normalizedTarget === root || normalizedTarget.startsWith(`${root}${path.sep}`));
}

function asAgent(value: string): "codex" | "claude" | undefined {
  return value === "codex" || value === "claude" ? value : undefined;
}


async function findProcess(snapshot: ScopeSnapshot, pid: number) {
  const core = await loadCore();
  return core.findProcess(snapshot, pid);
}

async function findSession(snapshot: ScopeSnapshot, sessionId: string) {
  const core = await loadCore();
  return core.findSession(snapshot, sessionId);
}

async function sessionsForPid(snapshot: ScopeSnapshot, pid: number) {
  const core = await loadCore();
  return core.sessionsForPid(snapshot, pid);
}

function log(message: string): void {
  try {
    const dir =
      app.isReady() && app.isPackaged ? app.getPath("userData") : path.join(process.env.APPDATA ?? process.cwd(), "AgentScope");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "agentscope-main.log"), `${new Date().toISOString()} ${message}\n`);
  } catch {
    // Logging must never prevent the desktop shell from opening.
  }
}
