import { enUS } from "./resources/en-US.js";
import { jaJP } from "./resources/ja-JP.js";
import { koKR } from "./resources/ko-KR.js";
import { zhCN } from "./resources/zh-CN.js";
import type { Locale } from "./locales.js";
import type { ResourceTree } from "./types.js";

export const resources: Record<Locale, { translation: ResourceTree }> = {
  "en-US": { translation: enUS },
  "zh-CN": { translation: zhCN },
  "ja-JP": { translation: jaJP },
  "ko-KR": { translation: koKR }
};

export type ResourceKey = string;

export function resourceFor(locale: Locale): ResourceTree {
  return resources[locale].translation;
}
