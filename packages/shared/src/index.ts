export type AgentKind = "codex" | "claude" | "unknown";

export type Confidence = "exact" | "indexed" | "heuristic" | "unknown";

export type RelationKind = "parent_child" | "process_parent" | "transcript" | "subagent";

export type AgentProcessRole =
  | "codex_cli"
  | "codex_engine"
  | "codex_node_repl"
  | "codex_app_server"
  | "codex_mcp_tool"
  | "codex_tool_kernel"
  | "claude_cli"
  | "claude_daemon"
  | "agent_helper"
  | "unknown";

export type AgentSessionKind = "session" | "child" | "subagent" | "subagent_candidate";

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
  displayTitle?: string | undefined;
  executablePath?: string | undefined;
  commandLine?: string | undefined;
  creationDate?: string | undefined;
  startTime?: string | undefined;
  lastActivityAt?: string | undefined;
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
  runtimeSessionId?: string | undefined;
  runtimeWorkingDir?: string | undefined;
  sessionCandidates?: SessionCandidate[] | undefined;
  evidence: Evidence[];
}

export interface SessionCandidate {
  agent: AgentKind;
  sessionId: string;
  pid?: number | undefined;
  ppid?: number | undefined;
  processName?: string | undefined;
  processRole?: AgentProcessRole | undefined;
  rootPid?: number | undefined;
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

export interface SessionCandidateMatch {
  session: AgentSession;
  candidate: SessionCandidate;
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
  metadata?: Record<string, unknown> | undefined;
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
  sessionKind?: AgentSessionKind | undefined;
  sessionKindEvidence?: Evidence[] | undefined;
  confidence: Confidence;
  title?: string | undefined;
  startedAt?: string | undefined;
  updatedAt?: string | undefined;
  indexMetadata?: Record<string, unknown> | undefined;
  activity?: SessionActivity | undefined;
  runtimeCandidates?: SessionCandidate[] | undefined;
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

export type SessionChildDeleteMode = "block" | "includeChildren" | "detach";

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
  rollbackParams?: unknown[] | undefined;
  evidence: Evidence[];
}

export interface SessionOperationPlan {
  schemaVersion: 1;
  operation: SessionOperation;
  mode: SessionOperationMode;
  risk: SessionOperationRisk;
  childMode?: SessionChildDeleteMode | undefined;
  affectedChildSessionIds?: string[] | undefined;
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
  childMode?: SessionChildDeleteMode | undefined;
  childResults?: SessionChildDeleteResult[] | undefined;
  detachedRelations?: SessionDetachedRelation[] | undefined;
  movedFiles: SessionOperationFile[];
  patchedFiles: SessionOperationFile[];
  databaseChanges: SessionOperationDatabaseChange[];
}

export interface SessionChildDeleteResult {
  agent: AgentKind;
  sessionId: string;
  backupDir: string;
  quarantineDir: string;
  journalPath: string;
}

export interface SessionDetachedRelation {
  agent: AgentKind;
  parentSessionId: string;
  childSessionId: string;
  source: string;
  database?: string | undefined;
  table?: string | undefined;
  removedRows: number;
  evidence: Evidence[];
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

export type CodexControlSurfaceKind =
  | "config"
  | "agents"
  | "rules"
  | "skill"
  | "plugin"
  | "mcp"
  | "browser"
  | "computer_use"
  | "database"
  | "runtime"
  | "cache"
  | "memory"
  | "archive";

export type CodexControlSurfaceStatus = "ok" | "warn" | "blocked";

export interface CodexControlSurface {
  id: string;
  kind: CodexControlSurfaceKind;
  label: string;
  path?: string | undefined;
  exists: boolean;
  editable: boolean;
  status: CodexControlSurfaceStatus;
  detail: string;
  bytes?: number | undefined;
  updatedAt?: string | undefined;
  summary?: Record<string, string | number | boolean> | undefined;
  warnings: string[];
  evidence: Evidence[];
}

export interface CodexMcpServerSummary {
  name: string;
  source: "user_config" | "plugin_config";
  enabled?: boolean | undefined;
  transport?: "stdio" | "http" | "plugin" | "unknown" | undefined;
  table: string;
  evidence: Evidence[];
}

export interface CodexControlSnapshot {
  codexHome: string;
  surfaces: CodexControlSurface[];
  mcpServers: CodexMcpServerSummary[];
  warnings: string[];
  evidence: Evidence[];
}

export type CodexControlCenterSection =
  | "overview"
  | "models"
  | "safety"
  | "runtime"
  | "mcp"
  | "skills"
  | "storage"
  | "advanced";

export type CodexControlValueKind = "string" | "boolean" | "number" | "select" | "path" | "summary";

export type CodexControlRisk = "low" | "medium" | "high" | "blocked";

export interface CodexControlCenterItem {
  id: string;
  section: CodexControlCenterSection;
  label: string;
  detail: string;
  displayLabel?: string | undefined;
  displayDetail?: string | undefined;
  keyPath?: string | undefined;
  value?: string | number | boolean | undefined;
  valueKind: CodexControlValueKind;
  options?: string[] | undefined;
  editable: boolean;
  risk: CodexControlRisk;
  targetPath?: string | undefined;
  source: "official_docs" | "local_file" | "local_inventory" | "current_code";
  status: CodexControlSurfaceStatus;
  warnings: string[];
  evidence: Evidence[];
}

export interface CodexControlCenterSnapshot {
  codexHome: string;
  sqliteHome: string;
  configPath: string;
  configSha256: string;
  auth: {
    path: string;
    exists: boolean;
    bytes?: number | undefined;
    updatedAt?: string | undefined;
    sha256?: string | undefined;
    storageMode?: "file" | "keyring" | "auto" | "ephemeral" | "unknown" | undefined;
    warnings: string[];
    evidence: Evidence[];
  };
  items: CodexControlCenterItem[];
  warnings: string[];
  evidence: Evidence[];
}

export interface CodexControlMutation {
  itemId: string;
  keyPath: string;
  value: string | number | boolean | null;
}

export interface CodexControlMutationRequest {
  expectedSha256: string;
  mutations: CodexControlMutation[];
  confirmedHighRisk?: boolean | undefined;
  highRiskConfirmationToken?: string | undefined;
}

export interface CodexControlMutationPlan {
  configPath: string;
  expectedSha256: string;
  mutations: CodexControlMutation[];
  changedKeys: string[];
  blockers: string[];
  warnings: string[];
  highRisk: boolean;
  highRiskConfirmationToken?: string | undefined;
  backupPath?: string | undefined;
  journalPath?: string | undefined;
  evidence: Evidence[];
}

export interface CodexControlDocument {
  id: string;
  kind: CodexControlSurfaceKind;
  label: string;
  path: string;
  content: string;
  sha256: string;
  bytes: number;
  updatedAt?: string | undefined;
  editable: boolean;
  redacted: boolean;
  warnings: string[];
  evidence: Evidence[];
}

export interface CodexControlRevealResult {
  id: string;
  path: string;
  revealAllowed: boolean;
  reason?: string | undefined;
  evidence: Evidence[];
}

export interface CodexControlSaveResult {
  id: string;
  path: string;
  backupPath?: string | undefined;
  journalPath?: string | undefined;
  changedKeys?: string[] | undefined;
  sha256: string;
  bytes: number;
  evidence: Evidence[];
}

export type CodexModeId = "default" | "plan" | "review";

export interface CodexModeValue {
  model?: string | undefined;
  reasoningEffort?: string | undefined;
  source: "config" | "inherits_default" | "unset";
  evidence: Evidence[];
}

export interface CodexModeConfigSnapshot {
  configPath: string;
  sha256: string;
  modes: Record<CodexModeId, CodexModeValue>;
  recommendedModels: string[];
  reasoningEffortValues: string[];
  planReasoningEffortValues: string[];
  warnings: string[];
  evidence: Evidence[];
}

export interface CodexModeConfigPatch {
  defaultModel?: string | null | undefined;
  defaultReasoningEffort?: string | null | undefined;
  planReasoningEffort?: string | null | undefined;
  reviewModel?: string | null | undefined;
}

export interface CodexModeConfigSaveResult extends CodexControlSaveResult {
  modes: Record<CodexModeId, CodexModeValue>;
}

export * from "./launcher.js";
