import { locales } from "./locales.js";
import { resourceFor } from "./resources.js";

type Flat = Map<string, { value: string; params: string[] }>;

function flatten(value: unknown, prefix = "", out: Flat = new Map()): Flat {
  if (typeof value === "string") {
    out.set(prefix, { value, params: interpolationParams(value) });
    return out;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid i18n value at ${prefix || "<root>"}`);
  }
  for (const [key, child] of Object.entries(value)) {
    flatten(child, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

function interpolationParams(value: string): string[] {
  return [...value.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)(?:\s*,[^}]*)?\s*\}\}/g)]
    .map((match) => match[1]!)
    .sort();
}

function sameParams(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

const base = flatten(resourceFor("en-US"));
let failures = 0;

for (const locale of locales) {
  const current = flatten(resourceFor(locale));
  for (const [key, expected] of base.entries()) {
    const actual = current.get(key);
    if (!actual) {
      console.error(`[${locale}] missing key: ${key}`);
      failures += 1;
      continue;
    }
    if (!actual.value.trim()) {
      console.error(`[${locale}] empty value: ${key}`);
      failures += 1;
    }
    if (!sameParams(expected.params, actual.params)) {
      console.error(
        `[${locale}] param mismatch: ${key} expected=${expected.params.join(",")} actual=${actual.params.join(",")}`
      );
      failures += 1;
    }
  }
  for (const key of current.keys()) {
    if (!base.has(key)) {
      console.error(`[${locale}] extra key: ${key}`);
      failures += 1;
    }
  }
}

if (failures > 0) {
  process.exitCode = 1;
} else {
  console.log(`i18n: ${base.size} keys checked across ${locales.length} locales`);
}
