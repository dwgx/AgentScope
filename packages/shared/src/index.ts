export type AgentKind = "codex" | "claude" | "unknown";

export type Confidence = "exact" | "indexed" | "heuristic" | "unknown";

export type RelationKind = "parent_child" | "process_parent" | "transcript" | "subagent";

export type AgentProcessRole =
  | "codex_cli"
  | "codex_engine"
  | "codex_node_repl"
  | "codex_app_server"
  | "codex_mcp_tool"
  | "claude_cli"
  | "claude_daemon"
  | "agent_helper"
  | "unknown";

export interface Evidence {
  source: string;
  detail: string;
  path?: string;
  field?: string;
}

export interface AgentProcess {
  pid: number;
  ppid?: number | undefined;
  processName: string;
  executablePath?: string | undefined;
  commandLine?: string | undefined;
  creationDate?: string | undefined;
  startTime?: string | undefined;
  windowTitle?: string | undefined;
  workingSetBytes?: number | undefined;
  privateMemoryBytes?: number | undefined;
  cpuSeconds?: number | undefined;
  cwdHint?: string | undefined;
  agent: AgentKind;
  processRole?: AgentProcessRole | undefined;
  processRoleDetail?: string | undefined;
  rootPid?: number | undefined;
  parentAgentPid?: number | undefined;
  sessionCandidates?: SessionCandidate[] | undefined;
  evidence: Evidence[];
}

export interface SessionCandidate {
  agent: AgentKind;
  sessionId: string;
  title?: string | undefined;
  cwd?: string | undefined;
  transcriptPath?: string | undefined;
  confidence: Confidence;
  score: number;
  scoreParts?: SessionCandidateScorePart[] | undefined;
  startedAt?: string | undefined;
  updatedAt?: string | undefined;
  reasons: Evidence[];
}

export interface SessionCandidateScorePart extends Evidence {
  points: number;
}

export interface Transcript {
  agent: AgentKind;
  sessionId: string;
  path: string;
  cwd?: string | undefined;
  updatedAt?: string | undefined;
  parentSessionId?: string | undefined;
  transcriptKind?: "session" | "subagent" | undefined;
  activity?: SessionActivity | undefined;
  evidence: Evidence[];
}

export interface IndexRecord {
  agent: AgentKind;
  sessionId: string;
  source: string;
  path?: string | undefined;
  cwd?: string | undefined;
  title?: string | undefined;
  status?: string | undefined;
  startedAt?: string | undefined;
  updatedAt?: string | undefined;
  preview?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  evidence: Evidence[];
}

export interface Relation {
  kind: RelationKind;
  sourceId: string;
  targetId: string;
  confidence: Confidence;
  evidence: Evidence[];
}

export interface AgentSession {
  agent: AgentKind;
  sessionId: string;
  pid?: number | undefined;
  ppid?: number | undefined;
  processName?: string | undefined;
  commandLine?: string | undefined;
  path?: string | undefined;
  cwd?: string | undefined;
  status?: string | undefined;
  transcriptPath?: string | undefined;
  indexSource?: string | undefined;
  parentSessionId?: string | undefined;
  childSessionIds: string[];
  confidence: Confidence;
  title?: string | undefined;
  startedAt?: string | undefined;
  updatedAt?: string | undefined;
  indexMetadata?: Record<string, unknown> | undefined;
  activity?: SessionActivity | undefined;
  evidence: Evidence[];
}

export interface SessionActivity {
  lineCount: number;
  byteSize?: number | undefined;
  eventCounts: Record<string, number>;
  roleCounts?: Record<string, number> | undefined;
  modelCounts?: Record<string, number> | undefined;
  toolCounts?: Record<string, number> | undefined;
  tokenUsage?: TokenUsage | undefined;
  gitBranch?: string | undefined;
  cliVersion?: string | undefined;
  permissionMode?: string | undefined;
  mode?: string | undefined;
  cwd?: string | undefined;
  firstTimestamp?: string | undefined;
  lastTimestamp?: string | undefined;
  compactedCount?: number | undefined;
  sidechainCount?: number | undefined;
  parseErrors?: number | undefined;
}

export interface TokenUsage {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  cacheCreationInputTokens?: number | undefined;
  cacheReadInputTokens?: number | undefined;
  serverToolUse?: Record<string, number> | undefined;
}

export interface Diagnostic {
  name: string;
  status: "ok" | "warn";
  detail: string;
}

export interface ScopeSnapshot {
  processes: AgentProcess[];
  sessions: AgentSession[];
  transcripts: Transcript[];
  indexRecords: IndexRecord[];
  relations: Relation[];
  diagnostics?: Diagnostic[];
}

export type SessionOperation = "backup" | "delete" | "import" | "restore";

export type SessionOperationMode = "dry-run" | "execute";

export type SessionOperationRisk = "safe" | "caution" | "blocked";

export interface SessionOperationFile {
  role: string;
  path: string;
  exists: boolean;
  bytes?: number | undefined;
  sha256?: string | undefined;
  action: "copy" | "move" | "delete" | "patch" | "inspect" | "skip";
  evidence: Evidence[];
}

export interface SessionOperationDatabaseChange {
  database: string;
  table: string;
  where: string;
  action: "delete" | "insert" | "update" | "inspect" | "skip";
  estimatedRows?: number | undefined;
  evidence: Evidence[];
}

export interface SessionOperationPlan {
  schemaVersion: 1;
  operation: SessionOperation;
  mode: SessionOperationMode;
  risk: SessionOperationRisk;
  agent: AgentKind;
  sessionId: string;
  createdAt: string;
  target?: AgentSession | undefined;
  files: SessionOperationFile[];
  databaseChanges: SessionOperationDatabaseChange[];
  warnings: string[];
  blockers: string[];
  notes: string[];
  evidence: Evidence[];
  backupRequiredBeforeExecute: boolean;
}

export interface SessionBackupResult {
  plan: SessionOperationPlan;
  backupDir: string;
  manifestPath: string;
  copiedFiles: SessionOperationFile[];
  databaseBundlePaths?: string[] | undefined;
}

export interface SessionOperationPlanResult {
  plan: SessionOperationPlan;
  path: string;
  backupDir?: string | undefined;
  quarantineDir?: string | undefined;
  journalPath?: string | undefined;
  restoreJournalPath?: string | undefined;
}

export interface SessionDeleteResult {
  plan: SessionOperationPlan;
  backup: SessionBackupResult;
  quarantineDir: string;
  journalPath: string;
  movedFiles: SessionOperationFile[];
  patchedFiles: SessionOperationFile[];
  databaseChanges: SessionOperationDatabaseChange[];
}

export interface SessionImportResult {
  plan: SessionOperationPlan;
  backupDir: string;
  importedFiles: SessionOperationFile[];
  databaseChanges?: SessionOperationDatabaseChange[] | undefined;
}

export interface QuarantinedSession {
  schemaVersion: 1;
  agent: AgentKind;
  sessionId: string;
  deletedAt: string;
  updatedAt?: string | undefined;
  backupDir: string;
  quarantineDir: string;
  journalPath: string;
  restoreJournalPath: string;
  title?: string | undefined;
  cwd?: string | undefined;
  transcriptPath?: string | undefined;
  parentSessionId?: string | undefined;
  restoreStatus: "restorable" | "restored" | "blocked" | "missing_backup" | "invalid";
  restorePossible: boolean;
  movedFiles: number;
  databaseDeletes: number;
  warnings: string[];
  blockers: string[];
  evidence: Evidence[];
}

export interface SessionRestoreResult {
  plan: SessionOperationPlan;
  backupDir: string;
  quarantineDir: string;
  journalPath: string;
  restoreJournalPath: string;
  importedFiles: SessionOperationFile[];
  databaseChanges?: SessionOperationDatabaseChange[] | undefined;
}

export * from "./launcher.js";
