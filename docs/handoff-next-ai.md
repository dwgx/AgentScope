# AgentScope Next-AI Handoff

Last updated: 2026-06-09.

This is the primary handoff for the next AI working on AgentScope. Read it before editing code, then read `AGENTS.md`, `README.md`, and `docs/research-local-agent-stores.md`.

## Product Identity

AgentScope is a Windows-only TypeScript/Electron desktop console for local AI coding agent trace and control. It indexes and explains local Codex and Claude Code processes, sessions, transcripts, relations, backups, deletion journals, and restore state.

It is not a chat UI, not a Kanban board, and not a generic file manager. Every session/process association must carry evidence and confidence. Heuristics must stay visibly heuristic.

## User Expectations

Always speak Chinese with the user unless they explicitly ask otherwise.

The user expects:

- concrete implementation, not vague plans.
- direct risk reporting with evidence source: official docs, local observation, or current code inference.
- screenshot/smoke verification after meaningful UI changes.
- dense, polished Windows desktop console UI.
- no hidden vendor reasoning exposure.
- no destructive action without backup, quarantine, journal, and blockers.

The user strongly dislikes:

- fake certainty.
- ugly or generic notifications.
- misaligned text, icons, pills, menus, or dropdowns.
- context menus that drift away from the row.
- opening executables when they asked to locate evidence.
- fuzzy session deletion.

## Latest Commit Baseline

Current latest commit at handoff time:

```text
70d322e Add Codex local storage metadata surfaces
```

Recent important commits:

```text
70d322e Add Codex local storage metadata surfaces
eee78b5 Align Codex mode reasoning controls
0a33ff0 Add Codex mode defaults control
172d9e5 Add safe Codex control settings
e3c64a7 Clarify restore state and classify Codex subagents
8b81b1d Correct handoff baseline and workflow notes
553cd42 Confirm diagnostic repair before package rebuild
b454097 Tighten import path validation audit fixes
39db692 Harden session control safety layer
c14d4f8 Fix launcher resolution and UI control states
2a55d1b Add quarantine restore control layer
8c8b673 Clarify diagnostics and notification details
4ae9e37 Improve process attribution and session controls
a4b47c1 Polish UI positioning and path feedback
```

The workspace was clean after `70d322e`.

## Commands To Run

After code changes, run:

```powershell
npm run typecheck
npm test
npm run i18n:check
npm run package
```

Before commit:

```powershell
git status --short
git diff --stat
git diff --check
```

For desktop iteration:

```powershell
npm run dev
```

Unpacked executable:

```text
apps/desktop/out/win-unpacked/AgentScope.exe
```

If Electron install is broken:

```powershell
npm run electron:repair
```

## Architecture Map

- `packages/core/src/processes.ts`: Windows process enumeration through PowerShell `Get-CimInstance Win32_Process` and `Get-Process`.
- `packages/core/src/codex.ts`: Codex SQLite and rollout JSONL indexing.
- `packages/core/src/claude.ts`: Claude sessions, daemon/jobs, projects JSONL, and stale PID handling.
- `packages/core/src/scope.ts`: unified snapshot merge, process/session candidate scoring, evidence, confidence, and relations.
- `packages/core/src/search.ts`: Codex SQLite and JSONL safe-field search.
- `packages/core/src/jsonl.ts`: JSONL streaming and search field allowlist. Treat as privacy-sensitive.
- `packages/core/src/sessionOps.ts`: backup, delete, import, quarantine restore, journal, and Codex DB row bundles. Treat this as highest risk.
- `apps/desktop/src/main/main.ts`: Electron IPC, shell path allowlists, launchers, dialogs, diagnostics repair.
- `apps/desktop/src/preload/preload.cjs`: narrow renderer API.
- `apps/desktop/src/renderer/src/App.tsx`: main desktop UI.
- `apps/desktop/src/renderer/src/styles.css`: layout, menus, notifications, recycle panel, font controls.
- `packages/i18n/src/resources/*.ts`: UI strings for en-US, zh-CN, ja-JP, ko-KR.

## Current Core Snapshot Flow

`packages/core/src/scope.ts` builds the unified snapshot:

1. Enumerates related Win32 processes.
2. Loads Claude session maps, daemon/job state, and transcripts.
3. Loads Codex `state_5.sqlite` thread records.
4. Scans Codex rollout JSONL files.
5. Merges sessions, attaches transcripts, attaches runtime processes, and applies relations.

Important current behavior:

- Exact PID attachment only writes runtime fields when an active `Win32_Process` row matches the stored PID.
- Claude stored PID claims are stored in `indexMetadata.storedPid`; stale PID claims are not treated as runtime exact.
- Codex heuristic process candidates are stored in `runtimeCandidates`, not in the primary `session.pid`, `processName`, `commandLine`, or `path`.
- Evidence source `process.heuristic` must remain visible in UI; do not present it as exact.

## Session Operations Current Reality

`packages/core/src/sessionOps.ts` now has real backup/delete/import/restore. It is not a mock layer.

Current capabilities:

- `backupSession()` accepts exact session IDs only.
- `deleteSession()` writes a backup first, creates quarantine, writes `journal.json`, backs up SQLite files, applies DB deletes, and moves files to quarantine.
- `importSessionBackup()` validates AgentScope backup manifests, file hashes, relative paths, target conflicts, role/path allowlists, and Codex DB row bundles before restore.
- `restoreQuarantinedSession()` restores from an AgentScope quarantine directory or journal using the same import validation path.
- `listQuarantinedSessions()` feeds the Sessions page recycle panel.
- Parent sessions with `childSessionIds` are blocked by default.
- Active PID mappings and high-confidence active Codex heuristic candidates are blocked by default.
- `allowActive` can only bypass active-process blockers; it cannot bypass child-session blockers.
- Destructive operations no longer use fuzzy `includes()` session ID matching.

Current backup manifest behavior:

- `manifest.json` has `kind: "AgentScope Session Backup"` and `schemaVersion: 1`.
- Copied files include role, original path, backup relative path, SHA-256 for files, evidence, and directory tree metadata for directories.
- Directory backups include recursive file entries and a tree hash; old directory backups without `directoryTree` are rejected on import.
- Manifest import rejects path traversal, including normalized traversal such as `safe\..\escape`.

Current Codex row bundle behavior:

- Export/import covers:
  - `state_5.sqlite`: `threads`, `thread_spawn_edges`, `thread_dynamic_tools`
  - `goals_1.sqlite`: `thread_goals`
  - `memories_1.sqlite`: `stage1_outputs`
- `logs_2.sqlite` is summary-only. Logs are not restored and not deleted.
- DB bundle import hardcodes allowed database/table pairs.
- DB bundle import validates payload metadata and per-row session ownership.
- DB writes use table/column checks, transactions, and `busy_timeout`.
- Import attempts rollback if Codex DB bundle restore fails after partial DB inserts.

Current Claude delete behavior:

- Claude transcript/session sidecar/session-env/file-history/image-cache/job-state files can be backed up and quarantined when role and path validation pass.
- Global Claude files such as `history.jsonl`, `.claude.json`, and daemon roster are currently inspect-only in delete plans. The old patch helpers remain in code but are not on the execution path.
- Do not re-enable global patching unless restore can reverse it with tests and journal evidence.

## Safety Invariants

Never delete, import over, or expose:

- Codex `auth.json`, credentials, `config.toml`, `installation_id`, plugins, skills, rules, global `history.jsonl`, `.sandbox-secrets`, hidden/internal stores.
- Claude `.credentials.json`, `settings.json`, `settings.local.json`, plugins, skills, global settings, global history, auth material.

Always preserve:

- exact session ID requirement for backup/delete/import/restore.
- backup before quarantine.
- `journal.json` for every delete.
- `restore-journal.json` or clear restore evidence for restore attempts.
- transaction/busy-timeout/table-column checks for SQLite writes.
- role/path allowlist for imported manifest paths.
- "logs summary only" behavior for Codex logs.

Do not read or display hidden vendor reasoning. AgentScope may parse plaintext JSONL, SQLite metadata, PID/session maps, path encodings, process metadata, and index relations only.

## Search Privacy State

JSONL search has been hardened:

- `packages/core/src/jsonl.ts` no longer searches raw line text.
- It returns safe match metadata such as `path`, `line`, `eventType`, `timestamp`, `matchedFields`, and `matchKind`.
- It denies fields matching reasoning/thinking/internal/hidden/content/text/result/output/delta/tool_result and similar body-like fields.
- `packages/core/src/search.test.ts` covers hidden/body fields and no raw excerpt.

Do not add raw transcript excerpts back to search results unless the product boundary is explicitly redesigned.

## Electron Main And IPC State

Renderer access goes through preload IPC only.

Current safety points:

- `shell:openPath` only opens text evidence file types such as `.json`, `.jsonl`, `.txt`, `.md`, and `.log`.
- Executables, scripts, native modules, SQLite/DB files, directories, and sensitive agent paths are reveal-only or rejected.
- `shell:revealPath` is still allowlisted to local trace paths.
- `session:import` accepts only AgentScope backup directories or AgentScope quarantine directories.
- `session:restore` is limited to AgentScope quarantine paths.
- `session:launch` supports Codex/Claude resume and fork through safe launcher resolution.
- Diagnostic repair for native SQLite now shows a native main-process confirmation before running `npm run package`; default is cancel.

Do not add broad shell/file IPC. If a new path action is needed, model its role first and enforce it in main.

## Desktop UI State

Implemented UI features:

- Processes, Sessions, Relations, Doctor, Settings views.
- Global `Ctrl+F` search and `Esc` close/back behavior.
- Sessions import button.
- Sessions recycle panel for quarantine restore, collapsed by default with animation.
- Session context menu with backup/delete/locate/resume/fork and multi-select backup/delete.
- Process context menu with inspect and candidate session actions.
- Notification center style bottom notifications with explicit path actions.
- Notifications can reveal/open only according to role and file type.
- Appearance settings with font modes, presets, detected fonts, reset buttons, and preview.
- General settings include control mode display and app cache/settings reset controls.
- Diagnostics can show repair actions and repair output notifications.
- Relations view has type/filter/search controls and stronger evidence rendering.

UI issues the user already pushed on and expects to stay fixed:

- Context menu positioning must stay row-anchored and viewport-clamped.
- Notification path rows must not overflow; long values should collapse/truncate but keep reveal/open actions.
- Dropdown menus must not leave stray white scrollbar blocks or overlap search/header areas.
- Font dropdown should not pin `Anthropic Sans` as a fake first choice; current value can be shown but installed/preferred fonts should be searchable.
- Recycle panel should be collapsible and default collapsed.
- "Open" should not launch `.exe`, `.cmd`, `.ps1`, `.sqlite`, `.db`, or Node/Codex executables.
- Resume/fork should use Codex/Claude launcher resolution, not open the wrapper script in a text editor.

After UI edits, use real screenshots or an Electron smoke path. The user specifically asked for true window screenshot review of new UI states.

## Known Residual Risks

These are not necessarily current bugs, but they should be handled honestly:

- Restore is not globally atomic across files plus multiple SQLite DBs. Current code has preflight, cleanup, rollback attempts, and restore journals, but rollback itself can fail.
- Codex process-to-thread mapping remains partly heuristic because the parsed local state does not expose a reliable PID-to-thread map.
- Claude daemon/job/session sidecars are local-observed internals, not guaranteed public API.
- Old Claude patch helper functions still exist in `sessionOps.ts`; keep them off execution path unless full reversible restore is implemented.
- `planSessionImport()` has side effects by writing a plan file. Revisit if planning must become pure.
- Directory backup integrity now relies on `directoryTree`; old backups without it are intentionally rejected.
- Diagnostic repair still can run `npm run package` after user confirmation. Treat it as high-power and do not weaken confirmation.
- Computer Use plugin may show unavailable in Codex settings when the current Codex session lacks `SKY_CUA_NATIVE_PIPE_DIRECTORY` / native pipe injection. Local plugin cache can be intact while runtime channel is absent.

## What Was Verified Recently

After `39db692`:

```powershell
npm run typecheck
npm test
npm run i18n:check
npm run package
```

After `b454097`:

```powershell
npm run typecheck
npm test
npm run i18n:check
npm run package
git diff --check
```

After `553cd42`:

```powershell
npm run typecheck
npm test
npm run i18n:check
npm run package
git diff --check
git status --short
```

Last known test result:

```text
8 test files passed
58 tests passed
i18n: 464 keys checked across 4 locales
```

## High-Risk Review Findings Already Closed

The user asked for a high-risk audit. Current code closed these points:

- Destructive operations no longer fuzzy-match partial session IDs.
- Import no longer blindly trusts manifest `file.path`; it uses role/path allowlists and target conflict checks.
- Codex DB bundle import validates allowed database/table, payload metadata, and row session ownership.
- JSONL search no longer scans raw line text or returns transcript excerpts.
- `openPath` no longer opens executables/scripts/native modules/SQLite files.
- Claude global history/state/daemon roster patching is inspect-only in delete plans.
- Heuristic process candidates no longer overwrite primary session PID/process fields.
- Claude stale PID claims are not exact runtime associations without a current process row.
- Directory backups now have recursive integrity metadata.
- `allowActive` no longer bypasses child-session blockers.
- Diagnostic repair now requires main-process confirmation before package rebuild.
- Notification actions are role-aware, not generic reveal-plus-open.

## Suggested Next Work

Highest-value next tasks:

1. Add a real Electron/Playwright smoke harness that can capture screenshots for Settings, Sessions recycle panel, context menus, notifications, Relations filters, and launch notifications.
2. Make restore journals more granular: record every copied file and every DB rollback step, including rollback failures.
3. Remove or isolate old Claude patch helper code unless a reversible patch/restore mode is implemented.
4. Add explicit child-session delete modes: block, include children, or detach. Do not silently detach.
5. Add keyboard access to row context menus with `Shift+F10`.
6. Keep improving relation naming and process role classification, but never upgrade heuristic to exact without evidence.
7. Document any future official Codex/Claude local-store changes with source type.

## Workflow For The Next AI

Start every new work session like this:

1. Read `AGENTS.md`, this file, `docs/research-local-agent-stores.md`, and `README.md`.
2. Run `git status --short` and do not revert user changes.
3. If touching session operations, read `packages/core/src/sessionOps.ts` and `packages/core/src/sessionOps.test.ts` before editing.
4. If touching process/session association, read `packages/core/src/scope.ts`, `packages/core/src/claude.ts`, and related tests.
5. If touching IPC, read `apps/desktop/src/main/main.ts`, preload, and renderer call sites.
6. If touching UI, inspect `App.tsx` and `styles.css`, then verify with screenshots or packaged/dev Electron smoke.
7. Use `apply_patch` for manual edits.
8. Run the required commands.
9. Commit with a clear message.
10. Report in Chinese: what changed, what was verified, what risk remains.

## Source Research Summary

Official OpenAI Codex documentation checked previously:

- `https://developers.openai.com/codex/codex-manual.md`
- `https://developers.openai.com/codex/config-basic`
- `https://developers.openai.com/codex/hooks`
- `https://developers.openai.com/codex/subagents`
- `https://developers.openai.com/codex/cli/reference`

Relevant official Codex facts:

- `CODEX_HOME` controls the Codex state root; default is `~/.codex`.
- Session transcripts live under `$CODEX_HOME/sessions`.
- User config is `~/.codex/config.toml`.
- Hooks can come from `hooks.json` or inline `[hooks]`.
- `codex resume <SESSION_ID>` resumes a local session.
- `codex fork` can fork a previous interactive session.
- Subagents are a documented Codex workflow.

Official Claude Code pages checked previously:

- `https://docs.anthropic.com/en/docs/claude-code/settings`
- `https://docs.anthropic.com/en/docs/claude-code/hooks`
- `https://docs.anthropic.com/en/docs/claude-code/memory`
- `https://docs.anthropic.com/en/docs/claude-code/slash-commands`
- `https://docs.anthropic.com/en/docs/claude-code/cli-reference`

Claude local store parsing remains mostly based on local observation and current code, not a stable official API.
