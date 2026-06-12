import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

if (process.platform !== "win32") {
  throw new Error("AgentScope desktop packaging is Windows-only.");
}

const root = process.cwd();
const desktopDir = path.join(root, "apps", "desktop");
const outDir = path.join(desktopDir, "out");
const npmCommand = "npm.cmd";
const npxCommand = "npx.cmd";
const args = new Set(process.argv.slice(2));
const mode = args.has("--pre") || args.has("--dist") || args.has("--beta") ? "pre" : "dir";
const startedAt = new Date();
const preVersion = process.env.AGENTSCOPE_PRE_VERSION || `${readDesktopVersion()}-pre`;

try {
  run(npmCommand, ["run", "native:rebuild"], root);
  run(npmCommand, ["--workspace", "@agentscope/desktop", "run", "build"], root);

  if (mode === "pre") {
    cleanDesktopArtifacts();
    runBuilder(["--dir", "--publish", "never", `-c.extraMetadata.version=${preVersion}`]);
    runBuilder(["--win", "--x64", "--publish", "never", `-c.extraMetadata.version=${preVersion}`]);
    writePrebuildManifest(preVersion, startedAt);
  } else {
    runBuilder(["--dir", "--publish", "never"]);
  }
} finally {
  run(npmCommand, ["run", "native:restore"], root);
}

printArtifacts();

function runBuilder(builderArgs) {
  run(npxCommand, ["electron-builder", ...builderArgs], desktopDir);
}

function run(command, commandArgs, cwd) {
  const result = spawnSync("cmd.exe", ["/d", "/s", "/c", [command, ...commandArgs].map(quoteCmdArg).join(" ")], {
    cwd,
    stdio: "inherit",
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(" ")} exited with status ${result.status ?? "unknown"}`);
  }
}

function quoteCmdArg(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(text)) return text;
  return `"${text.replace(/(["^&|<>])/g, "^$1")}"`;
}

function cleanDesktopArtifacts() {
  ensureInside(outDir, path.join(desktopDir, "out"));
  if (!fs.existsSync(outDir)) return;
  for (const entry of fs.readdirSync(outDir, { withFileTypes: true })) {
    const target = path.join(outDir, entry.name);
    ensureInside(target, outDir);
    if (entry.isDirectory()) {
      if (entry.name === "win-unpacked") fs.rmSync(target, { recursive: true, force: true });
      continue;
    }
    if (/\.(exe|zip|yml|yaml|blockmap|json)$/i.test(entry.name)) {
      fs.rmSync(target, { force: true });
    }
  }
}

function ensureInside(targetPath, allowedRoot) {
  const resolvedTarget = path.resolve(targetPath).toLowerCase();
  const resolvedRoot = path.resolve(allowedRoot).toLowerCase();
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Refusing to touch path outside desktop out: ${targetPath}`);
  }
}

function readDesktopVersion() {
  const raw = fs.readFileSync(path.join(desktopDir, "package.json"), "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed.version || typeof parsed.version !== "string") {
    throw new Error("apps/desktop/package.json is missing a string version.");
  }
  return parsed.version;
}

function writePrebuildManifest(version, createdAt) {
  fs.mkdirSync(outDir, { recursive: true });
  const manifest = {
    kind: "AgentScope Desktop Prebuild",
    version,
    createdAt: createdAt.toISOString(),
    commit: git(["rev-parse", "--short", "HEAD"]),
    artifacts: collectArtifacts()
  };
  fs.writeFileSync(path.join(outDir, "agentscope-prebuild.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
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

function printArtifacts() {
  const artifacts = collectArtifacts();
  if (!artifacts.length) return;
  console.log("AgentScope desktop artifacts:");
  for (const artifact of artifacts) console.log(`- ${artifact}`);
}

function collectArtifacts() {
  if (!fs.existsSync(outDir)) return [];
  const artifacts = [];
  for (const entry of fs.readdirSync(outDir, { withFileTypes: true })) {
    if (
      entry.isFile() &&
      (/^AgentScope-.*(?:Setup-x64|Portable-x64)\.exe$/i.test(entry.name) ||
        /^AgentScope-.*-win-x64\.zip$/i.test(entry.name) ||
        /^AgentScope-.*\.(?:exe|zip)\.blockmap$/i.test(entry.name) ||
        entry.name === "agentscope-prebuild.json")
    ) {
      artifacts.push(path.relative(root, path.join(outDir, entry.name)));
    }
  }
  const unpackedExe = path.join(outDir, "win-unpacked", "AgentScope.exe");
  if (fs.existsSync(unpackedExe)) artifacts.push(path.relative(root, unpackedExe));
  return artifacts.sort();
}
