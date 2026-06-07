import type {
  AgentProcess,
  AgentSession,
  Confidence,
  Evidence,
  Relation,
  ScopeSnapshot,
  SessionCandidate,
  SessionCandidateScorePart,
  Transcript
} from "@agentscope/shared";
import { mergeActivity } from "./activity.js";
import { loadClaudeIndexRecords, loadClaudeSessions, loadClaudeTranscripts } from "./claude.js";
import { appendEvidenceUnique, loadCodexIndex, scanCodexRollouts } from "./codex.js";
import { containsNormalizedPath } from "./paths.js";
import { listProcesses } from "./processes.js";

export async function buildSnapshot(home?: string, includeProcesses = true): Promise<ScopeSnapshot> {
  const processes = includeProcesses ? await listProcesses(false) : [];
  const claudeSessions = loadClaudeSessions(home);
  const claudeTranscriptIndex = await loadClaudeTranscripts(home);
  const claudeRecords = loadClaudeIndexRecords(home);
  const codex = loadCodexIndex(home);
  const rollouts = await scanCodexRollouts(home);

  const sessions = mergeSessions([...claudeSessions, ...codex.sessions, ...rollouts.sessions]);
  const transcripts = [...claudeTranscriptIndex.transcripts, ...rollouts.transcripts];
  const indexRecords = [...claudeRecords, ...codex.records, ...rollouts.records];
  const relations = [...codex.relations, ...rollouts.relations, ...claudeTranscriptIndex.relations];

  attachTranscripts(sessions, transcripts);
  attachProcesses(sessions, processes, relations);
  applyRelations(sessions, relations);

  sessions.sort((a, b) => a.agent.localeCompare(b.agent) || (a.updatedAt ?? "").localeCompare(b.updatedAt ?? "") || a.sessionId.localeCompare(b.sessionId));

  return { processes, sessions, transcripts, indexRecords, relations };
}

export function findSession(snapshot: ScopeSnapshot, sessionId: string, agent?: string): AgentSession | undefined {
  return snapshot.sessions.find(
    (session) =>
      session.sessionId.toLowerCase() === sessionId.toLowerCase() &&
      (agent === undefined || session.agent === agent)
  );
}

export function findProcess(snapshot: ScopeSnapshot, pid: number): AgentProcess | undefined {
  return snapshot.processes.find((process) => process.pid === pid);
}

export function sessionsForPid(snapshot: ScopeSnapshot, pid: number): AgentSession[] {
  const exact = snapshot.sessions.filter((session) => session.pid === pid);
  if (exact.length) return exact;
  const process = findProcess(snapshot, pid);
  return process ? sessionCandidatesForProcess(snapshot, process, 5).map((candidate) => sessionFromCandidate(snapshot, candidate)).filter(isDefined) : [];
}

export function heuristicSessionsForProcess(snapshot: ScopeSnapshot, process: AgentProcess, limit: number): AgentSession[] {
  return sessionCandidatesForProcess(snapshot, process, limit)
    .filter(canAttachHeuristicProcess)
    .map((candidate) => sessionFromCandidate(snapshot, candidate))
    .filter(isDefined);
}

export function sessionCandidatesForProcess(snapshot: ScopeSnapshot, process: AgentProcess, limit = 5): SessionCandidate[] {
  const candidates = snapshot.sessions
    .map((session) => scoreSessionForProcess(process, session))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") || a.sessionId.localeCompare(b.sessionId));
  return candidates.slice(0, limit);
}

export function mergeSessions(items: AgentSession[]): AgentSession[] {
  const merged = new Map<string, AgentSession>();
  for (const item of items) {
    const key = `${item.agent}\0${item.sessionId}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...item, childSessionIds: [...item.childSessionIds], evidence: [...item.evidence] });
      continue;
    }
    mergeSession(existing, item);
  }
  return [...merged.values()];
}

function attachTranscripts(sessions: AgentSession[], transcripts: Transcript[]): void {
  for (const transcript of transcripts) {
    if (transcript.transcriptKind === "subagent") {
      const parent = transcript.parentSessionId
        ? sessions.find((item) => item.agent === transcript.agent && item.sessionId === transcript.parentSessionId)
        : undefined;
      if (parent && !parent.childSessionIds.includes(transcript.sessionId)) parent.childSessionIds.push(transcript.sessionId);
      if (parent) parent.evidence = appendEvidenceUnique(parent.evidence, transcript.evidence);
      continue;
    }
    const session = sessions.find((item) => item.agent === transcript.agent && item.sessionId === transcript.sessionId);
    if (!session) {
      sessions.push({
        agent: transcript.agent,
        sessionId: transcript.sessionId,
        cwd: transcript.cwd,
        transcriptPath: transcript.path,
        indexSource: "transcript",
        childSessionIds: [],
        confidence: "indexed",
        updatedAt: transcript.updatedAt,
        activity: transcript.activity,
        evidence: transcript.evidence
      });
      continue;
    }
    session.transcriptPath ||= transcript.path;
    session.cwd ||= transcript.cwd;
    session.updatedAt = maxText(session.updatedAt, transcript.updatedAt);
    session.activity = mergeActivity(session.activity, transcript.activity);
    session.confidence = bestConfidence(session.confidence, "indexed");
    session.evidence = appendEvidenceUnique(session.evidence, transcript.evidence);
  }
}

function attachProcesses(sessions: AgentSession[], processes: AgentProcess[], relations: Relation[]): void {
  const byPid = new Map(processes.map((process) => [process.pid, process]));
  for (const session of sessions) {
    if (session.pid === undefined) continue;
    const process = byPid.get(session.pid);
    if (!process) {
      session.evidence.push({ source: "process.match", detail: "Session carries a PID, but no active Win32_Process row currently matches it.", field: "pid" });
      continue;
    }
    session.ppid = process.ppid;
    session.processName = process.processName;
    session.commandLine = process.commandLine;
    session.path = process.executablePath;
    session.confidence = bestConfidence(session.confidence, "exact");
    session.evidence.push({ source: "process.match", detail: "Active process matched session by explicit PID.", field: "pid" });
    relations.push({
      kind: "process_parent",
      sourceId: process.ppid === undefined ? "unknown" : String(process.ppid),
      targetId: String(process.pid),
      confidence: "exact",
      evidence: process.evidence
    });
  }

  const snapshot: ScopeSnapshot = { processes, sessions, transcripts: [], indexRecords: [], relations };
  for (const process of processes) {
    process.sessionCandidates = sessionCandidatesForProcess(snapshot, process, 5);
  }

  for (const process of processes) {
    const [candidate] = process.sessionCandidates ?? [];
    if (!candidate) continue;
    const session = sessions.find((item) => item.agent === candidate.agent && item.sessionId === candidate.sessionId);
    if (!session || session.pid !== undefined || !canAttachHeuristicProcess(candidate)) continue;
    session.pid = process.pid;
    session.ppid = process.ppid;
    session.processName = process.processName;
    session.commandLine = process.commandLine;
    session.path = process.executablePath;
    session.confidence = bestConfidence(session.confidence, "heuristic");
    session.evidence.push({
      source: "process.heuristic",
      detail: `Process candidate score ${candidate.score}; Codex has no exact PID map in MVP.`,
      field: "CommandLine,cwd,transcriptPath,CreationDate,StartTime,MainWindowTitle"
    });
  }
}

function applyRelations(sessions: AgentSession[], relations: Relation[]): void {
  for (const relation of relations) {
    if (relation.kind !== "parent_child" && relation.kind !== "subagent") continue;
    const parent = sessions.find((session) => session.sessionId === relation.sourceId);
    const child = sessions.find((session) => session.sessionId === relation.targetId);
    if (parent && !parent.childSessionIds.includes(relation.targetId)) parent.childSessionIds.push(relation.targetId);
    if (child) {
      child.parentSessionId = relation.sourceId;
      child.evidence = appendEvidenceUnique(child.evidence, relation.evidence);
    }
  }
}

function mergeSession(target: AgentSession, source: AgentSession): void {
  target.pid ??= source.pid;
  target.ppid ??= source.ppid;
  target.processName ||= source.processName;
  target.commandLine ||= source.commandLine;
  target.path ||= source.path;
  target.cwd ||= source.cwd;
  target.status ||= source.status;
  target.transcriptPath ||= source.transcriptPath;
  target.indexSource ||= source.indexSource;
  target.parentSessionId ||= source.parentSessionId;
  for (const child of source.childSessionIds) {
    if (!target.childSessionIds.includes(child)) target.childSessionIds.push(child);
  }
  target.title ||= source.title;
  target.startedAt ||= source.startedAt;
  target.updatedAt = maxText(target.updatedAt, source.updatedAt);
  target.indexMetadata = mergeMetadata(target.indexMetadata, source.indexMetadata);
  target.activity = mergeActivity(target.activity, source.activity);
  target.confidence = bestConfidence(target.confidence, source.confidence);
  target.evidence = appendEvidenceUnique(target.evidence, source.evidence);
}

function scoreSessionForProcess(process: AgentProcess, session: AgentSession): SessionCandidate {
  let score = 0;
  const reasons: Evidence[] = [];
  const scoreParts: SessionCandidateScorePart[] = [];
  const add = (points: number, evidence: Evidence): void => {
    score += points;
    reasons.push(evidence);
    scoreParts.push({ ...evidence, points });
  };

  if (session.pid !== undefined && session.pid === process.pid) {
    add(1000, {
      source: "process.match.pid",
      detail: "Session PID exactly matches the active Win32 process PID.",
      field: "pid"
    });
  }

  const agentMatches = process.agent !== "unknown" && session.agent === process.agent;
  const haystack = `${process.commandLine ?? ""} ${process.executablePath ?? ""}`;

  if (agentMatches && containsNormalizedPath(haystack, session.cwd)) {
    add(115, {
      source: "process.match.cwd",
      detail: "Process command line or executable path contains the indexed session cwd.",
      field: "CommandLine,ExecutablePath,cwd"
    });
  }

  if (agentMatches && containsNormalizedPath(haystack, session.transcriptPath)) {
    add(105, {
      source: "process.match.transcript",
      detail: "Process command line or executable path contains the indexed transcript path.",
      field: "CommandLine,ExecutablePath,transcriptPath"
    });
  }

  if (agentMatches && containsInsensitive(haystack, session.sessionId)) {
    add(90, {
      source: "process.match.session_id",
      detail: "Process command line or executable path contains the session/thread id.",
      field: "CommandLine,ExecutablePath,sessionId"
    });
  }

  const windowTitle = process.windowTitle;
  if (agentMatches && windowTitle && session.title && session.title.length >= 6 && containsInsensitive(windowTitle, session.title)) {
    add(35, {
      source: "process.match.window_title",
      detail: "Main window title contains the indexed session title.",
      field: "MainWindowTitle,title"
    });
  }

  const processStartedAt = process.startTime ?? process.creationDate;
  if (agentMatches && processStartedAt) {
    const startedScore = timeScore(processStartedAt, session.startedAt, "startedAt");
    if (startedScore) add(startedScore.points, startedScore.evidence);

    const updatedScore = timeScore(processStartedAt, session.updatedAt, "updatedAt");
    if (updatedScore) add(updatedScore.points, updatedScore.evidence);
  }

  if (agentMatches && score > 0) {
    score += 8;
    reasons.push({
      source: "process.match.agent",
      detail: "Process classification and session agent kind match.",
      field: "processName,CommandLine,agent"
    });
  }

  return {
    agent: session.agent,
    sessionId: session.sessionId,
    title: session.title,
    cwd: session.cwd,
    transcriptPath: session.transcriptPath,
    confidence: candidateConfidence(process, session, reasons),
    score,
    scoreParts,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    reasons
  };
}

function timeScore(processStartedAt: string, sessionTime: string | undefined, field: "startedAt" | "updatedAt"):
  | { points: number; evidence: Evidence }
  | undefined {
  const processTime = parseTime(processStartedAt);
  const targetTime = parseTime(sessionTime);
  if (processTime === undefined || targetTime === undefined) return undefined;
  const deltaMinutes = Math.abs(processTime - targetTime) / 60000;
  let points = 0;
  if (deltaMinutes <= 15) points = field === "startedAt" ? 65 : 35;
  else if (deltaMinutes <= 60) points = field === "startedAt" ? 45 : 25;
  else if (deltaMinutes <= 240) points = field === "startedAt" ? 24 : 12;
  if (!points) return undefined;
  return {
    points,
    evidence: {
      source: field === "startedAt" ? "process.match.start_time" : "process.match.updated_time",
      detail: `Process start time is within ${Math.round(deltaMinutes)} minutes of session ${field}.`,
      field: `StartTime,CreationDate,${field}`
    }
  };
}

function canAttachHeuristicProcess(candidate: SessionCandidate): boolean {
  if (candidate.confidence === "exact") return true;
  if (candidate.confidence !== "heuristic") return false;
  if (candidate.score < 100) return false;
  return hasStrongReason(candidate.reasons);
}

function sessionFromCandidate(snapshot: ScopeSnapshot, candidate: SessionCandidate): AgentSession | undefined {
  return snapshot.sessions.find((session) => session.agent === candidate.agent && session.sessionId === candidate.sessionId);
}

function candidateConfidence(process: AgentProcess, session: AgentSession, reasons: Evidence[]): Confidence {
  if (session.pid !== undefined && session.pid === process.pid) return "exact";
  return hasStrongReason(reasons) ? "heuristic" : "unknown";
}

function hasStrongReason(reasons: Evidence[]): boolean {
  return reasons.some((reason) =>
    ["process.match.cwd", "process.match.transcript", "process.match.session_id", "process.match.window_title"].includes(reason.source)
  );
}

function bestConfidence(left: Confidence, right: Confidence): Confidence {
  const rank: Record<Confidence, number> = { unknown: 0, heuristic: 1, indexed: 2, exact: 3 };
  return rank[left]! >= rank[right]! ? left : right;
}

function maxText(left?: string, right?: string): string | undefined {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

function mergeMetadata(
  left?: Record<string, unknown>,
  right?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!left) return right;
  if (!right) return left;
  return { ...right, ...left };
}

function parseTime(value?: string): number | undefined {
  if (!value) return undefined;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && value.length >= 10) {
    const numericDate = new Date(numeric).getTime();
    if (!Number.isNaN(numericDate)) return numericDate;
  }
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? undefined : parsed;
}

function containsInsensitive(haystack: string, needle?: string): boolean {
  return !!needle && haystack.toLowerCase().includes(needle.toLowerCase());
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
