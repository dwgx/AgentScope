import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { searchAll } from "./search.js";

describe("search privacy", () => {
  it("returns JSONL match location without raw text", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-search-"));
    const dir = path.join(home, ".codex", "sessions", "2026", "06", "07");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "rollout-2026-06-07T04-20-59-thread-1.jsonl"),
      JSON.stringify({
        type: "event_msg",
        payload: { type: "agent_message", message: "secret AgentScope raw text" }
      }) + "\n"
    );

    const [match] = await searchAll("AgentScope", home, 5);
    expect(match?.source).toBe("codex.sessions.rollout");
    expect(match).not.toHaveProperty("text");
    expect(match?.excerpt).toContain("AgentScope");
    expect(String(match?.excerpt).length).toBeLessThan(220);
    expect(match?.matchedFields).toEqual(["payload.message"]);
    expect(JSON.stringify(match)).not.toContain("secret AgentScope raw text");
  });
});
