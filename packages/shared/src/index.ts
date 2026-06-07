export type AgentKind = "codex" | "claude" | "unknown";

export type Confidence = "exact" | "indexed" | "heuristic" | "unknown";

export type RelationKind = "parent_child" | "process_parent" | "transcript";

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
  cwdHint?: string | undefined;
  agent: AgentKind;
  evidence: Evidence[];
}

export interface Transcript {
  agent: AgentKind;
  sessionId: string;
  path: string;
  cwd?: string | undefined;
  updatedAt?: string | undefined;
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
  updatedAt?: string | undefined;
  evidence: Evidence[];
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
