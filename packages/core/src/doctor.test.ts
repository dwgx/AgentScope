import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runDoctor } from "./doctor.js";

const tempRoots: string[] = [];

afterEach(async () => {
  for (const root of tempRoots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function tempHome(): Promise<string> {
  const home = await mkdtemp(path.join(os.tmpdir(), "agentscope-doctor-"));
  tempRoots.push(home);
  await mkdir(path.join(home, ".codex", "sessions"), { recursive: true });
  await mkdir(path.join(home, ".codex", "sqlite"), { recursive: true });
  await mkdir(path.join(home, ".claude", "sessions"), { recursive: true });
  await mkdir(path.join(home, ".claude", "projects"), { recursive: true });
  return home;
}

describe("doctor diagnostics", () => {
  it("treats missing Codex archived sessions as optional evidence", async () => {
    const home = await tempHome();

    const diagnostics = await runDoctor(home);
    const archivedSessions = diagnostics.find((item) => item.name === "codex.archived_sessions");
    const claudeDaemon = diagnostics.find((item) => item.name === "claude.daemon");

    expect(archivedSessions?.status).toBe("ok");
    expect(archivedSessions?.detail).toContain("Codex Desktop");
    expect(claudeDaemon?.status).toBe("warn");
  });
});
