import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

if (process.platform !== "win32") {
  console.error("AgentScope is Windows-only; electron:repair only supports win32.");
  process.exit(1);
}

const root = process.cwd();
const electronPackage = path.join(root, "node_modules", "electron");
const electronDist = path.join(electronPackage, "dist");
const electronExe = path.join(electronDist, "electron.exe");

if (fs.existsSync(electronExe)) {
  console.log(`Electron binary already exists: ${electronExe}`);
  process.exit(0);
}

const version = JSON.parse(fs.readFileSync(path.join(electronPackage, "package.json"), "utf8")).version;
const cacheRoot = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "electron", "Cache");
const archive = findElectronArchive(cacheRoot, `electron-v${version}-win32-x64.zip`);

if (!archive) {
  console.error(`Could not find electron-v${version}-win32-x64.zip under ${cacheRoot}.`);
  console.error("Run npm install again with network access, then retry npm run electron:repair.");
  process.exit(1);
}

fs.rmSync(electronDist, { recursive: true, force: true });
fs.mkdirSync(electronDist, { recursive: true });
execFileSync("powershell.exe", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath ${psQuote(archive)} -DestinationPath ${psQuote(electronDist)} -Force`], {
  stdio: "inherit"
});
fs.writeFileSync(path.join(electronPackage, "path.txt"), "electron.exe");
console.log(`Repaired Electron ${version} from ${archive}`);

function findElectronArchive(rootDir, fileName) {
  if (!fs.existsSync(rootDir)) return undefined;
  const queue = [rootDir];
  while (queue.length) {
    const dir = queue.shift();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) queue.push(filePath);
      else if (entry.name.toLowerCase() === fileName.toLowerCase()) return filePath;
    }
  }
  return undefined;
}

function psQuote(value) {
  return `'${value.replaceAll("'", "''")}'`;
}
