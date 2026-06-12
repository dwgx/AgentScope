import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "apps", "desktop", "out");

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
    test: () => fs.existsSync(path.join(outDir, "agentscope-prebuild.json"))
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

const manifestPath = path.join(outDir, "agentscope-prebuild.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (manifest.kind !== "AgentScope Desktop Prebuild" || !manifest.version || !Array.isArray(manifest.artifacts)) {
  throw new Error("agentscope-prebuild.json is not a valid AgentScope prebuild manifest.");
}

console.log(`Verified AgentScope desktop artifacts for ${manifest.version}:`);
for (const artifact of manifest.artifacts) console.log(`- ${artifact}`);
