const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("agentscope", {
  getSnapshot: () => ipcRenderer.invoke("snapshot:get"),
  getDoctor: () => ipcRenderer.invoke("doctor:get"),
  search: (query, limit = 50) => ipcRenderer.invoke("search:run", query, limit),
  exportSnapshot: (snapshot) => ipcRenderer.invoke("snapshot:export", snapshot),
  getAppInfo: () => ipcRenderer.invoke("app:info"),
  reloadApp: () => ipcRenderer.invoke("app:reload"),
  quitApp: () => ipcRenderer.invoke("app:quit"),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  openPath: (targetPath) => ipcRenderer.invoke("shell:openPath", targetPath),
  revealPath: (targetPath) => ipcRenderer.invoke("shell:revealPath", targetPath),
  inspectPid: (pid) => ipcRenderer.invoke("inspect:pid", pid),
  inspectSession: (sessionId) => ipcRenderer.invoke("inspect:session", sessionId)
});
