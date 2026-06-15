import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { app, BrowserWindow, dialog, ipcMain, session as electronSession, shell } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import {
  isSafeSessionId,
  type SessionLaunchAction,
  type SessionLaunchContext,
  type SessionLaunchResolution,
  type SessionLaunchResult
} from "@agentscope/shared";
import type { AgentProcess, CodexControlMutationRequest, CodexModeConfigPatch, Evidence, IndexRecord, Relation, ScopeSnapshot } from "@agentscope/shared";
import type * as AgentScopeCore from "@agentscope/core";
import { runIpcNegativeSmoke } from "./ipcNegativeSmoke.js";
import { launchResult, resolveLaunchCommand, waitForLaunchAccepted } from "./launcherRuntime.js";
import { assertTrustedIpcSender, isSafeOperationPath } from "./security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "development" || process.env.VITE_DEV_SERVER_URL;
const isSmoke = process.env.AGENTSCOPE_SMOKE === "1" || process.argv.includes("--agentscope-smoke");
const isVisibleSmoke = isSmoke && process.env.AGENTSCOPE_SMOKE_VISIBLE === "1";
const smokeUserData = isSmoke ? process.env.AGENTSCOPE_SMOKE_USER_DATA?.trim() : undefined;
const execFileAsync = promisify(execFile);
let mainWindow: BrowserWindow | undefined;
let corePromise: Promise<typeof AgentScopeCore> | undefined;
let lastCoreError: string | undefined;
let controlMode: "safe" | "readOnly" = "safe";
const openedTextArtifacts = new Set<string>();
const highRiskCodexControlConfirmations = new Map<string, { signature: string; expiresAt: number }>();
const registeredIpcChannels = new Set<string>();

if (smokeUserData) {
  app.setPath("userData", path.resolve(smokeUserData));
}

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
              codexControlTab: process.env.AGENTSCOPE_SMOKE_CODEX_CONTROL_TAB ?? "",
              language: process.env.AGENTSCOPE_SMOKE_LANGUAGE ?? ""
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

function handleTrustedIpc<Result>(
  channel: string,
  listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => Result | Promise<Result>
): void {
  registeredIpcChannels.add(channel);
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    assertTrustedIpcSender(event, {
      mainWindow,
      isDev: !!isDev,
      devServerUrl: process.env.VITE_DEV_SERVER_URL,
      rendererIndexPath: rendererIndexPath()
    });
    return listener(event, ...args);
  });
}

handleTrustedIpc("snapshot:get", async () => timedIpc("snapshot:get", buildSnapshot));
handleTrustedIpc("doctor:get", async () => timedIpc("doctor:get", runDoctor));
handleTrustedIpc("search:run", async (_event, query, limit = 50, options) =>
  searchAll(asString(query, "Search query"), undefined, asOptionalLimit(limit), {
    includeSqlitePreview: objectValue(options)?.includeSqlitePreview === true
  })
);
handleTrustedIpc("snapshot:export", async () => exportSnapshot());
handleTrustedIpc("app:info", async () => appInfo());
handleTrustedIpc("app:setControlMode", async (_event, mode) => {
  if (mode !== "safe" && mode !== "readOnly") throw new Error("Unsupported AgentScope control mode.");
  if (mode === "safe" && controlMode === "readOnly" && !(await confirmControlModeSafe())) {
    return { controlMode };
  }
  controlMode = mode;
  return { controlMode };
});
handleTrustedIpc("fonts:list", async () => listInstalledFonts());
handleTrustedIpc("codexControl:list", async () => {
  const core = await loadCore();
  return core.listCodexControlSurfaces();
});
handleTrustedIpc("codexControl:center", async () => {
  const core = await loadCore();
  return core.getCodexControlCenterSnapshot();
});
handleTrustedIpc("codexControl:read", async (_event, id) => {
  const core = await loadCore();
  return core.readCodexControlDocument(asString(id, "Codex control document id"));
});
handleTrustedIpc("codexControl:revealSurface", async (_event, id) => {
  const core = await loadCore();
  const result = await core.revealCodexControlSurface(validateCodexControlSurfaceId(id));
  if (!result.revealAllowed) return result;
  if (!fs.existsSync(result.path)) return { ...result, revealAllowed: false, reason: "Path does not exist" };
  if (!isSmokeNoShell()) shell.showItemInFolder(result.path);
  return result;
});
handleTrustedIpc("codexControl:save", async (_event, id, content, expectedSha256) => {
  assertWriteControlAllowed("Codex control save");
  const core = await loadCore();
  return core.saveCodexControlDocument(
    asString(id, "Codex control document id"),
    asString(content, "Codex control document content"),
    asSha256(expectedSha256)
  );
});
handleTrustedIpc("codexControl:readModes", async () => {
  const core = await loadCore();
  return core.readCodexModeConfig();
});
handleTrustedIpc("codexControl:saveModes", async (_event, patch, expectedSha256) => {
  assertWriteControlAllowed("Codex mode save");
  const core = await loadCore();
  return core.saveCodexModeConfig(patch as CodexModeConfigPatch, asSha256(expectedSha256));
});
handleTrustedIpc("codexControl:planMutation", async (_event, request) => {
  const core = await loadCore();
  const validated = validateCodexControlMutationRequest(request);
  const unconfirmedPlan = await core.planCodexControlMutation({
    ...validated,
    confirmedHighRisk: false,
    highRiskConfirmationToken: undefined
  });
  if (unconfirmedPlan.highRisk && validated.confirmedHighRisk) {
    const confirmedPlan = await core.planCodexControlMutation({
      ...validated,
      confirmedHighRisk: true,
      highRiskConfirmationToken: undefined
    });
    if (confirmedPlan.blockers.length > 0) return confirmedPlan;
    if (!(await confirmHighRiskCodexControlMutation(confirmedPlan.changedKeys, confirmedPlan.warnings))) {
      return unconfirmedPlan;
    }
    return {
      ...confirmedPlan,
      highRiskConfirmationToken: createHighRiskCodexControlConfirmation(validated),
      blockers: []
    };
  }
  return unconfirmedPlan;
});
handleTrustedIpc("codexControl:executeMutation", async (_event, request) => {
  assertWriteControlAllowed("Codex control mutation");
  const core = await loadCore();
  const validated = validateCodexControlMutationRequest(request);
  const plan = await core.planCodexControlMutation(validated);
  if (plan.highRisk) {
    consumeHighRiskCodexControlConfirmation(validated);
    validated.confirmedHighRisk = true;
  }
  return core.executeCodexControlMutation(validated);
});
handleTrustedIpc("app:reload", async () => {
  mainWindow?.reload();
  return true;
});
handleTrustedIpc("app:quit", async () => {
  app.quit();
  return true;
});
handleTrustedIpc("app:clearCache", async () => {
  return clearAppCache();
});
handleTrustedIpc("shell:openExternal", async (_event, url) => {
  const safeUrl = asString(url, "External URL");
  if (!isAllowedExternalUrl(safeUrl)) return false;
  if (isSmokeNoShell()) return true;
  await shell.openExternal(safeUrl);
  return true;
});
handleTrustedIpc("shell:openPath", async (_event, targetPath) => {
  const safePath = asString(targetPath, "Path");
  if (!(await isAllowedLocalPath(safePath))) return "路径不在 AgentScope 本地 trace allowlist 中，只允许定位已识别的 Codex/Claude/AgentScope 元数据路径。";
  if (!fs.existsSync(safePath)) return "Path does not exist";
  if (!isAllowedOpenPath(safePath)) return "此路径只能在文件管理器中定位，AgentScope 不直接打开敏感正文、数据库、可执行文件或目录。";
  if (isSmokeNoShell()) return "";
  return shell.openPath(safePath);
});
handleTrustedIpc("shell:revealPath", async (_event, targetPath) => {
  const safePath = asString(targetPath, "Path");
  if (!(await isAllowedLocalPath(safePath))) return "路径不在 AgentScope 本地 trace allowlist 中，只允许定位已识别的 Codex/Claude/AgentScope 元数据路径。";
  if (!fs.existsSync(safePath)) return "Path does not exist";
  if (isSmokeNoShell()) return "";
  shell.showItemInFolder(safePath);
  return "";
});
handleTrustedIpc("inspect:pid", async (_event, pid) => {
  const safePid = asPid(pid);
  const snapshot = await buildSnapshot();
  return {
    process: await findProcess(snapshot, safePid),
    sessions: await sessionsForPid(snapshot, safePid)
  };
});
handleTrustedIpc("inspect:session", async (_event, sessionId) => {
  const safeSessionId = asString(sessionId, "Session id");
  const snapshot = await buildSnapshot();
  const session = await findSession(snapshot, safeSessionId);
  return {
    session,
    process: session?.pid === undefined ? undefined : await findProcess(snapshot, session.pid),
    relations: snapshot.relations.filter((relation: Relation) => relation.sourceId === safeSessionId || relation.targetId === safeSessionId),
    indexRecords: snapshot.indexRecords.filter((record: IndexRecord) => record.sessionId.toLowerCase() === safeSessionId.toLowerCase())
  };
});
handleTrustedIpc("diagnostic:repair", async (_event, name) => {
  const safeName = asString(name, "Diagnostic name");
  assertWriteControlAllowed("Diagnostic repair");
  if (isNativeSqliteDiagnostic(safeName) && !(await confirmNativeSqliteRepair(safeName))) {
    return {
      ok: false,
      name: safeName,
      message: "Diagnostic repair was canceled before running npm run package.",
      directories: [],
      files: []
    };
  }
  return repairDiagnostic(safeName);
});
handleTrustedIpc("session:backup", async (_event, agent, sessionId) => {
  assertWriteControlAllowed("Session backup");
  const core = await loadCore();
  return core.backupSession(asString(sessionId, "Session id"), asAgent(asString(agent, "Agent")));
});
handleTrustedIpc("session:delete", async (_event, agent, sessionId, createdAt, options) => {
  assertWriteControlAllowed("Session delete");
  const core = await loadCore();
  const safeCreatedAt = asOptionalString(createdAt, "Created-at timestamp");
  const deleteOptions = objectValue(options);
  const childMode = deleteOptions?.childMode;
  return core.deleteSession(
    asString(sessionId, "Session id"),
    asAgent(asString(agent, "Agent")),
    {
      ...(safeCreatedAt ? { now: new Date(safeCreatedAt) } : {}),
      ...(childMode === "includeChildren" || childMode === "detach" || childMode === "block" ? { childMode } : {})
    }
  );
});
handleTrustedIpc("session:launch", async (_event, agent, sessionId, action, context) => {
  assertWriteControlAllowed("Session launch");
  return launchSessionCommand(
    asString(agent, "Agent"),
    asString(sessionId, "Session id"),
    asString(action, "Session launch action"),
    context as SessionLaunchContext | undefined
  );
});
handleTrustedIpc("session:import", async (_event, backupDir) => {
  assertWriteControlAllowed("Session import");
  const safeBackupDir = asString(backupDir, "Backup directory");
  if (await isAllowedAgentScopeQuarantinePath(safeBackupDir)) {
    const core = await loadCore();
    return core.restoreQuarantinedSession(safeBackupDir);
  }
  if (!(await isAllowedAgentScopeBackupPath(safeBackupDir))) {
    throw new Error("Import is limited to AgentScope backup directories.");
  }
  const core = await loadCore();
  return core.importSessionBackup(safeBackupDir);
});
handleTrustedIpc("session:listQuarantine", async () => {
  const core = await loadCore();
  return timedIpc("session:listQuarantine", () => core.listQuarantinedSessions());
});
handleTrustedIpc("session:restore", async (_event, quarantineDirOrJournalPath) => {
  assertWriteControlAllowed("Session restore");
  const safeQuarantinePath = asString(quarantineDirOrJournalPath, "Quarantine path");
  if (!(await isAllowedAgentScopeQuarantinePath(safeQuarantinePath))) {
    throw new Error("Restore is limited to AgentScope quarantine directories.");
  }
  const core = await loadCore();
  return core.restoreQuarantinedSession(safeQuarantinePath);
});
handleTrustedIpc("session:deletePlan", async (_event, agent, sessionId) => {
  assertWriteControlAllowed("Session delete plan");
  const core = await loadCore();
  return core.writeSessionDeletePlan(asString(sessionId, "Session id"), asAgent(asString(agent, "Agent")));
});
handleTrustedIpc("session:importPlan", async (_event, backupDir) => {
  assertWriteControlAllowed("Session import plan");
  const safeBackupDir = asString(backupDir, "Backup directory");
  if (await isAllowedAgentScopeQuarantinePath(safeBackupDir)) {
    const core = await loadCore();
    return core.planSessionRestore(safeBackupDir);
  }
  if (!(await isAllowedAgentScopeBackupPath(safeBackupDir))) {
    throw new Error("Import planning is limited to AgentScope backup directories.");
  }
  const core = await loadCore();
  return core.planSessionImport(safeBackupDir);
});
handleTrustedIpc("session:chooseImportPlan", async () => {
  assertWriteControlAllowed("Session import plan");
  const backupRoot = path.join(agentScopeDataRoot(), "backups");
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
handleTrustedIpc("session:chooseImport", async () => {
  assertWriteControlAllowed("Session import");
  const agentScopeRoot = agentScopeDataRoot();
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

app.on("will-finish-launching", () => {
  log("app will-finish-launching");
});

app.on("ready", () => {
  log("app ready event");
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});

async function bootstrap(): Promise<void> {
  log("bootstrap start");
  await app.whenReady();
  log(`app ready packaged=${app.isPackaged} appPath=${app.getAppPath()} dirname=${__dirname}`);
  await createWindow().catch((error: unknown) => {
    log(`createWindow failed ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  });
  if (isSmoke && process.env.AGENTSCOPE_SMOKE_IPC_NEGATIVE === "1") {
    await runIpcNegativeSmoke({ app, appHome: appHome(), registeredIpcChannels }).catch((error: unknown) => {
      log(`ipc negative smoke failed ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
      app.exit(1);
    });
  }
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
    const includeProcesses = !(isSmoke && process.env.AGENTSCOPE_SMOKE_DISABLE_PROCESSES === "1");
    const includeRolloutActivity = process.env.AGENTSCOPE_INCLUDE_ROLLOUT_ACTIVITY === "1";
    const includeCodexLogMetadata = process.env.AGENTSCOPE_INCLUDE_CODEX_LOG_METADATA === "1";
    const processTimeoutMs = numberEnv("AGENTSCOPE_PROCESS_SCAN_TIMEOUT_MS", 5000);
    const snapshot = await core.buildSnapshot(undefined, {
      includeProcesses,
      includeRolloutActivity,
      includeCodexLogMetadata,
      processTimeoutMs,
      processProvider: smokeProcessProvider(core)
    });
    lastCoreError = undefined;
    for (const diagnostic of snapshot.diagnostics ?? []) {
      if (diagnostic.status === "warn") log(`snapshot diagnostic ${diagnostic.name}: ${diagnostic.detail}`);
    }
    return snapshot;
  } catch (error) {
    log(`buildSnapshot failed ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    lastCoreError = error instanceof Error ? error.message : String(error);
    return { processes: [], sessions: [], transcripts: [], indexRecords: [], relations: [] };
  }
}

function smokeProcessProvider(core: typeof AgentScopeCore): (() => Promise<AgentProcess[]>) | undefined {
  if (!isSmoke || process.env.AGENTSCOPE_SMOKE_PROCESS_TREE !== "1") return undefined;
  return async () => core.annotateProcessTree(syntheticSmokeProcesses());
}

function syntheticSmokeProcesses(): AgentProcess[] {
  const startedAt = "2026-06-12T00:00:00.000Z";
  const evidence: Evidence[] = [
    {
      source: "smoke.synthetic.process",
      detail: "Synthetic process tree used by desktop smoke; it does not read local Win32 processes.",
      field: "pid,ppid,processName,CommandLine"
    }
  ];
  return [
    {
      pid: 9100,
      ppid: 90,
      processName: "node.exe",
      executablePath: String.raw`C:\Program Files\nodejs\node.exe`,
      commandLine: String.raw`"node" "C:\Users\smoke\AppData\Roaming\npm\node_modules\@openai\codex\bin\codex.js"`,
      startTime: startedAt,
      windowTitle: "AgentScope smoke parent",
      agent: "codex",
      evidence: [...evidence]
    },
    {
      pid: 9110,
      ppid: 9100,
      processName: "codex.exe",
      executablePath: String.raw`C:\Users\smoke\AppData\Roaming\npm\node_modules\@openai\codex\node_modules\@openai\codex-win32-x64\vendor\x86_64-pc-windows-msvc\bin\codex.exe`,
      commandLine: String.raw`C:\Users\smoke\AppData\Roaming\npm\node_modules\@openai\codex\node_modules\@openai\codex-win32-x64\vendor\x86_64-pc-windows-msvc\bin\codex.exe`,
      startTime: startedAt,
      agent: "codex",
      evidence: [...evidence]
    },
    {
      pid: 9120,
      ppid: 9110,
      processName: "node_repl.exe",
      executablePath: String.raw`C:\Users\smoke\AppData\Local\OpenAI\Codex\bin\34ab3e1324cc55b5\node_repl.exe`,
      commandLine: String.raw`"C:\Users\smoke\AppData\Local\OpenAI\Codex\bin\34ab3e1324cc55b5\node_repl.exe"`,
      startTime: startedAt,
      agent: "codex",
      evidence: [...evidence]
    },
    {
      pid: 9130,
      ppid: 9120,
      processName: "codex.exe",
      executablePath: String.raw`C:\Users\smoke\AppData\Local\OpenAI\Codex\bin\fb2111b91430cb17\codex.exe`,
      commandLine: String.raw`"C:\Users\smoke\AppData\Local\OpenAI\Codex\bin\fb2111b91430cb17\codex.exe" app-server --listen stdio://`,
      startTime: startedAt,
      agent: "codex",
      evidence: [...evidence]
    },
    {
      pid: 9140,
      ppid: 9120,
      processName: "node.exe",
      executablePath: String.raw`C:\Program Files\nodejs\node.exe`,
      commandLine: String.raw`"C:\Program Files\nodejs\node.exe" C:\Users\smoke\.codex\mcp-node\node_modules\@playwright\mcp\cli.js --cdp-endpoint http://127.0.0.1:9222`,
      startTime: startedAt,
      agent: "unknown",
      evidence: [...evidence]
    },
    {
      pid: 9150,
      ppid: 9120,
      processName: "node.exe",
      executablePath: String.raw`C:\Users\smoke\AppData\Local\OpenAI\Codex\bin\5b9024f90663758b\node.exe`,
      commandLine: String.raw`"C:\Users\smoke\AppData\Local\OpenAI\Codex\bin\5b9024f90663758b\node.exe" --experimental-vm-modules C:\Temp\kernel.js --session-id smoke-runtime --working-dir "D:\AgentScopeSmoke\Workspace"`,
      startTime: startedAt,
      agent: "unknown",
      evidence: [...evidence]
    },
    {
      pid: 9160,
      ppid: 9110,
      processName: "ida-pro-mcp.exe",
      executablePath: String.raw`C:\Users\smoke\.local\bin\ida-pro-mcp.exe`,
      commandLine: String.raw`"C:\Users\smoke\.local\bin\ida-pro-mcp.exe"`,
      startTime: startedAt,
      agent: "unknown",
      evidence: [...evidence]
    },
    {
      pid: 9170,
      ppid: 9160,
      processName: "python.exe",
      executablePath: String.raw`C:\Users\smoke\AppData\Roaming\uv\tools\ida-pro-mcp\Scripts\python.exe`,
      commandLine: String.raw`"C:\Users\smoke\AppData\Roaming\uv\tools\ida-pro-mcp\Scripts\python.exe" "C:\Users\smoke\.local\bin\ida-pro-mcp.exe"`,
      startTime: startedAt,
      agent: "unknown",
      evidence: [...evidence]
    }
  ];
}

function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
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
  fs.writeFileSync(result.filePath, JSON.stringify(redactSnapshotForExport(snapshot), null, 2), "utf8");
  const normalized = normalizeFsPath(result.filePath);
  if (normalized) openedTextArtifacts.add(normalized);
  return { canceled: false, path: result.filePath };
}

function appInfo() {
  const home = appHome();
  return {
    userData: app.getPath("userData"),
    locale: app.getLocale(),
    home,
    codexHome: process.env.CODEX_HOME?.trim() || path.join(home, ".codex"),
    claudeHome: process.env.CLAUDE_HOME?.trim() || path.join(home, ".claude"),
    githubUrl: "https://github.com/dwgx/AgentScope",
    actionsUrl: "https://github.com/dwgx/AgentScope/actions",
    issuesUrl: "https://github.com/dwgx/AgentScope/issues",
    readmeUrl: "https://github.com/dwgx/AgentScope#readme"
  };
}

function appHome(): string {
  return process.env.AGENTSCOPE_HOME?.trim() || process.env.USERPROFILE || os.homedir();
}

function agentScopeDataRoot(): string {
  return process.env.AGENTSCOPE_DATA_HOME?.trim() || path.join(appHome(), ".agentscope");
}

function isSmokeNoShell(): boolean {
  return isSmoke && process.env.AGENTSCOPE_SMOKE_NO_SHELL === "1";
}

function isSmokeFakeLaunch(): boolean {
  return isSmoke && process.env.AGENTSCOPE_SMOKE_FAKE_LAUNCH === "1";
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
    normalizeFsPath(agentScopeDataRoot()),
    normalizeFsPath(path.join(info.codexHome, "sessions")),
    normalizeFsPath(path.join(info.codexHome, "rollouts")),
    normalizeFsPath(path.join(info.codexHome, "browser-profiles")),
    normalizeFsPath(path.join(info.codexHome, "sqlite")),
    normalizeFsPath(path.join(info.claudeHome, "sessions")),
    normalizeFsPath(path.join(info.claudeHome, "projects")),
    normalizeFsPath(path.join(info.claudeHome, "jobs")),
    normalizeFsPath(path.join(info.claudeHome, "daemon"))
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
  if (![".json", ".txt", ".md", ".log"].includes(ext)) return false;
  return isAgentScopeTextArtifact(targetPath);
}

function isAgentScopeTextArtifact(targetPath: string): boolean {
  const normalized = normalizeFsPath(targetPath);
  if (!normalized) return false;
  if (openedTextArtifacts.has(normalized)) return true;
  const agentScopeRoot = normalizeFsPath(agentScopeDataRoot());
  const userDataBackups = normalizeFsPath(path.join(app.getPath("userData"), "backups"));
  const userDataQuarantine = normalizeFsPath(path.join(app.getPath("userData"), "quarantine"));
  const operationRoots = [agentScopeRoot, userDataBackups, userDataQuarantine].filter((item): item is string => !!item);
  if (!operationRoots.some((root) => normalized === root || normalized.startsWith(`${root}${path.sep}`))) return false;
  const basename = path.basename(normalized).toLowerCase();
  return basename === "journal.json" || basename === "restore-journal.json" || basename === "manifest.json";
}

function redactSnapshotForExport(snapshot: ScopeSnapshot): unknown {
  return redactExportValue(snapshot, "");
}

function redactExportValue(value: unknown, key: string): unknown {
  if (Array.isArray(value)) return value.map((item) => redactExportValue(item, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redactExportValue(entryValue, entryKey)]));
  }
  if (typeof value !== "string") return value;
  if (/^(commandLine|windowTitle|title|preview)$/i.test(key)) return value ? `[redacted ${key}]` : value;
  if (/^(path|cwd|cwdHint|transcriptPath|executablePath|runtimeWorkingDir)$/i.test(key)) return redactPathForExport(value);
  return redactEmbeddedPaths(value);
}

function redactPathForExport(value: string): string {
  const normalized = redactEmbeddedPaths(value);
  if (/^[A-Za-z]:\\/.test(normalized) || normalized.startsWith("\\\\")) return "<local-path>";
  return normalized;
}

function redactEmbeddedPaths(value: string): string {
  const home = normalizeFsPath(appHome());
  let out = value.replace(/\//g, "\\");
  if (home) {
    const escapedHome = escapeRegExp(home);
    out = out.replace(new RegExp(escapedHome, "ig"), "%USERPROFILE%");
  }
  out = out.replace(/[A-Za-z]:\\Users\\[^\\\s"]+/gi, (match) => match.replace(/^[A-Za-z]:\\Users\\[^\\]+/i, "%USERPROFILE%"));
  out = out.replace(/[A-Za-z]:\\(?:Project|work)\\[^\\\s"]+/gi, "<local-path>");
  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function allowedLocalPaths(): Promise<string[]> {
  const info = appInfo();
  const paths = new Set<string>();
  addAllowedPath(paths, info.userData);
  addAllowedPath(paths, agentScopeDataRoot());
  addAllowedPath(paths, info.codexHome);
  addAllowedPath(paths, info.claudeHome);
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
  return isSafeOperationPath(targetPath, [
    path.join(agentScopeDataRoot(), child),
    path.join(app.getPath("userData"), child)
  ]);
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
  if (isSmoke && process.env.AGENTSCOPE_SMOKE_AUTO_CONFIRM_CONTROL_MODE === "1") return true;
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

async function confirmHighRiskCodexControlMutation(changedKeys: string[], warnings: string[]): Promise<boolean> {
  if (isSmoke && process.env.AGENTSCOPE_SMOKE_AUTO_CONFIRM_HIGH_RISK === "1") return true;
  const options = {
    type: "warning" as const,
    buttons: ["Cancel", "Save high-risk changes"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: "Confirm Codex Control change",
    message: "Save high-risk Codex Control changes?",
    detail: [
      changedKeys.length ? `Keys: ${changedKeys.join(", ")}` : undefined,
      warnings.length ? `Warnings: ${warnings.join("\n")}` : undefined,
      "AgentScope will write only allowlisted Codex config keys and record a backup plus journal."
    ].filter(Boolean).join("\n\n")
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
  const resolution = await resolveLaunchCommand({
    agent,
    action: action as SessionLaunchAction,
    sessionId,
    snapshot,
    context,
    homeDir: appHome()
  });
  if (isSmokeFakeLaunch()) {
    await recordSmokeLaunch(resolution, workingDirectory);
    return launchResult(resolution, workingDirectory);
  }
  const child = spawn(resolution.filePath, resolution.args, {
    cwd: workingDirectory,
    detached: true,
    windowsHide: false,
    stdio: "ignore"
  });
  await waitForLaunchAccepted(child);
  child.unref();
  return launchResult(resolution, workingDirectory);
}

async function recordSmokeLaunch(resolution: SessionLaunchResolution, cwd?: string): Promise<void> {
  const logPath = process.env.AGENTSCOPE_SMOKE_LAUNCH_LOG?.trim();
  if (!logPath) return;
  const entry = {
    at: new Date().toISOString(),
    agent: resolution.agent,
    action: resolution.action,
    sessionId: resolution.sessionId,
    filePath: resolution.filePath,
    args: resolution.args,
    command: launchResult(resolution).command,
    source: resolution.source,
    ...(cwd ? { cwd } : {})
  };
  await fs.promises.mkdir(path.dirname(logPath), { recursive: true });
  await fs.promises.appendFile(logPath, `${JSON.stringify(entry)}\n`, "utf8");
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

function asString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`Invalid ${label}.`);
  return value;
}

function asOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  return asString(value, label);
}

function asSha256(value: unknown): string {
  const hash = asString(value, "sha256");
  if (!/^[a-f0-9]{64}$/i.test(hash)) throw new Error("Invalid sha256.");
  return hash;
}

function asPid(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 0x7fffffff) {
    throw new Error("Invalid process id.");
  }
  return value;
}

function asOptionalLimit(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 500) {
    throw new Error("Invalid search limit.");
  }
  return value;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
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
    highRiskConfirmationToken: typeof request.highRiskConfirmationToken === "string" ? request.highRiskConfirmationToken : undefined,
    mutations
  };
}

function validateCodexControlSurfaceId(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 160) {
    throw new Error("Invalid Codex control surface id.");
  }
  if (!/^[A-Za-z0-9_.:@/-]+$/.test(value)) {
    throw new Error("Invalid Codex control surface id.");
  }
  return value;
}

function createHighRiskCodexControlConfirmation(request: CodexControlMutationRequest): string {
  pruneExpiredHighRiskCodexControlConfirmations();
  const token = crypto.randomBytes(24).toString("base64url");
  highRiskCodexControlConfirmations.set(token, {
    signature: codexControlMutationSignature(request),
    expiresAt: Date.now() + 60_000
  });
  return token;
}

function consumeHighRiskCodexControlConfirmation(request: CodexControlMutationRequest): void {
  pruneExpiredHighRiskCodexControlConfirmations();
  const token = request.highRiskConfirmationToken;
  if (!token) throw new Error("High-risk Codex control mutation requires main-process confirmation.");
  const confirmation = highRiskCodexControlConfirmations.get(token);
  highRiskCodexControlConfirmations.delete(token);
  if (!confirmation || confirmation.expiresAt < Date.now()) {
    throw new Error("High-risk Codex control confirmation is missing or expired.");
  }
  if (confirmation.signature !== codexControlMutationSignature(request)) {
    throw new Error("High-risk Codex control confirmation does not match this mutation.");
  }
}

function pruneExpiredHighRiskCodexControlConfirmations(): void {
  const now = Date.now();
  for (const [token, confirmation] of highRiskCodexControlConfirmations) {
    if (confirmation.expiresAt < now) highRiskCodexControlConfirmations.delete(token);
  }
}

function codexControlMutationSignature(request: CodexControlMutationRequest): string {
  const normalized = request.mutations
    .map((mutation) => ({
      itemId: mutation.itemId,
      keyPath: mutation.keyPath,
      value: mutation.value
    }))
    .sort((a, b) => `${a.itemId}\n${a.keyPath}`.localeCompare(`${b.itemId}\n${b.keyPath}`));
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ expectedSha256: request.expectedSha256, mutations: normalized }))
    .digest("hex");
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
      smokeUserData
        ? path.resolve(smokeUserData)
        : app.isReady() && app.isPackaged
          ? app.getPath("userData")
          : path.join(process.env.APPDATA ?? process.cwd(), "AgentScope");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "agentscope-main.log"), `${new Date().toISOString()} ${message}\n`);
  } catch {
    // Logging must never prevent the desktop shell from opening.
  }
}
