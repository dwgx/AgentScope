const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("agentscope", {
  getSnapshot: () => ipcRenderer.invoke("snapshot:get"),
  getDoctor: () => ipcRenderer.invoke("doctor:get"),
  search: (query, limit = 50) => ipcRenderer.invoke("search:run", query, limit),
  inspectPid: (pid) => ipcRenderer.invoke("inspect:pid", pid),
  inspectSession: (sessionId) => ipcRenderer.invoke("inspect:session", sessionId)
});
