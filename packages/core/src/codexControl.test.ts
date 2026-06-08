import fs from "node:fs";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listCodexControlSurfaces,
  readCodexControlDocument,
  saveCodexControlDocument
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

    const snapshot = await listCodexControlSurfaces(home);

    expect(snapshot.mcpServers.map((server) => server.name)).toContain("playwright");
    expect(snapshot.surfaces.find((surface) => surface.id === "config.global")?.editable).toBe(true);
    expect(snapshot.surfaces.find((surface) => surface.id === "agents.global")?.editable).toBe(true);
    expect(snapshot.surfaces.find((surface) => surface.id === "rules:default.rules")?.editable).toBe(true);
    expect(snapshot.surfaces.find((surface) => surface.id === "skill:review-helper")?.editable).toBe(true);
    expect(snapshot.surfaces.find((surface) => surface.id.startsWith("skill-readonly:.system"))?.editable).toBe(false);
    expect(snapshot.surfaces.find((surface) => surface.id === "plugins.summary")?.editable).toBe(false);
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
});
