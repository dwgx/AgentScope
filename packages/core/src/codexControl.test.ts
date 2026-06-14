import fs from "node:fs";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  executeCodexControlMutation,
  getCodexControlCenterSnapshot,
  listCodexControlSurfaces,
  planCodexControlMutation,
  readCodexModeConfig,
  readCodexControlDocument,
  revealCodexControlSurface,
  saveCodexControlDocument,
  saveCodexModeConfig
} from "./codexControl.js";

const tempRoots: string[] = [];

afterEach(async () => {
  for (const root of tempRoots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function tempHome(): Promise<string> {
  const home = await mkdtemp(path.join(os.tmpdir(), "agentscope-codex-control-"));
  tempRoots.push(home);
  await mkdir(path.join(home, ".codex", "rules"), { recursive: true });
  await mkdir(path.join(home, ".codex", "skills", "review-helper"), { recursive: true });
  await mkdir(path.join(home, ".codex", "skills", ".system", "skill-creator"), { recursive: true });
  return home;
}

describe("Codex control surfaces", () => {
  it("lists editable user config surfaces and read-only system/plugin surfaces", async () => {
    const home = await tempHome();
    await writeFile(
      path.join(home, ".codex", "config.toml"),
      [
        'model = "gpt-5.5"',
        "",
        "[mcp_servers.playwright]",
        'command = "npx"',
        "enabled = true",
        "",
        '[plugins."browser@openai-bundled"]',
        "enabled = true"
      ].join("\n")
    );
    await writeFile(path.join(home, ".codex", "AGENTS.md"), "Use Chinese.\n");
    await writeFile(path.join(home, ".codex", "rules", "default.rules"), "# rules\n");
    await writeFile(path.join(home, ".codex", "skills", "review-helper", "SKILL.md"), "---\nname: review-helper\n---\n");
    await writeFile(path.join(home, ".codex", "skills", ".system", "skill-creator", "SKILL.md"), "system\n");
    await mkdir(path.join(home, ".codex", "browser-profiles", "playwright-output"), { recursive: true });
    await writeFile(path.join(home, ".codex", "browser-profiles", "playwright-output", "console-1.log"), "body omitted\n");
    await mkdir(path.join(home, ".codex", "mcp-node", "node_modules"), { recursive: true });
    await mkdir(path.join(home, ".codex", "node_repl", "active_execs"), { recursive: true });
    await mkdir(path.join(home, ".codex", "tmp", "arg0", "codex-arg-test"), { recursive: true });
    await mkdir(path.join(home, ".codex", "vendor_imports"), { recursive: true });
    await writeFile(path.join(home, ".codex", "vendor_imports", "skills-curated-cache.json"), "{}\n");
    await mkdir(path.join(home, ".codex", "pets"), { recursive: true });

    const snapshot = await listCodexControlSurfaces(home);

    expect(snapshot.mcpServers.map((server) => server.name)).toContain("playwright");
    expect(snapshot.surfaces.find((surface) => surface.id === "config.global")?.editable).toBe(false);
    expect(snapshot.surfaces.find((surface) => surface.id === "agents.global")?.editable).toBe(true);
    expect(snapshot.surfaces.find((surface) => surface.id === "rules:default.rules")?.editable).toBe(true);
    expect(snapshot.surfaces.find((surface) => surface.id === "skill:review-helper")?.editable).toBe(true);
    expect(snapshot.surfaces.find((surface) => surface.id.startsWith("skill-readonly:.system"))?.editable).toBe(false);
    expect(snapshot.surfaces.find((surface) => surface.id === "plugins.summary")?.editable).toBe(false);
    expect(snapshot.surfaces.find((surface) => surface.id === "browser.output")?.summary?.ext_log).toBe(1);
    expect(snapshot.surfaces.find((surface) => surface.id === "mcp-node.runtime")?.editable).toBe(false);
    expect(snapshot.surfaces.find((surface) => surface.id === "node-repl.runtime")?.editable).toBe(false);
    expect(snapshot.surfaces.find((surface) => surface.id === "tmp.arg0")?.editable).toBe(false);
    expect(snapshot.surfaces.find((surface) => surface.id === "vendor-imports.cache")?.summary?.ext_json).toBe(1);
    expect(snapshot.surfaces.find((surface) => surface.id === "pets.state")?.kind).toBe("runtime");
  });

  it("summarizes Codex sqlite stores without reading body columns", async () => {
    const home = await tempHome();
    const dbPath = path.join(home, ".codex", "state_5.sqlite");
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE threads (id TEXT PRIMARY KEY, title TEXT, archived INTEGER);
      INSERT INTO threads (id, title, archived) VALUES ('thread-1', 'hidden body should not be exposed', 0);
    `);
    db.close();

    const snapshot = await listCodexControlSurfaces(home);
    const state = snapshot.surfaces.find((surface) => surface.id === "database.state");

    expect(state?.editable).toBe(false);
    expect(state?.kind).toBe("database");
    expect(state?.summary?.tables).toBeGreaterThanOrEqual(1);
    expect(state?.summary?.rows_threads).toBe(1);
    expect(JSON.stringify(state)).not.toContain("hidden body");
  });

  it("backs up and atomically saves allowlisted documents", async () => {
    const home = await tempHome();
    const agentsPath = path.join(home, ".codex", "AGENTS.md");
    await writeFile(agentsPath, "old\n");
    const doc = await readCodexControlDocument("agents.global", home);

    const saved = await saveCodexControlDocument("agents.global", "new\n", doc.sha256, home);

    expect(saved.backupPath).toBeDefined();
    expect(saved.journalPath).toBeDefined();
    expect(saved.changedKeys).toEqual(["agents.global"]);
    expect(await readFile(agentsPath, "utf8")).toBe("new\n");
    expect(await readFile(saved.backupPath!, "utf8")).toBe("old\n");
    expect(await readFile(saved.journalPath!, "utf8")).toContain("codex-control-document-save");
    expect(saved.evidence.map((item) => item.source)).toContain("codex.control.backup");
    expect(saved.evidence.map((item) => item.source)).toContain("codex.control.journal");
  });

  it("reveals only id-resolved user Codex control documents", async () => {
    const home = await tempHome();
    const skillPath = path.join(home, ".codex", "skills", "review-helper", "SKILL.md");
    const rulePath = path.join(home, ".codex", "rules", "default.rules");
    await writeFile(skillPath, "---\nname: review-helper\n---\n");
    await writeFile(rulePath, "# rules\n");

    const skill = await revealCodexControlSurface("skill:review-helper", home);
    const rule = await revealCodexControlSurface("rules:default.rules", home);
    const config = await revealCodexControlSurface("config.global", home);
    const systemSkill = await revealCodexControlSurface("skill-readonly:.system/skill-creator", home);
    const plugins = await revealCodexControlSurface("plugins.summary", home);

    expect(skill.revealAllowed).toBe(true);
    expect(skill.path).toBe(skillPath);
    expect(rule.revealAllowed).toBe(true);
    expect(rule.path).toBe(rulePath);
    expect(config.revealAllowed).toBe(false);
    expect(config.path).toBe("");
    expect(systemSkill.revealAllowed).toBe(false);
    expect(systemSkill.path).toBe("");
    expect(plugins.revealAllowed).toBe(false);
    expect(plugins.path).toBe("");
  });

  it("rejects stale writes and path traversal ids", async () => {
    const home = await tempHome();
    const agentsPath = path.join(home, ".codex", "AGENTS.md");
    await writeFile(agentsPath, "old\n");
    const doc = await readCodexControlDocument("agents.global", home);
    await writeFile(agentsPath, "changed\n");

    await expect(saveCodexControlDocument("agents.global", "new\n", doc.sha256, home)).rejects.toThrow(/changed on disk/);
    await expect(readCodexControlDocument("rules:..\\auth.rules", home)).rejects.toThrow(/Invalid Codex rules/);
    await expect(readCodexControlDocument("skill:..", home)).rejects.toThrow(/Invalid Codex skill/);
  });

  it("redacts sensitive allowlisted documents and refuses to save sensitive content", async () => {
    const home = await tempHome();
    const agentsPath = path.join(home, ".codex", "AGENTS.md");
    await writeFile(agentsPath, "Use bearer token fake-redacted-token-for-test\n");

    const doc = await readCodexControlDocument("agents.global", home);

    expect(doc.redacted).toBe(true);
    expect(doc.editable).toBe(false);
    expect(doc.content).not.toContain("fake-redacted-token-for-test");
    expect(doc.warnings.join("\n")).toContain("Sensitive content");
    await expect(saveCodexControlDocument("agents.global", "# cleaned\n", doc.sha256, home)).rejects.toThrow(
      /redacted on read/
    );
    await expect(
      saveCodexControlDocument("rules:default.rules", "Authorization = fake-redacted-token-for-test\n", "0".repeat(64), home)
    ).rejects.toThrow(/sensitive-looking content/);
  });

  it("keeps raw config.toml read-only so it cannot bypass structured controls", async () => {
    const home = await tempHome();
    await writeFile(
      path.join(home, ".codex", "config.toml"),
      'model = "gpt-5.5"\napproval_policy = "on-request"\n'
    );

    const snapshot = await listCodexControlSurfaces(home);
    const configSurface = snapshot.surfaces.find((surface) => surface.id === "config.global");
    expect(configSurface?.editable).toBe(false);
    expect(configSurface?.status).toBe("warn");
    await expect(readCodexControlDocument("config.global", home)).rejects.toThrow(/Raw config\.toml editing is disabled/);
    await expect(
      saveCodexControlDocument("config.global", 'sandbox_mode = "danger-full-access"\n', "0".repeat(64), home)
    ).rejects.toThrow(/Raw config\.toml saving is disabled/);
  });

  it("can create missing default rules without touching credentials paths", async () => {
    const home = await tempHome();
    const target = path.join(home, ".codex", "rules", "default.rules");
    await rm(target, { force: true });
    const doc = await readCodexControlDocument("rules:default.rules", home);

    expect(doc.content).toBe("");
    const result = await saveCodexControlDocument("rules:default.rules", "# allowlist\n", doc.sha256, home);

    expect(fs.existsSync(target)).toBe(true);
    expect(result.backupPath).toBeUndefined();
    expect(await readFile(target, "utf8")).toBe("# allowlist\n");
  });

  it("summarizes Codex default, plan, and review model modes", async () => {
    const home = await tempHome();
    await writeFile(
      path.join(home, ".codex", "config.toml"),
      [
        'model = "gpt-5.5"',
        'review_model = "gpt-5.4-mini"',
        'model_reasoning_effort = "xhigh"',
        'plan_mode_reasoning_effort = "medium"'
      ].join("\n")
    );

    const snapshot = await readCodexModeConfig(home);

    expect(snapshot.modes.default.model).toBe("gpt-5.5");
    expect(snapshot.modes.default.reasoningEffort).toBe("xhigh");
    expect(snapshot.modes.plan.model).toBe("gpt-5.5");
    expect(snapshot.modes.plan.reasoningEffort).toBe("medium");
    expect(snapshot.modes.plan.source).toBe("config");
    expect(snapshot.modes.review.model).toBe("gpt-5.4-mini");
    expect(snapshot.modes.review.reasoningEffort).toBe("xhigh");
  });

  it("saves Codex mode defaults with backup and preserves tables", async () => {
    const home = await tempHome();
    const configPath = path.join(home, ".codex", "config.toml");
    await writeFile(configPath, ['model = "gpt-5.4-mini"', "", "[mcp_servers.playwright]", 'command = "npx"'].join("\n"));
    const snapshot = await readCodexModeConfig(home);

    const result = await saveCodexModeConfig(
      {
        defaultModel: "gpt-5.5",
        defaultReasoningEffort: "xhigh",
        planReasoningEffort: "medium",
        reviewModel: "gpt-5.5"
      },
      snapshot.sha256,
      home
    );
    const saved = await readFile(configPath, "utf8");
    const journal = await readFile(result.journalPath!, "utf8");

    expect(result.backupPath).toBeDefined();
    expect(result.journalPath).toBeDefined();
    expect(saved).toContain('model = "gpt-5.5"');
    expect(saved).toContain('model_reasoning_effort = "xhigh"');
    expect(saved).toContain('plan_mode_reasoning_effort = "medium"');
    expect(saved).toContain('review_model = "gpt-5.5"');
    expect(saved).toContain("[mcp_servers.playwright]");
    expect(result.modes.plan.reasoningEffort).toBe("medium");
    expect(journal).toContain("codex-mode-config-save");
    expect(journal).toContain("model_reasoning_effort");
    expect(journal).not.toContain("secret");
  });

  it("replaces existing Codex mode keys instead of duplicating them", async () => {
    const home = await tempHome();
    const configPath = path.join(home, ".codex", "config.toml");
    await writeFile(
      configPath,
      [
        'model = "gpt-5.4-mini"',
        'review_model = "gpt-5.4-mini"',
        'model_reasoning_effort = "medium"',
        'plan_mode_reasoning_effort = "low"',
        "",
        "[mcp_servers.playwright]",
        'command = "npx"'
      ].join("\n")
    );
    const snapshot = await readCodexModeConfig(home);

    await saveCodexModeConfig(
      {
        defaultModel: "gpt-5.5",
        defaultReasoningEffort: "xhigh",
        planReasoningEffort: "high",
        reviewModel: "gpt-5.5"
      },
      snapshot.sha256,
      home
    );
    const saved = await readFile(configPath, "utf8");

    expect(saved.match(/^model\s*=/gm)).toHaveLength(1);
    expect(saved.match(/^review_model\s*=/gm)).toHaveLength(1);
    expect(saved.match(/^model_reasoning_effort\s*=/gm)).toHaveLength(1);
    expect(saved.match(/^plan_mode_reasoning_effort\s*=/gm)).toHaveLength(1);
    expect(saved).toContain("[mcp_servers.playwright]");
  });

  it("allows plan mode reasoning none but not default reasoning none", async () => {
    const home = await tempHome();
    const configPath = path.join(home, ".codex", "config.toml");
    await writeFile(configPath, 'model = "gpt-5.5"\n');
    const snapshot = await readCodexModeConfig(home);

    const result = await saveCodexModeConfig({ planReasoningEffort: "none" }, snapshot.sha256, home);
    const saved = await readFile(configPath, "utf8");

    expect(saved).toContain('plan_mode_reasoning_effort = "none"');
    expect(result.modes.plan.reasoningEffort).toBe("none");
    await expect(
      saveCodexModeConfig({ defaultReasoningEffort: "none" }, result.sha256, home)
    ).rejects.toThrow(/Invalid Codex reasoning/);
  });

  it("can clear explicit Codex mode overrides back to inheritance", async () => {
    const home = await tempHome();
    const configPath = path.join(home, ".codex", "config.toml");
    await writeFile(
      configPath,
      [
        'model = "gpt-5.5"',
        'model_reasoning_effort = "xhigh"',
        'plan_mode_reasoning_effort = "medium"',
        'review_model = "gpt-5.4-mini"',
        "",
        "[mcp_servers.playwright]",
        'command = "npx"'
      ].join("\n")
    );
    const snapshot = await readCodexModeConfig(home);

    await saveCodexModeConfig({ planReasoningEffort: null, reviewModel: null }, snapshot.sha256, home);
    const saved = await readFile(configPath, "utf8");
    const restoredInheritance = await readCodexModeConfig(home);

    expect(saved).not.toContain("plan_mode_reasoning_effort");
    expect(saved).not.toContain("review_model");
    expect(saved).toContain('model = "gpt-5.5"');
    expect(saved).toContain("[mcp_servers.playwright]");
    expect(restoredInheritance.modes.plan.source).toBe("inherits_default");
    expect(restoredInheritance.modes.review.source).toBe("inherits_default");
  });

  it("rejects invalid Codex mode values and stale mode writes", async () => {
    const home = await tempHome();
    const configPath = path.join(home, ".codex", "config.toml");
    await writeFile(configPath, 'model = "gpt-5.5"\n');
    const snapshot = await readCodexModeConfig(home);
    const fakeOpenAiToken = `sk-proj_${"agentscope_control_save_token_123456"}`;
    const fakeGithubToken = `ghp_${"agentscope_control_save_token_123456"}`;

    await expect(saveCodexModeConfig({ planReasoningEffort: "extreme" }, snapshot.sha256, home)).rejects.toThrow(
      /Invalid Codex reasoning/
    );
    await expect(saveCodexModeConfig({ defaultModel: fakeOpenAiToken }, snapshot.sha256, home)).rejects.toThrow(
      /sensitive-looking value/
    );
    await expect(saveCodexModeConfig({ reviewModel: fakeGithubToken }, snapshot.sha256, home)).rejects.toThrow(
      /sensitive-looking value/
    );
    expect(await readFile(configPath, "utf8")).not.toContain(fakeOpenAiToken);
    expect(await readFile(configPath, "utf8")).not.toContain(fakeGithubToken);
    await writeFile(configPath, 'model = "gpt-5.4-mini"\n');
    await expect(saveCodexModeConfig({ planReasoningEffort: "medium" }, snapshot.sha256, home)).rejects.toThrow(
      /changed on disk/
    );
  });

  it("returns a structured control center snapshot without exposing auth content", async () => {
    const home = await tempHome();
    await writeFile(
      path.join(home, ".codex", "config.toml"),
      ['model = "gpt-5.5"', 'cli_auth_credentials_store = "file"', "", "[windows]", 'sandbox = "unelevated"'].join("\n")
    );
    await writeFile(path.join(home, ".codex", "auth.json"), '{"tokens":"secret-token-value"}\n');

    const snapshot = await getCodexControlCenterSnapshot(home);

    expect(snapshot.auth.exists).toBe(true);
    expect(snapshot.auth.storageMode).toBe("file");
    expect(snapshot.auth.sha256).toBeUndefined();
    expect(JSON.stringify(snapshot)).not.toContain("secret-token-value");
    expect(snapshot.items.find((item) => item.id === "config.model")?.value).toBe("gpt-5.5");
    expect(snapshot.items.find((item) => item.id === "config.windows.sandbox")?.value).toBe("unelevated");
  });

  it("reports auth.json symlink metadata without following the target", async () => {
    const home = await tempHome();
    const outside = path.join(home, "outside-auth.json");
    const linkPath = path.join(home, ".codex", "auth.json");
    await writeFile(path.join(home, ".codex", "config.toml"), 'cli_auth_credentials_store = "file"\n');
    await writeFile(outside, '{"tokens":"secret-token-value"}\n');
    try {
      fs.symlinkSync(outside, linkPath, "file");
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === "EPERM") return;
      throw error;
    }

    const snapshot = await getCodexControlCenterSnapshot(home);

    expect(snapshot.auth.exists).toBe(true);
    expect(snapshot.auth.sha256).toBeUndefined();
    expect(snapshot.auth.warnings.join("\n")).toContain("symlink");
    expect(JSON.stringify(snapshot)).not.toContain("secret-token-value");
  });

  it("does not echo sensitive-looking config values in structured controls", async () => {
    const home = await tempHome();
    await writeFile(
      path.join(home, ".codex", "config.toml"),
      ['model = "sk-secret-model-token"', 'sandbox_mode = "workspace-write"'].join("\n")
    );

    const snapshot = await getCodexControlCenterSnapshot(home);
    const modelItem = snapshot.items.find((item) => item.id === "config.model");

    expect(modelItem?.value).toBeUndefined();
    expect(modelItem?.editable).toBe(false);
    expect(JSON.stringify(snapshot)).not.toContain("sk-secret-model-token");
  });

  it("does not echo sensitive-looking mode model values", async () => {
    const home = await tempHome();
    const fakeOpenAiToken = `sk-proj_${"agentscope_control_mode_token_123456"}`;
    const fakeGithubToken = `ghp_${"agentscope_control_mode_token_123456"}`;
    await writeFile(
      path.join(home, ".codex", "config.toml"),
      [`model = "${fakeOpenAiToken}"`, `review_model = "${fakeGithubToken}"`].join("\n")
    );

    const snapshot = await readCodexModeConfig(home);

    expect(snapshot.modes.default.model).toBeUndefined();
    expect(snapshot.modes.review.model).toBeUndefined();
    expect(JSON.stringify(snapshot)).not.toContain(fakeOpenAiToken);
    expect(JSON.stringify(snapshot)).not.toContain(fakeGithubToken);
  });

  it("refuses allowlisted documents that are symbolic links outside CODEX_HOME", async () => {
    const home = await tempHome();
    const outside = path.join(home, "outside.rules");
    const linkPath = path.join(home, ".codex", "rules", "default.rules");
    await writeFile(outside, "outside marker\n");
    try {
      fs.symlinkSync(outside, linkPath, "file");
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === "EPERM") return;
      throw error;
    }

    await expect(readCodexControlDocument("rules:default.rules", home)).rejects.toThrow(/symbolic link|escapes CODEX_HOME/i);
  });

  it("plans and executes allowlisted structured Codex config mutations with journal evidence", async () => {
    const home = await tempHome();
    const configPath = path.join(home, ".codex", "config.toml");
    await writeFile(configPath, ['model = "gpt-5.4-mini"', "", "[windows]", 'sandbox = "unelevated"'].join("\n"));
    const snapshot = await getCodexControlCenterSnapshot(home);

    const blocked = await planCodexControlMutation(
      {
        expectedSha256: snapshot.configSha256,
        mutations: [{ itemId: "config.sandbox_mode", keyPath: "sandbox_mode", value: "danger-full-access" }]
      },
      home
    );
    expect(blocked.highRisk).toBe(true);
    expect(blocked.blockers.join("\n")).toContain("explicit confirmation");
    const sensitivePlanValue = "secret-model-value-for-agentscope-plan";
    expect(JSON.stringify(blocked)).not.toContain(sensitivePlanValue);

    const windowsSandboxBlocked = await planCodexControlMutation(
      {
        expectedSha256: snapshot.configSha256,
        mutations: [{ itemId: "config.windows.sandbox", keyPath: "windows.sandbox", value: "elevated" }]
      },
      home
    );
    expect(windowsSandboxBlocked.highRisk).toBe(true);
    expect(windowsSandboxBlocked.blockers.join("\n")).toContain("explicit confirmation");

    const sensitiveBlocked = await planCodexControlMutation(
      {
        expectedSha256: snapshot.configSha256,
        mutations: [{ itemId: "config.model", keyPath: "model", value: sensitivePlanValue }]
      },
      home
    );
    expect(sensitiveBlocked.blockers.join("\n")).toContain("sensitive");
    expect(JSON.stringify(sensitiveBlocked)).not.toContain(sensitivePlanValue);
    expect(sensitiveBlocked.mutations[0]?.value).toBe("[redacted by AgentScope]");

    const tokenShapedValue = `sk-${"proj_1234567890abcdefghijklmnop"}`;
    const tokenShapedBlocked = await planCodexControlMutation(
      {
        expectedSha256: snapshot.configSha256,
        mutations: [{ itemId: "config.model", keyPath: "model", value: tokenShapedValue }]
      },
      home
    );
    expect(tokenShapedBlocked.blockers.join("\n")).toContain("sensitive");
    expect(JSON.stringify(tokenShapedBlocked)).not.toContain(tokenShapedValue);
    expect(tokenShapedBlocked.mutations[0]?.value).toBe("[redacted by AgentScope]");

    const result = await executeCodexControlMutation(
      {
        expectedSha256: snapshot.configSha256,
        confirmedHighRisk: true,
        mutations: [
          { itemId: "config.model", keyPath: "model", value: "gpt-5.5" },
          { itemId: "config.windows.sandbox", keyPath: "windows.sandbox", value: "elevated" },
          { itemId: "config.memories.use_memories", keyPath: "memories.use_memories", value: true }
        ]
      },
      home
    );
    const saved = await readFile(configPath, "utf8");
    const journal = await readFile(result.journalPath!, "utf8");

    expect(result.backupPath).toBeDefined();
    expect(result.journalPath).toBeDefined();
    expect(saved.match(/^model\s*=/gm)).toHaveLength(1);
    expect(saved).toContain('model = "gpt-5.5"');
    expect(saved).toContain("[windows]");
    expect(saved).toContain('sandbox = "elevated"');
    expect(saved).toContain("[memories]");
    expect(saved).toContain("use_memories = true");
    expect(journal).toContain("codex-control-mutation");
    expect(journal).toContain("model");
    expect(journal).not.toContain("secret");
  });

  it("rejects unsupported structured mutations and stale config writes", async () => {
    const home = await tempHome();
    const configPath = path.join(home, ".codex", "config.toml");
    await writeFile(configPath, 'model = "gpt-5.5"\n');
    const snapshot = await getCodexControlCenterSnapshot(home);

    const unsupported = await planCodexControlMutation(
      {
        expectedSha256: snapshot.configSha256,
        mutations: [{ itemId: "config.auth", keyPath: "auth.json", value: "not allowed" }]
      },
      home
    );
    expect(unsupported.blockers.join("\n")).toContain("Unsupported");

    await writeFile(configPath, 'model = "gpt-5.4-mini"\n');
    await expect(
      executeCodexControlMutation(
        {
          expectedSha256: snapshot.configSha256,
          mutations: [{ itemId: "config.model", keyPath: "model", value: "gpt-5.5" }]
        },
        home
      )
    ).rejects.toThrow(/changed on disk/);
  });

  it("plans every allowlisted structured mutation fixture and blocks invalid values without leaking secrets", async () => {
    const home = await tempHome();
    const configPath = path.join(home, ".codex", "config.toml");
    await writeFile(configPath, 'model = "gpt-5.5"\n');
    const snapshot = await getCodexControlCenterSnapshot(home);
    const validFixtures = [
      ["config.model", "model", "gpt-5.4-mini"],
      ["config.review_model", "review_model", "gpt-5.4-mini"],
      ["config.model_reasoning_effort", "model_reasoning_effort", "medium"],
      ["config.plan_mode_reasoning_effort", "plan_mode_reasoning_effort", "none"],
      ["config.approval_policy", "approval_policy", "on-request"],
      ["config.approvals_reviewer", "approvals_reviewer", "user"],
      ["config.sandbox_mode", "sandbox_mode", "workspace-write"],
      ["config.web_search", "web_search", "disabled"],
      ["config.hide_agent_reasoning", "hide_agent_reasoning", true],
      ["config.show_raw_agent_reasoning", "show_raw_agent_reasoning", false],
      ["config.service_tier", "service_tier", "default"],
      ["config.windows.sandbox", "windows.sandbox", "unelevated"],
      ["config.features.multi_agent", "features.multi_agent", true],
      ["config.memories.generate_memories", "memories.generate_memories", false],
      ["config.memories.use_memories", "memories.use_memories", true]
    ] as const;

    for (const [itemId, keyPath, value] of validFixtures) {
      const plan = await planCodexControlMutation(
        {
          expectedSha256: snapshot.configSha256,
          confirmedHighRisk: true,
          mutations: [{ itemId, keyPath, value }]
        },
        home
      );
      expect(plan.blockers, `${itemId} should plan cleanly`).toEqual([]);
      expect(plan.changedKeys).toEqual([keyPath]);
    }

    const fakeToken = `sk-${"agentscope_control_fixture_token_1234567890"}`;
    const invalidFixtures = [
      { itemId: "config.model", keyPath: "model", value: fakeToken, message: /sensitive/ },
      { itemId: "config.model", keyPath: "model", value: "../escape", message: /must be one of|model-style/ },
      { itemId: "config.sandbox_mode", keyPath: "sandbox_mode", value: "unsafe", message: /must be one of/ },
      { itemId: "config.hide_agent_reasoning", keyPath: "hide_agent_reasoning", value: "true", message: /boolean/ },
      { itemId: "config.web_search", keyPath: "web_search", value: "live".repeat(80), message: /too long/ },
      { itemId: "config.auth", keyPath: "auth.json", value: "not allowed", message: /Unsupported/ },
      { itemId: "../config.model", keyPath: "../model", value: "gpt-5.5", message: /Unsupported/ }
    ] as const;

    for (const fixture of invalidFixtures) {
      const plan = await planCodexControlMutation(
        {
          expectedSha256: snapshot.configSha256,
          mutations: [{ itemId: fixture.itemId, keyPath: fixture.keyPath, value: fixture.value }]
        },
        home
      );
      expect(plan.blockers.join("\n"), `${fixture.itemId}/${fixture.keyPath}`).toMatch(fixture.message);
      expect(JSON.stringify(plan)).not.toContain(fakeToken);
    }
  });

  it("blocks structured mutation execution when the plan hash or TOML shape is stale", async () => {
    const home = await tempHome();
    const configPath = path.join(home, ".codex", "config.toml");
    await writeFile(configPath, ['model = "gpt-5.5"', "", "[windows]", 'sandbox = "unelevated"'].join("\n"));
    const snapshot = await getCodexControlCenterSnapshot(home);
    await writeFile(configPath, ['model = "gpt-5.5"', "[windows", 'sandbox = "unelevated"'].join("\n"));

    await expect(
      executeCodexControlMutation(
        {
          expectedSha256: snapshot.configSha256,
          confirmedHighRisk: true,
          mutations: [{ itemId: "config.sandbox_mode", keyPath: "sandbox_mode", value: "danger-full-access" }]
        },
        home
      )
    ).rejects.toThrow(/changed on disk|validation failed/);
  });
});
