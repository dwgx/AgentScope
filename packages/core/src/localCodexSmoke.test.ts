import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { getCodexControlCenterSnapshot, readCodexControlDocument, readCodexModeConfig } from "./codexControl.js";

const execFileAsync = promisify(execFile);
const smokeEnabled = process.env.AGENTSCOPE_LOCAL_CODEX_SMOKE === "1";
const strictBoundaries = process.env.AGENTSCOPE_LOCAL_CODEX_STRICT_BOUNDARY_SMOKE === "1";
const describeSmoke = smokeEnabled ? describe : describe.skip;
const describeStrict = smokeEnabled && strictBoundaries ? describe : describe.skip;
const tempRoots: string[] = [];
const fakeOpenAiToken = `sk-proj_${"agentscope_strict_boundary_token_123456"}`;
const fakeGithubToken = `ghp_${"agentscope_strict_boundary_token_123456"}`;

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describeSmoke("local Codex smoke", () => {
  it("runs installed Codex metadata commands with a synthetic CODEX_HOME", async () => {
    const codexPath = await resolveCodexPath();
    const { env } = createSyntheticCodexEnv();

    const version = await runCodex(codexPath, ["--version"], env);
    expect(version.stdout + version.stderr).toMatch(/codex/i);

    const help = await runCodex(codexPath, ["--help"], env);
    expect(help.stdout + help.stderr).toMatch(/usage|commands|codex/i);

    const execHelp = await runCodex(codexPath, ["exec", "--help"], env);
    expect(execHelp.stdout + execHelp.stderr).toMatch(/exec|usage|non-interactive/i);

    const mcpHelp = await runCodex(codexPath, ["mcp", "--help"], env);
    expect(mcpHelp.stdout + mcpHelp.stderr).toMatch(/mcp|model context protocol|usage/i);
  }, 120_000);

  it("keeps AgentScope Codex Control metadata-only on synthetic auth material", async () => {
    const home = createFixtureHome();
    const codexRoot = path.join(home, ".codex");
    fs.mkdirSync(codexRoot, { recursive: true });
    fs.writeFileSync(
      path.join(codexRoot, "config.toml"),
      ['model = "gpt-5.5"', 'cli_auth_credentials_store = "file"', "", "[mcp_servers.synthetic]", 'command = "node"'].join("\n"),
      "utf8"
    );
    fs.writeFileSync(path.join(codexRoot, "auth.json"), '{"tokens":"fake-local-codex-smoke-token"}\n', "utf8");

    const snapshot = await getCodexControlCenterSnapshot(home);
    expect(snapshot.auth.exists).toBe(true);
    expect(snapshot.auth.sha256).toBeUndefined();
    expect(JSON.stringify(snapshot)).not.toContain("fake-local-codex-smoke-token");

    const modes = await readCodexModeConfig(home);
    expect(modes.modes.default.model).toBe("gpt-5.5");
  });
});

describeStrict("strict Codex Control boundary smoke", () => {
  it("does not echo token-shaped model values from mode snapshots", async () => {
    const home = createFixtureHome();
    const codexRoot = path.join(home, ".codex");
    fs.mkdirSync(codexRoot, { recursive: true });
    fs.writeFileSync(
      path.join(codexRoot, "config.toml"),
      [`model = "${fakeOpenAiToken}"`, `review_model = "${fakeGithubToken}"`].join("\n"),
      "utf8"
    );

    const snapshot = await readCodexModeConfig(home);
    expect(JSON.stringify(snapshot)).not.toContain(fakeOpenAiToken);
    expect(JSON.stringify(snapshot)).not.toContain(fakeGithubToken);
  });

  it("refuses allowlisted Codex documents that are symbolic links outside CODEX_HOME", async () => {
    const home = createFixtureHome();
    const codexRoot = path.join(home, ".codex");
    const rulesRoot = path.join(codexRoot, "rules");
    fs.mkdirSync(rulesRoot, { recursive: true });
    const outside = path.join(home, "outside-marker.txt");
    fs.writeFileSync(outside, "outside marker\n", "utf8");
    const linkPath = path.join(rulesRoot, "default.rules");

    try {
      fs.symlinkSync(outside, linkPath, "file");
    } catch (error) {
      if (isSymlinkPrivilegeError(error)) return;
      throw error;
    }

    await expect(readCodexControlDocument("rules:default.rules", home)).rejects.toThrow(/symbolic link|escapes CODEX_HOME|sensitive/i);
  });
});

async function resolveCodexPath(): Promise<string> {
  const explicit = process.env.AGENTSCOPE_CODEX_BIN?.trim();
  if (explicit) return explicit;
  if (process.platform !== "win32") return "codex";

  const { stdout } = await execFileAsync("where.exe", ["codex"], { timeout: 10_000, windowsHide: true });
  const candidates = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const cmd = candidates.find((candidate) => /\.cmd$/i.test(candidate));
  if (cmd) {
    const js = path.join(path.dirname(cmd), "node_modules", "@openai", "codex", "bin", "codex.js");
    if (fs.existsSync(js)) return js;
  }
  return candidates[0] ?? "codex";
}

async function runCodex(codexPath: string, args: string[], env: NodeJS.ProcessEnv): Promise<{ stdout: string; stderr: string }> {
  const command = commandInvocation(codexPath, args);
  const result = await execFileAsync(command.file, command.args, {
    env,
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
    windowsHide: true
  });
  return { stdout: result.stdout, stderr: result.stderr };
}

function commandInvocation(filePath: string, args: string[]): { file: string; args: string[] } {
  if (/\.js$/i.test(filePath)) return { file: process.execPath, args: [filePath, ...args] };
  if (process.platform === "win32" && /\.(?:cmd|bat)$/i.test(filePath)) {
    return {
      file: process.env.ComSpec ?? "cmd.exe",
      args: ["/d", "/s", "/c", [quoteCmd(filePath), ...args.map(quoteCmd)].join(" ")]
    };
  }
  return { file: filePath, args };
}

function quoteCmd(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function createSyntheticCodexEnv(): { env: NodeJS.ProcessEnv; home: string } {
  const home = createFixtureHome();
  const codexHome = path.join(home, ".codex");
  const sqliteHome = path.join(home, ".codex-sqlite");
  fs.mkdirSync(codexHome, { recursive: true });
  fs.mkdirSync(sqliteHome, { recursive: true });
  fs.writeFileSync(path.join(codexHome, "config.toml"), 'model = "gpt-5.5"\n', "utf8");

  const env: NodeJS.ProcessEnv = {
    Path: process.env.Path ?? process.env.PATH,
    PATH: process.env.PATH ?? process.env.Path,
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    ComSpec: process.env.ComSpec,
    TEMP: path.join(home, "tmp"),
    TMP: path.join(home, "tmp"),
    USERPROFILE: home,
    HOME: home,
    APPDATA: path.join(home, "AppData", "Roaming"),
    LOCALAPPDATA: path.join(home, "AppData", "Local"),
    CODEX_HOME: codexHome,
    CODEX_SQLITE_HOME: sqliteHome,
    NO_COLOR: "1"
  };
  fs.mkdirSync(env.TEMP!, { recursive: true });
  fs.mkdirSync(env.APPDATA!, { recursive: true });
  fs.mkdirSync(env.LOCALAPPDATA!, { recursive: true });
  return { env, home };
}

function createFixtureHome(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-local-codex-smoke-"));
  tempRoots.push(root);
  return root;
}

function isSymlinkPrivilegeError(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && String((error as { code?: unknown }).code) === "EPERM";
}
