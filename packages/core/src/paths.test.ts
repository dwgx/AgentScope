import { describe, expect, it } from "vitest";
import { encodeClaudeProjectPath, normalizeWindowsPath, pathsEqual } from "./paths.js";

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
});
