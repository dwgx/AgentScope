import type { AgentProcess, AgentSession, Confidence, Relation, ScopeSnapshot, Transcript } from "@agentscope/shared";
import { loadClaudeIndexRecords, loadClaudeSessions, loadClaudeTranscripts } from "./claude.js";
import { appendEvidenceUnique, loadCodexIndex, scanCodexRollouts } from "./codex.js";
import { containsNormalizedPath } from "./paths.js";
import { listProcesses } from "./processes.js";

export async function buildSnapshot(home?: string, includeProcesses = true): Promise<ScopeSnapshot> {
  const processes = includeProcesses ? await listProcesses(false) : [];
  const claudeSessions = loadClaudeSessions(home);
  const claudeTranscripts = loadClaudeTranscripts(home);
  const claudeRecords = loadClaudeIndexRecords(home);
  const codex = loadCodexIndex(home);
  const rollouts = await scanCodexRollouts(home);

  const sessions = mergeSessions([...claudeSessions, ...codex.sessions, ...rollouts.sessions]);
  const transcripts = [...claudeTranscripts, ...rollouts.transcripts];
  const indexRecords = [...claudeRecords, ...codex.records, ...rollouts.records];
  const relations = [...codex.relations];

  attachTranscripts(sessions, transcripts);
  attachProcesses(sessions, processes, relations);
  applyRelations(sessions, relations);

  sessions.sort((a, b) => a.agent.localeCompare(b.agent) || (a.updatedAt ?? "").localeCompare(b.updatedAt ?? "") || a.sessionId.localeCompare(b.sessionId));

  return { processes, sessions, transcripts, indexRecords, relations };
}

export function findSession(snapshot: ScopeSnapshot, sessionId: string): AgentSession | undefined {
  return snapshot.sessions.find((session) => session.sessionId.toLowerCase() === sessionId.toLowerCase());
}

export function findProcess(snapshot: ScopeSnapshot, pid: number): AgentProcess | undefined {
  return snapshot.processes.find((process) => process.pid === pid);
}

export function sessionsForPid(snapshot: ScopeSnapshot, pid: number): AgentSession[] {
  const exact = snapshot.sessions.filter((session) => session.pid === pid);
  if (exact.length) return exact;
  const process = findProcess(snapshot, pid);
  return process ? heuristicSessionsForProcess(snapshot, process, 5) : [];
}

export function heuristicSessionsForProcess(snapshot: ScopeSnapshot, process: AgentProcess, limit: number): AgentSession[] {
  if (process.agent === "unknown") return [];
  const scored = snapshot.sessions
    .filter((session) => session.agent === process.agent)
    .map((session) => {
      let score = 0;
      if (containsNormalizedPath(process.commandLine, session.cwd)) score += 100;
      if (containsNormalizedPath(process.commandLine, session.transcriptPath)) score += 90;
      return { score, session };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || (b.session.updatedAt ?? "").localeCompare(a.session.updatedAt ?? ""));
  return scored.slice(0, limit).map((item) => item.session);
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
        evidence: transcript.evidence
      });
      continue;
    }
    session.transcriptPath ||= transcript.path;
    session.cwd ||= transcript.cwd;
    session.updatedAt = maxText(session.updatedAt, transcript.updatedAt);
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
    const [candidate] = heuristicSessionsForProcess(snapshot, process, 1);
    if (!candidate) continue;
    const session = sessions.find((item) => item.agent === candidate.agent && item.sessionId === candidate.sessionId);
    if (!session || session.pid !== undefined) continue;
    session.pid = process.pid;
    session.ppid = process.ppid;
    session.processName = process.processName;
    session.commandLine = process.commandLine;
    session.path = process.executablePath;
    session.confidence = "heuristic";
    session.evidence.push({
      source: "process.heuristic",
      detail: "Process command line contains this session cwd or transcript path; Codex has no exact PID map in MVP.",
      field: "CommandLine,cwd,transcriptPath"
    });
  }
}

function applyRelations(sessions: AgentSession[], relations: Relation[]): void {
  for (const relation of relations) {
    if (relation.kind !== "parent_child") continue;
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
  target.updatedAt = maxText(target.updatedAt, source.updatedAt);
  target.confidence = bestConfidence(target.confidence, source.confidence);
  target.evidence = appendEvidenceUnique(target.evidence, source.evidence);
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
