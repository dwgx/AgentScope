import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import { execFile, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { app, BrowserWindow, dialog, ipcMain, session as electronSession, shell } from "electron";
import {
  formatCommandForDisplay,
  isSafeSessionId,
  resolveSessionLauncher,
  splitWindowsCommandLine,
  type LaunchFileCandidate,
  type SessionLaunchAction,
  type SessionLaunchContext,
  type SessionLaunchResult
} from "@agentscope/shared";
import type { CodexControlMutationRequest, CodexModeConfigPatch, Evidence, ScopeSnapshot } from "@agentscope/shared";
import type * as AgentScopeCore from "@agentscope/core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "development" || process.env.VITE_DEV_SERVER_URL;
const isSmoke = process.env.AGENTSCOPE_SMOKE === "1" || process.argv.includes("--agentscope-smoke");
const isVisibleSmoke = isSmoke && process.env.AGENTSCOPE_SMOKE_VISIBLE === "1";
const execFileAsync = promisify(execFile);

let mainWindow: BrowserWindow | undefined;
let corePromise: Promise<typeof AgentScopeCore> | undefined;
let lastCoreError: string | undefined;
let controlMode: "safe" | "readOnly" = "safe";

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 860,
    minWidth: 1040,
    minHeight: 680,
    title: "AgentScope",
    autoHideMenuBar: true,
    backgroundColor: "#f7f5f0",
    show: !isSmoke || isVisibleSmoke,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: isSmoke && !isVisibleSmoke
    }
  });
  log("browser window created");
  mainWindow.setMenuBarVisibility(false);

  const showWindow = (): void => {
    if (isSmoke && !isVisibleSmoke) return;
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
    queueSmokeScreenshot();
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
    await mainWindow.loadFile(
      rendererIndexPath(),
      isSmoke
        ? {
            query: {
              agentscopeSmoke: "1",
              view: process.env.AGENTSCOPE_SMOKE_VIEW ?? "",
              settingsSection: process.env.AGENTSCOPE_SMOKE_SETTINGS_SECTION ?? "",
              codexControlTab: process.env.AGENTSCOPE_SMOKE_CODEX_CONTROL_TAB ?? ""
            }
          }
        : undefined
    );
  }
}

function queueSmokeScreenshot(): void {
  const screenshotPath = process.env.AGENTSCOPE_SMOKE_SCREENSHOT;
  if (!isSmoke || !screenshotPath || !mainWindow) return;
  const delayMs = Math.max(500, Number(process.env.AGENTSCOPE_SMOKE_SCREENSHOT_DELAY_MS ?? 5000));
  setTimeout(() => {
    const windowRef = mainWindow;
    if (!windowRef || windowRef.isDestroyed()) return;
    void windowRef.webContents
      .capturePage()
      .then(async (image) => {
        await fs.promises.mkdir(path.dirname(screenshotPath), { recursive: true });
        await fs.promises.writeFile(screenshotPath, image.toPNG());
        log(`smoke screenshot saved ${screenshotPath}`);
      })
      .catch((error: unknown) => {
        log(`smoke screenshot failed ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
      })
      .finally(() => {
        if (process.env.AGENTSCOPE_SMOKE_QUIT_AFTER_SCREENSHOT === "1") app.quit();
      });
  }, delayMs);
}

ipcMain.handle("snapshot:get", async () => timedIpc("snapshot:get", buildSnapshot));
ipcMain.handle("doctor:get", async () => timedIpc("doctor:get", runDoctor));
ipcMain.handle("search:run", async (_event, query: string, limit = 50, options?: { includeSqlitePreview?: boolean }) =>
  searchAll(query, undefined, limit, {
    includeSqlitePreview: options?.includeSqlitePreview === true
  })
);
ipcMain.handle("snapshot:export", async () => exportSnapshot());
ipcMain.handle("app:info", async () => appInfo());
ipcMain.handle("app:setControlMode", async (_event, mode: string) => {
  if (mode !== "safe" && mode !== "readOnly") throw new Error("Unsupported AgentScope control mode.");
  if (mode === "safe" && controlMode === "readOnly" && !(await confirmControlModeSafe())) {
    return { controlMode };
  }
  controlMode = mode;
  return { controlMode };
});
ipcMain.handle("fonts:list", async () => listInstalledFonts());
ipcMain.handle("codexControl:list", async () => {
  const core = await loadCore();
  return core.listCodexControlSurfaces();
});
ipcMain.handle("codexControl:center", async () => {
  const core = await loadCore();
  return core.getCodexControlCenterSnapshot();
});
ipcMain.handle("codexControl:read", async (_event, id: string) => {
  const core = await loadCore();
  return core.readCodexControlDocument(id);
});
ipcMain.handle("codexControl:save", async (_event, id: string, content: string, expectedSha256: string) => {
  assertWriteControlAllowed("Codex control save");
  const core = await loadCore();
  return core.saveCodexControlDocument(id, content, expectedSha256);
});
ipcMain.handle("codexControl:readModes", async () => {
  const core = await loadCore();
  return core.readCodexModeConfig();
});
ipcMain.handle("codexControl:saveModes", async (_event, patch: CodexModeConfigPatch, expectedSha256: string) => {
  assertWriteControlAllowed("Codex mode save");
  const core = await loadCore();
  return core.saveCodexModeConfig(patch, expectedSha256);
});
ipcMain.handle("codexControl:planMutation", async (_event, request: CodexControlMutationRequest) => {
  const core = await loadCore();
  return core.planCodexControlMutation(validateCodexControlMutationRequest(request));
});
ipcMain.handle("codexControl:executeMutation", async (_event, request: CodexControlMutationRequest) => {
  assertWriteControlAllowed("Codex control mutation");
  const core = await loadCore();
  return core.executeCodexControlMutation(validateCodexControlMutationRequest(request));
});
ipcMain.handle("app:reload", async () => {
  mainWindow?.reload();
  return true;
});
ipcMain.handle("app:quit", async () => {
  app.quit();
  return true;
});
ipcMain.handle("app:clearCache", async () => {
  return clearAppCache();
});
ipcMain.handle("shell:openExternal", async (_event, url: string) => {
  if (!isAllowedExternalUrl(url)) return false;
  await shell.openExternal(url);
  return true;
});
ipcMain.handle("shell:openPath", async (_event, targetPath: string) => {
  if (!(await isAllowedLocalPath(targetPath))) return "Path is not in AgentScope's local trace allowlist";
  if (!fs.existsSync(targetPath)) return "Path does not exist";
  if (!isAllowedOpenPath(targetPath)) return "Path can only be revealed, not opened by AgentScope";
  return shell.openPath(targetPath);
});
ipcMain.handle("shell:revealPath", async (_event, targetPath: string) => {
  if (!(await isAllowedLocalPath(targetPath))) return "Path is not in AgentScope's local trace allowlist";
  if (!fs.existsSync(targetPath)) return "Path does not exist";
  shell.showItemInFolder(targetPath);
  return "";
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
ipcMain.handle("diagnostic:repair", async (_event, name: string) => {
  assertWriteControlAllowed("Diagnostic repair");
  if (isNativeSqliteDiagnostic(name) && !(await confirmNativeSqliteRepair(name))) {
    return {
      ok: false,
      name,
      message: "Diagnostic repair was canceled before running npm run package.",
      directories: [],
      files: []
    };
  }
  return repairDiagnostic(name);
});
ipcMain.handle("session:backup", async (_event, agent: string, sessionId: string) => {
  assertWriteControlAllowed("Session backup");
  const core = await loadCore();
  return core.backupSession(sessionId, asAgent(agent));
});
ipcMain.handle("session:delete", async (_event, agent: string, sessionId: string, createdAt?: string) => {
  assertWriteControlAllowed("Session delete");
  const core = await loadCore();
  return core.deleteSession(sessionId, asAgent(agent), createdAt ? { now: new Date(createdAt) } : undefined);
});
ipcMain.handle("session:launch", async (_event, agent: string, sessionId: string, action: string, context?: SessionLaunchContext) => {
  assertWriteControlAllowed("Session launch");
  return launchSessionCommand(agent, sessionId, action, context);
});
ipcMain.handle("session:import", async (_event, backupDir: string) => {
  assertWriteControlAllowed("Session import");
  if (await isAllowedAgentScopeQuarantinePath(backupDir)) {
    const core = await loadCore();
    return core.restoreQuarantinedSession(backupDir);
  }
  if (!(await isAllowedAgentScopeBackupPath(backupDir))) {
    throw new Error("Import is limited to AgentScope backup directories.");
  }
  const core = await loadCore();
  return core.importSessionBackup(backupDir);
});
ipcMain.handle("session:listQuarantine", async () => {
  const core = await loadCore();
  return timedIpc("session:listQuarantine", () => core.listQuarantinedSessions());
});
ipcMain.handle("session:restore", async (_event, quarantineDirOrJournalPath: string) => {
  assertWriteControlAllowed("Session restore");
  if (!(await isAllowedAgentScopeQuarantinePath(quarantineDirOrJournalPath))) {
    throw new Error("Restore is limited to AgentScope quarantine directories.");
  }
  const core = await loadCore();
  return core.restoreQuarantinedSession(quarantineDirOrJournalPath);
});
ipcMain.handle("session:deletePlan", async (_event, agent: string, sessionId: string) => {
  assertWriteControlAllowed("Session delete plan");
  const core = await loadCore();
  return core.writeSessionDeletePlan(sessionId, asAgent(agent));
});
ipcMain.handle("session:importPlan", async (_event, backupDir: string) => {
  assertWriteControlAllowed("Session import plan");
  if (await isAllowedAgentScopeQuarantinePath(backupDir)) {
    const core = await loadCore();
    return core.planSessionRestore(backupDir);
  }
  if (!(await isAllowedAgentScopeBackupPath(backupDir))) {
    throw new Error("Import planning is limited to AgentScope backup directories.");
  }
  const core = await loadCore();
  return core.planSessionImport(backupDir);
});
ipcMain.handle("session:chooseImportPlan", async () => {
  assertWriteControlAllowed("Session import plan");
  const backupRoot = path.join(os.homedir(), ".agentscope", "backups");
  await fs.promises.mkdir(backupRoot, { recursive: true });
  const options = {
    title: "Choose AgentScope backup directory",
    defaultPath: backupRoot,
    properties: ["openDirectory"] as Array<"openDirectory">
  };
  const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  if (await isAllowedAgentScopeQuarantinePath(result.filePaths[0])) {
    const core = await loadCore();
    return core.planSessionRestore(result.filePaths[0]);
  }
  if (!(await isAllowedAgentScopeBackupPath(result.filePaths[0]))) {
    throw new Error("Import planning is limited to AgentScope backup directories.");
  }
  const core = await loadCore();
  return core.planSessionImport(result.filePaths[0]);
});
ipcMain.handle("session:chooseImport", async () => {
  assertWriteControlAllowed("Session import");
  const agentScopeRoot = path.join(os.homedir(), ".agentscope");
  const backupRoot = path.join(agentScopeRoot, "backups");
  await fs.promises.mkdir(backupRoot, { recursive: true });
  const options = {
    title: "Choose AgentScope backup or quarantine directory",
    defaultPath: agentScopeRoot,
    properties: ["openDirectory"] as Array<"openDirectory">
  };
  const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  if (await isAllowedAgentScopeQuarantinePath(result.filePaths[0])) {
    const core = await loadCore();
    return core.restoreQuarantinedSession(result.filePaths[0]);
  }
  if (!(await isAllowedAgentScopeBackupPath(result.filePaths[0]))) {
    throw new Error("Import is limited to AgentScope backup directories.");
  }
  const core = await loadCore();
  return core.importSessionBackup(result.filePaths[0]);
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

async function timedIpc<T>(name: string, action: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  log(`${name} start`);
  try {
    const result = await action();
    log(`${name} ok ${Date.now() - startedAt}ms ${ipcResultSummary(result)}`);
    return result;
  } catch (error) {
    log(`${name} failed ${Date.now() - startedAt}ms ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    throw error;
  }
}

function ipcResultSummary(value: unknown): string {
  if (Array.isArray(value)) return `array=${value.length}`;
  if (value && typeof value === "object") {
    const snapshot = value as Partial<ScopeSnapshot>;
    if (Array.isArray(snapshot.processes) || Array.isArray(snapshot.sessions)) {
      return `processes=${snapshot.processes?.length ?? 0} sessions=${snapshot.sessions?.length ?? 0} relations=${snapshot.relations?.length ?? 0}`;
    }
  }
  return "";
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

async function searchAll(query: string, home?: string, limit?: number, options?: { includeSqlitePreview?: boolean }) {
  try {
    const core = await loadCore();
    return core.searchAll(query, home, limit, options);
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
  if (allowedPaths.includes(normalizedTarget)) return true;
  return allowedLocalPathPrefixes().some(
    (root) => normalizedTarget === root || normalizedTarget.startsWith(`${root}${path.sep}`)
  );
}

function allowedLocalPathPrefixes(): string[] {
  const info = appInfo();
  return [
    normalizeFsPath(info.userData),
    normalizeFsPath(path.join(os.homedir(), ".agentscope"))
  ].filter((item): item is string => !!item);
}

function isAllowedOpenPath(targetPath: string): boolean {
  if (isSensitiveAgentPath(targetPath)) return false;
  try {
    const stat = fs.statSync(targetPath);
    if (!stat.isFile()) return false;
  } catch {
    return false;
  }
  const ext = path.extname(targetPath).toLowerCase();
  if ([".exe", ".cmd", ".bat", ".ps1", ".msi", ".dll", ".node", ".sqlite", ".db"].includes(ext)) return false;
  return [".json", ".jsonl", ".txt", ".md", ".log"].includes(ext);
}

async function allowedLocalPaths(): Promise<string[]> {
  const info = appInfo();
  const paths = new Set<string>();
  addAllowedPath(paths, info.userData);
  addAllowedPath(paths, path.join(os.homedir(), ".agentscope"));
  addAllowedPath(paths, info.codexHome);
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
  if (normalized && !isSensitiveAgentPath(normalized)) paths.add(normalized);
}

function isSensitiveAgentPath(candidate: string | undefined): boolean {
  const normalized = normalizeFsPath(candidate);
  if (!normalized) return false;
  const parts = normalized.split(/[\\/]+/);
  if (!parts.some((part) => part === ".codex" || part === ".claude" || part === ".agentscope")) return false;
  const basename = path.basename(normalized).toLowerCase();
  if (["auth", ".auth", "credentials", ".credentials", "plugins", "skills", "rules"].some((part) => parts.includes(part))) return true;
  if (/^(?:\.?credentials?|auth|settings(?:\.local)?|config)\.(?:json|toml)$/i.test(basename)) return true;
  if (basename === ".claude.json" || basename === "history.jsonl") return true;
  return false;
}

function normalizeFsPath(candidate: string | undefined): string | undefined {
  if (!candidate) return undefined;
  try {
    return path.resolve(candidate.replace(/^\\\\\?\\/, "")).toLowerCase();
  } catch {
    return undefined;
  }
}

async function isAllowedAgentScopeBackupPath(targetPath: string): Promise<boolean> {
  return isAllowedAgentScopeOperationPath(targetPath, "backups");
}

async function isAllowedAgentScopeQuarantinePath(targetPath: string): Promise<boolean> {
  return isAllowedAgentScopeOperationPath(targetPath, "quarantine");
}

async function isAllowedAgentScopeOperationPath(targetPath: string, child: "backups" | "quarantine"): Promise<boolean> {
  const normalizedTarget = normalizeFsPath(targetPath);
  if (!normalizedTarget) return false;
  const operationRoots = [
    normalizeFsPath(path.join(os.homedir(), ".agentscope", child)),
    normalizeFsPath(path.join(app.getPath("userData"), child))
  ].filter((item): item is string => !!item);
  return operationRoots.some((root) => normalizedTarget === root || normalizedTarget.startsWith(`${root}${path.sep}`));
}

async function clearAppCache(): Promise<{ ok: true; directories: string[]; files: string[] }> {
  await electronSession.defaultSession.clearCache();
  const userData = app.getPath("userData");
  return {
    ok: true,
    directories: [
      path.join(userData, "Cache"),
      path.join(userData, "Code Cache"),
      path.join(userData, "GPUCache")
    ],
    files: []
  };
}

async function repairDiagnostic(name: string): Promise<{
  ok: boolean;
  name: string;
  message: string;
  directories: string[];
  files: string[];
  restartRequired?: boolean;
}> {
  if (!isNativeSqliteDiagnostic(name)) {
    return {
      ok: false,
      name,
      message: "No automatic repair is registered for this diagnostic.",
      directories: [],
      files: []
    };
  }
  const root = findWorkspaceRoot();
  if (!root) {
    return {
      ok: false,
      name,
      message: "Cannot find AgentScope workspace root for native rebuild.",
      directories: [],
      files: []
    };
  }
  try {
    await execNpm(["run", "package"], root, 420000);
    const desktopOut = path.join(root, "apps", "desktop", "out", "win-unpacked");
    return {
      ok: true,
      name,
      message: "Rebuilt the unpacked desktop app and native better-sqlite3 module. Restart AgentScope to load the repaired native module.",
      directories: [
        desktopOut,
        path.join(desktopOut, "resources", "app.asar.unpacked", "node_modules", "better-sqlite3")
      ],
      files: [
        path.join(desktopOut, "resources", "app.asar.unpacked", "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node")
      ],
      restartRequired: true
    };
  } catch (error) {
    return {
      ok: false,
      name,
      message: error instanceof Error ? error.message : String(error),
      directories: [root],
      files: []
    };
  }
}

async function confirmNativeSqliteRepair(name: string): Promise<boolean> {
  const root = findWorkspaceRoot();
  const options = {
    type: "warning" as const,
    buttons: ["Cancel", "Run repair"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: "Confirm AgentScope diagnostic repair",
    message: "Run native SQLite repair?",
    detail: [
      `Diagnostic: ${name}`,
      "Command: npm run package",
      `Workspace: ${root ?? "not found yet"}`,
      "This rebuilds the unpacked desktop app and native better-sqlite3 module. It will not read session transcripts, credentials, or hidden reasoning."
    ].join("\n")
  };
  const result = mainWindow ? await dialog.showMessageBox(mainWindow, options) : await dialog.showMessageBox(options);
  return result.response === 1;
}

async function confirmControlModeSafe(): Promise<boolean> {
  const options = {
    type: "warning" as const,
    buttons: ["Stay read-only", "Enable safe controls"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: "Confirm AgentScope control mode",
    message: "Enable AgentScope safe controls?",
    detail: [
      "Safe mode allows AgentScope to write allowlisted Codex config files, create backups, delete sessions through backup/quarantine/journal, restore quarantine entries, import AgentScope backups, launch resume/fork commands, and run confirmed diagnostic repair.",
      "Read-only mode keeps these actions blocked in the main process."
    ].join("\n")
  };
  const result = mainWindow ? await dialog.showMessageBox(mainWindow, options) : await dialog.showMessageBox(options);
  return result.response === 1;
}

async function launchSessionCommand(
  agentValue: string,
  sessionId: string,
  action: string,
  context?: SessionLaunchContext
): Promise<SessionLaunchResult> {
  const agent = asAgent(agentValue);
  if (!agent) throw new Error("Unsupported agent for session launch.");
  if (action !== "resume" && action !== "fork") throw new Error("Unsupported session launch action.");
  if (!isSafeSessionId(sessionId)) throw new Error("Session id contains unsupported characters.");
  const workingDirectory = context?.cwd && await isAllowedLocalPath(context.cwd) && fs.existsSync(context.cwd) ? context.cwd : undefined;
  const snapshot = await buildSnapshot();
  const resolution = resolveSessionLauncher(agent, action as SessionLaunchAction, sessionId, await launchResolverEnvironment(snapshot), context);
  assertLaunchResolutionSafe(resolution.filePath);
  const child = spawn(resolution.filePath, resolution.args, {
    cwd: workingDirectory,
    detached: true,
    windowsHide: false,
    stdio: "ignore"
  });
  await waitForLaunchAccepted(child);
  child.unref();
  return {
    ok: true,
    ...resolution,
    command: formatCommandForDisplay(resolution.filePath, resolution.args),
    ...(workingDirectory ? { cwd: workingDirectory } : {})
  };
}

function assertLaunchResolutionSafe(filePath: string): void {
  if (!fs.existsSync(filePath)) throw new Error("Resolved launcher does not exist.");
  const ext = path.extname(filePath).toLowerCase();
  if ([".ps1", ".bat"].includes(ext)) throw new Error("Refusing to launch script entrypoints.");
  if (![".exe", ".cmd"].includes(ext)) throw new Error("Resolved launcher must be an executable or cmd shim.");
}

async function waitForLaunchAccepted(child: ChildProcess): Promise<void> {
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

async function launchResolverEnvironment(snapshot: ScopeSnapshot) {
  const existingFiles = new Set<string>();
  const candidates: Record<string, LaunchFileCandidate[]> = {};
  const addFile = (candidate: string | undefined) => {
    if (!candidate) return;
    if (!fs.existsSync(candidate)) return;
    existingFiles.add(path.resolve(candidate).toLowerCase());
  };
  const addCandidates = async (command: string) => {
    candidates[command] = (await whereCommand(command)).filter((candidate) => isTrustedWhereLauncher(command, candidate.path));
    for (const candidate of candidates[command] ?? []) addFile(candidate.path);
  };
  const addDirectCandidate = (command: string, candidatePath: string | undefined, source: string) => {
    if (!candidatePath || !fs.existsSync(candidatePath)) return;
    const list = candidates[command] ?? [];
    list.push({
      path: candidatePath,
      source,
      evidence: [{ source: "launcher.wellKnown", detail: source, path: candidatePath }]
    });
    candidates[command] = list;
    addFile(candidatePath);
  };
  for (const item of snapshot.processes) {
    addFile(item.executablePath);
    for (const arg of item.commandLine ? splitWindowsCommandLine(item.commandLine) : []) {
      if (/\.js$/i.test(arg)) addFile(arg);
    }
  }
  addFile(process.env.APPDATA ? path.join(process.env.APPDATA, "npm", "node_modules", "@openai", "codex", "bin", "codex.js") : undefined);
  addFile(process.env.ProgramFiles ? path.join(process.env.ProgramFiles, "nodejs", "node.exe") : undefined);
  addFile(process.env["ProgramFiles(x86)"] ? path.join(process.env["ProgramFiles(x86)"], "nodejs", "node.exe") : undefined);
  await Promise.all(["node.exe", "codex.cmd", "codex.exe", "claude.cmd", "claude.exe"].map(addCandidates));
  const npmBin = process.env.APPDATA ? path.join(process.env.APPDATA, "npm") : undefined;
  addDirectCandidate("codex.cmd", npmBin ? path.join(npmBin, "codex.cmd") : undefined, "appdata.npm.codexCmd");
  addDirectCandidate("codex.exe", npmBin ? path.join(npmBin, "codex.exe") : undefined, "appdata.npm.codexExe");
  addDirectCandidate("claude.cmd", npmBin ? path.join(npmBin, "claude.cmd") : undefined, "appdata.npm.claudeCmd");
  addDirectCandidate("claude.exe", npmBin ? path.join(npmBin, "claude.exe") : undefined, "appdata.npm.claudeExe");
  return {
    homeDir: os.homedir(),
    ...(process.env.APPDATA ? { appDataDir: process.env.APPDATA } : {}),
    ...(process.env.ProgramFiles ? { programFilesDir: process.env.ProgramFiles } : {}),
    ...(process.env["ProgramFiles(x86)"] ? { programFilesX86Dir: process.env["ProgramFiles(x86)"] } : {}),
    pathCandidates: candidates,
    existingFiles,
    processes: snapshot.processes
  };
}

function isTrustedWhereLauncher(command: string, candidatePath: string): boolean {
  const normalized = normalizeFsPath(candidatePath);
  if (!normalized) return false;
  const appDataNpm = process.env.APPDATA ? normalizeFsPath(path.join(process.env.APPDATA, "npm")) : undefined;
  const programFilesNode = process.env.ProgramFiles ? normalizeFsPath(path.join(process.env.ProgramFiles, "nodejs")) : undefined;
  const programFilesX86Node = process.env["ProgramFiles(x86)"] ? normalizeFsPath(path.join(process.env["ProgramFiles(x86)"], "nodejs")) : undefined;
  if (command.toLowerCase() === "node.exe") {
    return [programFilesNode, programFilesX86Node].some((root) => !!root && (normalized === root || normalized.startsWith(`${root}${path.sep}`)));
  }
  if (/^(?:codex|claude)\.(?:cmd|exe)$/i.test(command)) {
    return !!appDataNpm && (normalized === appDataNpm || normalized.startsWith(`${appDataNpm}${path.sep}`));
  }
  return false;
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

function isNativeSqliteDiagnostic(name: string): boolean {
  return [
    "native.better_sqlite3",
    "codex.sqlite.readable",
    "codex.logs.tables",
    "codex.goals.tables",
    "codex.memories.tables"
  ].includes(name);
}

function findWorkspaceRoot(): string | undefined {
  for (const start of [process.cwd(), app.getAppPath(), __dirname]) {
    let current = normalizeCandidateDir(start);
    for (let depth = 0; current && depth < 8; depth += 1) {
      if (fs.existsSync(path.join(current, "package.json")) && fs.existsSync(path.join(current, "apps", "desktop", "package.json"))) {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return undefined;
}

function normalizeCandidateDir(candidate: string): string {
  const cleaned = candidate.replace(/^\\\\\?\\/, "").replace(/\.asar($|\\.*$)/, "");
  return fs.existsSync(cleaned) && fs.statSync(cleaned).isFile() ? path.dirname(cleaned) : cleaned;
}

function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

async function execNpm(args: string[], cwd: string, timeout: number): Promise<void> {
  const command = process.platform === "win32" ? "cmd.exe" : npmCommand();
  const commandArgs =
    process.platform === "win32" ? ["/d", "/s", "/c", [npmCommand(), ...args].join(" ")] : args;
  await execFileAsync(command, commandArgs, {
    cwd,
    windowsHide: true,
    timeout,
    maxBuffer: 24 * 1024 * 1024
  });
}

function asAgent(value: string): "codex" | "claude" | undefined {
  return value === "codex" || value === "claude" ? value : undefined;
}

function validateCodexControlMutationRequest(value: unknown): CodexControlMutationRequest {
  if (!value || typeof value !== "object") throw new Error("Invalid Codex control mutation request.");
  const request = value as Partial<CodexControlMutationRequest>;
  if (typeof request.expectedSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(request.expectedSha256)) {
    throw new Error("Invalid Codex control expected sha256.");
  }
  if (!Array.isArray(request.mutations) || request.mutations.length < 1 || request.mutations.length > 32) {
    throw new Error("Invalid Codex control mutation count.");
  }
  const mutations = request.mutations.map((mutation) => {
    if (!mutation || typeof mutation !== "object") throw new Error("Invalid Codex control mutation.");
    const item = mutation as unknown as Record<string, unknown>;
    const itemId = typeof item.itemId === "string" ? item.itemId : "";
    const keyPath = typeof item.keyPath === "string" ? item.keyPath : "";
    if (!/^[A-Za-z0-9_.:-]{1,120}$/.test(itemId)) throw new Error("Invalid Codex control mutation item id.");
    if (!/^[A-Za-z0-9_.-]{1,120}$/.test(keyPath)) throw new Error("Invalid Codex control mutation key path.");
    const rawValue = item.value;
    if (
      rawValue !== null &&
      typeof rawValue !== "string" &&
      typeof rawValue !== "number" &&
      typeof rawValue !== "boolean"
    ) {
      throw new Error("Invalid Codex control mutation value.");
    }
    if (typeof rawValue === "string" && rawValue.length > 200) {
      throw new Error("Codex control mutation value is too long.");
    }
    if (typeof rawValue === "number" && !Number.isFinite(rawValue)) {
      throw new Error("Codex control mutation number must be finite.");
    }
    return { itemId, keyPath, value: rawValue };
  });
  return {
    expectedSha256: request.expectedSha256,
    confirmedHighRisk: request.confirmedHighRisk === true,
    mutations
  };
}

function assertWriteControlAllowed(action: string): void {
  if (controlMode !== "safe") {
    throw new Error(`${action} is blocked because AgentScope control mode is read-only.`);
  }
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
