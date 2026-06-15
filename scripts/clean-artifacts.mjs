import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "apps", "desktop", "out");
const portableOutDir = path.join(root, "apps", "desktop", "out-portable");
const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const cleanSmoke = args.has("--smoke");
const cleanReleasables = args.has("--releasables");
const cleanPortable = args.has("--portable");

const targets = [];
addIfExists(path.join(outDir, "ci-pre"));
addIfExists(path.join(outDir, "builder-debug.yml"));
if (cleanSmoke) addIfExists(path.join(outDir, "smoke"));
if (cleanReleasables && fs.existsSync(outDir)) {
  for (const entry of fs.readdirSync(outDir, { withFileTypes: true })) {
    const target = path.join(outDir, entry.name);
    if (entry.isDirectory() && entry.name === "win-unpacked") addIfExists(target);
    if (
      entry.isFile() &&
      (/^AgentScope-.*(?:Setup-x64|Portable-x64)\.exe$/i.test(entry.name) ||
        /^AgentScope-.*-win-x64\.zip$/i.test(entry.name) ||
        /^AgentScope-.*\.(?:exe|zip)\.blockmap$/i.test(entry.name) ||
        entry.name === "agentscope-prebuild.json")
    ) {
      addIfExists(target);
    }
  }
}
if (cleanPortable) addIfExists(portableOutDir);

if (!targets.length) {
  console.log("No desktop artifact cleanup candidates found.");
  process.exit(0);
}

console.log(`${apply ? "Deleting" : "Dry run, would delete"} ${targets.length} path(s):`);
for (const target of targets) {
  ensureInsideAny(target, [outDir, portableOutDir]);
  console.log(`- ${path.relative(root, target)}`);
  if (apply) fs.rmSync(target, { recursive: true, force: true });
}
if (!apply) {
  console.log(
    "Pass --apply to delete. Pass --smoke to include smoke outputs; pass --releasables to remove current release files too; pass --portable to remove apps/desktop/out-portable."
  );
}

function addIfExists(target) {
  if (fs.existsSync(target)) targets.push(path.resolve(target));
}

function ensureInsideAny(targetPath, allowedRoots) {
  if (allowedRoots.some((allowedRoot) => pathInside(targetPath, allowedRoot))) return;
  throw new Error(`Refusing to delete path outside desktop output directories: ${targetPath}`);
}

function pathInside(targetPath, allowedRoot) {
  const resolvedTarget = path.resolve(targetPath).toLowerCase();
  const resolvedRoot = path.resolve(allowedRoot).toLowerCase();
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`);
}
