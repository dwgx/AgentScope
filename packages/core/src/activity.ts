import fs from "node:fs";
import type { AgentKind, SessionActivity, TokenUsage } from "@agentscope/shared";
import { normalizeWindowsPath } from "./paths.js";
import { iterateJsonl } from "./jsonl.js";

export async function analyzeTranscriptActivity(agent: AgentKind, filePath: string): Promise<SessionActivity> {
  const stats = statSafe(filePath);
  const activity: SessionActivity = {
    lineCount: 0,
    byteSize: stats?.size,
    eventCounts: {},
    roleCounts: {},
    modelCounts: {},
    toolCounts: {},
    tokenUsage: {},
    parseErrors: 0
  };

  await iterateJsonl(filePath, (_line, _raw, value) => {
    activity.lineCount += 1;
    activity.firstTimestamp ||= timestampValue(value.timestamp);
    activity.lastTimestamp = timestampValue(value.timestamp) ?? activity.lastTimestamp;
    if (agent === "codex") collectCodexActivity(value, activity);
    else if (agent === "claude") collectClaudeActivity(value, activity);
  }).catch(() => {
    activity.parseErrors = (activity.parseErrors ?? 0) + 1;
  });

  trimEmptyMaps(activity);
  return activity;
}

export function mergeActivity(left?: SessionActivity, right?: SessionActivity): SessionActivity | undefined {
  if (!left) return right;
  if (!right) return left;
  return {
    lineCount: Math.max(left.lineCount, right.lineCount),
    byteSize: Math.max(left.byteSize ?? 0, right.byteSize ?? 0) || undefined,
    eventCounts: mergeCounts(left.eventCounts, right.eventCounts),
    roleCounts: mergeOptionalCounts(left.roleCounts, right.roleCounts),
    modelCounts: mergeOptionalCounts(left.modelCounts, right.modelCounts),
    toolCounts: mergeOptionalCounts(left.toolCounts, right.toolCounts),
    tokenUsage: mergeTokenUsage(left.tokenUsage, right.tokenUsage),
    gitBranch: left.gitBranch ?? right.gitBranch,
    cliVersion: left.cliVersion ?? right.cliVersion,
    permissionMode: left.permissionMode ?? right.permissionMode,
    mode: left.mode ?? right.mode,
    cwd: left.cwd ?? right.cwd,
    firstTimestamp: minText(left.firstTimestamp, right.firstTimestamp),
    lastTimestamp: maxText(left.lastTimestamp, right.lastTimestamp),
    compactedCount: addOptional(left.compactedCount, right.compactedCount),
    sidechainCount: addOptional(left.sidechainCount, right.sidechainCount),
    parseErrors: addOptional(left.parseErrors, right.parseErrors)
  };
}

function collectCodexActivity(value: Record<string, unknown>, activity: SessionActivity): void {
  increment(activity.eventCounts, stringValue(value.type) ?? "unknown");
  const payload = objectValue(value.payload);
  if (!payload) return;

  activity.firstTimestamp ||= timestampValue(payload.timestamp);
  activity.lastTimestamp = timestampValue(payload.timestamp) ?? activity.lastTimestamp;

  const payloadType = stringValue(payload.type);
  if (payloadType) increment(activity.eventCounts, `payload.${payloadType}`);
  if (value.type === "compacted") activity.compactedCount = (activity.compactedCount ?? 0) + 1;

  const role = stringValue(payload.role);
  if (role) increment(activity.roleCounts!, role);
  const model = stringValue(payload.model);
  if (model) increment(activity.modelCounts!, model);

  if (value.type === "session_meta") {
    activity.cwd ||= normalizeWindowsPath(stringValue(payload.cwd));
    activity.cliVersion ||= stringValue(payload.cli_version);
    activity.gitBranch ||= stringValue(objectValue(payload.git)?.branch);
  }

  if (value.type === "turn_context") {
    activity.cwd ||= normalizeWindowsPath(stringValue(payload.cwd));
    activity.mode ||= stringValue(objectValue(payload.collaboration_mode)?.mode);
    activity.permissionMode ||= stringValue(payload.approval_policy);
  }

  collectToolName(activity, payload.name);
  collectToolName(activity, payload.tool_name);
  collectToolName(activity, objectValue(payload.call)?.name);
}

function collectClaudeActivity(value: Record<string, unknown>, activity: SessionActivity): void {
  const type = stringValue(value.type) ?? "unknown";
  increment(activity.eventCounts, type);
  activity.cwd ||= normalizeWindowsPath(stringValue(value.cwd));
  activity.gitBranch ||= stringValue(value.gitBranch);
  activity.cliVersion ||= stringValue(value.version);
  if (value.isSidechain === true) activity.sidechainCount = (activity.sidechainCount ?? 0) + 1;

  if (type === "permission-mode") activity.permissionMode = stringValue(value.permissionMode) ?? activity.permissionMode;
  if (type === "mode") activity.mode = stringValue(value.mode) ?? activity.mode;

  const message = objectValue(value.message);
  const role = stringValue(message?.role) ?? (type === "assistant" || type === "user" ? type : undefined);
  if (role) increment(activity.roleCounts!, role);

  const model = stringValue(message?.model);
  if (model) increment(activity.modelCounts!, model);

  collectClaudeContentTools(activity, message?.content);
  collectToolUseResult(activity, value.toolUseResult);
  collectUsage(activity, objectValue(message?.usage));
}

function collectClaudeContentTools(activity: SessionActivity, content: unknown): void {
  if (!Array.isArray(content)) return;
  for (const item of content) {
    const block = objectValue(item);
    if (!block) continue;
    if (block.type === "tool_use") collectToolName(activity, block.name);
    if (block.type === "server_tool_use") collectToolName(activity, block.name ?? block.tool_name);
  }
}

function collectToolUseResult(activity: SessionActivity, value: unknown): void {
  const result = objectValue(value);
  if (!result) return;
  collectToolName(activity, result.name);
  collectToolName(activity, result.toolName);
  collectToolName(activity, result.tool_name);
  const type = stringValue(result.type);
  if (type) increment(activity.toolCounts!, `result.${type}`);
}

function collectUsage(activity: SessionActivity, usage?: Record<string, unknown>): void {
  if (!usage) return;
  const current = activity.tokenUsage ?? {};
  current.inputTokens = addOptional(current.inputTokens, numberValue(usage.input_tokens));
  current.outputTokens = addOptional(current.outputTokens, numberValue(usage.output_tokens));
  current.cacheCreationInputTokens = addOptional(current.cacheCreationInputTokens, numberValue(usage.cache_creation_input_tokens));
  current.cacheReadInputTokens = addOptional(current.cacheReadInputTokens, numberValue(usage.cache_read_input_tokens));
  const serverToolUse = objectValue(usage.server_tool_use);
  if (serverToolUse) {
    current.serverToolUse ??= {};
    for (const [key, value] of Object.entries(serverToolUse)) {
      const numeric = numberValue(value);
      if (numeric !== undefined) current.serverToolUse[key] = (current.serverToolUse[key] ?? 0) + numeric;
    }
  }
  activity.tokenUsage = current;
}

function trimEmptyMaps(activity: SessionActivity): void {
  if (activity.roleCounts && !Object.keys(activity.roleCounts).length) activity.roleCounts = undefined;
  if (activity.modelCounts && !Object.keys(activity.modelCounts).length) activity.modelCounts = undefined;
  if (activity.toolCounts && !Object.keys(activity.toolCounts).length) activity.toolCounts = undefined;
  if (activity.tokenUsage && !hasTokenUsage(activity.tokenUsage)) activity.tokenUsage = undefined;
  if (!activity.parseErrors) activity.parseErrors = undefined;
}

function hasTokenUsage(usage: TokenUsage): boolean {
  return (
    usage.inputTokens !== undefined ||
    usage.outputTokens !== undefined ||
    usage.cacheCreationInputTokens !== undefined ||
    usage.cacheReadInputTokens !== undefined ||
    !!Object.keys(usage.serverToolUse ?? {}).length
  );
}

function collectToolName(activity: SessionActivity, value: unknown): void {
  const name = stringValue(value);
  if (name) increment(activity.toolCounts!, name);
}

function increment(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

function mergeCounts(left: Record<string, number>, right: Record<string, number>): Record<string, number> {
  const merged = { ...left };
  for (const [key, value] of Object.entries(right)) merged[key] = (merged[key] ?? 0) + value;
  return merged;
}

function mergeOptionalCounts(left?: Record<string, number>, right?: Record<string, number>): Record<string, number> | undefined {
  if (!left) return right;
  if (!right) return left;
  return mergeCounts(left, right);
}

function mergeTokenUsage(left?: TokenUsage, right?: TokenUsage): TokenUsage | undefined {
  if (!left) return right;
  if (!right) return left;
  return {
    inputTokens: addOptional(left.inputTokens, right.inputTokens),
    outputTokens: addOptional(left.outputTokens, right.outputTokens),
    cacheCreationInputTokens: addOptional(left.cacheCreationInputTokens, right.cacheCreationInputTokens),
    cacheReadInputTokens: addOptional(left.cacheReadInputTokens, right.cacheReadInputTokens),
    serverToolUse: mergeOptionalCounts(left.serverToolUse, right.serverToolUse)
  };
}

function addOptional(left?: number, right?: number): number | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return left + right;
}

function minText(left?: string, right?: string): string | undefined {
  if (!left) return right;
  if (!right) return left;
  return left < right ? left : right;
}

function maxText(left?: string, right?: string): string | undefined {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

function timestampValue(value: unknown): string | undefined {
  const text = stringValue(value);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toISOString();
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stringValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value || undefined;
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") return String(value);
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }
  return undefined;
}

function statSafe(filePath: string): fs.Stats | undefined {
  try {
    return fs.statSync(filePath);
  } catch {
    return undefined;
  }
}
