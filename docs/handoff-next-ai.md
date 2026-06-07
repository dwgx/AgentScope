# AgentScope Next-AI Handoff

Last updated: 2026-06-08.

This document is the complete handoff for the next AI working on AgentScope. Read this before editing code.

## Current State

AgentScope is a Windows-only TypeScript/Electron desktop app that identifies, indexes, searches, and explains local Codex and Claude Code sessions. It uses a shared core library and a desktop renderer:

- `apps/desktop`: Electron main/preload plus React renderer.
- `packages/core`: process enumeration, local store parsing, search, doctor, session operations.
- `packages/shared`: IPC-safe shared types.
- `packages/i18n`: English, Chinese, Japanese, Korean UI strings.

Recent commits:

- `ce02de5 Add safe session operations UI`
- `8f43c40 Add safe session operation plans`
- `e3b6bb7 Advance desktop tracing UI`

The workspace was clean after `ce02de5`.

## User Communication And Preferences

Use Chinese with the user. The user wants direct, high-signal engineering work, not vague reassurance.

Important user preferences:

- They care deeply about actual usability, not only code compiling.
- They expect UI details to be checked with screenshots/smoke tests.
- They dislike ugly toasts, misaligned labels/icons, weak spacing, and fake polish.
- They prefer a dense Windows desktop control-console style, with smooth but not decorative animation.
- They want evidence for every session/process association.
- They are willing to push hard. Respond calmly, fix concrete issues, and do not become defensive.

Operational pattern that worked:

1. Read the existing code first.
2. Make a focused plan in Chinese.
3. Implement in scoped slices.
4. Run typecheck/tests/i18n/package.
5. Give exact paths and commit hashes.

## Must-Read Files

- `AGENTS.md`: project rules for future Codex agents.
- `README.md`: product summary, commands, current safety boundaries.
- `docs/research-local-agent-stores.md`: official-source and local-store research notes.
- `packages/core/src/sessionOps.ts`: highest-risk current file.
- `packages/core/src/scope.ts`: process/session scoring and confidence.
- `apps/desktop/src/renderer/src/App.tsx`: UI behavior.
- `apps/desktop/src/main/main.ts`: IPC allowlists and operation wiring.

## Verified Commands

Use these after code changes:

```powershell
npm run typecheck
npm test
npm run i18n:check
npm run package
```

`npm run package` writes:

```text
apps/desktop/out/win-unpacked/AgentScope.exe
```

If Electron install looks broken:

```powershell
npm run electron:repair
```

## Architecture Notes

### Core snapshot flow

`packages/core/src/scope.ts` owns the unified snapshot:

1. `listProcesses(false)` gets relevant Windows processes.
2. `loadClaudeSessions`, `loadClaudeTranscripts`, `loadClaudeIndexRecords` parse Claude stores.
3. `loadCodexIndex` reads `state_5.sqlite`.
4. `scanCodexRollouts` scans rollout JSONL.
5. `mergeSessions`, `attachTranscripts`, `attachProcesses`, and `applyRelations` produce `ScopeSnapshot`.

The process-to-session candidate score uses:

- exact PID match: very high score.
- cwd in command/executable path.
- transcript path in command/executable path.
- session/thread id in command/executable path.
- window title containing indexed title.
- start/update time proximity.
- agent kind match.

Do not pretend heuristic matches are exact. Keep confidence and evidence visible.

### Electron IPC

Renderer should not get direct filesystem or process access. Use `apps/desktop/src/preload/preload.cjs` and `apps/desktop/src/main/main.ts`.

Current session IPC includes:

- `session:backup`
- `session:delete`
- `session:import`
- dry-run plan APIs still exist but are not primary UI actions.

Shell open/reveal is allowlisted. Keep it that way.

### UI behavior

`App.tsx` currently implements:

- global search and context-specific suggestions.
- `Ctrl+F` and `Esc` behavior.
- bottom-center structured notifications.
- confirmation dialog for delete.
- session right-click context menu.
- settings sections for General, Appearance, Indexing, Runtime, Diagnostics.

If changing UI, watch for text baseline alignment, icon centering, hover/focus states, and scroll behavior.

## Session Operations: Current Scope And Risks

`packages/core/src/sessionOps.ts` has real backup/delete/import functions. This is no longer read-only.

Current behavior:

- `backupSession` builds a plan and copies session files under `~/.agentscope/backups/<timestamp-agent-id>`.
- backup `manifest.json` includes copied file metadata and `backupRelativePath`.
- `deleteSession` resolves a full snapshot with processes, blocks active sessions, writes backup, moves removable files to quarantine, patches known Claude references, and deletes selected Codex SQLite rows.
- Codex DB files are backed up to quarantine before row deletion.
- `importSessionBackup` accepts an AgentScope backup directory, validates manifest files, rejects unsafe relative paths/hash mismatches/existing targets, and copies files back.

Known limitations:

- Import restores files only; it does not reinsert Codex `threads`, `thread_spawn_edges`, `thread_dynamic_tools`, `thread_goals`, or `stage1_outputs`.
- Delete moves files before applying Codex DB deletes. If DB mutation fails after file quarantine, recovery requires using backup/quarantine manually. A future implementation should improve the transaction choreography.
- Parent/child deletion policy is not strict enough. Deleting a parent with children should block or require an explicit detach/include-children mode.
- `riskWarnings()` still contains older wording that suggests planning-only behavior for some actions. Audit wording when extending.
- `planSessionImport()` writes an import plan as a side effect. This is acceptable today but should be revisited if planning should be pure.

Never delete:

- Codex: `auth.json`, `config.toml`, `installation_id`, `.sandbox-secrets`, plugins, skills, rules, full `history.jsonl`.
- Claude: `.credentials.json`, `settings.json`, `settings.local.json`, plugins, skills, global credentials/settings.

## Next Best Work

Priority order:

1. Add tests for active heuristic Codex deletion blocking and parent/child deletion blocking.
2. Make Codex delete operation transactional at the workflow level: DB transaction first with rollback strategy, then quarantine rollout, or journal every step for recovery.
3. Implement full import for Codex SQLite rows from backup manifest/db row exports.
4. Add keyboard access to session context menu with `Shift+F10`.
5. Add notification actions that jump to a session/index row in the UI, not only reveal/open paths.
6. Add a proper UI smoke harness using Playwright or Electron testing dependency. Current package smoke is lightweight.
7. Update README whenever safety behavior changes.

## Review Checklist

Before committing:

- `git status --short` to avoid committing user data or build artifacts.
- Check `packages/i18n/src/resources/*.ts` for every new UI key.
- Run `npm run i18n:check`.
- Run `npm test` if core behavior changed.
- Run `npm run package` if desktop behavior changed.
- For UI changes, inspect the app at `apps/desktop/out/win-unpacked/AgentScope.exe` or via `npm run dev`.

## Source Research Summary

Official OpenAI Codex manual was fetched through the `openai-docs` skill:

- local cached manual: `C:\Users\dwgx1\AppData\Local\Temp\openai-docs-cache\codex-manual.md`
- outline: `C:\Users\dwgx1\AppData\Local\Temp\openai-docs-cache\codex-manual.outline.md`

Relevant official Codex facts:

- Codex local state is under `CODEX_HOME`, default `~/.codex`.
- Session transcripts are under `$CODEX_HOME/sessions`.
- User config is `~/.codex/config.toml`; project config is `.codex/config.toml` in trusted projects.
- Hooks can be loaded from `hooks.json` or inline `[hooks]` tables.
- `codex resume <SESSION_ID>` resumes a specific local session.
- `codex exec --json` emits machine-readable JSONL events.
- Subagents are a documented Codex workflow and have config under `[agents]`, including `agents.max_threads`.

Relevant official Claude Code pages checked by direct HTTP:

- `https://docs.anthropic.com/en/docs/claude-code/settings`
- `https://docs.anthropic.com/en/docs/claude-code/hooks`
- `https://docs.anthropic.com/en/docs/claude-code/memory`
- `https://docs.anthropic.com/en/docs/claude-code/slash-commands`
- `https://docs.anthropic.com/en/docs/claude-code/cli-reference`

The Claude pages confirm settings/hooks/memory/CLI areas exist, but AgentScope's concrete store parsing is mostly based on local observed `.claude` files and code-level evidence. Keep that distinction in docs.

## If You Need To Hand Off Again

Write a short Markdown update rather than relying on chat memory. Include:

- latest commit hash.
- changed files.
- exact tests run.
- any unverified assumptions.
- next concrete task.

