import { contextBridge, ipcRenderer } from "electron";
import type { Diagnostic, ScopeSnapshot } from "@agentscope/shared";

export interface AgentScopeApi {
  getSnapshot(): Promise<ScopeSnapshot>;
  getDoctor(): Promise<Diagnostic[]>;
  search(query: string, limit?: number): Promise<Record<string, unknown>[]>;
  inspectPid(pid: number): Promise<Record<string, unknown>>;
  inspectSession(sessionId: string): Promise<Record<string, unknown>>;
}

const api: AgentScopeApi = {
  getSnapshot: () => ipcRenderer.invoke("snapshot:get") as Promise<ScopeSnapshot>,
  getDoctor: () => ipcRenderer.invoke("doctor:get") as Promise<Diagnostic[]>,
  search: (query, limit = 50) => ipcRenderer.invoke("search:run", query, limit) as Promise<Record<string, unknown>[]>,
  inspectPid: (pid) => ipcRenderer.invoke("inspect:pid", pid) as Promise<Record<string, unknown>>,
  inspectSession: (sessionId) => ipcRenderer.invoke("inspect:session", sessionId) as Promise<Record<string, unknown>>
};

contextBridge.exposeInMainWorld("agentscope", api);
