import { afterEach, describe, expect, it } from "vitest";
import { agentScopeHome, claudeHome, codexHome, encodeClaudeProjectPath, normalizeWindowsPath, pathsEqual, userHome } from "./paths.js";

const originalEnv = {
  AGENTSCOPE_HOME: process.env.AGENTSCOPE_HOME,
  AGENTSCOPE_DATA_HOME: process.env.AGENTSCOPE_DATA_HOME,
  CODEX_HOME: process.env.CODEX_HOME,
  CLAUDE_HOME: process.env.CLAUDE_HOME,
  USERPROFILE: process.env.USERPROFILE
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Windows path helpers", () => {
  it("normalizes extended drive paths", () => {
    expect(normalizeWindowsPath(String.raw`\\?\c:\Users\me\project\\`)).toBe(String.raw`C:\Users\me\project`);
  });

  it("normalizes extended UNC paths", () => {
    expect(normalizeWindowsPath(String.raw`\\?\UNC\server\share\folder`)).toBe(String.raw`\\server\share\folder`);
  });

  it("compares paths case-insensitively", () => {
    expect(pathsEqual(String.raw`c:\Users\ME\project`, String.raw`C:\Users\me\project`)).toBe(true);
  });

  it("encodes Claude project path", () => {
    expect(encodeClaudeProjectPath(String.raw`D:\Project\AgentScope`)).toBe("D--Project-AgentScope");
  });

  it("can route default agent homes to synthetic smoke roots without changing explicit home calls", () => {
    process.env.AGENTSCOPE_HOME = String.raw`D:\AgentScopeSmoke\home`;
    process.env.AGENTSCOPE_DATA_HOME = String.raw`D:\AgentScopeSmoke\data`;
    process.env.CODEX_HOME = String.raw`D:\AgentScopeSmoke\codex`;
    process.env.CLAUDE_HOME = String.raw`D:\AgentScopeSmoke\claude`;

    expect(userHome()).toBe(String.raw`D:\AgentScopeSmoke\home`);
    expect(codexHome()).toBe(String.raw`D:\AgentScopeSmoke\codex`);
    expect(claudeHome()).toBe(String.raw`D:\AgentScopeSmoke\claude`);
    expect(agentScopeHome()).toBe(String.raw`D:\AgentScopeSmoke\data`);
    expect(codexHome(String.raw`D:\ExplicitHome`)).toBe(String.raw`D:\ExplicitHome\.codex`);
    expect(claudeHome(String.raw`D:\ExplicitHome`)).toBe(String.raw`D:\ExplicitHome\.claude`);
    expect(agentScopeHome(String.raw`D:\ExplicitHome`)).toBe(String.raw`D:\ExplicitHome\.agentscope`);
  });
});
