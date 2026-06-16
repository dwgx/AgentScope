import { mkdir, mkdtemp, rm } from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
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

  it("reports versioned Codex sqlite and rollouts compatibility roots", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "agentscope-doctor-compatible-"));
    tempRoots.push(home);
    await mkdir(path.join(home, ".codex", "rollouts", "2026", "06", "13"), { recursive: true });
    await mkdir(path.join(home, ".claude", "sessions"), { recursive: true });
    await mkdir(path.join(home, ".claude", "projects"), { recursive: true });
    const db = new Database(path.join(home, ".codex", "state_6.sqlite"));
    db.exec("CREATE TABLE threads (id TEXT PRIMARY KEY);");
    db.close();
    fs.writeFileSync(
      path.join(home, ".codex", "rollouts", "2026", "06", "13", "rollout-2026-06-13T12-00-00-thread-1.jsonl"),
      "{}\n"
    );

    const diagnostics = await runDoctor(home);
    const sqlite = diagnostics.find((item) => item.name === "codex.sqlite");
    const sessions = diagnostics.find((item) => item.name === "codex.sessions");
    const rollouts = diagnostics.find((item) => item.name === "codex.rollouts");

    expect(sqlite?.status).toBe("ok");
    expect(sqlite?.detail).toContain("state_6.sqlite");
    expect(sessions?.status).toBe("ok");
    expect(sessions?.detail).toContain("rollouts");
    expect(rollouts?.status).toBe("ok");
    expect(rollouts?.detail).toContain("1 rollout");
  });
});
