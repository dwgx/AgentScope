# AgentScope Agent Handoff Rules

AgentScope is a Windows-only TypeScript/Electron desktop console for local AI coding agent trace and control. It indexes Codex and Claude Code processes, sessions, transcripts, and evidence. It is not a chat UI and not a Kanban board.

## User And Product Direction

- Speak with the user in Chinese unless they explicitly ask otherwise.
- Be direct, rigorous, and pragmatic. The user expects concrete implementation, screenshots/smoke tests when UI changes, and honest risk reporting.
- The user strongly prefers high-quality UI that feels polished, dense, and controllable. Avoid decorative marketing layouts. Use a serious desktop-console feel with careful spacing, alignment, animation, and keyboard behavior.
- The user dislikes vague claims. Every session/process association must show evidence and confidence.
- The user wants subagent-style research when explicitly requested, but do not block on delegation if thread limits are reached. Continue locally and document what was verified.

## Engineering Defaults

- Use TypeScript, Electron, React, and the existing workspace structure.
- Prefer the existing core library over duplicating logic in the renderer.
- Keep Windows path handling centralized in `packages/core/src/paths.ts`.
- Keep privileged filesystem/process work in `packages/core` or Electron main. Renderer access goes through preload IPC only.
- Do not read or display hidden vendor reasoning. AgentScope only parses plaintext JSONL, SQLite, PID/session maps, path encodings, process metadata, and index relations.
- Default destructive behavior must be blocked, confirmed, backed up, and evidenced.
- Never delete credentials, auth files, settings, plugins, skills, rules, or full global history as a side effect of deleting one session.

## Current Commands

Run these before handoff after code changes:

```powershell
npm run audit:repo
npm run lint
npm run typecheck
npm test
npm run i18n:check
npm run package
```

For release/prebuild handoff, run the CI-aligned release check instead:

```powershell
npm run check:release
```

Use artifact helpers before sharing local builds:

```powershell
npm run audit:artifacts
npm run clean:artifacts
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

- `packages/core/src/processes.ts`: Windows process enumeration with `Get-CimInstance Win32_Process` and `Get-Process` runtime fields.
- `packages/core/src/codex.ts`: Codex SQLite and rollout JSONL indexing.
- `packages/core/src/claude.ts`: Claude session maps, daemon/jobs, transcript discovery.
- `packages/core/src/scope.ts`: unified snapshot merge, process/session candidate scoring, confidence and relations.
- `packages/core/src/search.ts`: Codex SQLite and JSONL search.
- `packages/core/src/codexControl.ts`: Codex config/control surfaces, structured mutation, protected auth metadata, rules/skills editing, and mutation journal. Treat this file as security-sensitive.
- `packages/core/src/sessionOps.ts`: backup, delete, import planning/execution. Treat this file as high risk.
- `apps/desktop/src/main/main.ts`: Electron IPC, shell path allowlists, dialogs.
- `apps/desktop/src/preload/preload.cjs`: narrow renderer API.
- `apps/desktop/src/renderer/src/App.tsx`: current desktop UI.
- `apps/desktop/src/renderer/src/styles.css`: theme, layout, animation, notification and menu styling.
- `packages/i18n/src/resources/*.ts`: all UI text for English, Chinese, Japanese, Korean.

## Safety Rules For Session Operations

- `backupSession` writes AgentScope backups under `~/.agentscope/backups`.
- `deleteSession` must first write a backup, then quarantine files under `~/.agentscope/quarantine`.
- Active sessions must block destructive actions unless a future explicit force workflow exists.
- Codex SQLite writes must use a writable DB connection, busy timeout, and transaction.
- Delete plan and execution must agree. If a table is marked `skip`, execution must not mutate it.
- Import must accept only AgentScope backup manifests, reject path traversal, reject hash mismatch, and reject existing targets.
- Import restores copied files plus compatible Codex row-level bundles for selected tables. It still does not restore `logs_2.sqlite` log bodies and must reject schema drift instead of guessing.

## UI Rules

- `Ctrl+F` opens search everywhere. `Esc` closes search first, then steps back view history.
- Search runs as-you-type. Clearing search must cancel stale async results.
- Notifications appear bottom-center, do not close on body click, and expose explicit role-aware path actions.
- Only AgentScope journal/manifest/redacted-export text evidence may be opened. Direct transcript, history, vendor log, executable, script, SQLite, DB, native module, credentials, auth, config, plugin, skill, and rule paths must be reveal-only or rejected in Electron main.
- Session row right-click menu supports focused controls: backup, delete, locate transcript, resume/fork for a single session, and multi-select backup/delete. Keep it compact and row-anchored.
- The Sessions page owns import backup. Inspector safe control should stay focused on the selected session.
- Keep icons visually centered in `AgentTile`, buttons, segmented controls, and menus.
- After UI changes, smoke-test packed or dev desktop if feasible and inspect screenshots if layout/alignment changed.

## Documentation

The next AI should read these before changing the project:

- `README.md`
- `docs/handoff-next-ai.md`
- `docs/project-state-and-next-agent-workflow-2026-06-13.md`
- `docs/research-local-agent-stores.md`
- `docs/repository-hygiene.md`
