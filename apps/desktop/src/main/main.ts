import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { app, BrowserWindow, ipcMain, shell } from "electron";
import type { ScopeSnapshot } from "@agentscope/shared";
import type * as AgentScopeCore from "@agentscope/core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "development" || process.env.VITE_DEV_SERVER_URL;

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
    void shell.openExternal(url);
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
