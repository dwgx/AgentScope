export function formatNumber(value: number | undefined, locale?: string): string | undefined {
  return value === undefined ? undefined : new Intl.NumberFormat(locale).format(value);
}

export function formatBytes(value: number | undefined, locale?: string): string | undefined {
  if (value === undefined) return undefined;
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: size >= 10 ? 0 : 1 }).format(size)} ${units[unit]}`;
}

export function formatDate(value: string, locale?: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function formatMaybeDate(value: string | undefined, locale?: string) {
  return value ? formatDate(value, locale) : undefined;
}

export function shortHash(value: string): string {
  return value.length > 16 ? `${value.slice(0, 8)}...${value.slice(-8)}` : value;
}

export function compactPath(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/\//g, "\\");
  const parts = normalized.split("\\").filter(Boolean);
  if (parts.length <= 3) return normalized;
  const root = normalized.startsWith("\\\\") ? `\\\\${parts.slice(0, 2).join("\\")}` : parts[0]!;
  return `${root}\\...\\${parts.slice(-2).join("\\")}`;
}

export function displayPath(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/\//g, "\\");
  const userMatch = /^[A-Za-z]:\\Users\\[^\\]+(\\.*)?$/i.exec(normalized);
  if (userMatch) {
    const rest = userMatch[1] ?? "";
    const userPath = `%USERPROFILE%${rest}`;
    const parts = userPath.split("\\").filter(Boolean);
    return parts.length > 4 ? `${parts[0]}\\...\\${parts.slice(-2).join("\\")}` : userPath;
  }
  return compactPath(normalized);
}

export function looksLikeLocalPath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\") || value.startsWith("%USERPROFILE%\\");
}
