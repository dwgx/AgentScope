import crypto from "node:crypto";
import { spawn } from "node:child_process";
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

describe("session operations", () => {
  it("blocks deleting high-confidence active Codex heuristic process candidates", async () => {
    const home = tempHome();
    const sessionId = "77777777-7777-4777-8777-777777777777";
    const cwd = process.cwd();
    const child = process.platform === "win32"
      ? spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)", String.raw`C:\Users\dwgx1\AppData\Roaming\npm\node_modules\@openai\codex\bin\codex.js`, "resume", sessionId, "--cwd", cwd], { cwd, stdio: "ignore", windowsHide: true })
      : undefined;
    const rollout = path.join(home, ".codex", "sessions", "2026", "06", "07", `rollout-2026-06-07T00-00-00-${sessionId}.jsonl`);
    fs.mkdirSync(path.dirname(rollout), { recursive: true });
    fs.writeFileSync(rollout, JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd } }) + "\n");

    try {
      if (child) await waitForProcessList();
      const plan = await planSessionDelete(sessionId, "codex", {
        home,
        includeProcesses: true,
        now: new Date("2026-06-07T00:00:00Z")
      });

      if (process.platform === "win32") {
        expect(plan.blockers.join(" ")).toContain("high-confidence active Codex process candidate");
      } else {
        expect(plan.blockers).toEqual([]);
      }
    } finally {
      child?.kill();
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
      now: new Date("2026-06-07T00:00:00Z")
    });

    expect(plan.risk).toBe("blocked");
    expect(plan.blockers.join(" ")).toContain("child sessions");
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

  it("deletes a Claude session by backing up and quarantining files", async () => {
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
    expect(fs.readFileSync(path.join(home, ".claude", "history.jsonl"), "utf8")).not.toContain(sessionId);
    expect(result.movedFiles.some((file) => file.role === "transcript")).toBe(true);
    expect(result.movedFiles.some((file) => file.role === "claude.job_state")).toBe(true);
    expect(result.patchedFiles.some((file) => file.role === "claude.history_jsonl_patch")).toBe(true);
    expect(fs.existsSync(result.journalPath)).toBe(true);
    const journal = JSON.parse(fs.readFileSync(result.journalPath, "utf8")) as Record<string, unknown>;
    expect(journal.kind).toBe("AgentScope Session Delete Journal");
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

  it("rejects import hash mismatches", async () => {
    const home = tempHome();
    const backupDir = makeBackupFixture(home, "cccccccc-cccc-4ccc-8ccc-cccccccccccc");
    fs.writeFileSync(path.join(backupDir, "files", "transcript.jsonl"), "tampered\n");

    await expect(importSessionBackup(backupDir, { home })).rejects.toThrow(/checksum mismatch/);
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
    expect(Number((state.prepare("SELECT COUNT(*) AS count FROM thread_dynamic_tools WHERE thread_id = ?").get(sessionId) as { count: number }).count)).toBe(1);
    state.close();
    const logs = new Database(path.join(home, ".codex", "logs_2.sqlite"), { readonly: true });
    expect(Number((logs.prepare("SELECT COUNT(*) AS count FROM logs WHERE thread_id = ?").get(sessionId) as { count: number }).count)).toBe(0);
    logs.close();
    expect(imported.databaseChanges?.some((change) => change.table === "threads" && change.action === "insert")).toBe(true);
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

function createCodexBundleFixture(home: string, sessionId: string, rollout: string): void {
  recreateCodexEmptySchema(home);
  const state = new Database(path.join(home, ".codex", "state_5.sqlite"));
  state.prepare("INSERT INTO threads (id, rollout_path, cwd, title) VALUES (?, ?, ?, ?)").run(sessionId, rollout, String.raw`D:\Project\AgentScope`, "bundle test");
  state.prepare("INSERT INTO thread_spawn_edges (parent_thread_id, child_thread_id) VALUES (?, ?)").run("parent-thread", sessionId);
  state.prepare("INSERT INTO thread_dynamic_tools (thread_id, name, value) VALUES (?, ?, ?)").run(sessionId, "shell", "enabled");
  state.close();

  const goals = new Database(path.join(home, ".codex", "goals_1.sqlite"));
  goals.prepare("INSERT INTO thread_goals (thread_id, goal) VALUES (?, ?)").run(sessionId, "ship");
  goals.close();

  const memories = new Database(path.join(home, ".codex", "memories_1.sqlite"));
  memories.prepare("INSERT INTO stage1_outputs (thread_id, output) VALUES (?, ?)").run(sessionId, "memory");
  memories.close();

  const logs = new Database(path.join(home, ".codex", "logs_2.sqlite"));
  logs.prepare("INSERT INTO logs (thread_id, level, ts, body) VALUES (?, ?, ?, ?)").run(sessionId, "INFO", "2026-06-07T00:00:00Z", "do not restore body");
  logs.close();
}

function recreateCodexEmptySchema(home: string): void {
  const codexRoot = path.join(home, ".codex");
  fs.mkdirSync(codexRoot, { recursive: true });
  for (const name of ["state_5.sqlite", "goals_1.sqlite", "memories_1.sqlite", "logs_2.sqlite"]) {
    fs.rmSync(path.join(codexRoot, name), { force: true });
  }
  const state = new Database(path.join(codexRoot, "state_5.sqlite"));
  state.exec(`
    CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT, cwd TEXT, title TEXT);
    CREATE TABLE thread_spawn_edges (parent_thread_id TEXT, child_thread_id TEXT);
    CREATE TABLE thread_dynamic_tools (thread_id TEXT, name TEXT, value TEXT);
  `);
  state.close();
  const goals = new Database(path.join(codexRoot, "goals_1.sqlite"));
  goals.exec("CREATE TABLE thread_goals (thread_id TEXT, goal TEXT);");
  goals.close();
  const memories = new Database(path.join(codexRoot, "memories_1.sqlite"));
  memories.exec("CREATE TABLE stage1_outputs (thread_id TEXT, output TEXT);");
  memories.close();
  const logs = new Database(path.join(codexRoot, "logs_2.sqlite"));
  logs.exec("CREATE TABLE logs (thread_id TEXT, level TEXT, ts TEXT, body TEXT);");
  logs.close();
}

function sha256(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

async function waitForProcessList(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 350));
}
