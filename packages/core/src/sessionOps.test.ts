import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import {
  backupSession,
  deleteSession,
  importSessionBackup,
  listQuarantinedSessions,
  planSessionDelete,
  planSessionImport,
  planSessionRestore,
  restoreQuarantinedSession,
  writeSessionDeletePlan
} from "./sessionOps.js";
import { annotateProcessTree } from "./processes.js";

describe("session operations", () => {
  it("blocks deleting high-confidence active Codex heuristic process candidates", async () => {
    const home = tempHome();
    const sessionId = "77777777-7777-4777-8777-777777777777";
    const cwd = process.cwd();
    const rollout = path.join(home, ".codex", "sessions", "2026", "06", "07", `rollout-2026-06-07T00-00-00-${sessionId}.jsonl`);
    fs.mkdirSync(path.dirname(rollout), { recursive: true });
    fs.writeFileSync(rollout, JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd } }) + "\n");

    const plan = await planSessionDelete(sessionId, "codex", {
      home,
      includeProcesses: true,
      now: new Date("2026-06-07T00:00:00Z"),
      processProvider: process.platform === "win32"
        ? async () => annotateProcessTree([
            {
              pid: 7770,
              ppid: process.pid,
              processName: "node.exe",
              executablePath: String.raw`C:\Program Files\nodejs\node.exe`,
              commandLine: String.raw`"node" "C:\Users\dwgx1\AppData\Roaming\npm\node_modules\@openai\codex\bin\codex.js" resume ${sessionId} --cwd "${cwd}"`,
              startTime: "2026-06-07T00:00:00.000Z",
              agent: "codex",
              evidence: []
            }
          ])
        : undefined
    });

    if (process.platform === "win32") {
      expect(plan.blockers.join(" ")).toContain("high-confidence active Codex process candidate");
    } else {
      expect(plan.blockers).toEqual([]);
    }
  });

  it("plans Claude session sidecars without treating stale PID files as blockers", async () => {
    const home = tempHome();
    const sessionId = "11111111-1111-4111-8111-111111111111";
    const cwd = String.raw`D:\Project\AgentScope`;
    const encoded = "D--Project-AgentScope";
    fs.mkdirSync(path.join(home, ".claude", "sessions"), { recursive: true });
    fs.mkdirSync(path.join(home, ".claude", "projects", encoded, sessionId, "tool-results"), { recursive: true });
    const stalePid = 2147483000;
    fs.writeFileSync(
      path.join(home, ".claude", "sessions", "1234.json"),
      JSON.stringify({ pid: stalePid, sessionId, cwd, status: "idle", startedAt: 1780000000000, updatedAt: 1780000001000 })
    );
    fs.writeFileSync(path.join(home, ".claude", "projects", encoded, `${sessionId}.jsonl`), "{}\n");
    fs.writeFileSync(path.join(home, ".claude", "projects", encoded, sessionId, "tool-results", "1.txt"), "tool");

    const plan = await planSessionDelete(sessionId, "claude", { home, now: new Date("2026-06-07T00:00:00Z") });

    expect(plan.mode).toBe("dry-run");
    expect(plan.risk).toBe("caution");
    expect(plan.blockers).toHaveLength(0);
    expect(plan.files.some((file) => file.role === "transcript" && file.exists)).toBe(true);
    expect(plan.files.some((file) => file.role === "claude.session_sidecar" && file.exists)).toBe(true);
    expect(plan.files.some((file) => file.role === "claude.history_jsonl_patch")).toBe(true);
  });

  it("blocks deleting parent sessions that still have child sessions", async () => {
    const home = tempHome();
    const parentId = "88888888-8888-4888-8888-888888888888";
    const childId = "99999999-9999-4999-8999-999999999999";
    const dbPath = path.join(home, ".codex", "state_5.sqlite");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT, cwd TEXT);
      CREATE TABLE thread_spawn_edges (parent_thread_id TEXT, child_thread_id TEXT);
    `);
    db.prepare("INSERT INTO threads (id, cwd) VALUES (?, ?)").run(parentId, String.raw`D:\Parent`);
    db.prepare("INSERT INTO threads (id, cwd) VALUES (?, ?)").run(childId, String.raw`D:\Child`);
    db.prepare("INSERT INTO thread_spawn_edges (parent_thread_id, child_thread_id) VALUES (?, ?)").run(parentId, childId);
    db.close();

    const plan = await planSessionDelete(parentId, "codex", {
      home,
      includeProcesses: false,
      now: new Date("2026-06-07T00:00:00Z")
    });

    expect(plan.risk).toBe("blocked");
    expect(plan.blockers.join(" ")).toContain("child sessions");
    await expect(
      deleteSession(parentId, "codex", {
        home,
        allowActive: true,
        includeProcesses: false,
        now: new Date("2026-06-07T00:00:00Z")
      })
    ).rejects.toThrow(/child sessions/);
  });

  it("deletes child sessions first when includeChildren is explicit", async () => {
    const home = tempHome();
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-child-include-"));
    const parentId = "88888888-1111-4888-8888-888888888888";
    const childId = "99999999-1111-4999-8999-999999999999";
    const parentRollout = path.join(home, ".codex", "sessions", "2026", "06", "07", `rollout-2026-06-07T00-00-00-${parentId}.jsonl`);
    const childRollout = path.join(home, ".codex", "sessions", "2026", "06", "07", `rollout-2026-06-07T00-00-00-${childId}.jsonl`);
    fs.mkdirSync(path.dirname(parentRollout), { recursive: true });
    fs.writeFileSync(parentRollout, JSON.stringify({ type: "session_meta", payload: { id: parentId, cwd: String.raw`D:\Parent` } }) + "\n");
    fs.writeFileSync(childRollout, JSON.stringify({ type: "session_meta", payload: { id: childId, cwd: String.raw`D:\Child` } }) + "\n");
    createCodexBundleFixture(home, parentId, parentRollout);
    const state = new Database(path.join(home, ".codex", "state_5.sqlite"));
    state.prepare("INSERT INTO threads (id, rollout_path, cwd, title) VALUES (?, ?, ?, ?)").run(childId, childRollout, String.raw`D:\Child`, "child");
    state.prepare("INSERT INTO thread_spawn_edges (parent_thread_id, child_thread_id) VALUES (?, ?)").run(parentId, childId);
    state.close();

    const result = await deleteSession(parentId, "codex", {
      home,
      outputRoot,
      includeProcesses: false,
      childMode: "includeChildren",
      now: new Date("2026-06-07T07:00:00Z")
    });

    expect(result.childMode).toBe("includeChildren");
    expect(result.childResults?.map((child) => child.sessionId)).toContain(childId);
    expect(fs.existsSync(parentRollout)).toBe(false);
    expect(fs.existsSync(childRollout)).toBe(false);
    const journal = JSON.parse(fs.readFileSync(result.journalPath, "utf8")) as { steps?: Array<Record<string, unknown>> };
    expect(journal.steps?.some((step) => step.phase === "child_delete" && step.childSessionId === childId)).toBe(true);
  });

  it("detaches reversible Codex child edges before deleting only the parent", async () => {
    const home = tempHome();
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-child-detach-"));
    const parentId = "88888888-2222-4888-8888-888888888888";
    const childId = "99999999-2222-4999-8999-999999999999";
    const parentRollout = path.join(home, ".codex", "sessions", "2026", "06", "07", `rollout-2026-06-07T00-00-00-${parentId}.jsonl`);
    const childRollout = path.join(home, ".codex", "sessions", "2026", "06", "07", `rollout-2026-06-07T00-00-00-${childId}.jsonl`);
    fs.mkdirSync(path.dirname(parentRollout), { recursive: true });
    fs.writeFileSync(parentRollout, JSON.stringify({ type: "session_meta", payload: { id: parentId, cwd: String.raw`D:\Parent` } }) + "\n");
    fs.writeFileSync(childRollout, JSON.stringify({ type: "session_meta", payload: { id: childId, cwd: String.raw`D:\Child` } }) + "\n");
    createCodexBundleFixture(home, parentId, parentRollout);
    const state = new Database(path.join(home, ".codex", "state_5.sqlite"));
    state.prepare("INSERT INTO threads (id, rollout_path, cwd, title) VALUES (?, ?, ?, ?)").run(childId, childRollout, String.raw`D:\Child`, "child");
    state.prepare("INSERT INTO thread_spawn_edges (parent_thread_id, child_thread_id) VALUES (?, ?)").run(parentId, childId);
    state.close();

    const result = await deleteSession(parentId, "codex", {
      home,
      outputRoot,
      includeProcesses: false,
      childMode: "detach",
      now: new Date("2026-06-07T07:10:00Z")
    });

    expect(result.childMode).toBe("detach");
    expect(result.detachedRelations?.[0]?.childSessionId).toBe(childId);
    expect(fs.existsSync(parentRollout)).toBe(false);
    expect(fs.existsSync(childRollout)).toBe(true);
    const db = new Database(path.join(home, ".codex", "state_5.sqlite"), { readonly: true });
    expect(Number((db.prepare("SELECT COUNT(*) count FROM threads WHERE id = ?").get(childId) as { count: number }).count)).toBe(1);
    expect(Number((db.prepare("SELECT COUNT(*) count FROM thread_spawn_edges WHERE parent_thread_id = ? AND child_thread_id = ?").get(parentId, childId) as { count: number }).count)).toBe(0);
    db.close();
    const journal = JSON.parse(fs.readFileSync(result.journalPath, "utf8")) as { steps?: Array<Record<string, unknown>> };
    expect(journal.steps?.some((step) => step.phase === "relation" && step.action === "detach_child_relation" && step.status === "succeeded")).toBe(true);
    expect(JSON.stringify(journal)).toContain("rollbackRows");
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

  it("deletes a Claude session by backing up and quarantining files without patching global state", async () => {
    const home = tempHome();
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-delete-"));
    const sessionId = "55555555-5555-4555-8555-555555555555";
    const encoded = "D--Project-AgentScope";
    const transcript = path.join(home, ".claude", "projects", encoded, `${sessionId}.jsonl`);
    const sidecar = path.join(home, ".claude", "projects", encoded, sessionId, "tool-results");
    const jobState = path.join(home, ".claude", "jobs", "abc12345", "state.json");
    fs.mkdirSync(sidecar, { recursive: true });
    fs.mkdirSync(path.dirname(jobState), { recursive: true });
    fs.writeFileSync(transcript, "{}\n");
    fs.writeFileSync(path.join(sidecar, "1.txt"), "tool");
    fs.writeFileSync(jobState, JSON.stringify({ sessionId, state: "stopped" }));
    fs.writeFileSync(
      path.join(home, ".claude", "history.jsonl"),
      `${JSON.stringify({ sessionId, display: "remove" })}\n${JSON.stringify({ sessionId: "other", display: "keep" })}\n`
    );

    const result = await deleteSession(sessionId, "claude", {
      home,
      outputRoot,
      now: new Date("2026-06-07T04:00:00Z")
    });

    expect(fs.existsSync(result.backup.manifestPath)).toBe(true);
    expect(fs.existsSync(transcript)).toBe(false);
    expect(fs.existsSync(path.join(sidecar, "1.txt"))).toBe(false);
    expect(fs.existsSync(jobState)).toBe(false);
    expect(fs.readFileSync(path.join(home, ".claude", "history.jsonl"), "utf8")).toContain(sessionId);
    expect(result.movedFiles.some((file) => file.role === "transcript")).toBe(true);
    expect(result.movedFiles.some((file) => file.role === "claude.job_state")).toBe(true);
    expect(result.patchedFiles).toHaveLength(0);
    expect(fs.existsSync(result.journalPath)).toBe(true);
    const journal = JSON.parse(fs.readFileSync(result.journalPath, "utf8")) as { kind?: string; steps?: Array<Record<string, unknown>> };
    expect(journal.kind).toBe("AgentScope Session Delete Journal");
    expect(journal.steps?.some((step) => step.phase === "operation" && step.action === "deleteSession" && step.status === "succeeded")).toBe(true);
  });

  it("records the actual backup directory in delete journals when now is not fixed", async () => {
    const home = tempHome();
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-delete-journal-backup-"));
    const sessionId = "56565656-5656-4565-8565-565656565656";
    const encoded = "D--Project-AgentScope";
    const transcript = path.join(home, ".claude", "projects", encoded, `${sessionId}.jsonl`);
    fs.mkdirSync(path.dirname(transcript), { recursive: true });
    fs.writeFileSync(transcript, "{}\n");

    const result = await deleteSession(sessionId, "claude", { home, outputRoot });
    const journal = JSON.parse(fs.readFileSync(result.journalPath, "utf8")) as { backupDir?: string };
    const manifest = JSON.parse(fs.readFileSync(result.backup.manifestPath, "utf8")) as { createdAt?: string };

    expect(journal.backupDir).toBe(result.backup.backupDir);
    expect(fs.existsSync(path.join(String(journal.backupDir), "manifest.json"))).toBe(true);
    expect(manifest.createdAt).toBe(result.plan.createdAt);
  });

  it("keeps Codex files in place and writes journal evidence when SQLite delete fails", async () => {
    const home = tempHome();
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-codex-fail-"));
    const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const rollout = path.join(home, ".codex", "sessions", "2026", "06", "07", `rollout-2026-06-07T00-00-00-${sessionId}.jsonl`);
    fs.mkdirSync(path.dirname(rollout), { recursive: true });
    fs.writeFileSync(rollout, JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd: String.raw`D:\Project\AgentScope` } }) + "\n");
    const dbPath = path.join(home, ".codex", "state_5.sqlite");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT, cwd TEXT);
      CREATE TABLE thread_spawn_edges (parent_thread_id TEXT, child_thread_id TEXT);
      CREATE TABLE thread_dynamic_tools (thread_id TEXT, name TEXT);
      CREATE TRIGGER agentscope_fail_delete BEFORE DELETE ON threads BEGIN SELECT RAISE(FAIL, 'simulated sqlite delete failure'); END;
    `);
    db.prepare("INSERT INTO threads (id, rollout_path, cwd) VALUES (?, ?, ?)").run(sessionId, rollout, String.raw`D:\Project\AgentScope`);
    db.close();

    await expect(
      deleteSession(sessionId, "codex", {
        home,
        outputRoot,
        includeProcesses: false,
        now: new Date("2026-06-07T06:00:00Z")
      })
    ).rejects.toThrow(/backupDir=.*quarantineDir=.*journalPath=/);

    const expectedDir = path.join(outputRoot, "quarantine", `2026-06-07T06-00-00-000Z-codex-${sessionId}`);
    const journalPath = path.join(expectedDir, "journal.json");
    expect(fs.existsSync(rollout)).toBe(true);
    expect(fs.existsSync(journalPath)).toBe(true);
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as { steps?: Array<Record<string, unknown>> };
    expect(journal.steps?.some((step) => step.phase === "sqlite_delete" && step.status === "failed")).toBe(true);
  });

  it("rolls back prior Codex sqlite deletes when a later DB fails", async () => {
    const home = tempHome();
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-codex-partial-fail-"));
    const sessionId = "56565656-5555-4555-8555-565656565656";
    const rollout = path.join(home, ".codex", "sessions", "2026", "06", "07", `rollout-2026-06-07T00-00-00-${sessionId}.jsonl`);
    fs.mkdirSync(path.dirname(rollout), { recursive: true });
    fs.writeFileSync(rollout, JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd: String.raw`D:\Project\AgentScope` } }) + "\n");
    createCodexBundleFixture(home, sessionId, rollout);
    const goals = new Database(path.join(home, ".codex", "goals_1.sqlite"));
    goals.exec(`
      CREATE TRIGGER agentscope_fail_goals_delete BEFORE DELETE ON thread_goals
      BEGIN
        SELECT RAISE(FAIL, 'goals delete failed');
      END;
    `);
    goals.close();

    await expect(
      deleteSession(sessionId, "codex", {
        home,
        outputRoot,
        includeProcesses: false,
        now: new Date("2026-06-07T04:31:00Z")
      })
    ).rejects.toThrow(/backupDir=.*quarantineDir=.*journalPath=/);

    const expectedDir = path.join(outputRoot, "quarantine", `2026-06-07T04-31-00-000Z-codex-${sessionId}`);
    const journalPath = path.join(expectedDir, "journal.json");
    expect(fs.existsSync(rollout)).toBe(true);
    expect(fs.existsSync(path.join(expectedDir, "files"))).toBe(false);
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as { steps?: Array<Record<string, unknown>> };
    expect(journal.steps?.some((step) => step.phase === "sqlite_delete" && step.status === "succeeded" && step.table === "threads")).toBe(true);
    expect(journal.steps?.some((step) => step.phase === "sqlite_delete" && step.status === "failed" && step.table === "thread_goals")).toBe(true);
    expect(journal.steps?.some((step) => step.phase === "sqlite_delete" && step.action === "rollback_restore" && step.status === "succeeded")).toBe(true);
    const state = new Database(path.join(home, ".codex", "state_5.sqlite"), { readonly: true });
    const restored = state.prepare("SELECT COUNT(*) count FROM threads WHERE id = ?").get(sessionId) as { count: number };
    state.close();
    expect(restored.count).toBe(1);
  });

  it("rolls back Codex sqlite deletes when file quarantine fails after DB deletion", async () => {
    const home = tempHome();
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-codex-file-fail-"));
    const sessionId = "67676767-5555-4555-8555-676767676767";
    const rollout = path.join(home, ".codex", "sessions", "2026", "06", "07", `rollout-2026-06-07T00-00-00-${sessionId}.jsonl`);
    fs.mkdirSync(path.dirname(rollout), { recursive: true });
    fs.writeFileSync(rollout, JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd: String.raw`D:\Project\AgentScope` } }) + "\n");
    createCodexBundleFixture(home, sessionId, rollout);
    const blockingTarget = path.join(
      outputRoot,
      "quarantine",
      `2026-06-07T04-41-00-000Z-codex-${sessionId}`,
      relativeBackupPathForTest(rollout)
    );
    fs.mkdirSync(path.dirname(path.dirname(blockingTarget)), { recursive: true });
    fs.writeFileSync(path.dirname(blockingTarget), "not a directory\n");

    await expect(
      deleteSession(sessionId, "codex", {
        home,
        outputRoot,
        includeProcesses: false,
        now: new Date("2026-06-07T04:41:00Z")
      })
    ).rejects.toThrow(/backupDir=.*quarantineDir=.*journalPath=/);

    expect(fs.existsSync(rollout)).toBe(true);
    const state = new Database(path.join(home, ".codex", "state_5.sqlite"), { readonly: true });
    expect(Number((state.prepare("SELECT COUNT(*) AS count FROM threads WHERE id = ?").get(sessionId) as { count: number }).count)).toBe(1);
    state.close();
    const journalPath = path.join(outputRoot, "quarantine", `2026-06-07T04-41-00-000Z-codex-${sessionId}`, "journal.json");
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as { steps?: Array<Record<string, unknown>> };
    expect(journal.steps?.some((step) => step.phase === "file" && step.status === "started")).toBe(true);
    expect(journal.steps?.some((step) => step.phase === "sqlite_delete" && step.action === "rollback_restore" && step.status === "succeeded")).toBe(true);
  });

  it("moves already quarantined files back when a later file quarantine fails", async () => {
    const home = tempHome();
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-claude-file-rollback-"));
    const sessionId = "78787878-5555-4555-8555-787878787878";
    const encoded = "D--Project-AgentScope";
    const transcript = path.join(home, ".claude", "projects", encoded, `${sessionId}.jsonl`);
    const sidecar = path.join(home, ".claude", "projects", encoded, sessionId);
    const jobState = path.join(home, ".claude", "jobs", "rollback-job", "state.json");
    fs.mkdirSync(path.join(sidecar, "tool-results"), { recursive: true });
    fs.mkdirSync(path.dirname(jobState), { recursive: true });
    fs.writeFileSync(transcript, "{}\n");
    fs.writeFileSync(path.join(sidecar, "tool-results", "1.txt"), "tool");
    fs.writeFileSync(jobState, JSON.stringify({ sessionId, state: "stopped" }));
    const quarantineDir = path.join(outputRoot, "quarantine", `2026-06-07T04-51-00-000Z-claude-${sessionId}`);
    const jobTarget = path.join(quarantineDir, relativeBackupPathForTest(jobState));
    fs.mkdirSync(path.dirname(path.dirname(jobTarget)), { recursive: true });
    fs.writeFileSync(path.dirname(jobTarget), "not a directory\n");

    await expect(
      deleteSession(sessionId, "claude", {
        home,
        outputRoot,
        now: new Date("2026-06-07T04:51:00Z")
      })
    ).rejects.toThrow(/backupDir=.*quarantineDir=.*journalPath=/);

    expect(fs.existsSync(transcript)).toBe(true);
    expect(fs.existsSync(path.join(sidecar, "tool-results", "1.txt"))).toBe(true);
    expect(fs.existsSync(jobState)).toBe(true);
    const transcriptTarget = path.join(quarantineDir, relativeBackupPathForTest(transcript));
    const sidecarTarget = path.join(quarantineDir, relativeBackupPathForTest(sidecar));
    expect(fs.existsSync(transcriptTarget)).toBe(false);
    expect(fs.existsSync(sidecarTarget)).toBe(false);
    const journal = JSON.parse(fs.readFileSync(path.join(quarantineDir, "journal.json"), "utf8")) as { steps?: Array<Record<string, unknown>> };
    expect(journal.steps?.some((step) => step.phase === "file" && step.action === "move" && step.status === "succeeded" && step.role === "transcript")).toBe(true);
    expect(journal.steps?.some((step) => step.phase === "file" && step.action === "rollback_move" && step.status === "succeeded" && step.role === "transcript")).toBe(true);
    expect(journal.steps?.some((step) => step.phase === "file" && step.action === "rollback_move" && step.status === "succeeded" && step.role === "claude.session_sidecar")).toBe(true);
    expect(journal.steps?.some((step) => step.phase === "operation" && step.action === "deleteSession" && step.status === "failed")).toBe(true);
  });

  it("imports an AgentScope backup when target files are absent", async () => {
    const home = tempHome();
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-import-exec-"));
    const sessionId = "66666666-6666-4666-8666-666666666666";
    const encoded = "D--Project-AgentScope";
    const transcript = path.join(home, ".claude", "projects", encoded, `${sessionId}.jsonl`);
    fs.mkdirSync(path.dirname(transcript), { recursive: true });
    fs.writeFileSync(transcript, "{}\n");
    const backup = await backupSession(sessionId, "claude", {
      home,
      outputRoot,
      now: new Date("2026-06-07T05:00:00Z")
    });
    fs.rmSync(transcript);

    const imported = await importSessionBackup(backup.backupDir, { home, outputRoot });

    expect(fs.existsSync(transcript)).toBe(true);
    expect(imported.importedFiles.some((file) => file.path === transcript)).toBe(true);
  });

  it("rejects destructive operations with partial session ids", async () => {
    const home = tempHome();
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-exact-id-"));
    const sessionA = "12121212-1212-4121-8121-121212121212";
    const sessionB = "99991212-1212-4121-8121-121212129999";
    for (const sessionId of [sessionA, sessionB]) {
      const transcript = path.join(home, ".claude", "projects", "D--Project-AgentScope", `${sessionId}.jsonl`);
      fs.mkdirSync(path.dirname(transcript), { recursive: true });
      fs.writeFileSync(transcript, "{}\n");
    }

    await expect(planSessionDelete("1212", "claude", { home, outputRoot })).rejects.toThrow(/Session not found/);
    await expect(backupSession("1212", "claude", { home, outputRoot })).rejects.toThrow(/Session not found/);
    await expect(deleteSession("1212", "claude", { home, outputRoot })).rejects.toThrow(/Session not found/);
  });

  it("lists restorable quarantined sessions from AgentScope delete journals only", async () => {
    const home = tempHome();
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-quarantine-list-"));
    const sessionId = "abababab-abab-4aba-8aba-abababababab";
    const encoded = "D--Project-AgentScope";
    const transcript = path.join(home, ".claude", "projects", encoded, `${sessionId}.jsonl`);
    fs.mkdirSync(path.dirname(transcript), { recursive: true });
    fs.writeFileSync(transcript, "{}\n");
    await deleteSession(sessionId, "claude", {
      home,
      outputRoot,
      now: new Date("2026-06-07T08:00:00Z")
    });
    const invalidDir = path.join(outputRoot, "quarantine", "invalid");
    fs.mkdirSync(invalidDir, { recursive: true });
    fs.writeFileSync(path.join(invalidDir, "journal.json"), JSON.stringify({ kind: "Other Journal", schemaVersion: 1 }));

    const items = await listQuarantinedSessions({ home, outputRoot });

    expect(items).toHaveLength(1);
    expect(items[0]?.sessionId).toBe(sessionId);
    expect(items[0]?.restoreStatus).toBe("restorable");
    expect(items[0]?.restorePossible).toBe(true);
    expect(items[0]?.movedFiles).toBe(1);
  });

  it("restores a quarantined Claude session through the referenced backup manifest", async () => {
    const home = tempHome();
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-restore-claude-"));
    const sessionId = "babababa-baba-4bab-8bab-babababababa";
    const encoded = "D--Project-AgentScope";
    const transcript = path.join(home, ".claude", "projects", encoded, `${sessionId}.jsonl`);
    fs.mkdirSync(path.dirname(transcript), { recursive: true });
    fs.writeFileSync(transcript, "{\"type\":\"user\"}\n");
    const deleted = await deleteSession(sessionId, "claude", {
      home,
      outputRoot,
      now: new Date("2026-06-07T08:10:00Z")
    });

    const restored = await restoreQuarantinedSession(deleted.quarantineDir, { home, outputRoot });

    expect(fs.existsSync(transcript)).toBe(true);
    expect(restored.importedFiles.some((file) => file.path === transcript)).toBe(true);
    expect(restored.restoreJournalPath).toBe(path.join(deleted.quarantineDir, "restore-journal.json"));
    const restoreJournal = JSON.parse(fs.readFileSync(restored.restoreJournalPath, "utf8")) as Record<string, unknown>;
    expect(restoreJournal.kind).toBe("AgentScope Session Restore Journal");
    expect(restoreJournal.status).toBe("succeeded");
    const steps = restoreJournal.steps as Array<Record<string, unknown>>;
    expect(steps.some((step) => step.phase === "file" && step.action === "copy_file_succeeded" && step.status === "succeeded")).toBe(true);
    expect(steps.some((step) => step.phase === "file" && step.action === "verify_sha256" && step.status === "succeeded")).toBe(true);
    expect(steps.some((step) => step.phase === "operation" && step.action === "restoreQuarantinedSession" && step.status === "succeeded")).toBe(true);
  });

  it("blocks quarantine restore when a target session already exists", async () => {
    const home = tempHome();
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-restore-conflict-"));
    const sessionId = "cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd";
    const encoded = "D--Project-AgentScope";
    const transcript = path.join(home, ".claude", "projects", encoded, `${sessionId}.jsonl`);
    fs.mkdirSync(path.dirname(transcript), { recursive: true });
    fs.writeFileSync(transcript, "{}\n");
    const deleted = await deleteSession(sessionId, "claude", {
      home,
      outputRoot,
      now: new Date("2026-06-07T08:20:00Z")
    });
    fs.writeFileSync(transcript, "existing\n");

    const plan = await planSessionRestore(deleted.quarantineDir, { home, outputRoot });

    expect(plan.plan.risk).toBe("blocked");
    expect(plan.plan.blockers.join(" ")).toContain("already exists");
    await expect(restoreQuarantinedSession(deleted.quarantineDir, { home, outputRoot })).rejects.toThrow(/restoreJournalPath=/);
    const failedJournal = JSON.parse(fs.readFileSync(path.join(deleted.quarantineDir, "restore-journal.json"), "utf8")) as Record<string, unknown>;
    expect(failedJournal.status).toBe("failed");
    expect((failedJournal.steps as Array<Record<string, unknown>>).some((step) => step.phase === "plan" && step.status === "failed")).toBe(true);
  });

  it("rejects non-AgentScope quarantine journals", async () => {
    const home = tempHome();
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-restore-invalid-"));
    const badDir = path.join(outputRoot, "quarantine", "bad");
    fs.mkdirSync(badDir, { recursive: true });
    fs.writeFileSync(
      path.join(badDir, "journal.json"),
      JSON.stringify({
        schemaVersion: 1,
        kind: "Other Journal",
        agent: "claude",
        sessionId: "efefefef-efef-4efe-8efe-efefefefefef",
        backupDir: path.join(outputRoot, "backups", "bad"),
        quarantineDir: badDir,
        journalPath: path.join(badDir, "journal.json"),
        steps: []
      })
    );

    await expect(planSessionRestore(badDir, { home, outputRoot })).rejects.toThrow(/not an AgentScope delete journal/);
  });

  it("rejects import path traversal in backup manifest", async () => {
    const home = tempHome();
    const backupDir = makeBackupFixture(home, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    const manifestPath = path.join(backupDir, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    const copiedFiles = manifest.copiedFiles as Array<Record<string, unknown>>;
    copiedFiles[0]!.backupRelativePath = "..\\escape.jsonl";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    await expect(importSessionBackup(backupDir, { home })).rejects.toThrow(/Unsafe backup relative path/);
  });

  it("rejects normalized backup relative paths that contain traversal segments", async () => {
    const home = tempHome();
    const backupDir = makeBackupFixture(home, "bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc");
    const manifestPath = path.join(backupDir, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    const copiedFiles = manifest.copiedFiles as Array<Record<string, unknown>>;
    copiedFiles[0]!.backupRelativePath = "nested\\..\\transcript.jsonl";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    await expect(importSessionBackup(backupDir, { home })).rejects.toThrow(/Unsafe backup relative path/);
  });

  it("rejects import targets outside agent session stores", async () => {
    const home = tempHome();
    const backupDir = makeBackupFixture(home, "12121212-aaaa-4aaa-8aaa-121212121212");
    const manifestPath = path.join(backupDir, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    const copiedFiles = manifest.copiedFiles as Array<Record<string, unknown>>;
    copiedFiles[0]!.path = path.join(home, "AppData", "Roaming", "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "evil.jsonl");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    await expect(importSessionBackup(backupDir, { home })).rejects.toThrow(/Unsafe Claude import target/);
  });

  it("rejects import targets for protected agent files", async () => {
    const home = tempHome();
    const backupDir = makeBackupFixture(home, "34343434-aaaa-4aaa-8aaa-343434343434");
    const manifestPath = path.join(backupDir, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    const copiedFiles = manifest.copiedFiles as Array<Record<string, unknown>>;
    copiedFiles[0]!.path = path.join(home, ".claude", "settings.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    await expect(importSessionBackup(backupDir, { home })).rejects.toThrow(/protected agent file/);
  });

  it("rejects import targets for credential-like agent files", async () => {
    const home = tempHome();
    const backupDir = makeBackupFixture(home, "35353535-aaaa-4aaa-8aaa-353535353535");
    const manifestPath = path.join(backupDir, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    const copiedFiles = manifest.copiedFiles as Array<Record<string, unknown>>;
    copiedFiles[0]!.path = path.join(home, ".claude", "projects", "D--Project-AgentScope", "credentials.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    await expect(importSessionBackup(backupDir, { home })).rejects.toThrow(/protected agent file/);
  });

  it("rejects Claude transcript imports that are not jsonl", async () => {
    const home = tempHome();
    const sessionId = "36363636-aaaa-4aaa-8aaa-363636363636";
    const backupDir = makeBackupFixture(home, sessionId);
    const manifestPath = path.join(backupDir, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    const copiedFiles = manifest.copiedFiles as Array<Record<string, unknown>>;
    copiedFiles[0]!.path = path.join(home, ".claude", "projects", "D--Project-AgentScope", `${sessionId}.json`);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    await expect(importSessionBackup(backupDir, { home })).rejects.toThrow(/Unsafe Claude import target extension/);
  });

  it("rejects import hash mismatches", async () => {
    const home = tempHome();
    const backupDir = makeBackupFixture(home, "cccccccc-cccc-4ccc-8ccc-cccccccccccc");
    fs.writeFileSync(path.join(backupDir, "files", "transcript.jsonl"), "tampered\n");

    await expect(importSessionBackup(backupDir, { home })).rejects.toThrow(/checksum mismatch.*backupDir=/);
  });

  it("rejects imports when copied file checksums are missing", async () => {
    const home = tempHome();
    const backupDir = makeBackupFixture(home, "cccccccc-cccc-4ccc-8ccc-cccccccccccd");
    const manifestPath = path.join(backupDir, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    const copiedFiles = manifest.copiedFiles as Array<Record<string, unknown>>;
    delete copiedFiles[0]!.sha256;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    await expect(importSessionBackup(backupDir, { home })).rejects.toThrow(/checksum is missing.*backupDir=/);
  });

  it("rejects non-AgentScope backup manifests", async () => {
    const home = tempHome();
    const backupDir = makeBackupFixture(home, "dddddddd-dddd-4ddd-8ddd-dddddddddddd");
    fs.writeFileSync(path.join(backupDir, "manifest.json"), JSON.stringify({ kind: "Other Backup", schemaVersion: 1, agent: "claude", sessionId: "x", copiedFiles: [] }));

    await expect(importSessionBackup(backupDir, { home })).rejects.toThrow(/not an AgentScope session backup/);
  });

  it("rejects import when target file already exists", async () => {
    const home = tempHome();
    const sessionId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const backupDir = makeBackupFixture(home, sessionId);
    const target = path.join(home, ".claude", "projects", "D--Project-AgentScope", `${sessionId}.jsonl`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "existing\n");

    await expect(importSessionBackup(backupDir, { home })).rejects.toThrow(/target already exists/);
  });

  it("exports and restores compatible Codex SQLite row bundles without logs bodies", async () => {
    const home = tempHome();
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-codex-import-"));
    const sessionId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const rollout = path.join(home, ".codex", "sessions", "2026", "06", "07", `rollout-2026-06-07T00-00-00-${sessionId}.jsonl`);
    fs.mkdirSync(path.dirname(rollout), { recursive: true });
    fs.writeFileSync(rollout, JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd: String.raw`D:\Project\AgentScope` } }) + "\n");
    createCodexBundleFixture(home, sessionId, rollout);

    const backup = await backupSession(sessionId, "codex", {
      home,
      outputRoot,
      now: new Date("2026-06-07T07:00:00Z")
    });
    const manifest = JSON.parse(fs.readFileSync(backup.manifestPath, "utf8")) as { databaseBundles?: Array<Record<string, unknown>> };
    expect(manifest.databaseBundles?.some((bundle) => bundle.table === "threads" && bundle.action === "restore")).toBe(true);
    expect(manifest.databaseBundles?.some((bundle) => bundle.table === "logs" && bundle.action === "summary")).toBe(true);

    fs.rmSync(rollout);
    recreateCodexEmptySchema(home);
    const imported = await importSessionBackup(backup.backupDir, { home, outputRoot });

    const state = new Database(path.join(home, ".codex", "state_5.sqlite"), { readonly: true });
    expect(Number((state.prepare("SELECT COUNT(*) AS count FROM threads WHERE id = ?").get(sessionId) as { count: number }).count)).toBe(1);
    expect(Number((state.prepare("SELECT COUNT(*) AS count FROM thread_spawn_edges WHERE child_thread_id = ?").get(sessionId) as { count: number }).count)).toBe(1);
    expect(Number((state.prepare("SELECT COUNT(*) AS count FROM thread_dynamic_tools WHERE thread_id = ?").get(sessionId) as { count: number }).count)).toBe(1);
    state.close();
    const goals = new Database(path.join(home, ".codex", "goals_1.sqlite"), { readonly: true });
    expect(Number((goals.prepare("SELECT COUNT(*) AS count FROM thread_goals WHERE thread_id = ?").get(sessionId) as { count: number }).count)).toBe(1);
    goals.close();
    const memories = new Database(path.join(home, ".codex", "memories_1.sqlite"), { readonly: true });
    expect(Number((memories.prepare("SELECT COUNT(*) AS count FROM stage1_outputs WHERE thread_id = ?").get(sessionId) as { count: number }).count)).toBe(1);
    memories.close();
    const logs = new Database(path.join(home, ".codex", "logs_2.sqlite"), { readonly: true });
    expect(Number((logs.prepare("SELECT COUNT(*) AS count FROM logs WHERE thread_id = ?").get(sessionId) as { count: number }).count)).toBe(0);
    logs.close();
    expect(imported.databaseChanges?.some((change) => change.table === "threads" && change.action === "insert")).toBe(true);
  });

  it("rolls back copied files and earlier Codex SQLite rows when a later DB import fails", async () => {
    const home = tempHome();
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-codex-import-rollback-"));
    const sessionId = "f1f1f1f1-1111-4f1f-8f1f-f1f1f1f1f1f1";
    const rollout = path.join(home, ".codex", "sessions", "2026", "06", "07", `rollout-2026-06-07T00-00-00-${sessionId}.jsonl`);
    fs.mkdirSync(path.dirname(rollout), { recursive: true });
    fs.writeFileSync(rollout, JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd: String.raw`D:\Project\AgentScope` } }) + "\n");
    createCodexBundleFixture(home, sessionId, rollout);
    const backup = await backupSession(sessionId, "codex", { home, outputRoot });

    fs.rmSync(rollout);
    recreateCodexEmptySchema(home);
    const goals = new Database(path.join(home, ".codex", "goals_1.sqlite"));
    goals.exec(`
      CREATE TRIGGER agentscope_fail_goals_import BEFORE INSERT ON thread_goals
      BEGIN
        SELECT RAISE(FAIL, 'goals import failed');
      END;
    `);
    goals.close();

    await expect(importSessionBackup(backup.backupDir, { home, outputRoot })).rejects.toThrow(/goals import failed/);

    expect(fs.existsSync(rollout)).toBe(false);
    const state = new Database(path.join(home, ".codex", "state_5.sqlite"), { readonly: true });
    expect(Number((state.prepare("SELECT COUNT(*) AS count FROM threads WHERE id = ?").get(sessionId) as { count: number }).count)).toBe(0);
    expect(Number((state.prepare("SELECT COUNT(*) AS count FROM thread_spawn_edges WHERE child_thread_id = ?").get(sessionId) as { count: number }).count)).toBe(0);
    expect(Number((state.prepare("SELECT COUNT(*) AS count FROM thread_dynamic_tools WHERE thread_id = ?").get(sessionId) as { count: number }).count)).toBe(0);
    state.close();
  });

  it("persists restore journal rollback steps when Codex DB import fails", async () => {
    const home = tempHome();
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-codex-restore-rollback-"));
    const sessionId = "f2f2f2f2-2222-4f2f-8f2f-f2f2f2f2f2f2";
    const rollout = path.join(home, ".codex", "sessions", "2026", "06", "07", `rollout-2026-06-07T00-00-00-${sessionId}.jsonl`);
    fs.mkdirSync(path.dirname(rollout), { recursive: true });
    fs.writeFileSync(rollout, JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd: String.raw`D:\Project\AgentScope` } }) + "\n");
    createCodexBundleFixture(home, sessionId, rollout);
    const deleted = await deleteSession(sessionId, "codex", {
      home,
      outputRoot,
      includeProcesses: false,
      allowActive: true,
      now: new Date("2026-06-07T09:10:00Z")
    });

    recreateCodexEmptySchema(home);
    const goals = new Database(path.join(home, ".codex", "goals_1.sqlite"));
    goals.exec(`
      CREATE TRIGGER agentscope_fail_goals_restore BEFORE INSERT ON thread_goals
      BEGIN
        SELECT RAISE(FAIL, 'goals restore failed');
      END;
    `);
    goals.close();

    await expect(restoreQuarantinedSession(deleted.quarantineDir, { home, outputRoot })).rejects.toThrow(/goals restore failed/);

    const restoreJournal = JSON.parse(fs.readFileSync(path.join(deleted.quarantineDir, "restore-journal.json"), "utf8")) as { steps?: Array<Record<string, unknown>>; status?: string };
    expect(restoreJournal.status).toBe("failed");
    expect(restoreJournal.steps?.some((step) => step.phase === "sqlite_import" && step.status === "failed")).toBe(true);
    expect(restoreJournal.steps?.some((step) => step.phase === "rollback" && step.action === "rollback_sqlite_delete_rows" && step.status === "succeeded")).toBe(true);
    expect(restoreJournal.steps?.some((step) => step.phase === "rollback" && step.action === "rollback_remove_imported_files" && step.status === "succeeded")).toBe(true);
  });

  it("rejects Codex SQLite row bundles that target unsupported databases or tables", async () => {
    const home = tempHome();
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-codex-bad-bundle-"));
    const sessionId = "abababab-1111-4aba-8aba-abababababab";
    const rollout = path.join(home, ".codex", "sessions", "2026", "06", "07", `rollout-2026-06-07T00-00-00-${sessionId}.jsonl`);
    fs.mkdirSync(path.dirname(rollout), { recursive: true });
    fs.writeFileSync(rollout, JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd: String.raw`D:\Project\AgentScope` } }) + "\n");
    createCodexBundleFixture(home, sessionId, rollout);
    const backup = await backupSession(sessionId, "codex", { home, outputRoot });
    fs.rmSync(rollout);
    recreateCodexEmptySchema(home);
    const manifestPath = path.join(backup.backupDir, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { databaseBundles: Array<Record<string, unknown>> };
    manifest.databaseBundles[0]!.databaseName = "..\\state_5.sqlite";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    await expect(importSessionBackup(backup.backupDir, { home, outputRoot })).rejects.toThrow(/Unsupported Codex SQLite row bundle target|Unsafe Codex row bundle/);
  });

  it("rejects Codex SQLite row bundle paths with traversal segments", async () => {
    const home = tempHome();
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-codex-bundle-traversal-"));
    const sessionId = "acacacac-1111-4aca-8aca-acacacacacac";
    const rollout = path.join(home, ".codex", "sessions", "2026", "06", "07", `rollout-2026-06-07T00-00-00-${sessionId}.jsonl`);
    fs.mkdirSync(path.dirname(rollout), { recursive: true });
    fs.writeFileSync(rollout, JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd: String.raw`D:\Project\AgentScope` } }) + "\n");
    createCodexBundleFixture(home, sessionId, rollout);
    const backup = await backupSession(sessionId, "codex", { home, outputRoot });
    fs.rmSync(rollout);
    recreateCodexEmptySchema(home);
    const manifestPath = path.join(backup.backupDir, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { databaseBundles: Array<Record<string, unknown>> };
    const threadsBundle = manifest.databaseBundles.find((bundle) => bundle.table === "threads")!;
    threadsBundle.relativePath = "db\\..\\db\\state_5.sqlite-threads.json";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    await expect(importSessionBackup(backup.backupDir, { home, outputRoot })).rejects.toThrow(/Unsafe Codex row bundle relative path|Unsafe backup relative path/);
  });

  it("rejects Codex SQLite row bundles whose rows belong to another session", async () => {
    const home = tempHome();
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-codex-wrong-session-"));
    const sessionId = "cdcdcdcd-1111-4cdc-8cdc-cdcdcdcdcdcd";
    const otherId = "edededed-1111-4ede-8ede-edededededed";
    const rollout = path.join(home, ".codex", "sessions", "2026", "06", "07", `rollout-2026-06-07T00-00-00-${sessionId}.jsonl`);
    fs.mkdirSync(path.dirname(rollout), { recursive: true });
    fs.writeFileSync(rollout, JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd: String.raw`D:\Project\AgentScope` } }) + "\n");
    createCodexBundleFixture(home, sessionId, rollout);
    const backup = await backupSession(sessionId, "codex", { home, outputRoot });
    fs.rmSync(rollout);
    recreateCodexEmptySchema(home);
    const manifestPath = path.join(backup.backupDir, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { databaseBundles: Array<Record<string, unknown>> };
    const threadsBundle = manifest.databaseBundles.find((bundle) => bundle.table === "threads")!;
    const bundlePath = path.join(backup.backupDir, String(threadsBundle.relativePath));
    const payload = JSON.parse(fs.readFileSync(bundlePath, "utf8")) as { rows: Array<Record<string, unknown>> };
    payload.rows[0]!.id = otherId;
    fs.writeFileSync(bundlePath, JSON.stringify(payload, null, 2));
    threadsBundle.sha256 = sha256(bundlePath);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    await expect(importSessionBackup(backup.backupDir, { home, outputRoot })).rejects.toThrow(/does not belong to this session/);
  });

  it("restores quarantined Codex file and row bundles without logs bodies", async () => {
    const home = tempHome();
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-codex-restore-"));
    const sessionId = "fefefefe-fefe-4fef-8fef-fefefefefefe";
    const rollout = path.join(home, ".codex", "sessions", "2026", "06", "07", `rollout-2026-06-07T00-00-00-${sessionId}.jsonl`);
    fs.mkdirSync(path.dirname(rollout), { recursive: true });
    fs.writeFileSync(rollout, JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd: String.raw`D:\Project\AgentScope` } }) + "\n");
    createCodexBundleFixture(home, sessionId, rollout);

    const deleted = await deleteSession(sessionId, "codex", {
      home,
      outputRoot,
      includeProcesses: false,
      now: new Date("2026-06-07T08:30:00Z")
    });
    expect(fs.existsSync(rollout)).toBe(false);

    const restored = await restoreQuarantinedSession(deleted.quarantineDir, { home, outputRoot });

    expect(fs.existsSync(rollout)).toBe(true);
    const state = new Database(path.join(home, ".codex", "state_5.sqlite"), { readonly: true });
    expect(Number((state.prepare("SELECT COUNT(*) AS count FROM threads WHERE id = ?").get(sessionId) as { count: number }).count)).toBe(1);
    expect(Number((state.prepare("SELECT COUNT(*) AS count FROM thread_spawn_edges WHERE child_thread_id = ?").get(sessionId) as { count: number }).count)).toBe(1);
    state.close();
    const logs = new Database(path.join(home, ".codex", "logs_2.sqlite"), { readonly: true });
    expect(Number((logs.prepare("SELECT COUNT(*) AS count FROM logs WHERE thread_id = ?").get(sessionId) as { count: number }).count)).toBe(1);
    logs.close();
    expect(restored.databaseChanges?.some((change) => change.table === "logs" && change.action === "skip")).toBe(true);
  });

  it("uses configured sqlite_home for Codex backup delete and restore row bundles", async () => {
    const home = tempHome();
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-codex-sqlite-home-"));
    const sqliteRoot = path.join(home, "sqlite-state");
    const sessionId = "fdfdfdfd-fdfd-4fdf-8fdf-fdfdfdfdfdfd";
    const codexRoot = path.join(home, ".codex");
    fs.mkdirSync(codexRoot, { recursive: true });
    fs.writeFileSync(path.join(codexRoot, "config.toml"), `sqlite_home = "${sqliteRoot.replaceAll("\\", "\\\\")}"\n`);
    const rollout = path.join(codexRoot, "sessions", "2026", "06", "07", `rollout-2026-06-07T00-00-00-${sessionId}.jsonl`);
    fs.mkdirSync(path.dirname(rollout), { recursive: true });
    fs.writeFileSync(rollout, JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd: String.raw`D:\Project\AgentScope` } }) + "\n");
    createCodexBundleFixture(home, sessionId, rollout, sqliteRoot);

    const deleted = await deleteSession(sessionId, "codex", {
      home,
      outputRoot,
      includeProcesses: false,
      now: new Date("2026-06-07T08:40:00Z")
    });

    const stateAfterDelete = new Database(path.join(sqliteRoot, "state_5.sqlite"), { readonly: true });
    expect(Number((stateAfterDelete.prepare("SELECT COUNT(*) AS count FROM threads WHERE id = ?").get(sessionId) as { count: number }).count)).toBe(0);
    stateAfterDelete.close();
    expect(deleted.databaseChanges.some((change) => change.database.includes("sqlite-state") && change.table === "threads")).toBe(true);

    await restoreQuarantinedSession(deleted.quarantineDir, { home, outputRoot });

    const stateAfterRestore = new Database(path.join(sqliteRoot, "state_5.sqlite"), { readonly: true });
    expect(Number((stateAfterRestore.prepare("SELECT COUNT(*) AS count FROM threads WHERE id = ?").get(sessionId) as { count: number }).count)).toBe(1);
    stateAfterRestore.close();
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

function makeBackupFixture(home: string, sessionId: string): string {
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-import-fixture-"));
  const filesRoot = path.join(backupDir, "files");
  fs.mkdirSync(filesRoot, { recursive: true });
  const source = path.join(filesRoot, "transcript.jsonl");
  fs.writeFileSync(source, "{}\n");
  const target = path.join(home, ".claude", "projects", "D--Project-AgentScope", `${sessionId}.jsonl`);
  const manifest = {
    schemaVersion: 1,
    kind: "AgentScope Session Backup",
    createdAt: "2026-06-07T00:00:00.000Z",
    agent: "claude",
    sessionId,
    sourceHome: home,
    copiedFiles: [
      {
        role: "transcript",
        path: target,
        exists: true,
        action: "copy",
        sha256: sha256(source),
        backupRelativePath: "transcript.jsonl",
        evidence: [{ source: "test", detail: "fixture" }]
      }
    ]
  };
  fs.writeFileSync(path.join(backupDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return backupDir;
}

function createCodexBundleFixture(home: string, sessionId: string, rollout: string, sqliteRoot = path.join(home, ".codex")): void {
  recreateCodexEmptySchema(home, sqliteRoot);
  const state = new Database(path.join(sqliteRoot, "state_5.sqlite"));
  state.prepare("INSERT INTO threads (id, rollout_path, cwd, title) VALUES (?, ?, ?, ?)").run(sessionId, rollout, String.raw`D:\Project\AgentScope`, "bundle test");
  state.prepare("INSERT INTO thread_spawn_edges (parent_thread_id, child_thread_id) VALUES (?, ?)").run("parent-thread", sessionId);
  state.prepare("INSERT INTO thread_dynamic_tools (thread_id, name, value) VALUES (?, ?, ?)").run(sessionId, "shell", "enabled");
  state.close();

  const goals = new Database(path.join(sqliteRoot, "goals_1.sqlite"));
  goals.prepare("INSERT INTO thread_goals (thread_id, goal) VALUES (?, ?)").run(sessionId, "ship");
  goals.close();

  const memories = new Database(path.join(sqliteRoot, "memories_1.sqlite"));
  memories.prepare("INSERT INTO stage1_outputs (thread_id, output) VALUES (?, ?)").run(sessionId, "memory");
  memories.close();

  const logs = new Database(path.join(sqliteRoot, "logs_2.sqlite"));
  logs.prepare("INSERT INTO logs (thread_id, level, ts, body) VALUES (?, ?, ?, ?)").run(sessionId, "INFO", "2026-06-07T00:00:00Z", "do not restore body");
  logs.close();
}

function recreateCodexEmptySchema(home: string, sqliteRoot = path.join(home, ".codex")): void {
  fs.mkdirSync(path.join(home, ".codex"), { recursive: true });
  fs.mkdirSync(sqliteRoot, { recursive: true });
  for (const name of ["state_5.sqlite", "goals_1.sqlite", "memories_1.sqlite", "logs_2.sqlite"]) {
    fs.rmSync(path.join(sqliteRoot, name), { force: true });
  }
  const state = new Database(path.join(sqliteRoot, "state_5.sqlite"));
  state.exec(`
    CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT, cwd TEXT, title TEXT);
    CREATE TABLE thread_spawn_edges (parent_thread_id TEXT, child_thread_id TEXT);
    CREATE TABLE thread_dynamic_tools (thread_id TEXT, name TEXT, value TEXT);
  `);
  state.close();
  const goals = new Database(path.join(sqliteRoot, "goals_1.sqlite"));
  goals.exec("CREATE TABLE thread_goals (thread_id TEXT, goal TEXT);");
  goals.close();
  const memories = new Database(path.join(sqliteRoot, "memories_1.sqlite"));
  memories.exec("CREATE TABLE stage1_outputs (thread_id TEXT, output TEXT);");
  memories.close();
  const logs = new Database(path.join(sqliteRoot, "logs_2.sqlite"));
  logs.exec("CREATE TABLE logs (thread_id TEXT, level TEXT, ts TEXT, body TEXT);");
  logs.close();
}

function sha256(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function relativeBackupPathForTest(filePath: string): string {
  let normalized = path.resolve(filePath).replaceAll("/", "\\");
  if (/^[a-zA-Z]:/.test(normalized)) normalized = normalized[0]!.toUpperCase() + normalized.slice(1);
  const withoutRoot = normalized.replace(/^([A-Za-z]):\\/, "$1/").replace(/^\\\\/, "UNC/");
  return withoutRoot.replace(/[<>:"|?*]/g, "_");
}
