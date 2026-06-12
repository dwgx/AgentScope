import { _electron as electron } from "playwright-core";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const cliArgs = process.argv.slice(2);
const executableArg = cliArgs.find((arg) => arg.startsWith("--executable="));
const customExecutable = executableArg ? path.resolve(executableArg.slice("--executable=".length)) : process.env.AGENTSCOPE_SMOKE_EXECUTABLE ? path.resolve(process.env.AGENTSCOPE_SMOKE_EXECUTABLE) : null;
const usePackaged = Boolean(customExecutable) || cliArgs.includes("--packaged") || process.env.AGENTSCOPE_SMOKE_CLICK_PACKAGED === "1";
const outputArg = cliArgs.find((arg) => !arg.startsWith("--"));
const outputRoot = outputArg ? path.resolve(outputArg) : path.join(root, "apps", "desktop", "out", "smoke", smokeStamp(), "clicks");
const packagedExe = customExecutable || path.join(root, "apps", "desktop", "out", "win-unpacked", "AgentScope.exe");
const fixturesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentscope-desktop-click-smoke-"));
const home = path.join(fixturesRoot, "home");
const appData = path.join(fixturesRoot, "AppData", "Roaming");
const localAppData = path.join(fixturesRoot, "AppData", "Local");
const userData = path.join(fixturesRoot, "ElectronUserData");
const launchLog = path.join(fixturesRoot, "launches.jsonl");
const parentId = "11111111-1111-4111-8111-111111111111";
const childId = "22222222-2222-4222-8222-222222222222";
const claudeId = "44444444-4444-4444-8444-444444444444";
const restoreClaudeId = "55555555-5555-4555-8555-555555555555";

let app;
let completed = false;
try {
  fs.mkdirSync(outputRoot, { recursive: true });
  seedFixtureHome(home);
  seedLaunchers();

  app = await electron.launch({
    executablePath: usePackaged ? packagedExe : path.join(root, "node_modules", "electron", "dist", "electron.exe"),
    args: [
      ...(usePackaged ? [] : [path.join(root, "apps", "desktop")]),
      "--agentscope-smoke",
      "--disable-gpu"
    ],
    cwd: root,
    env: {
      ...process.env,
      AGENTSCOPE_SMOKE: "1",
      AGENTSCOPE_SMOKE_VISIBLE: "1",
      AGENTSCOPE_SMOKE_VIEW: "sessions",
      AGENTSCOPE_SMOKE_PROCESS_TREE: "1",
      AGENTSCOPE_SMOKE_NO_SHELL: "1",
      AGENTSCOPE_SMOKE_FAKE_LAUNCH: "1",
      AGENTSCOPE_SMOKE_AUTO_CONFIRM_HIGH_RISK: "1",
      AGENTSCOPE_SMOKE_AUTO_CONFIRM_CONTROL_MODE: "1",
      AGENTSCOPE_SMOKE_LANGUAGE: "zh-CN",
      AGENTSCOPE_SMOKE_USER_DATA: userData,
      AGENTSCOPE_SMOKE_LAUNCH_LOG: launchLog,
      AGENTSCOPE_HOME: home,
      AGENTSCOPE_DATA_HOME: path.join(home, ".agentscope"),
      AGENTSCOPE_LAUNCHER_APPDATA: appData,
      CODEX_HOME: path.join(home, ".codex"),
      CODEX_SQLITE_HOME: path.join(home, ".codex"),
      CLAUDE_HOME: path.join(home, ".claude"),
      NO_COLOR: "1"
    }
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(15_000);
  await page.locator('[data-testid="session-row"][data-session-id="' + parentId + '"]').waitFor();
  await assertSyntheticRoots(page);

  await smokeSessionContextMenu(page);
  await smokeRecycleAndNotification(page);
  await smokeRelationsFilter(page);
  await smokeProcessTree(page);
  await smokeResumeFork(page);
  await smokeCommandSearch(page);
  await smokeCodexControlInteractions(page);

  await page.screenshot({ path: path.join(outputRoot, "desktop-clicks-final.png"), fullPage: true });
  await assertLaunchLog();
  completed = true;
  console.log(`Desktop click smoke passed. Screenshots: ${path.relative(root, outputRoot)}`);
} finally {
  if (app) await app.close().catch(() => undefined);
  if (completed) {
    fs.rmSync(fixturesRoot, { recursive: true, force: true });
  } else {
    console.error(`Desktop click smoke fixture preserved for debugging: ${fixturesRoot}`);
    console.error(`Desktop click smoke output preserved for debugging: ${outputRoot}`);
  }
}

async function assertSyntheticRoots(page) {
  const info = await page.evaluate(() => window.agentscope.getAppInfo());
  for (const [name, value] of Object.entries({
    home: info.home,
    codexHome: info.codexHome,
    claudeHome: info.claudeHome,
    userData: info.userData
  })) {
    if (!String(value).toLowerCase().startsWith(fixturesRoot.toLowerCase())) {
      throw new Error(`Smoke ${name} escaped fixture root: ${value}`);
    }
  }
}

async function smokeSessionContextMenu(page) {
  const parentRow = page.locator(`[data-testid="session-row"][data-session-id="${parentId}"]`);
  await parentRow.click();
  await parentRow.click({ button: "right" });
  await page.locator('[data-testid="session-context-menu"]').waitFor();
  const backupsBefore = countBackupManifests();
  await page.locator('[data-testid="session-context-backup"]').click();
  await waitForBackupManifests(backupsBefore + 1);
  await page.locator('[data-testid="notification"]').waitFor();
  await page.locator('[data-testid="notification-close"]').click();

  await parentRow.click({ button: "right" });
  await page.locator('[data-testid="session-context-menu"]').waitFor();
  const resume = page.locator('[data-testid="session-context-resume"]');
  if (await resume.isDisabled()) throw new Error("Session context resume button is disabled.");
  const fork = page.locator('[data-testid="session-context-fork"]');
  if (await fork.isDisabled()) throw new Error("Session context fork button is disabled.");
  await page.screenshot({ path: path.join(outputRoot, "session-context-menu.png"), fullPage: true });
  await page.mouse.click(40, 40);
}

async function smokeRecycleAndNotification(page) {
  await ensureSessionsView(page);
  const panel = page.locator('[data-testid="recycle-panel"]');
  await panel.waitFor();
  await page.locator('[data-testid="recycle-toggle"]').click();
  await expectAttribute(panel, "data-open", "true");
  const row = page.locator(`[data-testid="recycle-row"][data-session-id="${claudeId}"]`);
  await row.waitFor();
  await row.locator('[data-testid="recycle-open-journal"]').click();
  await waitForNotification(page, /打开|opened|open/i);
  await page.screenshot({ path: path.join(outputRoot, "recycle-notification.png"), fullPage: true });
  await page.locator('[data-testid="notification-close"]').click();

  const restoreRow = page.locator(`[data-testid="recycle-row"][data-session-id="${restoreClaudeId}"]`);
  await restoreRow.waitFor();
  if ((await restoreRow.getAttribute("data-restore-status")) !== "restorable") {
    throw new Error(`Expected restorable recycle row for ${restoreClaudeId}.`);
  }
  await restoreRow.locator('[data-testid="recycle-restore"]').click();
  await waitForNotification(page, /恢复|restored|imported/i);
  await waitForFilePredicate("restored Claude transcript", () => fs.existsSync(restoreClaudeTranscriptPath()), "restored Claude transcript to exist");
  await waitForRestoreJournal(restoreClaudeId);
  await page.screenshot({ path: path.join(outputRoot, "recycle-restore-success.png"), fullPage: true });
  await page.locator('[data-testid="notification-close"]').click();
}

async function smokeRelationsFilter(page) {
  await page.locator('[data-testid="nav-relations"]').click();
  await page.locator('[data-testid="relation-row"]').first().waitFor();
  await page.screenshot({ path: path.join(outputRoot, "relations-initial.png"), fullPage: true });
  await page.locator('[data-testid="relations-kind-filter"] button[data-value="subagent"]').click();
  await page.locator('[data-testid="relation-row"][data-relation-kind="subagent"]').first().waitFor();
  await page.locator('[data-testid="relations-confidence-filter"] button[data-value="indexed"]').click();
  const spawnOpen = page.locator('[data-testid="relations-spawn-filter"] button[data-value="open"]');
  if (await spawnOpen.count()) await spawnOpen.click();
  await page.locator('[data-testid="relations-search"]').fill(childId);
  await page.locator('[data-testid="relation-row"][data-relation-kind="subagent"]').first().waitFor();
  const count = await page.locator('[data-testid="relation-row"]').count();
  if (count !== 1) throw new Error(`Expected one filtered relation, got ${count}.`);
  await page.screenshot({ path: path.join(outputRoot, "relations-filtered.png"), fullPage: true });
}

async function smokeProcessTree(page) {
  await page.locator('[data-testid="nav-processes"]').click();
  const taskGroup = page.locator('[data-testid="process-group"][data-group-key="root:9100"]');
  await taskGroup.waitFor();
  await taskGroup.locator('[data-testid="process-group-toggle"]').click();
  await page.locator('[data-testid="process-row"][data-pid="9100"][data-process-role="codex_cli"]').waitFor();
  await page.locator('[data-testid="process-row"][data-pid="9100"]').click();
  await page.locator('[data-testid="inspector"]').waitFor();
  await expectText(page.locator('[data-testid="inspector"]'), /Codex CLI|PID 9100/i);

  await page.locator('[data-testid="process-row"][data-pid="9120"][data-process-role="codex_node_repl"]').waitFor();
  await expectAttribute(page.locator('[data-testid="process-row"][data-pid="9120"]'), "data-depth", "2");
  await page.locator('[data-testid="process-row"][data-pid="9130"][data-process-role="codex_app_server"]').waitFor();
  await page.locator('[data-testid="process-row"][data-pid="9140"][data-process-role="codex_mcp_tool"]').waitFor();
  await page.locator('[data-testid="process-row"][data-pid="9150"][data-process-role="codex_tool_kernel"]').waitFor();
  await page.locator('[data-testid="process-row"][data-pid="9160"][data-process-role="codex_mcp_tool"]').waitFor();
  await page.locator('[data-testid="process-row"][data-pid="9170"][data-process-role="codex_mcp_tool"]').waitFor();
  await expectAttribute(page.locator('[data-testid="process-row"][data-pid="9170"]'), "data-parent-agent-pid", "9160");
  await page.screenshot({ path: path.join(outputRoot, "process-tree-expanded.png"), fullPage: true });

  await page.locator('[data-testid="process-row"][data-pid="9140"]').click({ button: "right" });
  await page.locator('[data-testid="process-context-menu"]').waitFor();
  await expectText(page.locator('[data-testid="process-context-menu"]'), /MCP|parent PID|root PID/i);
  await page.locator('[data-testid="process-context-inspect"]').click();
  await page.locator('[data-testid="process-row"][data-pid="9140"].selected').waitFor();
  await expectText(page.locator('[data-testid="inspector"]'), /MCP|process\.parent_tree|Win32_Process|smoke\.synthetic\.process/i);

  await page.locator('[data-testid="process-group-control"] button[data-value="role"]').click();
  await page.locator('[data-testid="process-group"][data-group-key="role:codex_mcp_tool"]').waitFor();
  await page.locator('[data-testid="process-group"][data-group-key="role:codex_tool_kernel"]').waitFor();
  await page.locator('[data-testid="process-group"][data-group-key="role:codex_app_server"]').waitFor();
  await page.screenshot({ path: path.join(outputRoot, "process-role-groups.png"), fullPage: true });
}

async function smokeResumeFork(page) {
  await ensureSessionsView(page);
  const parentRow = page.locator(`[data-testid="session-row"][data-session-id="${parentId}"]`);
  await parentRow.waitFor();
  await parentRow.click({ button: "right" });
  await page.locator('[data-testid="session-context-resume"]').click();
  await waitForNotification(page, /resume|恢复|启动/i);
  await page.locator('[data-testid="notification-close"]').click();

  await parentRow.click({ button: "right" });
  await page.locator('[data-testid="session-context-fork"]').click();
  await waitForNotification(page, /fork|分叉|启动/i);
  await page.screenshot({ path: path.join(outputRoot, "resume-fork-notification.png"), fullPage: true });
  await page.locator('[data-testid="notification-close"]').click();
}

async function smokeCommandSearch(page) {
  await ensureSessionsView(page);
  await page.keyboard.press("Control+F");
  await page.locator('[data-testid="command-palette-input"]').waitFor();
  await page.locator('[data-testid="command-palette-input"]').fill("AgentScope smoke parent");
  await page.locator('[data-testid="command-search-result"]').first().waitFor();
  await page.locator('[data-testid="command-clear-current"]').click();
  await page.locator('[data-testid="command-no-history"]').waitFor({ state: "detached" });
  const historyItem = page.locator('[data-testid="command-history-item"]').filter({ hasText: "AgentScope smoke parent" });
  await historyItem.waitFor();
  await page.screenshot({ path: path.join(outputRoot, "command-search-history.png"), fullPage: true });
  await page.locator('[data-testid="command-clear-history"]').click();
  await page.locator('[data-testid="command-no-history"]').waitFor();
  await page.screenshot({ path: path.join(outputRoot, "command-search-cleared.png"), fullPage: true });
  await page.keyboard.press("Escape");
}

async function smokeCodexControlInteractions(page) {
  await page.locator('[data-testid="nav-codex-control"]').click();
  await page.locator('[data-testid="codex-control-tabs"]').waitFor();
  await page.locator('[data-testid="codex-control-tabs"] button[data-value="overview"]').click();
  await assertNoHorizontalOverflow(page, "Codex Control overview");
  const overviewText = await page.locator("body").innerText();
  if (overviewText.includes("smoke-secret-auth-token")) {
    throw new Error("Codex Control overview leaked synthetic auth token content.");
  }
  await page.screenshot({ path: path.join(outputRoot, "codex-control-overview.png"), fullPage: true });

  await page.locator('[data-testid="codex-control-tabs"] button[data-value="files"]').click();
  await page.locator('[data-testid="codex-control-files-layout"]').waitFor();
  await assertNoHorizontalOverflow(page, "Codex Control files");
  await editCodexSurface(page, "rules:default.rules", "# smoke rule edit", readCodexRule, "rules/default.rules");
  await editCodexSurface(page, "skill:review-helper", "\nSmoke skill edit.", readCodexSkill, "skills/review-helper/SKILL.md");
  const codexRevealAction = page.locator('[data-testid="notification-action"][data-action-role="codexControl"][data-action-kind="reveal"]').first();
  await codexRevealAction.waitFor();
  await codexRevealAction.click();
  await waitForNotification(page, /已定位路径|Revealed path/i);
  await assertNoNotificationRawPathActions(page, "Codex Control document notification");
  await page.screenshot({ path: path.join(outputRoot, "codex-control-document-notification.png"), fullPage: true });
  await closeNotificationIfVisible(page);

  await assertReadOnlySurface(page, "config.global");
  await assertReadOnlySurface(page, "plugins.summary");
  await assertReadOnlySurface(page, "skill-readonly:.system");
  await page.screenshot({ path: path.join(outputRoot, "codex-control-blocked-surfaces.png"), fullPage: true });

  await page.locator('[data-testid="codex-control-tabs"] button[data-value="models"]').click();
  await page.locator('[data-testid="codex-control-item-config.model_reasoning_effort-trigger"]').click();
  await assertViewportFit(page, '[data-testid="codex-control-item-config.model_reasoning_effort-search"]', "Codex Control combo menu");
  await page.locator('[data-testid="codex-control-item-config.model_reasoning_effort-option"][data-value="medium"]').click();
  const save = page.locator('[data-testid="codex-control-center-save"]');
  await waitForEnabled(save, "Codex Control model save");
  await save.click();
  await waitForNotification(page, /Codex|保存|saved|control/i);
  await waitForConfigContains('model_reasoning_effort = "medium"');
  await page.locator('[data-testid="notification-close"]').click();

  await page.locator('[data-testid="codex-control-tabs"] button[data-value="safety"]').click();
  await page.locator('[data-testid="codex-control-item-config.sandbox_mode-trigger"]').click();
  await page.locator('[data-testid="codex-control-item-config.sandbox_mode-option"][data-value="danger-full-access"]').click();
  await waitForEnabled(save, "Codex Control high-risk save");
  await save.click();
  await page.locator('[data-testid="confirm-dialog"]').waitFor();
  await page.screenshot({ path: path.join(outputRoot, "codex-control-high-risk-confirm.png"), fullPage: true });
  await page.locator('[data-testid="confirm-cancel"]').click();
  await waitForConfigMissing('sandbox_mode = "danger-full-access"');
  await save.click();
  await page.locator('[data-testid="confirm-dialog"]').waitFor();
  await page.locator('[data-testid="confirm-confirm"]').click();
  await waitForNotification(page, /Codex|保存|saved|control/i);
  await waitForConfigContains('sandbox_mode = "danger-full-access"');
  await waitForCodexControlJournal("sandbox_mode");
  await page.screenshot({ path: path.join(outputRoot, "codex-control-saved.png"), fullPage: true });
  await page.locator('[data-testid="notification-close"]').click();

  await page.locator('[data-testid="nav-settings"]').click();
  await page.locator('[data-testid="settings-control-mode"] button[data-value="readOnly"]').click();
  await page.locator('[data-testid="nav-codex-control"]').click();
  await page.locator('[data-testid="codex-control-tabs"] button[data-value="models"]').click();
  await page.locator('[data-testid="codex-control-item-config.plan_mode_reasoning_effort-trigger"]').waitFor();
  const readOnlySave = page.locator('[data-testid="codex-control-center-save"]');
  if (!(await readOnlySave.isDisabled())) {
    throw new Error("Codex Control save is enabled while control mode is read-only.");
  }
  const readOnlyTrigger = page.locator('[data-testid="codex-control-item-config.plan_mode_reasoning_effort-trigger"]');
  if (!(await readOnlyTrigger.isDisabled())) {
    throw new Error("Codex Control editor is enabled while control mode is read-only.");
  }
  const readOnlyDirectResult = await page.evaluate(async () => {
    try {
      await window.agentscope.saveCodexControlDocument("agents.global", "blocked direct smoke write\n", "0".repeat(64));
      return "unexpected success";
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });
  if (!/read-only|只读/i.test(readOnlyDirectResult)) {
    throw new Error(`Direct Codex Control save was not blocked by main read-only mode: ${readOnlyDirectResult}`);
  }
  await assertReadOnlyDirectIpcBlocked(page);
  await page.screenshot({ path: path.join(outputRoot, "codex-control-read-only.png"), fullPage: true });
  await page.locator('[data-testid="nav-settings"]').click();
  await page.locator('[data-testid="settings-control-mode"] button[data-value="safe"]').click();
}

async function ensureSessionsView(page) {
  await page.locator('[data-testid="nav-sessions"]').click();
  await page.locator(`[data-testid="session-row"][data-session-id="${parentId}"]`).waitFor();
}

async function assertLaunchLog() {
  const raw = fs.readFileSync(launchLog, "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const resume = raw.find((entry) => entry.agent === "codex" && entry.action === "resume" && entry.sessionId === parentId);
  const fork = raw.find((entry) => entry.agent === "codex" && entry.action === "fork" && entry.sessionId === parentId);
  if (!resume || !fork) throw new Error(`Missing resume/fork launch records: ${JSON.stringify(raw)}`);
  if (JSON.stringify(resume.args) !== JSON.stringify(["resume", parentId])) {
    throw new Error(`Unexpected resume args: ${JSON.stringify(resume.args)}`);
  }
  if (JSON.stringify(fork.args) !== JSON.stringify(["fork", parentId])) {
    throw new Error(`Unexpected fork args: ${JSON.stringify(fork.args)}`);
  }
}

async function expectText(locator, pattern) {
  const text = await locator.innerText();
  if (!pattern.test(text)) throw new Error(`Expected ${pattern} in text: ${text}`);
}

async function waitForNotification(page, pattern) {
  await page.waitForFunction(
    (source) => {
      const pattern = new RegExp(source, "i");
      return [...document.querySelectorAll('[data-testid="notification-message"]')].some((item) => pattern.test(item.textContent ?? ""));
    },
    pattern.source,
    { timeout: 15_000 }
  );
}

async function closeNotificationIfVisible(page) {
  const close = page.locator('[data-testid="notification-close"]');
  if (await close.count()) {
    await close.click();
    await page.locator('[data-testid="notification"]').waitFor({ state: "detached", timeout: 5_000 }).catch(() => undefined);
  }
}

async function editCodexSurface(page, surfaceId, marker, readFile, label) {
  const card = page.locator(`[data-testid="codex-control-surface-card"][data-surface-id="${surfaceId}"]`);
  await card.waitFor();
  await card.click();
  await page.locator(`[data-testid="codex-control-detail"][data-surface-id="${surfaceId}"]`).waitFor();
  const editor = page.locator('[data-testid="codex-control-editor"]');
  await editor.waitFor();
  await waitForEditorContent(editor, readFile, label);
  const before = await editor.inputValue();
  await editor.fill(`${before.trimEnd()}\n${marker}\n`);
  await waitForEnabled(page.locator('[data-testid="codex-control-file-save"]'), `${label} save`);
  await page.locator('[data-testid="codex-control-file-save"]').click();
  await waitForFilePredicate(label, () => readFile().includes(marker), `${label} to contain smoke marker`);
  await waitForNotification(page, /已保存|Saved/i);
  await page.screenshot({ path: path.join(outputRoot, `codex-control-${safeScreenshotName(surfaceId)}-edit.png`), fullPage: true });
}

async function assertReadOnlySurface(page, surfaceId) {
  const card = page.locator(`[data-testid="codex-control-surface-card"][data-surface-id="${surfaceId}"]`);
  await card.waitFor();
  await card.click();
  await page.locator(`[data-testid="codex-control-detail"][data-surface-id="${surfaceId}"]`).waitFor();
  await page.locator('[data-testid="codex-control-readonly-panel"]').waitFor();
  if (await page.locator('[data-testid="codex-control-editor"]').count()) {
    throw new Error(`Read-only Codex Control surface rendered an editor: ${surfaceId}`);
  }
}

async function assertNoNotificationRawPathActions(page, label) {
  const rawDocumentItems = await page.locator('[data-testid="notification-item"]').evaluateAll((items) =>
    items.filter((item) => !item.hasAttribute("disabled") && /^Document$/i.test(item.querySelector("span")?.textContent?.trim() ?? "")).length
  );
  if (rawDocumentItems > 0) {
    throw new Error(`${label} exposed clickable raw path notification item(s).`);
  }
}

async function assertViewportFit(page, selector, label) {
  await page.locator(selector).waitFor();
  const result = await page.locator(selector).evaluate((node) => {
    const box = node.getBoundingClientRect();
    return {
      left: box.left,
      top: box.top,
      right: box.right,
      bottom: box.bottom,
      width: box.width,
      height: box.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    };
  });
  if (
    result.left < -1 ||
    result.top < -1 ||
    result.right > result.viewportWidth + 1 ||
    result.bottom > result.viewportHeight + 1 ||
    result.width <= 0 ||
    result.height <= 0
  ) {
    throw new Error(`${label} is outside viewport: ${JSON.stringify(result)}`);
  }
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    const offenders = [...document.querySelectorAll("body, .content, .settingsRows, .listPane, .codexControlLayout")]
      .map((node) => {
        const element = node;
        return {
          selector: element === document.body ? "body" : `.${[...element.classList].join(".")}`,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth
        };
      })
      .filter((item) => item.scrollWidth > item.clientWidth + 2);
    return {
      rootScrollWidth: root.scrollWidth,
      rootClientWidth: root.clientWidth,
      offenders
    };
  });
  if (overflow.rootScrollWidth > overflow.rootClientWidth + 2 || overflow.offenders.length) {
    throw new Error(`${label} has horizontal overflow: ${JSON.stringify(overflow)}`);
  }
}

async function expectAttribute(locator, name, expected) {
  const value = await locator.getAttribute(name);
  if (value !== expected) throw new Error(`Expected ${name}=${expected}, got ${value}`);
}

function countBackupManifests() {
  const backupRoot = path.join(home, ".agentscope", "backups");
  if (!fs.existsSync(backupRoot)) return 0;
  return fs.readdirSync(backupRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(backupRoot, entry.name, "manifest.json")))
    .length;
}

async function waitForBackupManifests(expected) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (countBackupManifests() >= expected) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Expected at least ${expected} backup manifest(s), got ${countBackupManifests()}.`);
}

async function waitForEnabled(locator, label) {
  await locator.waitFor();
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (!(await locator.isDisabled())) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${label} did not become enabled.`);
}

async function waitForConfigContains(expected) {
  await waitForFilePredicate("config.toml", () => readCodexConfig().includes(expected), `config.toml to contain ${expected}`);
}

async function waitForConfigMissing(unexpected) {
  await waitForFilePredicate("config.toml", () => !readCodexConfig().includes(unexpected), `config.toml to not contain ${unexpected}`);
}

async function waitForCodexControlJournal(expectedKey) {
  const journalRoot = path.join(home, ".agentscope", "codex-control");
  await waitForFilePredicate(
    "codex-control journal",
    () => {
      if (!fs.existsSync(journalRoot)) return false;
      const entries = fs.readdirSync(journalRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
      return entries.some((entry) => {
        const journalPath = path.join(journalRoot, entry.name, "journal.json");
        return fs.existsSync(journalPath) && fs.readFileSync(journalPath, "utf8").includes(expectedKey);
      });
    },
    `Codex Control journal containing ${expectedKey}`
  );
}

async function waitForRestoreJournal(sessionId) {
  const journalPath = path.join(home, ".agentscope", "quarantine", `2026-06-11T00-01-00-000Z-claude-${sessionId}`, "restore-journal.json");
  await waitForFilePredicate(
    "restore journal",
    () => {
      if (!fs.existsSync(journalPath)) return false;
      const text = fs.readFileSync(journalPath, "utf8");
      return text.includes('"status": "succeeded"') && text.includes('"action": "copy"') && text.includes(sessionId);
    },
    `successful restore journal for ${sessionId}`
  );
}

async function assertReadOnlyDirectIpcBlocked(page) {
  const beforeConfig = readCodexConfig();
  const beforeLaunchLog = fs.existsSync(launchLog) ? fs.readFileSync(launchLog, "utf8") : "";
  const beforeBackups = countBackupManifests();
  const restoreJournal = path.join(home, ".agentscope", "quarantine", `2026-06-11T00-01-00-000Z-claude-${restoreClaudeId}`, "restore-journal.json");
  const beforeRestoreJournalMtime = fs.existsSync(restoreJournal) ? fs.statSync(restoreJournal).mtimeMs : 0;
  const restoreBackupDir = path.join(home, ".agentscope", "backups", `2026-06-11T00-01-00-000Z-claude-${restoreClaudeId}`);
  const results = await page.evaluate(async ({ parentId, restoreDir, restoreBackupDir }) => {
    const calls = [
      ["saveCodexModeConfig", () => window.agentscope.saveCodexModeConfig({ defaultModel: "blocked-readonly" }, "0".repeat(64))],
      ["executeCodexControlMutation", () => window.agentscope.executeCodexControlMutation({ mutations: [{ itemId: "config.model", keyPath: "model", value: "blocked-readonly" }] })],
      ["repairDiagnostic", () => window.agentscope.repairDiagnostic("desktop.nativeSqlite")],
      ["backupSession", () => window.agentscope.backupSession("codex", parentId)],
      ["deleteSession", () => window.agentscope.deleteSession("codex", parentId)],
      ["launchSession", () => window.agentscope.launchSession("codex", parentId, "resume", {})],
      ["restoreQuarantinedSession", () => window.agentscope.restoreQuarantinedSession(restoreDir)],
      ["importSessionBackup", () => window.agentscope.importSessionBackup(restoreBackupDir)],
      ["writeDeletePlan", () => window.agentscope.writeDeletePlan("codex", parentId)],
      ["writeImportPlan", () => window.agentscope.writeImportPlan(restoreBackupDir)],
      ["chooseImportPlan", () => window.agentscope.chooseImportPlan()],
      ["chooseImportSession", () => window.agentscope.chooseImportSession()]
    ];
    const output = [];
    for (const [name, call] of calls) {
      try {
        await call();
        output.push({ name, ok: true, message: "unexpected success" });
      } catch (error) {
        output.push({ name, ok: false, message: error instanceof Error ? error.message : String(error) });
      }
    }
    return output;
  }, {
    parentId,
    restoreDir: restoreClaudeQuarantineDir(),
    restoreBackupDir
  });
  const failures = results.filter((result) => result.ok || !/read-only/i.test(result.message));
  if (failures.length) {
    throw new Error(`Read-only direct IPC checks failed: ${JSON.stringify(failures)}`);
  }
  if (readCodexConfig() !== beforeConfig) throw new Error("Read-only direct IPC changed config.toml.");
  const afterLaunchLog = fs.existsSync(launchLog) ? fs.readFileSync(launchLog, "utf8") : "";
  if (afterLaunchLog !== beforeLaunchLog) throw new Error("Read-only direct IPC changed launch log.");
  if (countBackupManifests() !== beforeBackups) throw new Error("Read-only direct IPC created backup manifest.");
  const afterRestoreJournalMtime = fs.existsSync(restoreJournal) ? fs.statSync(restoreJournal).mtimeMs : 0;
  if (afterRestoreJournalMtime !== beforeRestoreJournalMtime) throw new Error("Read-only direct IPC changed restore journal.");
}

async function waitForFilePredicate(name, predicate, label) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label || name}.`);
}

async function waitForEditorContent(editor, readFile, label) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const expected = readFile();
    const value = await editor.inputValue();
    if (value === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const expected = readFile();
  const value = await editor.inputValue();
  throw new Error(`Timed out waiting for ${label} editor to load target document. editor=${JSON.stringify(value.slice(0, 160))} file=${JSON.stringify(expected.slice(0, 160))}`);
}

function readCodexConfig() {
  return fs.readFileSync(path.join(home, ".codex", "config.toml"), "utf8");
}

function readCodexRule() {
  return fs.readFileSync(path.join(home, ".codex", "rules", "default.rules"), "utf8");
}

function readCodexSkill() {
  return fs.readFileSync(path.join(home, ".codex", "skills", "review-helper", "SKILL.md"), "utf8");
}

function restoreClaudeTranscriptPath() {
  return path.join(home, ".claude", "projects", "D--Project-AgentScope", `${restoreClaudeId}.jsonl`);
}

function restoreClaudeQuarantineDir() {
  return path.join(home, ".agentscope", "quarantine", `2026-06-11T00-01-00-000Z-claude-${restoreClaudeId}`);
}

function safeScreenshotName(value) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

function seedLaunchers() {
  const npmBin = path.join(appData, "npm");
  fs.mkdirSync(npmBin, { recursive: true });
  for (const name of ["codex.cmd", "claude.cmd"]) {
    fs.writeFileSync(path.join(npmBin, name), "@echo off\r\nexit /b 0\r\n", "utf8");
  }
}

function seedFixtureHome(targetHome) {
  fs.mkdirSync(targetHome, { recursive: true });
  fs.mkdirSync(appData, { recursive: true });
  fs.mkdirSync(localAppData, { recursive: true });
  const codexRoot = path.join(targetHome, ".codex");
  const claudeRoot = path.join(targetHome, ".claude");
  fs.mkdirSync(codexRoot, { recursive: true });
  fs.writeFileSync(
    path.join(codexRoot, "config.toml"),
    [
      'model = "gpt-5.5"',
      'review_model = "gpt-5.4-mini"',
      'model_reasoning_effort = "high"',
      'plan_mode_reasoning_effort = "medium"',
      "",
      "[windows]",
      'sandbox = "unelevated"',
      "",
      "[mcp_servers.synthetic]",
      'command = "node"',
      "enabled = true",
      "",
      '[plugins."browser@openai-bundled"]',
      "enabled = true"
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(path.join(codexRoot, "auth.json"), JSON.stringify({ OPENAI_API_KEY: "smoke-secret-auth-token" }, null, 2) + "\n", "utf8");
  fs.writeFileSync(path.join(codexRoot, "AGENTS.md"), "Synthetic AgentScope smoke instructions.\n", "utf8");
  fs.mkdirSync(path.join(codexRoot, "rules"), { recursive: true });
  fs.writeFileSync(path.join(codexRoot, "rules", "default.rules"), "# Synthetic smoke rule\n", "utf8");
  fs.mkdirSync(path.join(codexRoot, "skills", "review-helper"), { recursive: true });
  fs.writeFileSync(path.join(codexRoot, "skills", "review-helper", "SKILL.md"), "---\nname: review-helper\n---\nSynthetic skill body.\n", "utf8");
  fs.mkdirSync(path.join(codexRoot, "skills", ".system", "skill-creator"), { recursive: true });
  fs.writeFileSync(path.join(codexRoot, "skills", ".system", "skill-creator", "SKILL.md"), "system skill body\n", "utf8");
  fs.mkdirSync(path.join(codexRoot, "plugins", "browser@openai-bundled"), { recursive: true });
  fs.mkdirSync(path.join(codexRoot, "mcp-node", "node_modules"), { recursive: true });
  fs.mkdirSync(path.join(codexRoot, "node_repl", "active_execs"), { recursive: true });
  fs.mkdirSync(path.join(codexRoot, "vendor_imports"), { recursive: true });
  fs.writeFileSync(path.join(codexRoot, "vendor_imports", "skills-curated-cache.json"), "{}\n", "utf8");

  const parentRollout = codexRolloutPath(targetHome, parentId, "sessions");
  const childRollout = codexRolloutPath(targetHome, childId, "sessions");
  fs.mkdirSync(path.dirname(parentRollout), { recursive: true });
  fs.writeFileSync(parentRollout, rolloutLine(parentId, "AgentScope smoke parent", String.raw`D:\AgentScopeSmoke\Workspace`) + "\n", "utf8");
  fs.writeFileSync(
    childRollout,
    JSON.stringify({
      type: "session_meta",
      payload: {
        id: childId,
        title: "AgentScope smoke subagent",
        cwd: String.raw`D:\AgentScopeSmoke\Workspace`,
        parent_thread_id: parentId,
        thread_source: "subagent",
        agent_nickname: "SmokeSubagent",
        agent_role: "explorer"
      }
    }) + "\n",
    "utf8"
  );
  seedCodexSqlite(codexRoot, parentRollout, childRollout);

  const encoded = "D--Project-AgentScope";
  fs.mkdirSync(path.join(claudeRoot, "sessions"), { recursive: true });
  fs.mkdirSync(path.join(claudeRoot, "projects", encoded), { recursive: true });
  fs.writeFileSync(
    path.join(claudeRoot, "sessions", "smoke.json"),
    JSON.stringify({
      pid: 0,
      sessionId: claudeId,
      cwd: String.raw`D:\AgentScopeSmoke\Workspace`,
      status: "stopped",
      startedAt: "2026-06-11T00:00:00.000Z",
      updatedAt: "2026-06-11T00:05:00.000Z"
    }),
    "utf8"
  );
  fs.writeFileSync(path.join(claudeRoot, "projects", encoded, `${claudeId}.jsonl`), JSON.stringify({ type: "system", cwd: String.raw`D:\AgentScopeSmoke\Workspace` }) + "\n", "utf8");
  seedQuarantine(targetHome, claudeId);
  seedRestorableQuarantine(targetHome, restoreClaudeId);
}

function seedRestorableQuarantine(targetHome, sessionId) {
  const backupDir = path.join(targetHome, ".agentscope", "backups", `2026-06-11T00-01-00-000Z-claude-${sessionId}`);
  const quarantineDir = restoreClaudeQuarantineDir();
  const originalPath = restoreClaudeTranscriptPath();
  const transcriptText = JSON.stringify({ type: "system", sessionId, cwd: String.raw`D:\AgentScopeSmoke\Restored` }) + "\n";
  const backupRelativePath = path.join("C", "Users", "dwgx1", "claude", `${sessionId}.jsonl`);
  const backupFile = path.join(backupDir, "files", backupRelativePath);
  fs.mkdirSync(path.dirname(backupFile), { recursive: true });
  fs.mkdirSync(quarantineDir, { recursive: true });
  fs.writeFileSync(backupFile, transcriptText, "utf8");
  const sha256 = crypto.createHash("sha256").update(transcriptText).digest("hex");
  const copiedFile = {
    role: "transcript",
    path: originalPath,
    exists: true,
    bytes: Buffer.byteLength(transcriptText),
    sha256,
    action: "copy",
    backupRelativePath,
    evidence: [
      {
        source: "claude.projects",
        detail: "Synthetic restorable Claude transcript backup.",
        path: originalPath,
        field: "sessionId"
      }
    ]
  };
  fs.writeFileSync(
    path.join(backupDir, "manifest.json"),
    JSON.stringify({
      schemaVersion: 1,
      kind: "AgentScope Session Backup",
      createdAt: "2026-06-11T00:01:00.000Z",
      agent: "claude",
      sessionId,
      sourceHome: targetHome,
      plan: {
        target: {
          title: "Restorable Claude smoke",
          cwd: String.raw`D:\AgentScopeSmoke\Restored`,
          transcriptPath: originalPath
        }
      },
      copiedFiles: [copiedFile]
    }, null, 2) + "\n",
    "utf8"
  );
  fs.writeFileSync(
    path.join(quarantineDir, "journal.json"),
    JSON.stringify({
      schemaVersion: 1,
      kind: "AgentScope Session Delete Journal",
      createdAt: "2026-06-11T00:01:00.000Z",
      updatedAt: "2026-06-11T00:01:00.000Z",
      agent: "claude",
      sessionId,
      backupDir,
      quarantineDir,
      journalPath: path.join(quarantineDir, "journal.json"),
      steps: [
        { phase: "backup", action: "backupSession", status: "succeeded", path: path.join(backupDir, "manifest.json") },
        { phase: "file", action: "move", status: "succeeded", role: "transcript", path: originalPath, targetPath: path.join(quarantineDir, "files", `${sessionId}.jsonl`) }
      ]
    }, null, 2) + "\n",
    "utf8"
  );
}

function seedCodexSqlite(codexRoot, parentRollout, childRollout) {
  const state = new Database(path.join(codexRoot, "state_5.sqlite"));
  state.exec(`
    CREATE TABLE threads (
      id TEXT PRIMARY KEY,
      rollout_path TEXT,
      cwd TEXT,
      title TEXT,
      source TEXT,
      created_at TEXT,
      updated_at TEXT,
      agent_nickname TEXT,
      agent_role TEXT,
      agent_path TEXT,
      thread_source TEXT,
      archived INTEGER
    );
    CREATE TABLE thread_spawn_edges (parent_thread_id TEXT, child_thread_id TEXT, status TEXT);
  `);
  const insert = state.prepare("INSERT INTO threads (id, rollout_path, cwd, title, source, created_at, updated_at, agent_nickname, agent_role, agent_path, thread_source, archived) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  insert.run(parentId, parentRollout, String.raw`D:\AgentScopeSmoke\Workspace`, "AgentScope smoke parent", "", "2026-06-11T00:00:00.000Z", "2026-06-11T00:04:00.000Z", "", "", "", "", 0);
  insert.run(childId, childRollout, String.raw`D:\AgentScopeSmoke\Workspace`, "AgentScope smoke subagent", JSON.stringify({ subagent: { thread_spawn: { parent_thread_id: parentId, depth: 1, agent_nickname: "SmokeSubagent", agent_role: "explorer", agent_path: "smoke-child" } } }), "2026-06-11T00:01:00.000Z", "2026-06-11T00:05:00.000Z", "SmokeSubagent", "explorer", "smoke-child", "subagent", 0);
  state.prepare("INSERT INTO thread_spawn_edges (parent_thread_id, child_thread_id, status) VALUES (?, ?, ?)").run(parentId, childId, "open");
  state.close();
}

function seedQuarantine(targetHome, sessionId) {
  const backupDir = path.join(targetHome, ".agentscope", "backups", "2026-06-11T00-00-00-000Z-claude-smoke");
  const quarantineDir = path.join(targetHome, ".agentscope", "quarantine", "2026-06-11T00-00-00-000Z-claude-smoke");
  fs.mkdirSync(backupDir, { recursive: true });
  fs.mkdirSync(quarantineDir, { recursive: true });
  fs.writeFileSync(
    path.join(backupDir, "manifest.json"),
    JSON.stringify({
      schemaVersion: 1,
      kind: "AgentScope Session Backup",
      createdAt: "2026-06-11T00:00:00.000Z",
      agent: "claude",
      sessionId,
      sourceHome: targetHome,
      copiedFiles: []
    }, null, 2) + "\n",
    "utf8"
  );
  fs.writeFileSync(
    path.join(quarantineDir, "journal.json"),
    JSON.stringify({
      schemaVersion: 1,
      kind: "AgentScope Session Delete Journal",
      createdAt: "2026-06-11T00:00:00.000Z",
      updatedAt: "2026-06-11T00:00:00.000Z",
      agent: "claude",
      sessionId,
      backupDir,
      quarantineDir,
      journalPath: path.join(quarantineDir, "journal.json"),
      steps: [
        { phase: "backup", action: "backupSession", status: "succeeded", path: path.join(backupDir, "manifest.json") },
        { phase: "file", action: "move", status: "succeeded", role: "transcript", path: "synthetic", targetPath: quarantineDir }
      ]
    }, null, 2) + "\n",
    "utf8"
  );
}

function codexRolloutPath(targetHome, sessionId, rootName) {
  return path.join(targetHome, ".codex", rootName, "2026", "06", "11", `rollout-2026-06-11T00-00-00-${sessionId}.jsonl`);
}

function rolloutLine(id, title, cwd) {
  return JSON.stringify({
    type: "session_meta",
    payload: {
      id,
      title,
      cwd,
      model: "gpt-5.5",
      usage: { input_tokens: 10, output_tokens: 4 }
    }
  });
}

function smokeStamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}
