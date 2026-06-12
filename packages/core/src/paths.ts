import os from "node:os";
import fs from "node:fs";
import path from "node:path";

export function userHome(): string {
  const smokeHome = process.env.AGENTSCOPE_HOME?.trim();
  if (smokeHome) return smokeHome;
  return process.env.USERPROFILE || os.homedir();
}

export function codexHome(home = userHome()): string {
  const env = process.env.CODEX_HOME?.trim();
  if (env && home === userHome()) return resolveAgentHome(env);
  return path.join(home, ".codex");
}

export function codexSqliteHome(home = userHome(), cwd = process.cwd()): string {
  const root = codexHome(home);
  const configured = readCodexSqliteHomeFromConfig(path.join(root, "config.toml"));
  if (configured) return resolveCodexSqliteHome(configured, cwd);
  const env = process.env.CODEX_SQLITE_HOME?.trim();
  if (env) return resolveCodexSqliteHome(env, cwd);
  return root;
}

export function claudeHome(home = userHome()): string {
  const env = process.env.CLAUDE_HOME?.trim();
  if (env && home === userHome()) return resolveAgentHome(env);
  return path.join(home, ".claude");
}

export function agentScopeHome(home = userHome()): string {
  const env = process.env.AGENTSCOPE_DATA_HOME?.trim();
  if (env && home === userHome()) return resolveAgentHome(env);
  return path.join(home, ".agentscope");
}

export function normalizeWindowsPath(value?: string | null): string | undefined {
  let text = value?.trim().replace(/^"|"$/g, "");
  if (!text) return undefined;
  if (text.startsWith("\\\\?\\UNC\\")) {
    text = "\\\\" + text.slice("\\\\?\\UNC\\".length);
  } else if (text.startsWith("\\\\?\\")) {
    text = text.slice("\\\\?\\".length);
  }
  text = text.replaceAll("/", "\\");
  if (/^[a-zA-Z]:/.test(text)) {
    text = text[0]!.toUpperCase() + text.slice(1);
  }
  while (!text.startsWith("\\\\") && text.includes("\\\\")) {
    text = text.replaceAll("\\\\", "\\");
  }
  return text.length > 3 ? text.replace(/\\+$/g, "") : text;
}

export function pathsEqual(left?: string, right?: string): boolean {
  const normalizedLeft = normalizeWindowsPath(left);
  const normalizedRight = normalizeWindowsPath(right);
  return !!normalizedLeft && !!normalizedRight && normalizedLeft.toLowerCase() === normalizedRight.toLowerCase();
}

export function encodeClaudeProjectPath(cwd: string): string {
  return (normalizeWindowsPath(cwd) ?? cwd).replaceAll(":", "-").replaceAll("\\", "-");
}

export function containsNormalizedPath(haystack?: string, needle?: string): boolean {
  const normalizedNeedle = normalizeWindowsPath(needle);
  const normalizedHaystack = normalizeWindowsPath(haystack) ?? haystack;
  if (!normalizedNeedle || !normalizedHaystack) return false;
  return normalizedHaystack.toLowerCase().includes(normalizedNeedle.toLowerCase());
}

export function containsNormalizedPathToken(haystack?: string, needle?: string): boolean {
  const normalizedNeedle = normalizeWindowsPath(needle)?.toLowerCase();
  const normalizedHaystack = (normalizeWindowsPath(haystack) ?? haystack)?.toLowerCase();
  if (!normalizedNeedle || !normalizedHaystack) return false;
  let index = normalizedHaystack.indexOf(normalizedNeedle);
  while (index >= 0) {
    const before = index > 0 ? normalizedHaystack[index - 1] ?? "" : "";
    const after = normalizedHaystack[index + normalizedNeedle.length] ?? "";
    if (isPathTokenBoundary(before) && isPathTokenBoundary(after)) return true;
    index = normalizedHaystack.indexOf(normalizedNeedle, index + 1);
  }
  return false;
}

function isPathTokenBoundary(value: string): boolean {
  return value === "" || /[\s"'`=,;()[\]{}<>|]/.test(value);
}

function resolveCodexSqliteHome(value: string, cwd: string): string {
  const normalized = normalizeWindowsPath(value) ?? value;
  return path.isAbsolute(normalized) ? normalized : path.resolve(cwd, normalized);
}

function resolveAgentHome(value: string): string {
  const normalized = normalizeWindowsPath(value) ?? value;
  return path.resolve(normalized);
}

function readCodexSqliteHomeFromConfig(configPath: string): string | undefined {
  let content: string;
  try {
    const stat = fs.statSync(configPath);
    if (!stat.isFile() || stat.size > 512 * 1024) return undefined;
    content = fs.readFileSync(configPath, "utf8");
  } catch {
    return undefined;
  }
  let inTopLevel = true;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;
    if (/^\[+/.test(line)) {
      inTopLevel = false;
      continue;
    }
    if (!inTopLevel) continue;
    const match = /^sqlite_home\s*=\s*(.+)$/.exec(line);
    if (!match) continue;
    return tomlStringValue(match[1]!.trim());
  }
  return undefined;
}

function tomlStringValue(value: string): string | undefined {
  const quoted = /^"((?:\\"|[^"])*)"|'([^']*)'/.exec(value);
  if (quoted) return (quoted[1] ?? quoted[2] ?? "").replace(/\\"/g, '"').trim() || undefined;
  return /^[^\s#]+/.exec(value)?.[0]?.trim() || undefined;
}

function stripTomlComment(line: string): string {
  let quoted = false;
  let quote = "";
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if ((char === "'" || char === '"') && line[index - 1] !== "\\") {
      if (!quoted) {
        quoted = true;
        quote = char;
      } else if (quote === char) {
        quoted = false;
        quote = "";
      }
    }
    if (char === "#" && !quoted) return line.slice(0, index);
  }
  return line;
}
