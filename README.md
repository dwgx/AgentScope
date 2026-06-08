# AgentScope

Windows-native control and trace layer for local AI coding agents.

AgentScope is a TypeScript/Electron desktop console for identifying, indexing,
searching, and explaining local Codex and Claude Code sessions on Windows. It is
not a chat UI and not a Kanban board.

## Architecture

```text
apps/desktop        Electron + React desktop shell
packages/core       Windows process/session indexing core
packages/shared     Shared models and IPC-safe types
```

The desktop app uses the same style of stack as modern desktop agent tools:
Electron main process for privileged local access, preload IPC for a narrow API,
and React/TypeScript renderer for the control surface.

## MVP Features

- Enumerates Windows `Win32_Process` rows for Codex, Claude, node, node_repl,
  app-server, and daemon-like processes.
- Enriches process rows with start time and `MainWindowTitle` from
  `Get-Process` when Windows exposes it.
- Parses Claude session PID files from `%USERPROFILE%\.claude\sessions`.
- Resolves Claude transcripts under `%USERPROFILE%\.claude\projects`.
- Reads Codex `%USERPROFILE%\.codex\state_5.sqlite`.
- Scans Codex rollout JSONL under `%USERPROFILE%\.codex\sessions`.
- Scores process-to-session candidates with evidence from PID, cwd,
  transcript path, session id, window title, and start/update time.
- Tracks confidence: `exact`, `indexed`, `heuristic`, `unknown`. Time-only
  candidates stay `unknown` and are shown as weak evidence, not as matches.
- Shows evidence for every association.
- Provides Processes, Sessions, Relations, Search, Doctor, and Settings views.
- Uses a flat graphite desktop UI with functional Settings sections for
  General, Appearance, Indexing, Runtime, and Diagnostics.
- Supports explicit session backup, safe delete, and AgentScope backup import
  through the desktop UI. Delete writes a backup and quarantine journal first,
  applies journaled row-level changes, then moves removable files to quarantine.
  Claude global history/state references are inspect-only until reversible
  patch/restore support exists.

## Commands

```powershell
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

`npm run dev` builds the workspace, starts Vite, then launches the Electron
desktop shell against the local renderer server. For renderer-only iteration,
run `npm --workspace @agentscope/desktop run dev:renderer`.

If the local Electron package reports that it failed to install correctly after
`npm ci`, repair the cached Windows binary:

```powershell
npm run electron:repair
```

Packaging smoke test:

```powershell
npm --workspace @agentscope/desktop run package
```

The unpacked Windows app is written to:

```text
apps/desktop/out/win-unpacked/AgentScope.exe
```

CI runs on `windows-latest` and verifies install, typecheck, tests, production
build, and an unpacked Electron package artifact.

## Safety Boundaries

Current behavior:

- Does not terminate processes.
- Does not decrypt hidden/internal vendor state.
- Only parses local plaintext JSONL, SQLite, PID mappings, path encodings, and
  index relations.
- Backs up sessions under `%USERPROFILE%\.agentscope\backups`.
- Deletes only after backup and quarantine under
  `%USERPROFILE%\.agentscope\quarantine`.
- Writes `journal.json` for every delete under the quarantine directory,
  recording backup, file move, patch/inspect, SQLite backup, and SQLite delete
  steps.
- Blocks destructive operations against sessions that still have an active PID
  mapping, high-confidence Codex heuristic process candidate, or indexed child
  sessions in the current snapshot.
- Exports Codex row-level SQLite bundles for compatible restore from
  `state_5.sqlite`, `goals_1.sqlite`, and `memories_1.sqlite`; `logs_2.sqlite`
  is backed up as summary metadata only and log bodies are not restored or
  deleted.
- Never imports or deletes credentials, auth files, global settings, plugins,
  skills, rules, or full global history as a session side effect.

Known limits:

- Codex delete spans multiple SQLite databases. AgentScope backs up those
  databases first and attempts compensating restore from `sqlite-backup` if a
  later DB step fails, but the journal must still be treated as recovery
  evidence for any failed delete.
- Codex row restore requires compatible target SQLite tables and columns; schema
  drift is rejected instead of partially reconstructing rows.
- Codex process-to-thread mapping is still partly heuristic because Codex does
  not expose a reliable PID-to-thread map in the parsed local state.

Planned later controls:

- richer restore journaling for file plus multi-DB rollback evidence
- `kill`: terminate only with explicit `--force`
- explicit child-session delete modes: block, include children, or detach
- `watch`
- web/TUI dashboard on the same core library

## Handoff Docs

Future agents should read:

- `AGENTS.md`
- `docs/handoff-next-ai.md`
- `docs/research-local-agent-stores.md`
