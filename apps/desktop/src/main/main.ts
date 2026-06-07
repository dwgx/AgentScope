import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain, shell } from "electron";
import { buildSnapshot, findProcess, findSession, runDoctor, searchAll, sessionsForPid } from "@agentscope/core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "development" || process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | undefined;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 860,
    minWidth: 1040,
    minHeight: 680,
    title: "AgentScope",
    backgroundColor: "#0f1419",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173");
  } else {
    await mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  }
}

ipcMain.handle("snapshot:get", async () => buildSnapshot());
ipcMain.handle("doctor:get", async () => runDoctor());
ipcMain.handle("search:run", async (_event, query: string, limit = 50) => searchAll(query, undefined, limit));
ipcMain.handle("inspect:pid", async (_event, pid: number) => {
  const snapshot = await buildSnapshot();
  return {
    process: findProcess(snapshot, pid),
    sessions: sessionsForPid(snapshot, pid)
  };
});
ipcMain.handle("inspect:session", async (_event, sessionId: string) => {
  const snapshot = await buildSnapshot();
  const session = findSession(snapshot, sessionId);
  return {
    session,
    process: session?.pid === undefined ? undefined : findProcess(snapshot, session.pid),
    relations: snapshot.relations.filter((relation) => relation.sourceId === sessionId || relation.targetId === sessionId),
    indexRecords: snapshot.indexRecords.filter((record) => record.sessionId.toLowerCase() === sessionId.toLowerCase())
  };
});

await app.whenReady();
await createWindow();

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});
