import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const cliArgs = process.argv.slice(2);
const executableArg = cliArgs.find((arg) => arg.startsWith("--executable="));
const executable = executableArg
  ? path.resolve(executableArg.slice("--executable=".length))
  : path.join(root, "apps", "desktop", "out", "win-unpacked", "AgentScope.exe");
const outputArg = cliArgs.find((arg) => !arg.startsWith("--"));
const outputRoot = outputArg
  ? path.resolve(outputArg)
  : path.join(root, "apps", "desktop", "out", "smoke", smokeStamp(), "ipc-negative");
const fixturesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-ipc-negative-"));
const home = path.join(fixturesRoot, "home");
const userData = path.join(fixturesRoot, "ElectronUserData");
const resultPath = path.join(outputRoot, "ipc-negative-result.json");

let completed = false;
try {
  fs.mkdirSync(path.join(home, ".codex"), { recursive: true });
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(path.join(home, ".codex", "config.toml"), 'model = "gpt-5.5"\n', "utf8");
  fs.writeFileSync(path.join(home, ".codex", "auth.json"), '{"token":"must-not-open"}\n', "utf8");

  const result = spawnSync(executable, ["--disable-gpu", "--agentscope-smoke"], {
    cwd: root,
    env: {
      ...process.env,
      AGENTSCOPE_SMOKE: "1",
      AGENTSCOPE_SMOKE_IPC_NEGATIVE: "1",
      AGENTSCOPE_SMOKE_IPC_NEGATIVE_RESULT: resultPath,
      AGENTSCOPE_SMOKE_USER_DATA: userData,
      AGENTSCOPE_SMOKE_NO_SHELL: "1",
      AGENTSCOPE_HOME: home,
      AGENTSCOPE_DATA_HOME: path.join(home, ".agentscope"),
      CODEX_HOME: path.join(home, ".codex"),
      CODEX_SQLITE_HOME: path.join(home, ".codex"),
      CLAUDE_HOME: path.join(home, ".claude"),
      NO_COLOR: "1"
    },
    encoding: "utf8",
    timeout: 60_000,
    windowsHide: true
  });
  fs.writeFileSync(path.join(outputRoot, "ipc-negative.out.log"), result.stdout ?? "", "utf8");
  fs.writeFileSync(path.join(outputRoot, "ipc-negative.err.log"), result.stderr ?? "", "utf8");
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${executable} ipc negative smoke exited with ${result.status}; output=${outputRoot}`);
  }
  const payload = JSON.parse(fs.readFileSync(resultPath, "utf8"));
  const failures = payload.results.filter((item) => item.ok || !/IPC sender rejected/i.test(item.message));
  if (failures.length) {
    throw new Error(`IPC negative smoke failures: ${JSON.stringify(failures)}`);
  }
  completed = true;
  console.log(`Desktop IPC negative smoke passed. Results: ${path.relative(root, resultPath)}`);
} finally {
  if (completed) {
    fs.rmSync(fixturesRoot, { recursive: true, force: true });
  } else {
    console.error(`IPC negative smoke fixture preserved for debugging: ${fixturesRoot}`);
    console.error(`IPC negative smoke output preserved for debugging: ${outputRoot}`);
  }
}

function smokeStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
