# AgentScope

Windows-native control and trace layer for local AI coding agents.

AgentScope is a TypeScript/Electron desktop console for identifying, indexing,
searching, and explaining local Codex and Claude Code sessions on Windows. It is
not a chat UI and not a Kanban board.

Project site: `https://dwgx.github.io/AgentScope/`

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
- Reads Codex versioned SQLite stores such as
  `%USERPROFILE%\.codex\state_*.sqlite` and `logs_*.sqlite`, including
  `CODEX_SQLITE_HOME` / `sqlite_home` resolution.
- Scans Codex rollout JSONL under `%USERPROFILE%\.codex\sessions`,
  `%USERPROFILE%\.codex\rollouts`, and archived rollout roots.
- Inventories safe Codex control surfaces such as config modes, MCP summary,
  rules, user skills, archives, memories, browser/computer-use state, and
  protected auth metadata.
- Applies structured Codex config changes with backup, mutation journal, atomic
  write, read-back verification, and clear new-session-effect warnings.
- Shows current Codex config, templates, MCP server child fields, and
  unverified advanced scalar keys without treating heuristics as official
  configuration facts.
- Labels Codex-launched MCP helper processes with evidence-backed identities
  such as Playwright, IDA Pro, or Model Context Protocol package names without
  reading MCP payloads.
- Scores process-to-session candidates with evidence from PID, cwd,
  transcript path, session id, window title, and start/update time.
- Tracks confidence: `exact`, `indexed`, `heuristic`, `unknown`. Time-only
  candidates stay `unknown` and are shown as weak evidence, not as matches.
- Shows evidence for every association.
- Provides Processes, Sessions, Relations, Doctor, Codex Control, and Settings
  views plus global `Ctrl+F` search.
- Uses a flat graphite desktop UI with functional Settings sections for
  General, Appearance, Indexing, Runtime, and Diagnostics.
- Supports explicit session backup, safe delete, and AgentScope backup import
  through the desktop UI. Delete writes a backup and quarantine journal first,
  applies journaled row-level changes, then moves removable files to quarantine.
  Claude global history/state references are inspect-only until reversible
  patch/restore support exists.
- Supports a Sessions recycle panel for validated quarantine restore.
- Supports Codex/Claude resume/fork launcher controls when safe launcher
  evidence is available.

## Commands

```powershell
npm install
npm run audit:repo
npm run lint
npm run typecheck
npm test
npm run i18n:check
npm run package
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
npm run package
```

Portable-only local release build:

```powershell
npm run native:rebuild
npm --workspace @agentscope/desktop run build
Push-Location apps/desktop
npx electron-builder --win portable --x64 --publish never --config.directories.output=out-portable --config.extraMetadata.version=0.1.0
Pop-Location
npm run native:restore
```

Release/prebuild verification:

```powershell
npm run check:release
```

`npm run package` builds the unpacked app for local iteration. `npm run package:pre`
builds the installer, portable executable, portable zip, and prebuild manifest.
`npm run check:release` matches the CI release path: repo audit, lint,
typecheck, i18n check, tests, synthetic smoke, `package:pre`, artifact
verification, and packaged/portable desktop smoke.

The default GitHub CI workflow keeps push checks lightweight: repository audit,
lint, typecheck, i18n, unit tests, and synthetic smoke. Packaging and desktop
smoke checks run from the manual `Release Check` workflow or through
`npm run check:release`.

Artifact inspection and cleanup:

```powershell
npm run audit:artifacts
npm run clean:artifacts
```

`clean:artifacts` is a dry run by default. Pass `-- --apply` only after checking
the listed paths; it is restricted to `apps/desktop/out`.

Portable-only release artifacts can be written to ignored
`apps/desktop/out-portable/` when the unpacked app in `apps/desktop/out` is
locked by a running AgentScope instance.

The unpacked Windows app is written to:

```text
apps/desktop/out/win-unpacked/AgentScope.exe
```

CI runs on `windows-latest` and verifies install, repository audit, typecheck,
i18n, tests, synthetic smoke, production build, prebuild packaging, artifact
manifest integrity, and packaged/portable desktop smoke.

## Safety Boundaries

Current behavior:

- Does not terminate processes.
- Does not decrypt hidden/internal vendor state.
- Only parses local plaintext JSONL, SQLite, PID mappings, path encodings, and
  index relations.
- JSONL search only checks safe metadata fields and does not return transcript
  body excerpts.
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
- Does not raw-edit `config.toml`; Codex config changes go through structured
  controls, high-risk confirmation, atomic write, and read-back verification.
- Treats unknown Codex config keys as unverified advanced settings. Sensitive,
  complex, duplicate, or unsafe TOML remains blocked/read-only.
- Electron main only opens AgentScope-owned text evidence such as journals,
  manifests, and redacted exports. Transcripts, histories, logs, executables,
  scripts, SQLite/DB files, native modules, credentials, auth, config, plugins,
  skills, and rules are reveal-only or rejected.
- Snapshot export is redacted by default to reduce accidental sharing of full
  local paths, commands, titles, and previews.

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

## Development Docs

Maintainers should read:

- `AGENTS.md`
- `docs/development-runbook.md`
- `docs/research-local-agent-stores.md`
- `docs/release-0.1.0-summary-2026-06-15.md`
- `CONTRIBUTING.md`

## Repository Governance

This repository is maintained as an active project. Avoid committing local credentials, transcript exports, private logs, or machine-specific paths. Public use rights and licensing should be clarified before redistribution beyond repository visibility.
