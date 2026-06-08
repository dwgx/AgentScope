import fs from "node:fs";
import readline from "node:readline";

export async function iterateJsonl(
  filePath: string,
  visitor: (line: number, raw: string, value: Record<string, unknown>) => boolean | void
): Promise<void> {
  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let lineNumber = 0;
  try {
    for await (const raw of reader) {
      lineNumber += 1;
      const trimmed = raw.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const keepGoing = visitor(lineNumber, trimmed, parsed as Record<string, unknown>);
          if (keepGoing === false) break;
        }
      } catch {
        continue;
      }
    }
  } finally {
    reader.close();
  }
}

export async function searchJsonl(filePath: string, query: string, limit: number): Promise<Record<string, unknown>[]> {
  const matches: Record<string, unknown>[] = [];
  const needle = query.toLowerCase();
  await iterateJsonl(filePath, (line, _raw, value) => {
    const matchedFields = findMatchingFields(value, needle).slice(0, 8);
    if (matchedFields.length) {
      matches.push({
        path: filePath,
        line,
        eventType: safeEventType(value),
        timestamp: safeTimestamp(value),
        matchedFields,
        matchKind: "jsonl.safe-fields"
      });
    }
    return matches.length < limit;
  }).catch(() => undefined);
  return matches;
}

function safeEventType(value: Record<string, unknown>): string {
  const direct = stringValue(value.type);
  const payloadType = objectValue(value.payload) ? stringValue(objectValue(value.payload)?.type) : undefined;
  const messageRole = objectValue(value.message) ? stringValue(objectValue(value.message)?.role) : undefined;
  return [direct, payloadType, messageRole].filter(Boolean).join(":") || "jsonl";
}

function safeTimestamp(value: Record<string, unknown>): string | undefined {
  return stringValue(value.timestamp) ?? stringValue(objectValue(value.payload)?.timestamp);
}

function findMatchingFields(value: Record<string, unknown>, needle: string): string[] {
  const matches = new Set<string>();
  const walk = (item: unknown, prefix: string, depth: number): void => {
    if (depth > 4 || matches.size >= 16) return;
    if (isDeniedJsonlField(prefix)) return;
    if (typeof item === "string") {
      if (isAllowedJsonlField(prefix) && item.toLowerCase().includes(needle)) matches.add(prefix);
      return;
    }
    if (typeof item === "number" || typeof item === "boolean") {
      if (isAllowedJsonlField(prefix) && String(item).toLowerCase().includes(needle)) matches.add(prefix);
      return;
    }
    if (!item || typeof item !== "object") return;
    if (Array.isArray(item)) {
      for (let index = 0; index < Math.min(item.length, 20); index += 1) {
        walk(item[index], `${prefix}[]`, depth + 1);
      }
      return;
    }
    for (const [key, nested] of Object.entries(item as Record<string, unknown>)) {
      walk(nested, prefix ? `${prefix}.${key}` : key, depth + 1);
    }
  };
  walk(value, "", 0);
  return [...matches];
}

function isAllowedJsonlField(prefix: string): boolean {
  const normalized = prefix.replace(/\[\]/g, "");
  if (!normalized) return false;
  if (["type", "timestamp", "session_id", "sessionId", "thread_id", "threadId", "cwd", "title", "model", "cli_version", "version", "tool_name", "name"].includes(normalized)) return true;
  return [
    /^payload\.type$/,
    /^payload\.timestamp$/,
    /^payload\.session_id$/,
    /^payload\.sessionId$/,
    /^payload\.thread_id$/,
    /^payload\.threadId$/,
    /^payload\.cwd$/,
    /^payload\.title$/,
    /^payload\.model$/,
    /^payload\.cli_version$/,
    /^payload\.tool_name$/,
    /^data\.cwd$/,
    /^data\.title$/,
    /^data\.model$/,
    /^data\.session_id$/,
    /^data\.thread_id$/,
    /^message\.role$/,
    /^message\.model$/
  ].some((pattern) => pattern.test(normalized));
}

function isDeniedJsonlField(prefix: string): boolean {
  return /(?:^|\.)(reasoning|thinking|internal|hidden|content|text|result|output|delta|message\.content|tool_result)(?:\.|$)/i.test(prefix);
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}
