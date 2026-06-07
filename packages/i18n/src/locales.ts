export const locales = ["en-US", "zh-CN", "ja-JP", "ko-KR"] as const;
export type Locale = (typeof locales)[number];
export type LanguageSetting = "system" | Locale;

export const languageSettings = ["system", ...locales] as const;

export function resolveLocale(input: string | undefined, fallback: Locale = "en-US"): Locale {
  if (!input) return fallback;
  const normalized = input.replace("_", "-").toLowerCase();
  if (normalized.startsWith("zh")) return "zh-CN";
  if (normalized.startsWith("ja")) return "ja-JP";
  if (normalized.startsWith("ko")) return "ko-KR";
  if (normalized.startsWith("en")) return "en-US";
  return fallback;
}

export function isLanguageSetting(value: unknown): value is LanguageSetting {
  return typeof value === "string" && (languageSettings as readonly string[]).includes(value);
}
