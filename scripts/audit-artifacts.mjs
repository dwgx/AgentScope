import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "apps", "desktop", "out");
const portableOutDir = path.join(root, "apps", "desktop", "out-portable");
const manifestPath = path.join(outDir, "agentscope-prebuild.json");

const rows = [];
if (fs.existsSync(outDir)) {
  for (const entry of fs.readdirSync(outDir, { withFileTypes: true })) {
    const target = path.join(outDir, entry.name);
    const stat = fs.statSync(target);
    rows.push({
      name: entry.name,
      kind: entry.isDirectory() ? "directory" : "file",
      bytes: entry.isDirectory() ? directorySize(target) : stat.size,
      updatedAt: stat.mtime.toISOString()
    });
  }
}

const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : undefined;
const head = git(["rev-parse", "--short", "HEAD"]);

console.log("AgentScope desktop artifact audit");
console.log(`outDir: ${outDir}`);
console.log(`currentHead: ${head ?? "(unknown)"}`);
if (!fs.existsSync(outDir)) {
  console.log("status: missing output directory");
} else {
  console.log("");
  console.log("entries:");
  for (const row of rows.sort((a, b) => b.bytes - a.bytes)) {
    console.log(`- ${row.kind.padEnd(9)} ${formatBytes(row.bytes).padStart(10)} ${row.updatedAt} ${row.name}`);
  }
}

if (manifest) {
  console.log("");
  console.log(`manifest: ${manifest.version ?? "(missing version)"} ${manifest.commit ?? "(missing commit)"}`);
  if (head && manifest.commit && manifest.commit !== head) {
    console.log(`manifestWarning: commit ${manifest.commit} does not match current HEAD ${head}`);
  }
  if (Array.isArray(manifest.artifacts)) {
    for (const artifact of manifest.artifacts) {
      const artifactPath = path.resolve(root, String(artifact));
      const exists = pathInside(outDir, artifactPath) && fs.existsSync(artifactPath);
      const bytes = exists ? fs.statSync(artifactPath).size : 0;
      const localPathWarning = String(artifact).includes("builder-debug.yml") ? " WARNING: local debug file" : "";
      console.log(`- ${exists ? "ok" : "missing"} ${formatBytes(bytes).padStart(10)} ${artifact}${localPathWarning}`);
    }
  }
} else {
  console.log("");
  console.log("manifest: missing");
}

console.log("");
console.log("cleanup candidates:");
for (const candidate of cleanupCandidates()) {
  console.log(`- ${candidate}`);
}

if (fs.existsSync(portableOutDir)) {
  console.log("");
  console.log("portable-only output:");
  for (const row of directoryRows(portableOutDir).sort((a, b) => b.bytes - a.bytes)) {
    console.log(`- ${row.kind.padEnd(9)} ${formatBytes(row.bytes).padStart(10)} ${row.updatedAt} ${path.join("apps", "desktop", "out-portable", row.name)}`);
  }
}

function cleanupCandidates() {
  const out = [];
  for (const name of ["ci-pre", "builder-debug.yml"]) {
    if (fs.existsSync(path.join(outDir, name))) out.push(path.join("apps", "desktop", "out", name));
  }
  const smokeDir = path.join(outDir, "smoke");
  if (fs.existsSync(smokeDir)) out.push(path.join("apps", "desktop", "out", "smoke", "(use clean:artifacts --apply after preserving needed screenshots)"));
  if (fs.existsSync(portableOutDir)) {
    out.push(path.join("apps", "desktop", "out-portable", "(portable-only release output; remove manually after preserving needed assets)"));
  }
  return out;
}

function directoryRows(dirPath) {
  const rows = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const target = path.join(dirPath, entry.name);
    const stat = fs.statSync(target);
    rows.push({
      name: entry.name,
      kind: entry.isDirectory() ? "directory" : "file",
      bytes: entry.isDirectory() ? directorySize(target) : stat.size,
      updatedAt: stat.mtime.toISOString()
    });
  }
  return rows;
}

function directorySize(dirPath) {
  let total = 0;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const target = path.join(dirPath, entry.name);
    total += entry.isDirectory() ? directorySize(target) : fs.statSync(target).size;
  }
  return total;
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function pathInside(rootPath, targetPath) {
  const resolvedRoot = path.resolve(rootPath).toLowerCase();
  const resolvedTarget = path.resolve(targetPath).toLowerCase();
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`);
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
