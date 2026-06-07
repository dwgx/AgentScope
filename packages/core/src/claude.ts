import fs from "node:fs";
import path from "node:path";
import type { AgentSession, IndexRecord, Transcript } from "@agentscope/shared";
import { claudeHome, encodeClaudeProjectPath, normalizeWindowsPath } from "./paths.js";

interface ClaudeSessionFile {
  pid?: number | string;
  sessionId?: string;
  cwd?: string;
  status?: string;
  startedAt?: unknown;
  updatedAt?: unknown;
}

export function loadClaudeSessions(home?: string): AgentSession[] {
  const sessionsDir = path.join(claudeHome(home), "sessions");
  if (!fs.existsSync(sessionsDir)) return [];
  return fs
    .readdirSync(sessionsDir)
    .filter((name) => name.endsWith(".json"))
    .flatMap((name) => {
      const loaded = loadClaudeSessionFile(path.join(sessionsDir, name));
      return loaded ? [loaded] : [];
    });
}

export function loadClaudeTranscripts(home?: string): Transcript[] {
  const projectsDir = path.join(claudeHome(home), "projects");
  if (!fs.existsSync(projectsDir)) return [];
  const out: Transcript[] = [];
  walk(projectsDir, (filePath) => {
    if (!filePath.endsWith(".jsonl")) return;
    out.push({
      agent: "claude",
      sessionId: path.basename(filePath, ".jsonl"),
      path: filePath,
      evidence: [
        {
          source: "claude.projects",
          detail: "Transcript discovered under .claude/projects/<encoded-cwd>/<sessionId>.jsonl.",
          path: filePath
        }
      ]
    });
  });
  return out;
}

export function loadClaudeIndexRecords(home?: string): IndexRecord[] {
  return loadClaudeSessions(home).map((session) => ({
    agent: "claude",
    sessionId: session.sessionId,
    source: "claude.sessions",
    path: session.transcriptPath,
    cwd: session.cwd,
    status: session.status,
    updatedAt: session.updatedAt,
    metadata: { pid: session.pid },
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
      updatedAt: payload.updatedAt === undefined ? undefined : String(payload.updatedAt),
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
