import { spawnSync } from "node:child_process";
import path from "node:path";

const env = {
  ...process.env,
  AGENTSCOPE_APP_SMOKE: "1"
};

console.log("AgentScope app smoke starting.");
console.log("This smoke uses synthetic agent homes and exercises indexing, search, session ops, and launch resolution.");

const result = spawnSync(
  process.execPath,
  [path.join("node_modules", "vitest", "vitest.mjs"), "run", "packages/core/src/agentScopeSmoke.test.ts"],
  {
    cwd: process.cwd(),
    env,
    stdio: "inherit"
  }
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
