import type {
  Diagnostic,
  ScopeSnapshot,
  SessionBackupResult,
  SessionDeleteResult,
  SessionImportResult,
  SessionOperationPlanResult
} from "@agentscope/shared";

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
  listFonts(): Promise<string[]>;
  reloadApp(): Promise<boolean>;
  clearCache(): Promise<{ ok: boolean; directories: string[]; files: string[] }>;
  quitApp(): Promise<boolean>;
  openExternal(url: string): Promise<boolean>;
  openPath(targetPath: string): Promise<string>;
  revealPath(targetPath: string): Promise<string>;
  inspectPid(pid: number): Promise<Record<string, unknown>>;
  inspectSession(sessionId: string): Promise<Record<string, unknown>>;
  repairDiagnostic(name: string): Promise<{
    ok: boolean;
    name: string;
    message: string;
    directories: string[];
    files: string[];
    restartRequired?: boolean;
  }>;
  backupSession(agent: string, sessionId: string): Promise<SessionBackupResult>;
  deleteSession(agent: string, sessionId: string, createdAt?: string): Promise<SessionDeleteResult>;
  importSessionBackup(backupDir: string): Promise<SessionImportResult>;
  chooseImportSession(): Promise<SessionImportResult | { canceled: true }>;
  writeDeletePlan(agent: string, sessionId: string): Promise<SessionOperationPlanResult>;
  writeImportPlan(backupDir: string): Promise<SessionOperationPlanResult>;
  chooseImportPlan(): Promise<SessionOperationPlanResult | { canceled: true }>;
}

declare global {
  interface Window {
    agentscope: AgentScopeApi;
  }
}

export {};
