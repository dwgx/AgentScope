import fs from "node:fs";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  listCodexControlSurfaces,
  readCodexModeConfig,
  readCodexControlDocument,
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
    expect(snapshot.surfaces.find((surface) => surface.id === "config.global")?.editable).toBe(true);
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
    expect(await readFile(agentsPath, "utf8")).toBe("new\n");
    expect(await readFile(saved.backupPath!, "utf8")).toBe("old\n");
    expect(saved.evidence.map((item) => item.source)).toContain("codex.control.backup");
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

  it("redacts and blocks config documents with sensitive-looking keys", async () => {
    const home = await tempHome();
    await writeFile(
      path.join(home, ".codex", "config.toml"),
      'api_key = "secret"\nmodel = "gpt-5.5"\nhttp_headers = { Authorization = "bearer value" }\n'
    );

    const snapshot = await listCodexControlSurfaces(home);
    const configSurface = snapshot.surfaces.find((surface) => surface.id === "config.global");
    expect(configSurface?.editable).toBe(false);
    expect(configSurface?.status).toBe("warn");

    const doc = await readCodexControlDocument("config.global", home);
    expect(doc.redacted).toBe(true);
    expect(doc.editable).toBe(false);
    expect(doc.content).not.toContain("secret");
    expect(doc.content).not.toContain("bearer value");
    await expect(saveCodexControlDocument("config.global", doc.content, doc.sha256, home)).rejects.toThrow(
      /sensitive-looking/
    );
  });

  it("rejects obviously invalid config.toml edits before writing", async () => {
    const home = await tempHome();
    const configPath = path.join(home, ".codex", "config.toml");
    await writeFile(configPath, 'model = "gpt-5.5"\n');
    const doc = await readCodexControlDocument("config.global", home);

    await expect(saveCodexControlDocument("config.global", 'model = "unterminated\n', doc.sha256, home)).rejects.toThrow(
      /validation failed/
    );
    expect(await readFile(configPath, "utf8")).toBe('model = "gpt-5.5"\n');
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

    expect(result.backupPath).toBeDefined();
    expect(saved).toContain('model = "gpt-5.5"');
    expect(saved).toContain('model_reasoning_effort = "xhigh"');
    expect(saved).toContain('plan_mode_reasoning_effort = "medium"');
    expect(saved).toContain('review_model = "gpt-5.5"');
    expect(saved).toContain("[mcp_servers.playwright]");
    expect(result.modes.plan.reasoningEffort).toBe("medium");
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

    await expect(saveCodexModeConfig({ planReasoningEffort: "extreme" }, snapshot.sha256, home)).rejects.toThrow(
      /Invalid Codex reasoning/
    );
    await writeFile(configPath, 'model = "gpt-5.4-mini"\n');
    await expect(saveCodexModeConfig({ planReasoningEffort: "medium" }, snapshot.sha256, home)).rejects.toThrow(
      /changed on disk/
    );
  });
});
