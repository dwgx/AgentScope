import type { Diagnostic, ScopeSnapshot } from "@agentscope/shared";

export interface AppInfo {
  userData: string;
  locale: string;
  home: string;
  codexHome: string;
  claudeHome: string;
  githubUrl: string;
  actionsUrl: string;
  issuesUrl: string;
  readmeUrl: string;
}

export interface AgentScopeApi {
  getSnapshot(): Promise<ScopeSnapshot>;
  getDoctor(): Promise<Diagnostic[]>;
  search(query: string, limit?: number): Promise<Record<string, unknown>[]>;
  exportSnapshot(): Promise<{ canceled: boolean; path?: string }>;
  getAppInfo(): Promise<AppInfo>;
  reloadApp(): Promise<boolean>;
  quitApp(): Promise<boolean>;
  openExternal(url: string): Promise<boolean>;
  openPath(targetPath: string): Promise<string>;
  revealPath(targetPath: string): Promise<boolean>;
  inspectPid(pid: number): Promise<Record<string, unknown>>;
  inspectSession(sessionId: string): Promise<Record<string, unknown>>;
}

declare global {
  interface Window {
    agentscope: AgentScopeApi;
  }
}

export {};
