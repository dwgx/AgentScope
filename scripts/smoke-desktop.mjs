import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const outputRoot = path.join(root, "apps", "desktop", "out", "smoke", smokeStamp());
const packagedExe = path.join(root, "apps", "desktop", "out", "win-unpacked", "AgentScope.exe");
const fixturesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-desktop-smoke-"));
const home = path.join(fixturesRoot, "home");
const appData = path.join(fixturesRoot, "AppData", "Roaming");
const localAppData = path.join(fixturesRoot, "AppData", "Local");
const userData = path.join(fixturesRoot, "ElectronUserData");
const launchLog = path.join(fixturesRoot, "launches.jsonl");

const views = [
  { name: "sessions", env: { AGENTSCOPE_SMOKE_VIEW: "sessions" } },
  { name: "relations", env: { AGENTSCOPE_SMOKE_VIEW: "graph" } },
  { name: "settings-codex-control", env: { AGENTSCOPE_SMOKE_VIEW: "settings", AGENTSCOPE_SMOKE_SETTINGS_SECTION: "codexControl" } },
  { name: "codex-control-templates", env: { AGENTSCOPE_SMOKE_VIEW: "codexControl", AGENTSCOPE_SMOKE_CODEX_CONTROL_TAB: "templates" } },
  { name: "codex-control-overview", env: { AGENTSCOPE_SMOKE_VIEW: "codexControl", AGENTSCOPE_SMOKE_CODEX_CONTROL_TAB: "overview" } },
  { name: "codex-control-files", env: { AGENTSCOPE_SMOKE_VIEW: "codexControl", AGENTSCOPE_SMOKE_CODEX_CONTROL_TAB: "files" } },
  { name: "codex-control-models", env: { AGENTSCOPE_SMOKE_VIEW: "codexControl", AGENTSCOPE_SMOKE_CODEX_CONTROL_TAB: "models" } },
  { name: "codex-control-safety", env: { AGENTSCOPE_SMOKE_VIEW: "codexControl", AGENTSCOPE_SMOKE_CODEX_CONTROL_TAB: "safety" } }
];
let Database;

let completed = false;
try {
  console.log("AgentScope desktop smoke starting.");
  console.log("This smoke launches Electron with synthetic AgentScope/Codex/Claude roots and writes local screenshots.");
  run("cmd.exe", ["/d", "/s", "/c", "npm run package"], root, process.env, 300_000);
  Database = (await import("better-sqlite3")).default;
  seedFixtureHome(home);
  fs.mkdirSync(outputRoot, { recursive: true });
  console.log(`Screenshots will be written under ${path.relative(root, outputRoot)}`);

  for (const view of views) {
    const screenshotPath = path.join(outputRoot, `${view.name}.png`);
    const env = {
      ...process.env,
      ...view.env,
      AGENTSCOPE_SMOKE: "1",
      AGENTSCOPE_SMOKE_VISIBLE: "1",
      AGENTSCOPE_SMOKE_DISABLE_PROCESSES: "1",
      AGENTSCOPE_SMOKE_NO_SHELL: "1",
      AGENTSCOPE_SMOKE_FAKE_LAUNCH: "1",
      AGENTSCOPE_SMOKE_LANGUAGE: "zh-CN",
      AGENTSCOPE_SMOKE_USER_DATA: userData,
      AGENTSCOPE_SMOKE_LAUNCH_LOG: launchLog,
      AGENTSCOPE_SMOKE_SCREENSHOT: screenshotPath,
      AGENTSCOPE_SMOKE_SCREENSHOT_DELAY_MS: "2500",
      AGENTSCOPE_SMOKE_QUIT_AFTER_SCREENSHOT: "1",
      AGENTSCOPE_HOME: home,
      AGENTSCOPE_DATA_HOME: path.join(home, ".agentscope"),
      AGENTSCOPE_LAUNCHER_APPDATA: appData,
      CODEX_HOME: path.join(home, ".codex"),
      CODEX_SQLITE_HOME: path.join(home, ".codex"),
      CLAUDE_HOME: path.join(home, ".claude"),
      NO_COLOR: "1"
    };
    runElectronView(view.name, env);
    const stat = fs.statSync(screenshotPath, { throwIfNoEntry: false });
    if (!stat?.isFile() || stat.size < 10_000) {
      throw new Error(`Desktop smoke screenshot was not created or is too small: ${screenshotPath}`);
    }
    console.log(`Saved ${path.relative(root, screenshotPath)} (${stat.size} bytes)`);
  }
  run(process.execPath, ["scripts/smoke-desktop-clicks.mjs", "--packaged", path.join(outputRoot, "clicks")], root, process.env, 180_000);
  completed = true;
} finally {
  if (completed) {
    fs.rmSync(fixturesRoot, { recursive: true, force: true });
  } else {
    console.error(`Desktop smoke fixture preserved for debugging: ${fixturesRoot}`);
    console.error(`Desktop smoke output preserved for debugging: ${outputRoot}`);
  }
}

function run(file, args, cwd, env, timeout) {
  const result = spawnSync(file, args, {
    cwd,
    env,
    stdio: "inherit",
    timeout,
    windowsHide: true
  });
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${file} ${args.join(" ")} exited with ${result.status}`);
  }
}

function runElectronView(name, env) {
  const outLog = path.join(outputRoot, `${name}.out.log`);
  const errLog = path.join(outputRoot, `${name}.err.log`);
  const result = spawnSync(packagedExe, [
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--no-sandbox",
    "--disable-features=CalculateNativeWinOcclusion",
    "--agentscope-smoke"
  ], {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 60_000,
    windowsHide: true
  });
  fs.writeFileSync(outLog, result.stdout ?? "", "utf8");
  fs.writeFileSync(errLog, result.stderr ?? "", "utf8");
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${packagedExe} --agentscope-smoke exited with ${result.status}; logs: ${outLog}, ${errLog}`);
  }
}

function seedFixtureHome(targetHome) {
  fs.mkdirSync(targetHome, { recursive: true });
  fs.mkdirSync(appData, { recursive: true });
  fs.mkdirSync(localAppData, { recursive: true });
  const codexRoot = path.join(targetHome, ".codex");
  const claudeRoot = path.join(targetHome, ".claude");
  fs.mkdirSync(codexRoot, { recursive: true });
  fs.writeFileSync(
    path.join(codexRoot, "config.toml"),
    [
      'model = "gpt-5.5"',
      'review_model = "gpt-5.4-mini"',
      'model_reasoning_effort = "high"',
      'plan_mode_reasoning_effort = "medium"',
      "",
      "[windows]",
      'sandbox = "unelevated"',
      "",
      "[mcp_servers.playwright]",
      'command = "node"',
      'args = ["@playwright/mcp"]',
      "enabled = true",
      "",
      '[plugins."browser@openai-bundled"]',
      "enabled = true"
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(path.join(codexRoot, "auth.json"), JSON.stringify({ OPENAI_API_KEY: "smoke-secret-auth-token" }, null, 2) + "\n", "utf8");
  fs.writeFileSync(path.join(codexRoot, "AGENTS.md"), "Synthetic AgentScope smoke instructions.\n", "utf8");
  fs.mkdirSync(path.join(codexRoot, "rules"), { recursive: true });
  fs.writeFileSync(path.join(codexRoot, "rules", "default.rules"), "# Synthetic smoke rule\n", "utf8");
  fs.mkdirSync(path.join(codexRoot, "skills", "review-helper"), { recursive: true });
  fs.writeFileSync(path.join(codexRoot, "skills", "review-helper", "SKILL.md"), "---\nname: review-helper\n---\nSynthetic skill body.\n", "utf8");
  fs.mkdirSync(path.join(codexRoot, "skills", ".system", "skill-creator"), { recursive: true });
  fs.writeFileSync(path.join(codexRoot, "skills", ".system", "skill-creator", "SKILL.md"), "system skill body\n", "utf8");
  fs.mkdirSync(path.join(codexRoot, "plugins", "browser@openai-bundled"), { recursive: true });
  fs.mkdirSync(path.join(codexRoot, "mcp-node", "node_modules"), { recursive: true });
  fs.mkdirSync(path.join(codexRoot, "node_repl", "active_execs"), { recursive: true });
  fs.mkdirSync(path.join(codexRoot, "vendor_imports"), { recursive: true });
  fs.writeFileSync(path.join(codexRoot, "vendor_imports", "skills-curated-cache.json"), "{}\n", "utf8");

  const parentId = "11111111-1111-4111-8111-111111111111";
  const childId = "22222222-2222-4222-8222-222222222222";
  const archivedId = "33333333-3333-4333-8333-333333333333";
  const parentRollout = codexRolloutPath(targetHome, parentId, "sessions");
  const childRollout = codexRolloutPath(targetHome, childId, "sessions");
  const archivedRollout = codexRolloutPath(targetHome, archivedId, "archived_sessions");
  fs.mkdirSync(path.dirname(parentRollout), { recursive: true });
  fs.mkdirSync(path.dirname(archivedRollout), { recursive: true });
  fs.writeFileSync(parentRollout, rolloutLine(parentId, "AgentScope smoke parent", String.raw`D:\AgentScopeSmoke\Workspace`) + "\n", "utf8");
  fs.writeFileSync(
    childRollout,
    JSON.stringify({
      type: "session_meta",
      payload: {
        id: childId,
        title: "AgentScope smoke subagent",
        cwd: String.raw`D:\AgentScopeSmoke\Workspace`,
        parent_thread_id: parentId,
        thread_source: "subagent",
        agent_nickname: "SmokeSubagent",
        agent_role: "explorer"
      }
    }) + "\n",
    "utf8"
  );
  fs.writeFileSync(archivedRollout, rolloutLine(archivedId, "AgentScope archived smoke", String.raw`D:\Archive`) + "\n", "utf8");
  seedCodexSqlite(codexRoot, parentId, childId, archivedId, parentRollout, childRollout, archivedRollout);

  const claudeId = "44444444-4444-4444-8444-444444444444";
  const encoded = "D--Project-AgentScope";
  fs.mkdirSync(path.join(claudeRoot, "sessions"), { recursive: true });
  fs.mkdirSync(path.join(claudeRoot, "projects", encoded), { recursive: true });
  fs.writeFileSync(
    path.join(claudeRoot, "sessions", "smoke.json"),
    JSON.stringify({
      pid: 0,
      sessionId: claudeId,
      cwd: String.raw`D:\AgentScopeSmoke\Workspace`,
      status: "stopped",
      startedAt: "2026-06-11T00:00:00.000Z",
      updatedAt: "2026-06-11T00:05:00.000Z"
    }),
    "utf8"
  );
  fs.writeFileSync(path.join(claudeRoot, "projects", encoded, `${claudeId}.jsonl`), JSON.stringify({ type: "system", cwd: String.raw`D:\AgentScopeSmoke\Workspace` }) + "\n", "utf8");
  seedQuarantine(targetHome, claudeId);
}

function seedCodexSqlite(codexRoot, parentId, childId, archivedId, parentRollout, childRollout, archivedRollout) {
  const state = new Database(path.join(codexRoot, "state_5.sqlite"));
  state.exec(`
    CREATE TABLE threads (
      id TEXT PRIMARY KEY,
      rollout_path TEXT,
      cwd TEXT,
      title TEXT,
      source TEXT,
      created_at TEXT,
      updated_at TEXT,
      agent_nickname TEXT,
      agent_role TEXT,
      agent_path TEXT,
      thread_source TEXT,
      archived INTEGER
    );
    CREATE TABLE thread_spawn_edges (parent_thread_id TEXT, child_thread_id TEXT, status TEXT);
  `);
  const insert = state.prepare("INSERT INTO threads (id, rollout_path, cwd, title, source, created_at, updated_at, agent_nickname, agent_role, agent_path, thread_source, archived) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  insert.run(parentId, parentRollout, String.raw`D:\AgentScopeSmoke\Workspace`, "AgentScope smoke parent", "", "2026-06-11T00:00:00.000Z", "2026-06-11T00:04:00.000Z", "", "", "", "", 0);
  insert.run(childId, childRollout, String.raw`D:\AgentScopeSmoke\Workspace`, "AgentScope smoke subagent", JSON.stringify({ subagent: { thread_spawn: { parent_thread_id: parentId, depth: 1, agent_nickname: "SmokeSubagent", agent_role: "explorer", agent_path: "smoke-child" } } }), "2026-06-11T00:01:00.000Z", "2026-06-11T00:05:00.000Z", "SmokeSubagent", "explorer", "smoke-child", "subagent", 0);
  insert.run(archivedId, archivedRollout, String.raw`D:\Archive`, "AgentScope archived smoke", "", "2026-06-10T00:00:00.000Z", "2026-06-10T00:01:00.000Z", "", "", "", "", 1);
  state.prepare("INSERT INTO thread_spawn_edges (parent_thread_id, child_thread_id, status) VALUES (?, ?, ?)").run(parentId, childId, "running");
  state.close();

  const logs = new Database(path.join(codexRoot, "logs_2.sqlite"));
  logs.exec("CREATE TABLE logs (thread_id TEXT, level TEXT, ts TEXT, target TEXT, body TEXT);");
  logs.prepare("INSERT INTO logs (thread_id, level, ts, target, body) VALUES (?, ?, ?, ?, ?)").run(parentId, "INFO", "2026-06-11T00:02:00Z", "codex", "body omitted");
  logs.close();
}

function seedQuarantine(targetHome, sessionId) {
  const backupDir = path.join(targetHome, ".agentscope", "backups", "2026-06-11T00-00-00-000Z-claude-smoke");
  const quarantineDir = path.join(targetHome, ".agentscope", "quarantine", "2026-06-11T00-00-00-000Z-claude-smoke");
  fs.mkdirSync(backupDir, { recursive: true });
  fs.mkdirSync(quarantineDir, { recursive: true });
  fs.writeFileSync(
    path.join(backupDir, "manifest.json"),
    JSON.stringify({
      schemaVersion: 1,
      kind: "AgentScope Session Backup",
      createdAt: "2026-06-11T00:00:00.000Z",
      agent: "claude",
      sessionId,
      sourceHome: targetHome,
      copiedFiles: []
    }, null, 2) + "\n",
    "utf8"
  );
  fs.writeFileSync(
    path.join(quarantineDir, "journal.json"),
    JSON.stringify({
      schemaVersion: 1,
      kind: "AgentScope Session Delete Journal",
      createdAt: "2026-06-11T00:00:00.000Z",
      updatedAt: "2026-06-11T00:00:00.000Z",
      agent: "claude",
      sessionId,
      backupDir,
      quarantineDir,
      journalPath: path.join(quarantineDir, "journal.json"),
      steps: [
        { phase: "backup", action: "backupSession", status: "succeeded", path: path.join(backupDir, "manifest.json") },
        { phase: "file", action: "move", status: "succeeded", role: "transcript", path: "synthetic", targetPath: quarantineDir }
      ]
    }, null, 2) + "\n",
    "utf8"
  );
}

function codexRolloutPath(targetHome, sessionId, rootName) {
  return path.join(targetHome, ".codex", rootName, "2026", "06", "11", `rollout-2026-06-11T00-00-00-${sessionId}.jsonl`);
}

function rolloutLine(id, title, cwd) {
  return JSON.stringify({
    type: "session_meta",
    payload: {
      id,
      title,
      cwd,
      model: "gpt-5.5",
      usage: { input_tokens: 10, output_tokens: 4 }
    }
  });
}

function smokeStamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}
