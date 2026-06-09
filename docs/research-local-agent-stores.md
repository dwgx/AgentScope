# Local Agent Store Research Notes

Last updated: 2026-06-09.

This document records what AgentScope currently knows about local Codex and Claude Code stores on Windows. Split each claim into source type: official documentation, local observation, or code implementation.

## Source Quality Rules

- Official documentation can confirm public product behavior, command names, and config surfaces.
- Local observation can confirm the user's current file layout, but not a stable vendor contract.
- Code implementation confirms what AgentScope currently parses, not what vendors guarantee.
- For destructive operations, assume vendor internals can change. Validate file/table existence at runtime.

## Official Sources Checked

OpenAI Codex:

- `https://developers.openai.com/codex/codex-manual.md`
- `https://developers.openai.com/codex/config-basic`
- `https://developers.openai.com/codex/hooks`
- `https://developers.openai.com/codex/subagents`
- `https://developers.openai.com/codex/cli/reference`

Claude Code:

- `https://docs.anthropic.com/en/docs/claude-code/settings`
- `https://docs.anthropic.com/en/docs/claude-code/hooks`
- `https://docs.anthropic.com/en/docs/claude-code/memory`
- `https://docs.anthropic.com/en/docs/claude-code/slash-commands`
- `https://docs.anthropic.com/en/docs/claude-code/cli-reference`

## Codex Store

### Officially Confirmed

- `CODEX_HOME` sets the Codex state root. Default is `~/.codex`.
- `CODEX_SQLITE_HOME` can set SQLite-backed state location.
- User config lives at `~/.codex/config.toml`.
- Trusted project config can live at `.codex/config.toml`.
- Hooks can live in `hooks.json` or inline `[hooks]` tables in active config layers.
- Session transcripts live under `$CODEX_HOME/sessions`.
- `codex resume <SESSION_ID>` resumes a specific run.
- `codex fork` forks a previous interactive session into a new thread.
- `codex exec --json` emits JSONL events.
- `codex exec resume <SESSION_ID>` can continue an exec session.

### Local Observation On This Machine

The observed `%USERPROFILE%\.codex` contains:

- `sessions/`
- `state_5.sqlite`, `state_5.sqlite-wal`, `state_5.sqlite-shm`
- `logs_2.sqlite`, `logs_2.sqlite-wal`, `logs_2.sqlite-shm`
- `goals_1.sqlite`, `memories_1.sqlite` and WAL/SHM sidecars
- `history.jsonl`
- `config.toml`
- `auth.json`
- `installation_id`
- `plugins/`, `skills/`, `rules/`, `memories/`
- `.sandbox`, `.sandbox-bin`, `.sandbox-secrets`
- `node_repl/`, `browser/`, `computer-use/`
- `archived_sessions/` may exist on machines where Codex Desktop has archived
  conversations. Absence of this directory is not a diagnostic failure.

Do not treat all of these as stable public APIs.

### AgentScope Current Parsing

`packages/core/src/codex.ts`:

- Reads `state_5.sqlite` table `threads`.
- Reads `thread_spawn_edges`.
- Reads optional metadata columns when present: `rollout_path`, `cwd`, `title`, `source`, `created_at`, `updated_at`, `cli_version`, `model_provider`, `model`, `reasoning_effort`, `tokens_used`, `sandbox_policy`, `approval_mode`, `git_sha`, `git_branch`, `archived`, `agent_nickname`, `agent_role`, `agent_path`, `thread_source`.
- Scans `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`.
- Parses rollout thread IDs from filenames.
- Reads rollout metadata by streaming JSONL, bounded by line count.
- Loads `logs_2.sqlite` metadata opportunistically but does not rely on it for core identity.

`packages/core/src/sessionOps.ts`:

- Plans Codex session backup/delete around rollout JSONL and selected SQLite rows.
- Exports row-level backup bundles for `state_5.threads`,
  `state_5.thread_spawn_edges`, `state_5.thread_dynamic_tools`,
  `goals_1.thread_goals`, and `memories_1.stage1_outputs`.
- Exports only aggregate `logs_2.sqlite` summary metadata; log body rows are not
  restored or deleted by default.
- Deletes rows from `state_5.sqlite` tables `thread_spawn_edges`, `thread_dynamic_tools`, `threads`.
- Deletes rows from `goals_1.sqlite.thread_goals` and `memories_1.sqlite.stage1_outputs`.
- Backs up `state_5`, `goals_1`, `memories_1`, and `logs_2` SQLite files plus WAL/SHM to quarantine before DB mutation.
- Does not delete `logs_2.sqlite.logs` rows in execution; plan marks logs as skip.
- Writes `quarantine/<id>/journal.json` for delete execution, including backup,
  file move, patch, SQLite backup, and SQLite delete steps.

`packages/core/src/codexControl.ts`:

- Inventories safe Codex control surfaces.
- Treats `auth.json` as protected metadata only: existence, size, mtime, and
  configured storage mode. It must not read token content or return a file hash.
- Keeps raw `config.toml` read-only and exposes structured allowlisted
  mutations with backup, sha256 conflict check, risk classification, and
  mutation journal.
- Shows rules, user AGENTS, and user skills only through allowlisted document
  IDs. Sensitive-looking content is redacted and cannot be saved.
- Summarizes archives, memories, browser/computer-use state, plugin/MCP state,
  and SQLite tables without reading hidden reasoning, memory bodies, browser
  page bodies, screenshots, or log bodies.

### Codex Risk Notes

- Codex does not currently expose a reliable PID-to-thread exact map in AgentScope. Most running Codex process matches are heuristic.
- Active Codex process candidates need careful blocking before destructive actions.
- SQLite files may be live and have WAL/SHM. Always use `busy_timeout` and tolerate missing tables/columns.
- Never delete global `history.jsonl` for one session. At most patch a known per-session reference with tests.
- Import restores Codex row bundles only when target DB schema/table/columns are
  compatible and target rows do not already exist.

## Claude Code Store

### Officially Confirmed

The checked Claude Code docs cover:

- settings and permissions.
- hooks.
- memory.
- slash commands.
- CLI reference.

Use those docs for public command/config claims. The local session file layout below is based on observation and AgentScope parsing, not a formal stability guarantee.

### Local Observation On This Machine

The observed `%USERPROFILE%\.claude` contains:

- `sessions/`
- `projects/`
- `daemon/`
- `jobs/`
- `file-history/`
- `image-cache/`
- `session-env/`
- `shell-snapshots/`
- `paste-cache/`
- `history.jsonl`
- `settings.json`
- `settings.local.json`
- `.credentials.json`
- `plugins/`, `skills/`

### AgentScope Current Parsing

`packages/core/src/claude.ts`:

- Reads `.claude/sessions/*.json` as PID/session maps.
- Reads `.claude/daemon/roster.json` as daemon worker session maps.
- Reads `.claude/jobs/<short>/state.json` as job session maps.
- Scans `.claude/projects/**/*.jsonl`.
- Treats `.claude/projects/<encoded-cwd>/<sessionId>.jsonl` as session transcripts.
- Treats nested `.claude/projects/<encoded-cwd>/<sessionId>/subagents/agent-*.jsonl` as subagent transcripts.

Current fields parsed from `.claude/sessions/*.json` include:

- `pid`
- `sessionId`
- `cwd`
- `status`
- `startedAt`
- `updatedAt`
- `kind`
- `entrypoint`
- `peerProtocol`
- `procStart`
- `version`

`packages/core/src/sessionOps.ts` handles Claude operation files:

- transcript JSONL.
- `.claude/sessions/*.json` PID map.
- per-session sidecar directory.
- `file-history/<sessionId>`.
- `session-env/<sessionId>`.
- `image-cache/<sessionId>`.
- `history.jsonl` line patch.
- user-level `.claude.json` value patch.
- `daemon/roster.json` worker patch.
- `jobs/<short>/state.json` when `sessionId` or `resumeSessionId` matches.

### Claude Risk Notes

- Claude session PID files can be stale. Treat exact PID as active only when the PID also resolves to a current process row.
- Global settings/credentials must never be imported or deleted.
- `history.jsonl` patching must keep malformed lines and remove only rows with exact `sessionId`/`session_id`.
- `.claude.json` patching should only remove exact session-id values, not arbitrary substring matches.
- Daemon/job structures may change. Keep parsing tolerant.

## AgentScope Store

Current local AgentScope state is under:

```text
%USERPROFILE%\.agentscope
```

Known subdirectories:

- `backups/`: session backups created before delete or by explicit backup.
- `plans/`: dry-run operation plans.
- `quarantine/`: files moved by delete operations.
- `quarantine/<id>/journal.json`: delete journal with paths, hashes, roles,
  actions, and evidence; it must not include transcript body text.

Backup manifest shape:

- `schemaVersion: 1`
- `kind: "AgentScope Session Backup"`
- `createdAt`
- `agent`
- `sessionId`
- `sourceHome`
- `copiedFiles[]`
- `databaseBundles[]` for Codex row bundles and log summaries
- `plan`

Each copied file should include:

- original `path`
- `role`
- `sha256`
- `backupRelativePath`
- `evidence`

Import must only trust the manifest after validating relative paths, checksums, and target existence.

## Process Runtime

`packages/core/src/processes.ts` uses PowerShell:

- `Get-Process` for `MainWindowTitle`, `StartTime`, memory, CPU.
- `Get-CimInstance Win32_Process` for PID, PPID, name, executable path, command line, creation date.

Related process detection includes:

- `codex.exe`, `Codex.exe`, `codex`
- `claude.exe`, `claude`
- `node_repl.exe`, `node_repl`
- `node.exe` whose command line/path contains `codex`, `claude`, `node_repl`, `app-server`, or `daemon`

## Open Questions

- Whether Codex exposes a future exact PID/thread hook map. If yes, prefer it over heuristics.
- Whether Claude Code formally documents `.claude/sessions/*.json` and daemon/job state. Treat as local internal until documented.
- How to reconstruct Codex SQLite rows during import without corrupting newer schema versions.
- Whether session deletion should support child session modes: block, include children, or detach.
