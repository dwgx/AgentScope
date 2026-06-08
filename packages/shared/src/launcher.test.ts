import { describe, expect, it } from "vitest";
import { resolveSessionLauncher, splitWindowsCommandLine } from "./launcher.js";

describe("session launcher resolution", () => {
  it("resolves Codex to node.exe plus the npm JS entrypoint from process evidence", () => {
    const nodePath = "C:\\Program Files\\nodejs\\node.exe";
    const codexJs = "C:\\Users\\dwgx1\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\bin\\codex.js";
    const result = resolveSessionLauncher("codex", "resume", "019ea42d-36b4-71a3-9508-30a4381a3cce", {
      homeDir: "C:\\Users\\dwgx1",
      appDataDir: "C:\\Users\\dwgx1\\AppData\\Roaming",
      pathCandidates: {
        "codex.ps1": [{ path: "C:\\Users\\dwgx1\\AppData\\Roaming\\npm\\codex.ps1", source: "where.codex" }],
        "codex.cmd": [{ path: "C:\\Users\\dwgx1\\AppData\\Roaming\\npm\\codex.cmd", source: "where.codex" }]
      },
      existingFiles: new Set([nodePath.toLowerCase(), codexJs.toLowerCase(), "c:\\users\\dwgx1\\appdata\\roaming\\npm\\codex.ps1"]),
      processes: [
        {
          pid: 40572,
          processName: "node.exe",
          executablePath: nodePath,
          commandLine: `"node" "${codexJs}"`,
          agent: "codex",
          evidence: []
        }
      ]
    });

    expect(result.filePath).toBe(nodePath);
    expect(result.args).toEqual([codexJs, "resume", "019ea42d-36b4-71a3-9508-30a4381a3cce"]);
    expect(result.command).toContain("@openai\\codex\\bin\\codex.js");
    expect(result.source).toBe("process.commandLine.codexJs");
  });

  it("refuses ps1 launchers even when they are present", () => {
    expect(() =>
      resolveSessionLauncher("codex", "resume", "019ea42d", {
        homeDir: "C:\\Users\\dwgx1",
        pathCandidates: {
          "codex.ps1": [{ path: "C:\\Users\\dwgx1\\AppData\\Roaming\\npm\\codex.ps1", source: "where.codex" }]
        },
        existingFiles: new Set(["c:\\users\\dwgx1\\appdata\\roaming\\npm\\codex.ps1"])
      })
    ).toThrow(/refusing \.ps1/i);
  });

  it("falls back to cmd launchers and never formats a bare command", () => {
    const cmd = "C:\\Users\\dwgx1\\AppData\\Roaming\\npm\\claude.cmd";
    const result = resolveSessionLauncher("claude", "fork", "session-123", {
      homeDir: "C:\\Users\\dwgx1",
      pathCandidates: {
        "claude.cmd": [{ path: cmd, source: "where.claude" }]
      },
      existingFiles: new Set([cmd.toLowerCase()])
    });
    expect(result.filePath).toBe(cmd);
    expect(result.args).toEqual(["--resume", "session-123", "--fork-session"]);
    expect(result.command.startsWith("claude ")).toBe(false);
  });
});

describe("splitWindowsCommandLine", () => {
  it("keeps quoted paths together", () => {
    expect(splitWindowsCommandLine('"C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\me\\codex js\\codex.js" resume abc')).toEqual([
      "C:\\Program Files\\nodejs\\node.exe",
      "C:\\Users\\me\\codex js\\codex.js",
      "resume",
      "abc"
    ]);
  });
});
