import type {
  Diagnostic,
  AgentKind,
  ScopeSnapshot,
  SessionBackupResult,
  SessionDeleteResult,
  SessionImportResult,
  SessionOperationPlanResult,
  QuarantinedSession,
  SessionRestoreResult,
  SessionLaunchContext,
  SessionLaunchResult,
  CodexControlDocument,
  CodexControlCenterSnapshot,
  CodexControlMutationPlan,
  CodexControlMutationRequest,
  CodexControlSaveResult,
  CodexControlSnapshot,
  CodexModeConfigPatch,
  CodexModeConfigSaveResult,
  CodexModeConfigSnapshot,
  SessionCandidateMatch
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
  search(query: string, limit?: number, options?: { includeSqlitePreview?: boolean }): Promise<Record<string, unknown>[]>;
  exportSnapshot(): Promise<{ canceled: boolean; path?: string }>;
  getAppInfo(): Promise<AppInfo>;
  setControlMode(mode: "safe" | "readOnly"): Promise<{ controlMode: "safe" | "readOnly" }>;
  listFonts(): Promise<string[]>;
  listCodexControl(): Promise<CodexControlSnapshot>;
  getCodexControlCenter(): Promise<CodexControlCenterSnapshot>;
  readCodexControlDocument(id: string): Promise<CodexControlDocument>;
  saveCodexControlDocument(
    id: string,
    content: string,
    expectedSha256: string
  ): Promise<CodexControlSaveResult>;
  readCodexModeConfig(): Promise<CodexModeConfigSnapshot>;
  saveCodexModeConfig(
    patch: CodexModeConfigPatch,
    expectedSha256: string
  ): Promise<CodexModeConfigSaveResult>;
  planCodexControlMutation(request: CodexControlMutationRequest): Promise<CodexControlMutationPlan>;
  executeCodexControlMutation(request: CodexControlMutationRequest): Promise<CodexControlSaveResult>;
  reloadApp(): Promise<boolean>;
  clearCache(): Promise<{ ok: boolean; directories: string[]; files: string[] }>;
  quitApp(): Promise<boolean>;
  openExternal(url: string): Promise<boolean>;
  openPath(targetPath: string): Promise<string>;
  revealPath(targetPath: string): Promise<string>;
  inspectPid(pid: number): Promise<{ process?: unknown; sessions: SessionCandidateMatch[] }>;
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
  launchSession(
    agent: AgentKind,
    sessionId: string,
    action: "resume" | "fork",
    context?: SessionLaunchContext
  ): Promise<SessionLaunchResult>;
  importSessionBackup(backupDir: string): Promise<SessionImportResult | SessionRestoreResult>;
  listQuarantinedSessions(): Promise<QuarantinedSession[]>;
  restoreQuarantinedSession(quarantineDirOrJournalPath: string): Promise<SessionRestoreResult>;
  chooseImportSession(): Promise<SessionImportResult | SessionRestoreResult | { canceled: true }>;
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
