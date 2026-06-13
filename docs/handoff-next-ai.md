# AgentScope Next-AI Handoff

Last updated: 2026-06-13.

Read order for the next AI:

1. `AGENTS.md`
2. this file
3. `docs/project-state-and-next-agent-workflow-2026-06-13.md`
4. `docs/research-local-agent-stores.md`
5. `docs/repository-hygiene.md`
6. `README.md`

## Product Identity

AgentScope is a Windows-only TypeScript/Electron desktop console for local AI coding agent trace and control. It indexes and explains Codex and Claude Code processes, sessions, transcripts, relations, backups, delete journals, quarantine restore state, and safe Codex control surfaces.

It is not a chat UI, not a Kanban board, and not a generic file manager. Every association must show evidence and confidence. Heuristics must stay visibly heuristic.

## User Expectations

Always speak Chinese with the user unless they explicitly asks otherwise.

The user expects:

- concrete implementation, not vague planning.
- direct risk reporting with evidence source: official docs, local observation, or current code.
- screenshot/smoke verification after meaningful UI changes.
- polished, dense, serious Windows desktop-console UI.
- no hidden vendor reasoning exposure.
- no destructive action without backup, quarantine, journal, and blockers.
- no fuzzy session deletion.
- no opening executables/scripts/transcripts when the user asked to locate evidence.

## Current Baseline

Use `git log --oneline -8` for the current commit list before changing code.

The current maintenance batch focuses on release/artifact hygiene, stronger
delete/Codex Control journaling, synthetic smoke coverage, and avoiding local
debug artifacts in prebuild manifests.

Latest verified implementation snapshot before this handoff refresh:

```text
commit: 9d774dc Harden release hygiene and operation journals
github ci: https://github.com/dwgx/AgentScope/actions/runs/27447351810
ci conclusion: success
artifact: AgentScope-win-pre
```

If this document is committed after the snapshot above, treat GitHub Actions for
the new HEAD as the current release evidence. Local `apps/desktop/out` can be
stale after any commit because `agentscope-prebuild.json` records the HEAD that
existed when `npm run package:pre` ran.

## Commands

Run after code changes:

```powershell
npm run audit:repo
npm run typecheck
npm test
npm run i18n:check
npm run package
```

For release/prebuild handoff:

```powershell
npm run check:release
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

## Code Map

- `packages/core/src/processes.ts`: Windows process enumeration through PowerShell `Get-CimInstance Win32_Process` and `Get-Process`.
- `packages/core/src/codex.ts`: Codex SQLite, rollout JSONL, archive/subagent metadata indexing.
- `packages/core/src/claude.ts`: Claude sessions, daemon/jobs, projects JSONL, stale PID handling.
- `packages/core/src/scope.ts`: unified snapshot merge, process/session scoring, evidence, confidence, relations.
- `packages/core/src/search.ts`: Codex SQLite and JSONL safe-field search.
- `packages/core/src/jsonl.ts`: JSONL streaming and search allowlist. Privacy-sensitive.
- `packages/core/src/codexControl.ts`: Codex control surfaces, protected auth metadata, rules/skills editing, structured config mutation, mutation journal. Security-sensitive.
- `packages/core/src/sessionOps.ts`: backup, delete, import, quarantine restore, journal, Codex DB row bundles. Highest risk.
- `apps/desktop/src/main/main.ts`: Electron IPC, shell path allowlists, launchers, dialogs, diagnostic repair.
- `apps/desktop/src/preload/preload.cjs`: narrow renderer API.
- `apps/desktop/src/renderer/src/App.tsx`: main desktop UI.
- `apps/desktop/src/renderer/src/styles.css`: layout, menus, notifications, recycle panel, dropdowns, font controls.
- `packages/i18n/src/resources/*.ts`: UI strings for en-US, zh-CN, ja-JP, ko-KR.
- `scripts/audit-repository.mjs`: tracked and untracked non-ignored repository hygiene and secret scan.
- `scripts/audit-artifacts.mjs`: local desktop artifact inventory and cleanup candidates.
- `scripts/clean-artifacts.mjs`: dry-run-first cleanup limited to `apps/desktop/out`.

## Current Safety State

Session operations:

- `backupSession()`, `deleteSession()`, and import/restore require exact session identity.
- `deleteSession()` writes backup first, creates quarantine, writes `journal.json`, backs up SQLite files, applies DB deletes, and moves files to quarantine.
- `restoreQuarantinedSession()` restores from a validated AgentScope quarantine journal/backup.
- Parent sessions with `childSessionIds` are blocked by default.
- Active exact PID mappings and high-confidence active Codex heuristic candidates are blocked by default.
- `allowActive` must not bypass child-session blockers.
- Claude global history/state/daemon roster patching is inspect-only unless reversible restore is implemented.

Codex DB row bundles:

- Export/import covers `state_5.threads`, `state_5.thread_spawn_edges`, `state_5.thread_dynamic_tools`, `goals_1.thread_goals`, and `memories_1.stage1_outputs`.
- `logs_2.sqlite` is summary-only. Log bodies are not restored and not deleted.
- DB bundle import hardcodes allowed database/table pairs and validates payload metadata plus row session ownership.
- SQLite writes must use table/column checks, transactions, and `busy_timeout`.

Search and privacy:

- JSONL search no longer scans raw line text.
- It returns safe metadata: path, line, event type, timestamp, matched fields, match kind.
- It denies reasoning/thinking/internal/hidden/content/text/result/output/delta/tool_result/body-like fields.
- Do not add raw transcript excerpts back unless product boundaries are redesigned.

Electron main:

- `shell:openPath` only opens AgentScope-owned text evidence: delete/restore journals, backup manifests, and redacted exports registered by the current process.
- Direct `.codex/.claude` transcripts, history, vendor logs, executables, scripts, native modules, SQLite/DB files, credentials, auth, config, plugins, skills, and rules are reveal-only or rejected.
- `shell:revealPath` remains allowlisted to local trace paths.
- Snapshot export is redacted by default.
- Diagnostic repair requires main-process confirmation before running `npm run package`.

Codex Control:

- `auth.json` is metadata-only: exists, size, mtime, storage mode. Do not read token content or hash.
- Raw `config.toml` editing is disabled; use structured controls.
- Structured mutations use allowlisted key paths, sha256 conflict checks, risk classification, backup, and journal.
- AGENTS/rules/user skill documents are allowlisted but sensitive-looking content is redacted and cannot be saved.

## UI State

Implemented views:

- Processes
- Sessions with recycle panel restore
- Relations
- Doctor
- Codex Control
- Settings
- Global `Ctrl+F` search

Important UI rules:

- Context menus must stay row-anchored and viewport-clamped.
- Notifications should be bottom-center, explicit, dense, and path-role-aware.
- Notification/body path display should be compact/redacted by default; actions may reveal real paths through main allowlists.
- Dropdowns must not overlap the header/search box or leave stray white scrollbar blocks.
- Recycle panel defaults collapsed and is animated.
- Resume/fork uses launcher resolution, not opening wrapper scripts.
- After meaningful UI changes, capture real screenshots with dev or packaged Electron.

## Repository Hygiene

Current hygiene rules:

- Do not commit `node_modules`, `dist`, `out`, `tmp`, `.codex`, `.claude`, `.agentscope`, real `.jsonl`, or real `.sqlite` files.
- Smoke screenshots may exist locally under ignored `apps/desktop/out/smoke`, but must not be committed or shared as evidence unless sanitized.
- `npm run audit:repo` checks tracked and untracked non-ignored files for high-confidence secrets, hard-coded local paths, and real local artifacts.
- `npm run audit:artifacts` inventories ignored desktop outputs and identifies local-only cleanup candidates.
- `npm run clean:artifacts` is dry-run by default; `-- --apply` is required to delete and is restricted to `apps/desktop/out`.
- If a real credential is found in git history, do not rewrite history automatically. Report, rotate/revoke, and ask before `filter-repo`/BFG.

## Known Residual Risks

- Restore is not fully atomic across files plus multiple SQLite DBs. Current code has preflight, cleanup, rollback attempts, and journals, but rollback itself can fail.
- Codex process-to-thread mapping remains partly heuristic because parsed local state does not expose a reliable PID-to-thread map.
- Claude daemon/job/session sidecars are local-observed internals, not stable official API.
- Old Claude patch helper functions still exist in `sessionOps.ts`; keep them off execution path unless full reversible restore is implemented.
- `planSessionImport()` writes a plan file and is not pure.
- Diagnostic repair can run `npm run package` after user confirmation. Keep confirmation strict.
- Computer Use plugin availability depends on Codex runtime native pipe injection; a present plugin cache does not guarantee current session support.

## Suggested Next Work

Highest-value next tasks:

1. Finish this maintenance batch: run all required checks, package, inspect `git diff --stat`, commit.
2. Add a real Electron/Playwright smoke harness for Settings, Codex Control, Sessions recycle panel, context menus, notifications, Relations filters, and launch notifications.
3. Make restore journals more granular for file copy and DB rollback evidence.
4. Remove or isolate old Claude patch helpers unless reversible patch/restore is implemented.
5. Add explicit child-session delete modes: block, include children, or detach. Do not silently detach.
6. Add keyboard access to row context menus with `Shift+F10`.
7. Keep improving Codex subagent/process role classification, but never upgrade heuristic to exact without evidence.
8. Continue Codex Control expansion only with safe structured controls and protected credentials.

## Source Research Summary

Official OpenAI Codex docs checked previously:

- `https://developers.openai.com/codex/codex-manual.md`
- `https://developers.openai.com/codex/config-basic`
- `https://developers.openai.com/codex/hooks`
- `https://developers.openai.com/codex/subagents`
- `https://developers.openai.com/codex/cli/reference`

Official Claude Code docs checked previously:

- `https://docs.anthropic.com/en/docs/claude-code/settings`
- `https://docs.anthropic.com/en/docs/claude-code/hooks`
- `https://docs.anthropic.com/en/docs/claude-code/memory`
- `https://docs.anthropic.com/en/docs/claude-code/slash-commands`
- `https://docs.anthropic.com/en/docs/claude-code/cli-reference`

Claude local store parsing remains mostly based on local observation and current code, not a stable official API.
