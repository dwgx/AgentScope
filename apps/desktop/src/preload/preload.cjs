const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("agentscope", {
  getSnapshot: () => ipcRenderer.invoke("snapshot:get"),
  getDoctor: () => ipcRenderer.invoke("doctor:get"),
  search: (query, limit = 50) => ipcRenderer.invoke("search:run", query, limit),
  exportSnapshot: () => ipcRenderer.invoke("snapshot:export"),
  getAppInfo: () => ipcRenderer.invoke("app:info"),
  listFonts: () => ipcRenderer.invoke("fonts:list"),
  reloadApp: () => ipcRenderer.invoke("app:reload"),
  quitApp: () => ipcRenderer.invoke("app:quit"),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  openPath: (targetPath) => ipcRenderer.invoke("shell:openPath", targetPath),
  revealPath: (targetPath) => ipcRenderer.invoke("shell:revealPath", targetPath),
  inspectPid: (pid) => ipcRenderer.invoke("inspect:pid", pid),
  inspectSession: (sessionId) => ipcRenderer.invoke("inspect:session", sessionId),
  backupSession: (agent, sessionId) => ipcRenderer.invoke("session:backup", agent, sessionId),
  deleteSession: (agent, sessionId, createdAt) => ipcRenderer.invoke("session:delete", agent, sessionId, createdAt),
  importSessionBackup: (backupDir) => ipcRenderer.invoke("session:import", backupDir),
  chooseImportSession: () => ipcRenderer.invoke("session:chooseImport"),
  writeDeletePlan: (agent, sessionId) => ipcRenderer.invoke("session:deletePlan", agent, sessionId),
  writeImportPlan: (backupDir) => ipcRenderer.invoke("session:importPlan", backupDir),
  chooseImportPlan: () => ipcRenderer.invoke("session:chooseImportPlan")
});
