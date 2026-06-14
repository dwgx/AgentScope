import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "apps", "desktop", "out");
const timeoutMs = Number(process.env.AGENTSCOPE_PORTABLE_SMOKE_TIMEOUT_MS ?? 120_000);

if (process.platform !== "win32") {
  throw new Error("AgentScope portable smoke is Windows-only.");
}

const portableExe = findNewestPortable();
const fixturesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-portable-smoke-"));
const screenshotPath = path.join(fixturesRoot, "portable-smoke.png");
const savedScreenshotPath = path.join(outDir, "smoke", "portable-smoke.png");
const markerArg = `--agentscope-portable-smoke=${path.basename(fixturesRoot)}`;

try {
  fs.mkdirSync(path.join(fixturesRoot, "home", ".codex"), { recursive: true });
  fs.mkdirSync(path.join(fixturesRoot, "home", ".claude"), { recursive: true });

  const child = spawn(portableExe, ["--agentscope-smoke", markerArg, "--disable-gpu"], {
    cwd: root,
    env: {
      ...process.env,
      AGENTSCOPE_SMOKE: "1",
      AGENTSCOPE_SMOKE_VISIBLE: "1",
      AGENTSCOPE_SMOKE_VIEW: "settings",
      AGENTSCOPE_SMOKE_DISABLE_PROCESSES: "1",
      AGENTSCOPE_SMOKE_NO_SHELL: "1",
      AGENTSCOPE_SMOKE_LANGUAGE: "zh-CN",
      AGENTSCOPE_SMOKE_USER_DATA: path.join(fixturesRoot, "ElectronUserData"),
      AGENTSCOPE_SMOKE_SCREENSHOT: screenshotPath,
      AGENTSCOPE_SMOKE_SCREENSHOT_DELAY_MS: "2500",
      AGENTSCOPE_SMOKE_QUIT_AFTER_SCREENSHOT: "1",
      AGENTSCOPE_HOME: path.join(fixturesRoot, "home"),
      AGENTSCOPE_DATA_HOME: path.join(fixturesRoot, "home", ".agentscope"),
      AGENTSCOPE_LAUNCHER_APPDATA: path.join(fixturesRoot, "AppData", "Roaming"),
      CODEX_HOME: path.join(fixturesRoot, "home", ".codex"),
      CODEX_SQLITE_HOME: path.join(fixturesRoot, "home", ".codex"),
      CLAUDE_HOME: path.join(fixturesRoot, "home", ".claude"),
      NO_COLOR: "1"
    },
    windowsHide: true,
    stdio: "ignore"
  });

  await waitForScreenshot(child, screenshotPath, timeoutMs);
  await waitForExit(child, 20_000);
  fs.mkdirSync(path.dirname(savedScreenshotPath), { recursive: true });
  fs.copyFileSync(screenshotPath, savedScreenshotPath);
  console.log(`Portable desktop smoke passed. Screenshot: ${path.relative(root, savedScreenshotPath)}`);
} catch (error) {
  cleanupSmokeProcesses(markerArg);
  throw error;
} finally {
  cleanupSmokeProcesses(markerArg);
  if (fs.existsSync(screenshotPath)) {
    removeFixtureRoot(fixturesRoot);
  } else {
    console.error(`Portable smoke fixture preserved for debugging: ${fixturesRoot}`);
  }
}

function findNewestPortable() {
  if (!fs.existsSync(outDir)) throw new Error(`Desktop output directory does not exist: ${outDir}`);
  const candidates = fs
    .readdirSync(outDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^AgentScope-.*-Portable-x64\.exe$/i.test(entry.name))
    .map((entry) => {
      const fullPath = path.join(outDir, entry.name);
      return { fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  if (!candidates.length) {
    throw new Error("No AgentScope portable executable found under apps/desktop/out.");
  }
  return candidates[0].fullPath;
}

async function waitForScreenshot(child, targetPath, maxMs) {
  const startedAt = Date.now();
  let childExit;
  child.once("exit", (code, signal) => {
    childExit = { code, signal };
  });

  while (Date.now() - startedAt < maxMs) {
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 10_000) return;
    if (childExit && Date.now() - startedAt > 5_000) {
      throw new Error(`Portable process exited before smoke screenshot: ${JSON.stringify(childExit)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for portable smoke screenshot after ${maxMs}ms.`);
}

async function waitForExit(child, maxMs) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exit = new Promise((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  const timeout = new Promise((resolve) => {
    setTimeout(() => resolve(undefined), maxMs);
  });
  const result = await Promise.race([exit, timeout]);
  if (!result && child.exitCode === null && child.signalCode === null) {
    throw new Error(`Portable process did not exit within ${maxMs}ms after smoke screenshot.`);
  }
}

function cleanupSmokeProcesses(marker) {
  const escaped = marker.replace(/'/g, "''");
  spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `$marker='${escaped}'; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*$marker*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`
    ],
    { windowsHide: true, stdio: "ignore" }
  );
}

function removeFixtureRoot(targetPath) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
      return;
    } catch (error) {
      if (attempt === 4) {
        console.error(`Portable smoke fixture cleanup failed: ${targetPath}`);
        console.error(error);
        return;
      }
    }
  }
}
