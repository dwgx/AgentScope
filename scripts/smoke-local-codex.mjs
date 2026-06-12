import { spawnSync } from "node:child_process";
import path from "node:path";

const strict = process.argv.includes("--strict-boundaries");

const env = {
  ...process.env,
  AGENTSCOPE_LOCAL_CODEX_SMOKE: "1",
  AGENTSCOPE_LOCAL_CODEX_STRICT_BOUNDARY_SMOKE: strict ? "1" : "0"
};

console.log(`AgentScope local Codex smoke starting${strict ? " (strict boundaries)" : ""}.`);
console.log("This smoke uses synthetic CODEX_HOME fixtures and metadata-only Codex CLI commands.");

const invocation = {
  file: process.execPath,
  args: [path.join("node_modules", "vitest", "vitest.mjs"), "run", "packages/core/src/localCodexSmoke.test.ts"]
};
const result = spawnSync(invocation.file, invocation.args, {
  cwd: process.cwd(),
  env,
  stdio: "inherit"
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
