import fs from "node:fs";
import path from "node:path";
import type { AgentSession, IndexRecord, Relation, Transcript } from "@agentscope/shared";
import { analyzeTranscriptActivity } from "./activity.js";
import { claudeHome, encodeClaudeProjectPath, normalizeWindowsPath } from "./paths.js";

interface ClaudeSessionFile {
  pid?: number | string;
  sessionId?: string;
  cwd?: string;
  status?: string;
  startedAt?: unknown;
  updatedAt?: unknown;
  kind?: string;
  entrypoint?: string;
  peerProtocol?: string;
  procStart?: unknown;
  version?: string;
}

export function loadClaudeSessions(home?: string): AgentSession[] {
  const sessionsDir = path.join(claudeHome(home), "sessions");
  const sessions: AgentSession[] = [];
  if (fs.existsSync(sessionsDir)) {
    sessions.push(
      ...fs
        .readdirSync(sessionsDir)
        .filter((name) => name.endsWith(".json"))
        .flatMap((name) => {
          const loaded = loadClaudeSessionFile(path.join(sessionsDir, name));
          return loaded ? [loaded] : [];
        })
    );
  }
  sessions.push(...loadClaudeDaemonSessions(home));
  sessions.push(...loadClaudeJobSessions(home));
  return sessions;
}

export async function loadClaudeTranscripts(home?: string): Promise<{ transcripts: Transcript[]; relations: Relation[] }> {
  const projectsDir = path.join(claudeHome(home), "projects");
  if (!fs.existsSync(projectsDir)) return { transcripts: [], relations: [] };
  const transcripts: Transcript[] = [];
  const relations: Relation[] = [];
  const files: string[] = [];
  walk(projectsDir, (filePath) => {
    if (!filePath.endsWith(".jsonl")) return;
    files.push(filePath);
  });
  for (const filePath of files) {
    const activity = await analyzeTranscriptActivity("claude", filePath);
    const subagent = parseClaudeSubagentPath(filePath);
    const sessionId = subagent?.childSessionId ?? path.basename(filePath, ".jsonl");
    transcripts.push({
      agent: "claude",
      sessionId,
      path: filePath,
      cwd: activity.cwd,
      updatedAt: fs.statSync(filePath).mtime.toISOString(),
      parentSessionId: subagent?.parentSessionId,
      transcriptKind: subagent ? "subagent" : "session",
      activity,
      evidence: [
        {
          source: subagent ? "claude.projects.subagents" : "claude.projects",
          detail: subagent
            ? "Claude subagent transcript discovered under .claude/projects/<encoded-cwd>/<sessionId>/subagents/agent-*.jsonl."
            : "Transcript discovered under .claude/projects/<encoded-cwd>/<sessionId>.jsonl.",
          path: filePath
        }
      ]
    });
    if (subagent) {
      relations.push({
        kind: "subagent",
        sourceId: subagent.parentSessionId,
        targetId: subagent.childSessionId,
        confidence: "indexed",
        evidence: [
          {
            source: "claude.projects.subagents",
            detail: "Claude subagent transcript nested under parent session directory.",
            path: filePath,
            field: "parentSessionId,agent-*.jsonl"
          }
        ]
      });
    }
  }
  return { transcripts, relations };
}

export function loadClaudeIndexRecords(home?: string): IndexRecord[] {
  return loadClaudeSessions(home).map((session) => ({
    agent: "claude",
    sessionId: session.sessionId,
    source: session.indexSource ?? "claude.sessions",
    path: session.transcriptPath,
    cwd: session.cwd,
    status: session.status,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    metadata: { pid: session.pid, startedAt: session.startedAt, ...session.indexMetadata },
    evidence: session.evidence
  }));
}

function loadClaudeSessionFile(filePath: string): AgentSession | undefined {
  try {
    const payload = JSON.parse(fs.readFileSync(filePath, "utf8")) as ClaudeSessionFile;
    const sessionId = payload.sessionId ?? path.basename(filePath, ".json");
    const cwd = normalizeWindowsPath(payload.cwd);
    const pid = payload.pid === undefined ? undefined : Number(payload.pid);
    const transcriptPath = findClaudeTranscript(filePath, cwd, sessionId);
    return {
      agent: "claude",
      sessionId,
      pid: Number.isFinite(pid) ? pid : undefined,
      cwd,
      status: payload.status,
      transcriptPath,
      indexSource: "claude.sessions",
      childSessionIds: [],
      confidence: Number.isFinite(pid) ? "exact" : "indexed",
      startedAt: timestampValue(payload.startedAt),
      updatedAt: timestampValue(payload.updatedAt),
      indexMetadata: compactMetadata({
        kind: payload.kind,
        entrypoint: payload.entrypoint,
        peerProtocol: payload.peerProtocol,
        procStart: timestampValue(payload.procStart),
        version: payload.version
      }),
      evidence: [
        {
          source: "claude.sessions",
          detail: "Claude session PID mapping loaded from .claude/sessions/*.json.",
          path: filePath,
          field: "pid,sessionId,cwd,status,startedAt,updatedAt"
        },
        ...(transcriptPath
          ? [
              {
                source: "claude.projects",
                detail: "Transcript path matched by sessionId and cwd encoded project directory.",
                path: transcriptPath
              }
            ]
          : [])
      ]
    };
  } catch {
    return undefined;
  }
}

function loadClaudeDaemonSessions(home?: string): AgentSession[] {
  const rosterPath = path.join(claudeHome(home), "daemon", "roster.json");
  if (!fs.existsSync(rosterPath)) return [];
  try {
    const payload = JSON.parse(fs.readFileSync(rosterPath, "utf8")) as Record<string, unknown>;
    const workers = objectValue(payload.workers);
    if (!workers) return [];
    return Object.entries(workers).flatMap(([workerId, value]) => {
      const worker = objectValue(value);
      if (!worker) return [];
      const sessionId = stringValue(worker.sessionId) ?? stringValue(objectValue(worker.dispatch)?.sessionId);
      if (!sessionId) return [];
      const cwd = normalizeWindowsPath(stringValue(worker.cwd) ?? stringValue(objectValue(worker.dispatch)?.cwd));
      const pid = numberValue(worker.pid);
      const transcriptPath = findClaudeTranscript(rosterPath, cwd, sessionId);
      return [
        {
          agent: "claude" as const,
          sessionId,
          pid,
          cwd,
          transcriptPath,
          indexSource: "claude.daemon.roster",
          childSessionIds: [],
          confidence: pid === undefined ? "indexed" : "exact",
          startedAt: timestampValue(worker.startedAt),
          updatedAt: timestampValue(payload.updatedAt) ?? timestampValue(objectValue(worker.dispatch)?.createdAt),
          indexMetadata: compactMetadata({
            daemon_worker: workerId,
            cliVersion: worker.cliVersion,
            attempt: worker.attempt,
            proto: payload.proto,
            supervisorPid: payload.supervisorPid,
            dispatchCreatedAt: timestampValue(objectValue(worker.dispatch)?.createdAt)
          }),
          evidence: [
            {
              source: "claude.daemon.roster",
              detail: "Claude daemon worker exact PID/session mapping loaded from daemon/roster.json.",
              path: rosterPath,
              field: "workers.*.pid,workers.*.sessionId,workers.*.cwd,workers.*.startedAt"
            }
          ]
        }
      ];
    });
  } catch {
    return [];
  }
}

function loadClaudeJobSessions(home?: string): AgentSession[] {
  const jobsDir = path.join(claudeHome(home), "jobs");
  if (!fs.existsSync(jobsDir)) return [];
  const out: AgentSession[] = [];
  for (const entry of fs.readdirSync(jobsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const statePath = path.join(jobsDir, entry.name, "state.json");
    if (!fs.existsSync(statePath)) continue;
    try {
      const payload = JSON.parse(fs.readFileSync(statePath, "utf8")) as Record<string, unknown>;
      const sessionId = stringValue(payload.sessionId) ?? stringValue(payload.resumeSessionId);
      if (!sessionId) continue;
      const cwd = normalizeWindowsPath(stringValue(payload.cwd));
      const transcriptPath = findClaudeTranscript(statePath, cwd, sessionId);
      out.push({
        agent: "claude",
        sessionId,
        cwd,
        status: stringValue(payload.state),
        transcriptPath,
        indexSource: "claude.jobs",
        childSessionIds: [],
        confidence: "indexed",
        startedAt: timestampValue(payload.createdAt),
        updatedAt: timestampValue(payload.updatedAt),
        indexMetadata: compactMetadata({
          job_short: entry.name,
          backend: payload.backend,
          daemonShort: payload.daemonShort,
          resumeSessionId: payload.resumeSessionId,
          children_count: countObjectKeys(payload.children),
          in_flight_count: countObjectKeys(payload.inFlight),
          firstTerminalAt: timestampValue(payload.firstTerminalAt)
        }),
        evidence: [
          {
            source: "claude.jobs",
            detail: "Claude job state loaded from .claude/jobs/<short>/state.json.",
            path: statePath,
            field: "state,backend,sessionId,resumeSessionId,cwd,createdAt,updatedAt,children,inFlight"
          }
        ]
      });
    } catch {
      continue;
    }
  }
  return out;
}

function timestampValue(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return undefined;
    const numeric = Number(text);
    if (Number.isFinite(numeric) && text.length >= 10) {
      const date = new Date(numeric);
      return Number.isNaN(date.getTime()) ? text : date.toISOString();
    }
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? text : date.toISOString();
  }
  return String(value);
}

function findClaudeTranscript(sessionFile: string, cwd: string | undefined, sessionId: string): string | undefined {
  const root = path.dirname(path.dirname(sessionFile));
  const projects = path.join(root, "projects");
  const candidates: string[] = [];
  if (cwd) candidates.push(path.join(projects, encodeClaudeProjectPath(cwd), `${sessionId}.jsonl`));
  if (fs.existsSync(projects)) {
    walk(projects, (filePath) => {
      if (path.basename(filePath) === `${sessionId}.jsonl`) candidates.push(filePath);
    });
  }
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function walk(root: string, visitor: (filePath: string) => void): void {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) walk(filePath, visitor);
    else visitor(filePath);
  }
}

function parseClaudeSubagentPath(filePath: string): { parentSessionId: string; childSessionId: string } | undefined {
  const parts = filePath.split(/[\\/]+/);
  const subagentsIndex = parts.findIndex((part) => part.toLowerCase() === "subagents");
  if (subagentsIndex <= 0) return undefined;
  const parentSessionId = parts[subagentsIndex - 1];
  const childSessionId = path.basename(filePath, ".jsonl");
  if (!parentSessionId || !childSessionId) return undefined;
  return { parentSessionId, childSessionId };
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value) return value;
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") return String(value);
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numeric) ? numeric : undefined;
}

function compactMetadata(values: Record<string, unknown>): Record<string, unknown> | undefined {
  const compact = Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
  return Object.keys(compact).length ? compact : undefined;
}

function countObjectKeys(value: unknown): number | undefined {
  const object = objectValue(value);
  return object ? Object.keys(object).length : undefined;
}
