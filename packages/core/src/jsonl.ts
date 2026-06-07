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
  await iterateJsonl(filePath, (line, raw) => {
    if (raw.toLowerCase().includes(needle)) {
      matches.push({ path: filePath, line, text: raw.slice(0, 500) });
    }
    return matches.length < limit;
  }).catch(() => undefined);
  return matches;
}
