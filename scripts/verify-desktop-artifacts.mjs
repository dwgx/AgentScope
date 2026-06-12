import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "apps", "desktop", "out");
const manifestPath = path.join(outDir, "agentscope-prebuild.json");
const strictHead = process.argv.includes("--strict-head");

const required = [
  {
    name: "unpacked executable",
    test: () => fs.existsSync(path.join(outDir, "win-unpacked", "AgentScope.exe"))
  },
  {
    name: "NSIS installer",
    test: (files) => files.some((name) => /^AgentScope-.*-Setup-x64\.exe$/i.test(name))
  },
  {
    name: "portable executable",
    test: (files) => files.some((name) => /^AgentScope-.*-Portable-x64\.exe$/i.test(name))
  },
  {
    name: "portable zip",
    test: (files) => files.some((name) => /^AgentScope-.*-win-x64\.zip$/i.test(name))
  },
  {
    name: "prebuild manifest",
    test: () => fs.existsSync(manifestPath)
  }
];

if (!fs.existsSync(outDir)) {
  throw new Error(`Desktop output directory does not exist: ${outDir}`);
}

const files = fs.readdirSync(outDir).filter((name) => fs.statSync(path.join(outDir, name)).isFile());
const missing = required.filter((item) => !item.test(files)).map((item) => item.name);

if (missing.length) {
  throw new Error(`Missing desktop artifact(s): ${missing.join(", ")}. Found: ${files.join(", ") || "(none)"}`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (manifest.kind !== "AgentScope Desktop Prebuild" || !manifest.version || !Array.isArray(manifest.artifacts)) {
  throw new Error("agentscope-prebuild.json is not a valid AgentScope prebuild manifest.");
}
if (!manifest.commit || typeof manifest.commit !== "string") {
  throw new Error("agentscope-prebuild.json is missing a commit.");
}

const head = git(["rev-parse", "--short", "HEAD"]);
if (strictHead && head && manifest.commit !== head) {
  throw new Error(`agentscope-prebuild.json commit ${manifest.commit} does not match current HEAD ${head}. Rebuild package:pre.`);
}

const artifactRows = [];
const seen = new Set();
for (const artifact of manifest.artifacts) {
  const artifactText = String(artifact);
  const artifactPortable = toPortablePath(artifactText);
  if (typeof artifact !== "string" || !artifactPortable.startsWith("apps/desktop/out/")) {
    throw new Error(`Manifest artifact path is not under apps/desktop/out: ${String(artifact)}`);
  }
  if (artifactPortable.includes("builder-debug.yml")) {
    throw new Error("Manifest must not include builder-debug.yml because it can contain machine-local paths.");
  }
  if (seen.has(artifactPortable)) throw new Error(`Manifest contains duplicate artifact: ${artifactText}`);
  seen.add(artifactPortable);
  const artifactPath = path.resolve(root, artifactText);
  ensureInside(artifactPath, outDir);
  if (!fs.existsSync(artifactPath)) throw new Error(`Manifest artifact is missing: ${artifactText}`);
  const stat = fs.statSync(artifactPath);
  if (!stat.isFile()) throw new Error(`Manifest artifact is not a file: ${artifactText}`);
  if (stat.size < 1) throw new Error(`Manifest artifact is empty: ${artifactText}`);
  artifactRows.push({ artifact: artifactPortable, bytes: stat.size, sha256: hashFile(artifactPath) });
}

const expectedPatterns = [
  /^apps\/desktop\/out\/AgentScope-.*-Setup-x64\.exe$/i,
  /^apps\/desktop\/out\/AgentScope-.*-Portable-x64\.exe$/i,
  /^apps\/desktop\/out\/AgentScope-.*-win-x64\.zip$/i,
  /^apps\/desktop\/out\/win-unpacked\/AgentScope\.exe$/i
];
for (const pattern of expectedPatterns) {
  if (!artifactRows.some((row) => pattern.test(row.artifact))) {
    throw new Error(`Manifest is missing required artifact pattern: ${pattern}`);
  }
}

console.log(`Verified AgentScope desktop artifacts for ${manifest.version} (${manifest.commit}):`);
for (const row of artifactRows) {
  console.log(`- ${row.artifact} ${row.bytes} bytes sha256=${row.sha256}`);
}
if (!strictHead && head && manifest.commit !== head) {
  console.log(`Warning: manifest commit ${manifest.commit} does not match current HEAD ${head}. Use --strict-head for release boundary checks.`);
}

function ensureInside(targetPath, allowedRoot) {
  const resolvedTarget = path.resolve(targetPath).toLowerCase();
  const resolvedRoot = path.resolve(allowedRoot).toLowerCase();
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Refusing to inspect path outside desktop out: ${targetPath}`);
  }
}

function hashFile(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function toPortablePath(value) {
  return value.replace(/\\/g, "/");
}

function git(gitArgs) {
  const result = spawnSync("git.exe", gitArgs, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}
