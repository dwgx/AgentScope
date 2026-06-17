import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const textFileRe = /\.(?:ts|tsx|js|cjs|mjs|json|md|yml|yaml|css|html|toml)$/i;
const secretPatterns = [
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bghp_[A-Za-z0-9_]{20,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g
];
const localPathPatterns = [
  /C:\\Users\\dwgx1\b/gi,
  /D:\\Project\\AgentScope\b/gi
];
const allowedLocalPathFiles = new Set([
  "docs/research-local-agent-stores.md",
  "packages/core/src/activity.test.ts",
  "packages/core/src/claude.test.ts",
  "packages/core/src/codex.test.ts",
  "packages/core/src/paths.test.ts",
  "packages/core/src/scope.test.ts",
  "packages/core/src/search.test.ts",
  "packages/core/src/sessionOps.test.ts",
  "packages/shared/src/launcher.test.ts"
]);
const allowedSecretFixtures = [
  "fake-redacted-token-for-test",
  "secret-token-value",
  "sk-secret-model-token",
  "secret AgentScope raw text"
];

const files = git(["ls-files", "--cached", "--others", "--exclude-standard"]).split(/\r?\n/).filter(Boolean);
const findings = [];

for (const file of files) {
  const normalized = file.replace(/\\/g, "/");
  const absolutePath = path.join(root, file);
  if (!fs.existsSync(absolutePath)) continue;
  if (/(^|\/)(node_modules|dist|out|tmp)(\/|$)/.test(normalized)) {
    findings.push({ file, reason: "tracked generated or local artifact path" });
  }
  if (/\.(?:sqlite|sqlite-wal|sqlite-shm|jsonl)$/i.test(file)) {
    findings.push({ file, reason: "tracked local session/database artifact" });
  }
  if (!textFileRe.test(file)) continue;
  const content = fs.readFileSync(absolutePath, "utf8");
  const scrubbed = allowedSecretFixtures.reduce((text, fixture) => text.replaceAll(fixture, ""), content);
  for (const pattern of secretPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(scrubbed)) findings.push({ file, reason: `high-confidence secret pattern ${pattern}` });
  }
  if (!allowedLocalPathFiles.has(normalized)) {
    for (const pattern of localPathPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) findings.push({ file, reason: `hard-coded local path ${pattern}` });
    }
  }
}

if (findings.length) {
  console.error("Repository audit failed:");
  for (const finding of findings) console.error(`- ${finding.file}: ${finding.reason}`);
  process.exit(1);
}

console.log(`Repository audit passed (${files.length} tracked/untracked non-ignored files checked).`);

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}
