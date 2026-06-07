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
- Parses Claude session PID files from `%USERPROFILE%\.claude\sessions`.
- Resolves Claude transcripts under `%USERPROFILE%\.claude\projects`.
- Reads Codex `%USERPROFILE%\.codex\state_5.sqlite`.
- Scans Codex rollout JSONL under `%USERPROFILE%\.codex\sessions`.
- Tracks confidence: `exact`, `indexed`, `heuristic`, `unknown`.
- Shows evidence for every association.
- Provides Sessions, Processes, Graph, Search, and Doctor views.

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

CI runs on `windows-latest` and verifies install, typecheck, tests, production
build, and an unpacked Electron package artifact.

## Safety Boundaries

First version behavior:

- Does not modify Codex or Claude files.
- Does not terminate processes.
- Does not decrypt hidden/internal vendor state.
- Only parses local plaintext JSONL, SQLite, PID mappings, path encodings, and
  index relations.

Planned later controls:

- `resume`: generate or run `codex resume` / `claude resume`
- `kill`: terminate only with explicit `--force`
- `open-transcript`
- `export`
- `watch`
- web/TUI dashboard on the same core library
