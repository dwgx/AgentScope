# Session Delete Cascade Recovery Fix - 2026-06-15

## Scope

This note records the plan, implementation, and verification for the
`childMode="includeChildren"` session delete hardening batch.

The affected surface is AgentScope session operations for Codex parent/child
relations, plus release-gate and launcher-smoke follow-up fixes discovered
during the same review.

## Evidence Before Fix

The review found that `deleteSessionInternal` deleted child sessions before
executing the parent delete. If a child delete succeeded and the later parent
delete failed, the parent catch block only rolled back the parent operation. The
already-deleted child remained quarantined.

The failing shape was reproducible with synthetic Codex home fixtures:

- parent rollout still existed after the parent delete failed.
- child rollout no longer existed.
- parent thread row still existed.
- child thread row was gone.
- parent/child edge row was gone.

The same review also found a narrower SQLite rollback weakness: rollback was
deduped by database path, so multiple table changes in the same SQLite database
could leave later tables unrestored. This mattered for `state_5.sqlite`, where
`threads`, `thread_spawn_edges`, and `thread_dynamic_tools` can all be changed
inside the same delete.

## Fix Plan

1. Keep `includeChildren` support, but make it compensating and auditable.
2. Keep leaf-first cascade ordering so descendants are deleted before parents.
3. If any later delete step fails, restore completed child deletes by using the
   existing validated `restoreQuarantinedSession` path.
4. Journal child delete rollback attempts in the parent delete journal.
5. Restore every deleted SQLite table change during rollback, not just one
   change per database file.
6. Add regression tests for parent failure, sibling failure, nested cascades,
   and active descendant blocking.
7. Restore the launcher runtime's `AGENTSCOPE_LAUNCHER_APPDATA` behavior and
   prove it with a unit test.
8. Make lint part of the release gate and remove existing lint failures.
9. Run the CI-aligned release check before closing the work.

## Implementation Summary

Core session operations:

- `packages/core/src/sessionOps.ts`
  - Moved child cascade work into the same main `try/catch/finally` as parent
    delete execution.
  - Added `child_restore` delete journal phase.
  - Added `rollbackCompletedChildDeletes`, which restores completed child
    deletes in reverse order by calling `restoreQuarantinedSession`.
  - Preserved original parent operation errors while appending child rollback
    failures when rollback itself fails.
  - Changed SQLite delete rollback to restore each deleted table change in
    reverse order instead of deduping by database file.
  - Made detached relation public projection explicit to avoid lint-only
    destructuring placeholders.

Regression coverage:

- `packages/core/src/sessionOps.test.ts`
  - Parent delete failure after a completed child delete restores the child.
  - Later sibling child failure restores earlier completed child deletes.
  - Nested includeChildren deletes descendants before parents.
  - Active descendant sessions block includeChildren delete.
  - The sibling failure test also proves `thread_spawn_edges` rollback in
    `state_5.sqlite`.

Launcher runtime:

- `apps/desktop/src/main/launcherRuntime.ts`
  - `AGENTSCOPE_LAUNCHER_APPDATA` again takes precedence over `APPDATA` for npm
    launcher trust roots.
- `apps/desktop/src/main/security.test.ts`
  - Added a test that proves the override is used and the normal `APPDATA`
    fallback is not trusted when the override is present.

Release gate and lint cleanup:

- `package.json`
  - `check:release` now runs `npm run lint`.
- `.github/workflows/ci.yml`
  - CI now runs `npm run lint` and `npm run smoke:desktop:ipc-negative` so the
    remote gate matches the local release-critical checks.
- `README.md`, `AGENTS.md`, `docs/development-runbook.md`
  - Command lists now include lint.
- `apps/desktop/src/main/main.ts`, `apps/desktop/src/renderer/src/App.tsx`,
  `packages/core/src/codexControl.ts`, `scripts/smoke-desktop.mjs`
  - Removed unused symbols that caused lint failures.

Portable smoke cleanup:

- `scripts/smoke-desktop-portable.mjs`
  - Waits for the portable Electron process to exit after screenshot capture
    before deleting the fixture directory.
  - Runs marker-based cleanup in `finally` as well as on error.

## Verification

The following commands passed locally:

```powershell
npm run lint
npm run typecheck
npm test
npm run i18n:check
npm run audit:repo
npm run smoke:agentscope
npm run smoke:codex:strict
npm run package
npm run smoke:desktop:packaged
npm run smoke:desktop:ipc-negative
npm run smoke:desktop:portable
npm run check:release
npm run audit:artifacts
git diff --check
```

Final `npm run check:release` result:

- repository audit passed.
- lint passed.
- typecheck passed.
- i18n check passed.
- tests passed: 12 passed, 2 skipped; 133 tests passed, 10 skipped.
- synthetic AgentScope smoke passed.
- prebuild package completed.
- desktop artifact verification passed locally before commit; regenerate
  `package:pre` artifacts after the final amended commit so
  `agentscope-prebuild.json` records the final HEAD.
- packaged desktop smoke passed.
- IPC negative smoke passed.
- portable desktop smoke passed without fixture cleanup warnings.

Known non-blocking warnings:

- Vite reports the renderer bundle chunk is larger than 500 KB.
- Node reports `fs.R_OK` deprecation from existing artifact tooling.

Artifact audit after verification reported only expected generated outputs under
`apps/desktop/out`, including `builder-debug.yml` and smoke screenshots. Those
are ignored build artifacts and can be removed with `npm run clean:artifacts`
after preserving any screenshots needed for maintenance records.

## Residual Risk

The delete operation still depends on AgentScope's current Codex row-bundle
schema allowlist and restore path. This fix does not make arbitrary future Codex
schema drift safe; restore/import code should continue rejecting schema drift
instead of guessing.

The UI still does not expose a broad force-delete workflow. Active sessions
remain blocked unless an explicit future force workflow is designed and
reviewed.
