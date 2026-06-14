# AgentScope Full Code Review Ledger - 2026-06-15

This ledger records the full-repository security review pass requested for AgentScope. It is a living audit artifact, not a replacement for tests or runtime safety checks.

## Review Scope

Included:

- Source: `packages/**/src`, `apps/desktop/src`, shared type definitions, Electron main/preload/renderer.
- Tests: Vitest suites, smoke tests, synthetic fixtures.
- Scripts: build, packaging, artifact audit/cleanup, desktop smoke, native repair/rebuild helpers.
- Docs/config: README, handoff docs, package manifests, TypeScript/Vite/Vitest/ESLint config.

Excluded:

- Ignored generated output: `node_modules`, `dist`, `out`, coverage, packaged smoke screenshots.
- Real local runtime stores: `.codex`, `.claude`, `.agentscope`.
- Binary image/icon assets were presence-checked only; no semantic security review was needed for SVG/ICO art beyond repository hygiene.

## Review Method

- Read project handoff and safety docs first: `README.md`, `docs/handoff-next-ai.md`, `docs/project-state-and-next-agent-workflow-2026-06-13.md`, `docs/research-local-agent-stores.md`, `docs/repository-hygiene.md`.
- Enumerated 83 tracked source/script/doc/config files in the reviewable set.
- Ran targeted static scans for destructive filesystem calls, process execution, Electron IPC, shell open/reveal, SQLite mutation, JSON parsing, path traversal, symlink/junction/realpath, token/secret markers, hidden reasoning/content fields, and force-recursive deletes.
- Manually reviewed high-risk execution paths line-by-line in:
  - `packages/core/src/sessionOps.ts`
  - `packages/core/src/codexControl.ts`
  - `packages/core/src/jsonl.ts`
  - `apps/desktop/src/main/main.ts`
  - `apps/desktop/src/main/security.ts`
  - `apps/desktop/src/preload/preload.cjs`
  - `packages/shared/src/launcher.ts`
  - `scripts/clean-build-outputs.mjs`
  - `scripts/smoke-desktop-ipc-negative.mjs`
- Used focused tests to verify security-sensitive fixes before broader validation.

## File Ledger

Status meanings:

- `reviewed`: manually reviewed in this pass.
- `scanned`: included in static scans and low-risk by role; no manual line-level concern found.
- `fixture`: test/smoke fixture reviewed for repository leak and destructive-scope safety.
- `doc`: documentation/handoff reviewed for consistency with implementation.

| Status | Area | Files |
| --- | --- | --- |
| reviewed | Session operations | `packages/core/src/sessionOps.ts`, `packages/core/src/sessionOps.test.ts` |
| reviewed | Codex Control | `packages/core/src/codexControl.ts`, `packages/core/src/codexControl.test.ts` |
| reviewed | Electron main security | `apps/desktop/src/main/main.ts`, `apps/desktop/src/main/security.ts`, `apps/desktop/src/main/security.test.ts` |
| reviewed | Launcher | `packages/shared/src/launcher.ts`, `packages/shared/src/launcher.test.ts` |
| reviewed | Search privacy | `packages/core/src/jsonl.ts`, `packages/core/src/search.ts`, `packages/core/src/search.test.ts` |
| reviewed | IPC surface | `apps/desktop/src/preload/preload.cjs`, `apps/desktop/src/renderer/global.d.ts` |
| fixture | Desktop smoke | `scripts/smoke-desktop-clicks.mjs`, `scripts/smoke-desktop.mjs`, `scripts/smoke-desktop-portable.mjs`, `scripts/smoke-desktop-ipc-negative.mjs`, `packages/core/src/agentScopeSmoke.test.ts`, `packages/core/src/localCodexSmoke.test.ts` |
| scanned | Core indexing | `packages/core/src/codex.ts`, `packages/core/src/claude.ts`, `packages/core/src/scope.ts`, `packages/core/src/processes.ts`, `packages/core/src/activity.ts`, `packages/core/src/paths.ts`, matching tests |
| scanned | Shared/i18n | `packages/shared/src/index.ts`, `packages/i18n/src/**/*.ts` |
| scanned | Renderer | `apps/desktop/src/renderer/src/App.tsx`, `apps/desktop/src/renderer/src/styles.css`, renderer HTML/assets |
| scanned | Build and hygiene scripts | `scripts/audit-repository.mjs`, `scripts/audit-artifacts.mjs`, `scripts/clean-artifacts.mjs`, `scripts/clean-build-outputs.mjs`, `scripts/package-desktop.mjs`, `scripts/verify-desktop-artifacts.mjs`, `scripts/repair-electron.mjs`, `scripts/rebuild-native.mjs`, `scripts/smoke-local-codex.mjs`, `scripts/smoke-agentscope.mjs` |
| doc | Docs/config | `AGENTS.md`, `README.md`, `SECURITY.md`, `docs/*.md`, package/tsconfig/vite/vitest/eslint configs |

## Findings And Fixes

### Fixed: restore journal was too coarse for failed recovery

- Risk: restore/import failures could leave enough evidence to know that rollback happened, but not enough to identify exact copied files, parent directory creation, checksum verification, SQLite transaction phase, or per-table rollback.
- Change: restore journal now records `manifest_read`, `manifest_validate`, `target_preflight`, `copy_file_started`, `verify_sha256`, `mkdir_parent`, `copy_file_succeeded`, `copy_file_failed`, `sqlite_transaction_started`, `sqlite_insert_rows`, `sqlite_transaction_committed`, `sqlite_transaction_failed`, `rollback_sqlite_delete_rows`, `rollback_remove_imported_files`, `rollback_remove_imported_file`, and `cleanup_parent_dir`.
- Safety boundary: journal records only role/path/hash/bytes/table/row-count metadata, not transcript/history/log/auth/config bodies.
- Verification: `packages/core/src/sessionOps.test.ts` covers success and rollback journal steps.

### Fixed: parent sessions only had one hard block path

- Risk: parent sessions with child sessions were correctly blocked, but there was no explicit execution model for deliberate include-children or detach flows.
- Change: added `SessionChildDeleteMode = "block" | "includeChildren" | "detach"` with default `block`.
- `includeChildren`: resolves child closure, detects cycles, deletes children before parent, records child operation references in parent journal, and stops parent delete if any child delete fails.
- `detach`: Codex-only for reversible `thread_spawn_edges` rows; logs rollback rows in journal and rolls back detach if later parent delete fails.
- Safety boundary: no implicit detach; active blockers remain unless explicitly bypassed by existing `allowActive`; unsupported detach sources reject.
- Verification: new tests cover default block, include-children delete, and detach-only parent delete.

### Fixed: Codex Control mutation fixtures were too narrow

- Risk: structured config mutation logic had focused tests but not a fixture matrix across all editable items and invalid value classes.
- Change: added table-driven fixtures for every allowlisted control item, invalid types, path traversal-style IDs, token-shaped values, unsupported keys, stale hash/TOML shape, and high-risk paths.
- Safety boundary: mutation plans still redact sensitive values and raw config editing stays disabled.
- Verification: `packages/core/src/codexControl.test.ts`.

### Fixed: launcher trust relied too much on string prefixes

- Risk: Windows symlink/junction/reparse paths or `where.exe` output could satisfy a string-prefix trusted root check while resolving outside the intended root.
- Change: shared launcher candidates can carry `realPath` and `hasReparsePoint`; resolver rejects marked unsafe candidates. Electron main now checks realpath/lstat/reparse chain before accepting `where` or direct launcher candidates and before spawn.
- Safety boundary: `.ps1`, `.bat`, relative paths, UNC paths, traversal paths, and reparse candidates remain refused.
- Verification: `packages/shared/src/launcher.test.ts`; desktop typecheck.

### Fixed: Electron IPC needed a real negative smoke path

- Risk: unit tests proved sender helper behavior, but packaged/dev Electron smoke did not prove untrusted webContents could not invoke destructive channels.
- Change: added smoke-only hidden-window IPC negative probe and `npm run smoke:desktop:ipc-negative`.
- Channels covered: `session:delete`, `session:import`, `session:restore`, `codexControl:executeMutation`, `diagnostic:repair`, `shell:openPath`.
- Safety boundary: probe is env-gated by `AGENTSCOPE_SMOKE_IPC_NEGATIVE=1`; it writes to synthetic home/userData only.
- Verification: script added; run after packaging as part of release path.

### Fixed: JSONL safe field values needed filtering

- Risk: safe metadata field names alone were not enough if values were huge, token-shaped, or secret-like.
- Change: safe JSONL metadata extraction now filters sensitive-looking and oversized string values and validates event type/timestamp values.
- Verification: `packages/core/src/search.test.ts`.

## Residual Risks

- Restore is still not a true atomic transaction across files and multiple SQLite databases. It now journals much more evidence and attempts rollback, but rollback can still fail on filesystem/SQLite errors.
- `detach` mode is deliberately narrow. Claude or transcript-derived child relations are rejected until reversible relation metadata is implemented.
- Codex process-to-thread mapping remains partly heuristic because local Codex state does not expose a reliable PID-to-thread map.
- `apps/desktop/src/renderer/src/App.tsx` remains large. This is not itself a security bug, but it increases UI regression risk and makes targeted smoke tests important.
- `docs/project-state-and-next-agent-workflow-2026-06-13.md` appears encoding-damaged in this workspace. It was read for context but not repaired in this security batch.
- Dev dependency audit previously reported dev-only issues in `concurrently/shell-quote` and `vite/esbuild` requiring semver-major upgrades. This batch did not perform dependency upgrades.

## Verification Checklist

Focused checks completed during implementation:

- `npm.cmd test -- packages/core/src/sessionOps.test.ts`
- `npm.cmd test -- packages/core/src/codexControl.test.ts`
- `npm.cmd test -- packages/shared/src/launcher.test.ts`
- `npm.cmd test -- apps/desktop/src/main/security.test.ts`
- `npm.cmd test -- packages/core/src/sessionOps.test.ts packages/core/src/codexControl.test.ts packages/shared/src/launcher.test.ts apps/desktop/src/main/security.test.ts`
- `npm.cmd --workspace @agentscope/shared run typecheck`
- `npm.cmd --workspace @agentscope/core run typecheck`
- `npm.cmd --workspace @agentscope/desktop run typecheck`

Full handoff checks still required after this document is written:

- `npm.cmd run audit:repo`
- `npm.cmd run typecheck`
- `npm.cmd test`
- `npm.cmd run i18n:check`
- `npm.cmd run package`
- `npm.cmd run smoke:desktop:ipc-negative`
- `git diff --check`
- `git status --short`
