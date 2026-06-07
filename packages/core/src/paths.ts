import os from "node:os";
import path from "node:path";

export function userHome(): string {
  return process.env.USERPROFILE || os.homedir();
}

export function codexHome(home = userHome()): string {
  return path.join(home, ".codex");
}

export function claudeHome(home = userHome()): string {
  return path.join(home, ".claude");
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
