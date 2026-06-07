import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { backupSession, planSessionDelete, planSessionImport, writeSessionDeletePlan } from "./sessionOps.js";

describe("session operations", () => {
  it("plans Claude session sidecars without deleting active PID mappings", async () => {
    const home = tempHome();
    const sessionId = "11111111-1111-4111-8111-111111111111";
    const cwd = String.raw`D:\Project\AgentScope`;
    const encoded = "D--Project-AgentScope";
    fs.mkdirSync(path.join(home, ".claude", "sessions"), { recursive: true });
    fs.mkdirSync(path.join(home, ".claude", "projects", encoded, sessionId, "tool-results"), { recursive: true });
    fs.writeFileSync(
      path.join(home, ".claude", "sessions", "1234.json"),
      JSON.stringify({ pid: 1234, sessionId, cwd, status: "idle", startedAt: 1780000000000, updatedAt: 1780000001000 })
    );
    fs.writeFileSync(path.join(home, ".claude", "projects", encoded, `${sessionId}.jsonl`), "{}\n");
    fs.writeFileSync(path.join(home, ".claude", "projects", encoded, sessionId, "tool-results", "1.txt"), "tool");

    const plan = await planSessionDelete(sessionId, "claude", { home, now: new Date("2026-06-07T00:00:00Z") });

    expect(plan.mode).toBe("dry-run");
    expect(plan.risk).toBe("blocked");
    expect(plan.blockers.join(" ")).toContain("exact active PID");
    expect(plan.files.some((file) => file.role === "transcript" && file.exists)).toBe(true);
    expect(plan.files.some((file) => file.role === "claude.session_sidecar" && file.exists)).toBe(true);
    expect(plan.files.some((file) => file.role === "claude.history_jsonl_patch")).toBe(true);
  });

  it("copies a Claude backup manifest and session files", async () => {
    const home = tempHome();
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-backup-"));
    const sessionId = "22222222-2222-4222-8222-222222222222";
    const cwd = String.raw`D:\Project\AgentScope`;
    const encoded = "D--Project-AgentScope";
    fs.mkdirSync(path.join(home, ".claude", "projects", encoded), { recursive: true });
    fs.writeFileSync(path.join(home, ".claude", "projects", encoded, `${sessionId}.jsonl`), "{\"type\":\"user\"}\n");

    const result = await backupSession(sessionId, "claude", {
      home,
      outputRoot,
      now: new Date("2026-06-07T01:02:03Z")
    });

    expect(fs.existsSync(result.manifestPath)).toBe(true);
    expect(result.copiedFiles.some((file) => file.role === "transcript" && file.sha256)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(result.manifestPath, "utf8")) as Record<string, unknown>;
    expect(manifest.sessionId).toBe(sessionId);
  });

  it("plans Codex delete as row-level sqlite operations", async () => {
    const home = tempHome();
    const sessionId = "33333333-3333-4333-8333-333333333333";
    const rollout = path.join(home, ".codex", "sessions", "2026", "06", "07", `rollout-2026-06-07T00-00-00-${sessionId}.jsonl`);
    fs.mkdirSync(path.dirname(rollout), { recursive: true });
    fs.writeFileSync(rollout, JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd: String.raw`D:\Project\AgentScope` } }) + "\n");

    const planResult = await writeSessionDeletePlan(sessionId, "codex", {
      home,
      outputRoot: fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-plan-")),
      now: new Date("2026-06-07T02:00:00Z")
    });

    expect(fs.existsSync(planResult.path)).toBe(true);
    expect(planResult.plan.databaseChanges.some((change) => change.table === "threads" && change.action === "delete")).toBe(true);
    expect(planResult.plan.warnings.join(" ")).toContain("no reliable PID");
  });

  it("builds an import plan from a backup directory and reports conflicts", async () => {
    const home = tempHome();
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-import-"));
    const sessionId = "44444444-4444-4444-8444-444444444444";
    const backupDir = path.join(outputRoot, "backups", "sample");
    fs.mkdirSync(path.join(backupDir, "files", "C", "Users", "dwgx1"), { recursive: true });
    fs.writeFileSync(path.join(backupDir, "manifest.json"), JSON.stringify({ agent: "claude", sessionId }));
    fs.writeFileSync(path.join(backupDir, "files", "C", "Users", "dwgx1", "transcript.jsonl"), "{}\n");
    fs.mkdirSync(path.join(home, ".claude", "projects", "D--Project-AgentScope"), { recursive: true });
    fs.writeFileSync(path.join(home, ".claude", "projects", "D--Project-AgentScope", `${sessionId}.jsonl`), "{}\n");

    const result = await planSessionImport(backupDir, { home, outputRoot, now: new Date("2026-06-07T03:00:00Z") });

    expect(fs.existsSync(result.path)).toBe(true);
    expect(result.plan.operation).toBe("import");
    expect(result.plan.warnings.join(" ")).toContain("already exists");
  });
});

function tempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-sessionops-"));
}
