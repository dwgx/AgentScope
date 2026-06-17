import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeTranscriptActivity } from "./activity.js";

describe("transcript activity analyzer", () => {
  it("summarizes Codex rollout metadata without reading message text into output", async () => {
    const filePath = tempJsonl([
      {
        timestamp: "2026-06-07T01:00:00.000Z",
        type: "session_meta",
        payload: {
          cwd: String.raw`D:\Workspace\AgentScopeFixture`,
          cli_version: "0.137.0",
          git: { branch: "main" }
        }
      },
      {
        timestamp: "2026-06-07T01:01:00.000Z",
        type: "turn_context",
        payload: { model: "gpt-5.5", approval_policy: "never" }
      },
      {
        timestamp: "2026-06-07T01:02:00.000Z",
        type: "response_item",
        payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "secret" }] }
      }
    ]);

    const activity = await analyzeTranscriptActivity("codex", filePath);
    expect(activity.lineCount).toBe(3);
    expect(activity.eventCounts.session_meta).toBe(1);
    expect(activity.eventCounts["payload.message"]).toBe(1);
    expect(activity.modelCounts?.["gpt-5.5"]).toBe(1);
    expect(activity.cliVersion).toBe("0.137.0");
    expect(JSON.stringify(activity)).not.toContain("secret");
  });

  it("summarizes Claude roles, models, token usage, and tool names", async () => {
    const filePath = tempJsonl([
      { type: "permission-mode", permissionMode: "bypassPermissions", sessionId: "s1" },
      {
        type: "assistant",
        timestamp: "2026-06-07T01:00:00.000Z",
        cwd: String.raw`D:\Workspace\AgentScopeFixture`,
        version: "2.1.167",
        gitBranch: "main",
        message: {
          role: "assistant",
          model: "claude-opus-4-6",
          content: [{ type: "tool_use", name: "Read" }],
          usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 30 }
        }
      }
    ]);

    const activity = await analyzeTranscriptActivity("claude", filePath);
    expect(activity.eventCounts.assistant).toBe(1);
    expect(activity.roleCounts?.assistant).toBe(1);
    expect(activity.modelCounts?.["claude-opus-4-6"]).toBe(1);
    expect(activity.toolCounts?.Read).toBe(1);
    expect(activity.tokenUsage?.inputTokens).toBe(10);
    expect(activity.permissionMode).toBe("bypassPermissions");
  });
});

function tempJsonl(rows: unknown[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-activity-"));
  const filePath = path.join(dir, "transcript.jsonl");
  fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join("\n"), "utf8");
  return filePath;
}

