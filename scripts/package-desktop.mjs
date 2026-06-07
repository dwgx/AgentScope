import { spawnSync } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

try {
  runNpm(["run", "native:rebuild"]);
  runNpm(["--workspace", "@agentscope/desktop", "run", "package"]);
} finally {
  runNpm(["run", "native:restore"]);
}

function runNpm(args) {
  const command = process.platform === "win32" ? "cmd.exe" : npmCommand;
  const commandArgs =
    process.platform === "win32"
      ? ["/d", "/s", "/c", [npmCommand, ...args].join(" ")]
      : args;
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    stdio: "inherit",
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${npmCommand} ${args.join(" ")} exited with status ${result.status ?? "unknown"}`);
  }
}
