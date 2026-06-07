import { describe, expect, it } from "vitest";
import { rolloutThreadId } from "./codex.js";

describe("Codex helpers", () => {
  it("extracts UUID tail from rollout filename", () => {
    expect(
      rolloutThreadId(String.raw`D:\x\rollout-2026-06-07T04-20-59-019e9e61-a40c-7e62-b98f-d80b7f96c5bf.jsonl`)
    ).toBe("019e9e61-a40c-7e62-b98f-d80b7f96c5bf");
  });
});
