import fs from "node:fs";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  executeCodexControlMutation,
  getCodexControlCenterSnapshot,
  getCodexConfigWorkbenchSnapshot,
  deleteCodexConfigTemplate,
  listCodexConfigTemplates,
  listCodexControlSurfaces,
  planCodexControlMutation,
  previewCodexConfigTemplate,
  readCodexModeConfig,
  readCodexControlDocument,
  revealCodexControlSurface,
  saveCodexConfigTemplate,
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

  it("uses SKILL.md heading as the visible Skill name without exposing the body", async () => {
    const home = await tempHome();
    const skillPath = path.join(home, ".codex", "skills", "review-helper", "SKILL.md");
    await writeFile(skillPath, "# Evidence Review Helper\n\nPrivate workflow body that should not be copied into labels.\n");

    const inventory = await listCodexControlSurfaces(home);
    const center = await getCodexControlCenterSnapshot(home);
    const surface = inventory.surfaces.find((item) => item.id === "skill:review-helper");
    const item = center.items.find((entry) => entry.id === "surface.skill:review-helper");

    expect(surface?.label).toBe("Evidence Review Helper");
    expect(item?.displayLabel).toBe("Evidence Review Helper");
    expect(JSON.stringify(item)).not.toContain("Private workflow body");
  });

  it("uses SKILL.md frontmatter name when no heading is present", async () => {
    const home = await tempHome();
    const skillPath = path.join(home, ".codex", "skills", "review-helper", "SKILL.md");
    await writeFile(
      skillPath,
      [
        "---",
        'name: "Evidence Frontmatter Helper"',
        "description: Private description that should stay out of labels.",
        "---",
        "",
        "Private workflow body that should not be copied into labels."
      ].join("\n")
    );

    const center = await getCodexControlCenterSnapshot(home);
    const item = center.items.find((entry) => entry.id === "surface.skill:review-helper");

    expect(item?.displayLabel).toBe("Evidence Frontmatter Helper");
    expect(JSON.stringify(item)).not.toContain("Private workflow body");
    expect(JSON.stringify(item)).not.toContain("Private description");
  });

  it("atomically saves SKILL.md without Windows hidden-temp rename failures", async () => {
    const home = await tempHome();
    const skillPath = path.join(home, ".codex", "skills", "review-helper", "SKILL.md");
    await writeFile(skillPath, "# Evidence Review Helper\n\nOriginal body.\n");
    const doc = await readCodexControlDocument("skill:review-helper", home);

    const result = await saveCodexControlDocument("skill:review-helper", `${doc.content.trimEnd()}\n\nUpdated body.\n`, doc.sha256, home);

    expect(result.journalPath).toBeDefined();
    expect(await readFile(skillPath, "utf8")).toContain("Updated body.");
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
    expect(result.effectiveScope).toBe("new_codex_sessions");
    expect(result.effectiveWarnings?.join("\n")).toContain("new Codex session");
    expect(result.verification?.status).toBe("passed");
    expect(result.verification?.checkedKeys).toEqual(["model", "windows.sandbox", "memories.use_memories"]);
    expect(saved.match(/^model\s*=/gm)).toHaveLength(1);
    expect(saved).toContain('model = "gpt-5.5"');
    expect(saved).toContain("[windows]");
    expect(saved).toContain('sandbox = "elevated"');
    expect(saved).toContain("[memories]");
    expect(saved).toContain("use_memories = true");
    expect(journal).toContain("codex-control-mutation");
    expect(journal).toContain("model");
    expect(journal).toContain('"verification"');
    expect(journal).not.toContain("secret");
  });

  it("edits scalar unknown advanced config with warnings and read-back verification", async () => {
    const home = await tempHome();
    const configPath = path.join(home, ".codex", "config.toml");
    await writeFile(configPath, ['model = "gpt-5.5"', 'reason = "current"', "", "[features]", 'custom_flag = "keep"'].join("\n"));

    const snapshot = await getCodexConfigWorkbenchSnapshot(home);
    const reasonItem = snapshot.items.find((item) => item.group === "unknown" && item.keyPath === "reason");
    const customFlagItem = snapshot.items.find((item) => item.group === "unknown" && item.keyPath === "features.custom_flag");

    expect(reasonItem?.currentValue).toBe("current");
    expect(reasonItem?.editable).toBe(true);
    expect(reasonItem?.supportLevel).toBe("unverified");
    expect(customFlagItem?.currentValue).toBe("keep");

    const plan = await planCodexControlMutation(
      {
        expectedSha256: snapshot.configSha256,
        mutations: [{ itemId: reasonItem!.id, keyPath: "reason", value: "next" }]
      },
      home
    );
    expect(plan.blockers).toEqual([]);
    expect(plan.warnings.join("\n")).toContain("unverified advanced");

    const result = await executeCodexControlMutation(
      {
        expectedSha256: snapshot.configSha256,
        mutations: [{ itemId: reasonItem!.id, keyPath: "reason", value: "next" }]
      },
      home
    );
    const saved = await readFile(configPath, "utf8");

    expect(result.verification?.status).toBe("passed");
    expect(result.verification?.checkedKeys).toEqual(["reason"]);
    expect(saved).toContain('reason = "next"');
    expect(saved).toContain('custom_flag = "keep"');
  });

  it("blocks edits to reserved built-in provider ids and points to openai_base_url", async () => {
    const home = await tempHome();
    const configPath = path.join(home, ".codex", "config.toml");
    await writeFile(configPath, 'model = "gpt-5.5"\n');
    const snapshot = await getCodexControlCenterSnapshot(home);

    const plan = await planCodexControlMutation(
      {
        expectedSha256: snapshot.configSha256,
        mutations: [
          {
            itemId: "config.custom.provider-openai-url",
            keyPath: "model_providers.openai.base_url",
            value: "https://proxy.example/v1"
          }
        ]
      },
      home
    );

    expect(plan.blockers.join("\n")).toContain("openai_base_url");
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
      ["config.model_provider", "model_provider", "custom-router"],
      ["config.review_model", "review_model", "gpt-5.4-mini"],
      ["config.model_reasoning_effort", "model_reasoning_effort", "medium"],
      ["config.plan_mode_reasoning_effort", "plan_mode_reasoning_effort", "none"],
      ["config.model_reasoning_summary", "model_reasoning_summary", "concise"],
      ["config.model_verbosity", "model_verbosity", "high"],
      ["config.model_supports_reasoning_summaries", "model_supports_reasoning_summaries", true],
      ["config.project_doc_max_bytes", "project_doc_max_bytes", 65536],
      ["config.openai_base_url", "openai_base_url", "https://us.api.openai.com/v1"],
      ["config.approval_policy", "approval_policy", "on-request"],
      ["config.approvals_reviewer", "approvals_reviewer", "user"],
      ["config.sandbox_mode", "sandbox_mode", "workspace-write"],
      ["config.web_search", "web_search", "disabled"],
      ["config.hide_agent_reasoning", "hide_agent_reasoning", true],
      ["config.show_raw_agent_reasoning", "show_raw_agent_reasoning", false],
      ["config.service_tier", "service_tier", "default"],
      ["config.windows.sandbox", "windows.sandbox", "unelevated"],
      ["config.features.multi_agent", "features.multi_agent", true],
      ["config.features.goals", "features.goals", true],
      ["config.features.memories", "features.memories", true],
      ["config.features.js_repl", "features.js_repl", false],
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
      { itemId: "config.model", keyPath: "model", value: "../escape", message: /model-style/ },
      { itemId: "config.model_provider", keyPath: "model_provider", value: "../escape", message: /provider id/ },
      { itemId: "config.openai_base_url", keyPath: "openai_base_url", value: "not-a-url", message: /http\(s\) URL/ },
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

  it("previews and executes the YOLO template through allowlisted high-risk mutations", async () => {
    const home = await tempHome();
    const configPath = path.join(home, ".codex", "config.toml");
    await writeFile(configPath, ['model = "gpt-5.5"', "", "[windows]", 'sandbox = "unelevated"'].join("\n"));

    const templates = await listCodexConfigTemplates(home);
    const yolo = templates.templates.find((template) => template.id === "builtin.yolo-full-access");
    expect(yolo?.readonly).toBe(true);
    expect(yolo?.risk).toBe("high");

    const preview = await previewCodexConfigTemplate(
      {
        templateId: "builtin.yolo-full-access",
        selectedItemIds: [
          "config.approval_policy",
          "config.sandbox_mode",
          "config.windows.sandbox",
          "config.model_reasoning_effort"
        ]
      },
      home
    );
    expect(preview.highRisk).toBe(true);
    expect(preview.mutations.map((mutation) => mutation.keyPath)).toEqual([
      "approval_policy",
      "sandbox_mode",
      "windows.sandbox",
      "model_reasoning_effort"
    ]);
    expect(preview.mutations.map((mutation) => mutation.keyPath)).not.toContain("web_search");

    const blocked = await planCodexControlMutation(
      { expectedSha256: preview.configSha256, mutations: preview.mutations },
      home
    );
    expect(blocked.blockers.join("\n")).toContain("explicit confirmation");

    const result = await executeCodexControlMutation(
      { expectedSha256: preview.configSha256, confirmedHighRisk: true, mutations: preview.mutations },
      home
    );
    const saved = await readFile(configPath, "utf8");

    expect(result.changedKeys).toEqual(["approval_policy", "sandbox_mode", "windows.sandbox", "model_reasoning_effort"]);
    expect(saved).toContain("# AgentScope template: No approval prompts");
    expect(saved).toContain('approval_policy = "never"');
    expect(saved).toContain('sandbox_mode = "danger-full-access"');
    expect(saved).toContain("[windows]");
    expect(saved).toContain('sandbox = "elevated"');
    expect(saved).toContain('model_reasoning_effort = "xhigh"');
    expect(saved).not.toContain('web_search = "live"');
  });

  it("preserves user advanced config and blocks unsafe scalar overwrites", async () => {
    const home = await tempHome();
    const configPath = path.join(home, ".codex", "config.toml");
    await writeFile(
      configPath,
      [
        "# user header",
        'model = "gpt-5.5" # keep my comment',
        'approval_policy = { granular = { sandbox_approval = true, request_permissions = false } }',
        'model_provider = "custom-router"',
        "",
        "[model_providers.custom-router]",
        'name = "Custom Router"',
        'base_url = "https://router.example/v1"',
        "",
        "[windows]",
        'sandbox = "unelevated" # keep windows comment',
        "",
        "[features]",
        "multi_agent = false",
        "shell_snapshot = true"
      ].join("\n")
    );

    const preview = await previewCodexConfigTemplate({ templateId: "builtin.yolo-full-access" }, home);
    expect(preview.mutations.map((mutation) => mutation.keyPath)).not.toContain("approval_policy");
    expect(preview.warnings.join("\n")).toContain("approval_policy");
    expect(preview.warnings.join("\n")).toContain("complex TOML");

    const snapshot = await getCodexControlCenterSnapshot(home);
    const blocked = await planCodexControlMutation(
      {
        expectedSha256: snapshot.configSha256,
        confirmedHighRisk: true,
        mutations: [{ itemId: "config.approval_policy", keyPath: "approval_policy", value: "never" }]
      },
      home
    );
    expect(blocked.blockers.join("\n")).toContain("approval_policy");

    const result = await executeCodexControlMutation(
      {
        expectedSha256: snapshot.configSha256,
        confirmedHighRisk: true,
        mutations: [
          { itemId: "config.model", keyPath: "model", value: "gpt-5.4-mini" },
          { itemId: "config.windows.sandbox", keyPath: "windows.sandbox", value: "elevated" },
          { itemId: "config.features.multi_agent", keyPath: "features.multi_agent", value: true }
        ]
      },
      home
    );
    const saved = await readFile(configPath, "utf8");
    expect(result.changedKeys).toEqual(["model", "windows.sandbox", "features.multi_agent"]);
    expect(saved).toContain('model = "gpt-5.4-mini" # keep my comment');
    expect(saved).toContain('approval_policy = { granular = { sandbox_approval = true, request_permissions = false } }');
    expect(saved).toContain("[model_providers.custom-router]");
    expect(saved).toContain('base_url = "https://router.example/v1"');
    expect(saved).toContain('sandbox = "elevated" # keep windows comment');
    expect(saved).toContain("shell_snapshot = true");
  });

  it("applies matched mutations while preserving multiline advanced TOML", async () => {
    const home = await tempHome();
    const configPath = path.join(home, ".codex", "config.toml");
    await writeFile(
      configPath,
      [
        'model = "gpt-5.5"',
        'model_provider = "proxy"',
        'project_doc_fallback_filenames = [',
        '  "AGENTS.md",',
        '  "WORKFLOW.md",',
        "]",
        "",
        "[model_providers.proxy]",
        'name = "Proxy"',
        'base_url = "https://proxy.example/v1"',
        'http_headers = { "X-Example-Header" = "example-value" }',
        "env_vars = [",
        '  "LOCAL_TOKEN_NAME",',
        '  { name = "REMOTE_TOKEN_NAME", source = "remote" },',
        "]",
        "",
        "[features]",
        "goals = false",
        "memories = false",
        "js_repl = false",
        'unknown_feature = "preserve"'
      ].join("\n")
    );

    const snapshot = await getCodexConfigWorkbenchSnapshot(home);
    const ids = new Map(snapshot.items.map((item) => [item.keyPath, item]));

    expect(ids.get("model_provider")?.currentValue).toBe("proxy");
    expect(ids.get("model_provider")?.allowCustom).toBe(true);
    expect(ids.get("model_verbosity")?.enabled).toBe(false);
    expect(ids.get("project_doc_max_bytes")?.enabled).toBe(false);
    expect(ids.get("features.goals")?.currentValue).toBe(false);
    expect(ids.get("features.memories")?.currentValue).toBe(false);
    expect(ids.get("features.js_repl")?.currentValue).toBe(false);
    expect(snapshot.unknownEntries.map((entry) => entry.keyPath)).toContain("model_providers.proxy.http_headers");
    expect(snapshot.unknownEntries.map((entry) => entry.keyPath)).toContain("features.unknown_feature");

    const result = await executeCodexControlMutation(
      {
        expectedSha256: snapshot.configSha256,
        confirmedHighRisk: true,
        mutations: [
          { itemId: "config.model_verbosity", keyPath: "model_verbosity", value: "high" },
          { itemId: "config.features.goals", keyPath: "features.goals", value: true }
        ]
      },
      home
    );
    const saved = await readFile(configPath, "utf8");

    expect(result.changedKeys).toEqual(["model_verbosity", "features.goals"]);
    expect(saved).toContain('model_verbosity = "high"');
    expect(saved).toContain('project_doc_fallback_filenames = [\n  "AGENTS.md",\n  "WORKFLOW.md",\n]');
    expect(saved).toContain('http_headers = { "X-Example-Header" = "example-value" }');
    expect(saved).toContain('  { name = "REMOTE_TOKEN_NAME", source = "remote" },');
    expect(saved).toContain("goals = true");
    expect(saved).toContain('unknown_feature = "preserve"');
  });

  it("shows current config as a read-only template", async () => {
    const home = await tempHome();
    const configPath = path.join(home, ".codex", "config.toml");
    await writeFile(configPath, ['model = "gpt-5.5"', 'sandbox_mode = "workspace-write"', "", "[features]", "multi_agent = false"].join("\n"));

    const list = await listCodexConfigTemplates(home);
    const current = list.templates[0];
    expect(current?.id).toBe("current.config");
    expect(current?.origin).toBe("current");
    expect(current?.readonly).toBe(true);
    expect(current?.items.map((item) => item.keyPath)).toEqual(
      expect.arrayContaining(["model", "sandbox_mode", "features.multi_agent"])
    );
    expect(current?.items.map((item) => item.keyPath)).not.toContain("features.shell_snapshot");

    const preview = await previewCodexConfigTemplate({ templateId: "current.config" }, home);
    expect(preview.mutations).toEqual([]);
    expect(preview.items.every((item) => item.selected === false)).toBe(true);
    expect(preview.warnings.join("\n")).toContain("current state");
  });

  it("stores custom templates locally and rejects unsupported or sensitive template content", async () => {
    const home = await tempHome();
    const configPath = path.join(home, ".codex", "config.toml");
    await writeFile(configPath, 'model = "gpt-5.5"\n');

    const saved = await saveCodexConfigTemplate(
      {
        name: "Local Safe Research",
        description: "Cached search and high reasoning.",
        items: [
          {
            itemId: "config.web_search",
            keyPath: "web_search",
            value: "cached",
            comment: "AgentScope template: keep cached search"
          },
          {
            itemId: "config.model_reasoning_effort",
            keyPath: "model_reasoning_effort",
            value: "high",
            comment: "AgentScope template: use high reasoning"
          }
        ]
      },
      home
    );
    const custom = saved.templates.find((template) => template.name === "Local Safe Research");
    expect(custom?.origin).toBe("custom");
    expect(saved.storagePath).toContain(path.join(".agentscope", "codex-control", "codex-config-templates.json"));

    const preview = await previewCodexConfigTemplate({ templateId: custom!.id }, home);
    expect(preview.mutations.map((mutation) => mutation.keyPath)).toEqual(["web_search", "model_reasoning_effort"]);

    const afterDelete = await deleteCodexConfigTemplate(custom!.id, home);
    expect(afterDelete.templates.some((template) => template.id === custom!.id)).toBe(false);

    await expect(
      saveCodexConfigTemplate(
        {
          name: "Bad secret",
          items: [{ itemId: "config.model", keyPath: "model", value: `sk-${"agentscope_template_token_123456789"}` }]
        },
        home
      )
    ).rejects.toThrow(/sensitive/);

    await expect(
      previewCodexConfigTemplate(
        {
          template: {
            name: "Unsupported",
            items: [{ itemId: "config.auth", keyPath: "auth.json", value: "not allowed" }]
          }
        },
        home
      )
    ).rejects.toThrow(/Unsupported/);
  });

  it("builds a current-state workbench with editable MCP fields and read-only unknown keys", async () => {
    const home = await tempHome();
    const configPath = path.join(home, ".codex", "config.toml");
    await writeFile(
      configPath,
      [
        'model = "gpt-5.5"',
        'custom_top = "keep"',
        "",
        "[mcp_servers.debugger-router]",
        'command = "node"',
        'args = ["router.js"]',
        "enabled = false",
        "startup_timeout_sec = 3",
        'custom_mcp_knob = "preserve"',
        "",
        "[plugins.sample.mcp_servers.reader]",
        "enabled = true",
        'default_tools_approval_mode = "prompt"'
      ].join("\n")
    );

    const snapshot = await getCodexConfigWorkbenchSnapshot(home);

    expect(snapshot.items.find((item) => item.id === "config.model")?.currentValue).toBe("gpt-5.5");
    expect(snapshot.items.find((item) => item.id === "config.mcp_servers.debugger-router.command")?.currentValue).toBe("node");
    expect(snapshot.items.find((item) => item.id === "config.mcp_servers.debugger-router.args")?.currentValue).toEqual(["router.js"]);
    expect(snapshot.items.find((item) => item.id === "config.plugins.sample.mcp_servers.reader.default_tools_approval_mode")?.currentValue).toBe("prompt");
    expect(snapshot.unknownEntries.map((entry) => entry.keyPath)).toContain("custom_top");
    expect(snapshot.unknownEntries.map((entry) => entry.keyPath)).toContain("mcp_servers.debugger-router.custom_mcp_knob");
    expect(snapshot.mcpServers.find((server) => server.name === "debugger-router")?.startupTimeoutSec).toBe(3);
  });

  it("creates and updates MCP server fields without destroying unknown config", async () => {
    const home = await tempHome();
    const configPath = path.join(home, ".codex", "config.toml");
    await writeFile(
      configPath,
      [
        "# keep header",
        'model = "gpt-5.5"',
        "",
        "[mcp_servers.playwright]",
        'command = "npx"',
        'args = ["-y", "@playwright/mcp"]',
        'custom_mcp_knob = "preserve"',
        "",
        "[features]",
        "shell_snapshot = true"
      ].join("\n")
    );
    const snapshot = await getCodexConfigWorkbenchSnapshot(home);

    await executeCodexControlMutation(
      {
        expectedSha256: snapshot.configSha256,
        confirmedHighRisk: true,
        mutations: [
          {
            itemId: "config.mcp_servers.playwright.args",
            keyPath: "mcp_servers.playwright.args",
            value: ["-y", "@playwright/mcp", "--headless"]
          },
          {
            itemId: "config.mcp_servers.debugger-router.command",
            keyPath: "mcp_servers.debugger-router.command",
            value: "node"
          },
          {
            itemId: "config.mcp_servers.debugger-router.args",
            keyPath: "mcp_servers.debugger-router.args",
            value: ["D:\\Tool\\debugger\\router.mjs"]
          },
          {
            itemId: "config.mcp_servers.debugger-router.enabled",
            keyPath: "mcp_servers.debugger-router.enabled",
            value: true
          },
          {
            itemId: "config.mcp_servers.debugger-router.default_tools_approval_mode",
            keyPath: "mcp_servers.debugger-router.default_tools_approval_mode",
            value: "prompt"
          },
          {
            itemId: "config.mcp_servers.debugger-router.startup_timeout_sec",
            keyPath: "mcp_servers.debugger-router.startup_timeout_sec",
            value: 20
          },
          {
            itemId: "config.mcp_servers.debugger-router.tool_timeout_sec",
            keyPath: "mcp_servers.debugger-router.tool_timeout_sec",
            value: 45
          }
        ]
      },
      home
    );
    const saved = await readFile(configPath, "utf8");

    expect(saved).toContain("# keep header");
    expect(saved).toContain('args = ["-y", "@playwright/mcp", "--headless"]');
    expect(saved).toContain('custom_mcp_knob = "preserve"');
    expect(saved).toContain("[mcp_servers.debugger-router]");
    expect(saved).toContain('command = "node"');
    expect(saved).toContain('args = ["D:\\\\Tool\\\\debugger\\\\router.mjs"]');
    expect(saved).toContain("enabled = true");
    expect(saved).toContain('default_tools_approval_mode = "prompt"');
    expect(saved).toContain("startup_timeout_sec = 20");
    expect(saved).toContain("tool_timeout_sec = 45");
    expect(saved).toContain("shell_snapshot = true");
  });

  it("updates existing top-level dotted assignments instead of appending duplicate tables", async () => {
    const home = await tempHome();
    const configPath = path.join(home, ".codex", "config.toml");
    await writeFile(
      configPath,
      [
        'model = "gpt-5.5"',
        "features.goals = false",
        "features.memories = true"
      ].join("\n")
    );
    const snapshot = await getCodexControlCenterSnapshot(home);

    await executeCodexControlMutation(
      {
        expectedSha256: snapshot.configSha256,
        mutations: [{ itemId: "config.features.goals", keyPath: "features.goals", value: true }]
      },
      home
    );
    const saved = await readFile(configPath, "utf8");

    expect(saved).toContain("features.goals = true");
    expect(saved).toContain("features.memories = true");
    expect(saved).not.toContain("[features]");
    expect(saved.match(/goals\s*=/g)).toHaveLength(1);
  });

  it("blocks structured edits when dotted and table assignments duplicate the same key", async () => {
    const home = await tempHome();
    const configPath = path.join(home, ".codex", "config.toml");
    await writeFile(
      configPath,
      [
        "features.goals = false",
        "",
        "[features]",
        "goals = true"
      ].join("\n")
    );
    const snapshot = await getCodexControlCenterSnapshot(home);

    const plan = await planCodexControlMutation(
      {
        expectedSha256: snapshot.configSha256,
        mutations: [{ itemId: "config.features.goals", keyPath: "features.goals", value: true }]
      },
      home
    );

    expect(plan.blockers.join("\n")).toContain("duplicate assignments");
  });

  it("blocks sensitive MCP command arguments and preserves env-var token references", async () => {
    const home = await tempHome();
    const configPath = path.join(home, ".codex", "config.toml");
    await writeFile(
      configPath,
      [
        "[mcp_servers.figma]",
        'url = "https://mcp.figma.com/mcp"',
        'bearer_token_env_var = "FIGMA_OAUTH_TOKEN"'
      ].join("\n")
    );

    const snapshot = await getCodexConfigWorkbenchSnapshot(home);
    expect(snapshot.warnings.join("\n")).not.toContain("Sensitive-looking");
    expect(snapshot.items.find((item) => item.id === "config.mcp_servers.figma.bearer_token_env_var")?.currentValue).toBe(
      "FIGMA_OAUTH_TOKEN"
    );

    const plan = await planCodexControlMutation(
      {
        expectedSha256: snapshot.configSha256,
        confirmedHighRisk: true,
        mutations: [
          {
            itemId: "config.mcp_servers.figma.args",
            keyPath: "mcp_servers.figma.args",
            value: ["--token", `sk-${"sensitive_token_shape_1234567890"}`]
          }
        ]
      },
      home
    );
    expect(plan.blockers.join("\n")).toContain("sensitive-looking");
  });
});
