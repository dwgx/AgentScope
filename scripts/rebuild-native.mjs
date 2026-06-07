import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

if (process.platform !== "win32") {
  console.error("AgentScope is Windows-only; native rebuild only supports win32.");
  process.exit(1);
}

const root = process.cwd();
const mode = process.argv[2] === "node" ? "node" : "electron";
const betterSqliteDir = path.join(root, "node_modules", "better-sqlite3");
const bindingPath = path.join(betterSqliteDir, "build", "Release", "better_sqlite3.node");
const desktopPackagePath = path.join(root, "apps", "desktop", "package.json");
const desktopPackage = JSON.parse(fs.readFileSync(desktopPackagePath, "utf8"));
const electronVersion = String(
  desktopPackage.devDependencies?.electron ?? desktopPackage.dependencies?.electron ?? ""
).replace(/^[^\d]*/, "");

if (mode === "electron" && !electronVersion) {
  console.error(`Could not resolve Electron version from ${desktopPackagePath}`);
  process.exit(1);
}

if (mode === "node") {
  restoreNodeBinding();
} else {
  rebuildElectronBinding();
}

function rebuildElectronBinding() {
  const electronRebuild = path.join(root, "node_modules", "@electron", "rebuild", "lib", "cli.js");
  if (!fs.existsSync(electronRebuild)) {
    console.error(`electron-rebuild CLI not found: ${electronRebuild}`);
    console.error("Run npm install, then retry npm run package.");
    process.exit(1);
  }
  execFileSync(process.execPath, [electronRebuild, "-f", "-w", "better-sqlite3", "-v", electronVersion], {
    cwd: root,
    stdio: "inherit",
    windowsHide: true
  });
  console.log(`Rebuilt better-sqlite3 for Electron ${electronVersion}`);
}

function restoreNodeBinding() {
  const prebuildInstall = path.join(root, "node_modules", "prebuild-install", "bin.js");
  if (!fs.existsSync(prebuildInstall)) {
    console.error(`prebuild-install not found: ${prebuildInstall}`);
    process.exit(1);
  }
  fs.rmSync(bindingPath, { force: true });
  execFileSync(process.execPath, [prebuildInstall], {
    cwd: betterSqliteDir,
    stdio: "inherit",
    windowsHide: true
  });
  if (!fs.existsSync(bindingPath)) {
    console.error(`Node better-sqlite3 binding was not restored: ${bindingPath}`);
    process.exit(1);
  }
  console.log(`Restored better-sqlite3 for Node ABI ${process.versions.modules}`);
}
