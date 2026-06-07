import type { Diagnostic, ScopeSnapshot } from "@agentscope/shared";

export interface AgentScopeApi {
  getSnapshot(): Promise<ScopeSnapshot>;
  getDoctor(): Promise<Diagnostic[]>;
  search(query: string, limit?: number): Promise<Record<string, unknown>[]>;
  inspectPid(pid: number): Promise<Record<string, unknown>>;
  inspectSession(sessionId: string): Promise<Record<string, unknown>>;
}

declare global {
  interface Window {
    agentscope: AgentScopeApi;
  }
}

export {};
