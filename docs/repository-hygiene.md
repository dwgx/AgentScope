# Repository Hygiene And Leak Audit

Last updated: 2026-06-16.

This document records repository-level hygiene rules for AgentScope handoff work. It covers repository contents, generated artifacts, screenshots, and accidental sensitive data exposure. It does not replace runtime security checks in Electron main or `packages/core`.

## Current Audit Result

Source: local repository inspection, artifact audit, and local verification on 2026-06-16.

- No real credential/API key/PAT/JWT leak was found in tracked or untracked non-ignored files, or targeted git-history scans.
- No tracked `node_modules`, `dist`, `out`, real `.jsonl`, or real `.sqlite` files were found.
- Ignored `apps/desktop/out/` contains build output and smoke screenshots with local paths, session titles, PIDs, and session IDs. These are local-only and must not be shared or committed.
- Ignored `apps/desktop/out-portable/` is used for portable-only release
  builds when `apps/desktop/out/win-unpacked` is locked by a running app.
  It can contain signed release executables and unpacked Electron files, but it
  is still a local artifact directory and must not be committed.
- `apps/desktop/out/builder-debug.yml` is a local Electron Builder debug file and can contain machine-local paths. It must not be included in release manifests or uploaded artifacts.
- Some tests still use realistic Windows paths and fake tokens as fixtures. They are allowed but should be gradually migrated to clearly synthetic values.
- Documentation should prefer `%USERPROFILE%` and `%WORKSPACE%` over real user names and project roots.
- `motion@12.40.0` was added as a desktop runtime dependency for renderer
  animation. Keep it in `apps/desktop/package.json` and `package-lock.json`;
  do not vendor animation libraries or generated bundles into the repo.
- The 2026-06-16 `npm install motion@12.40.0` run reported existing npm audit
  vulnerabilities. Do not run broad `npm audit fix --force` as part of routine
  handoff cleanup; treat dependency remediation as a separate reviewed change.

## Do Not Commit

- `node_modules/`
- `dist/`
- `out/`
- `out-portable/`
- `tmp/`
- `.codex/`
- `.claude/`
- `.agentscope/`
- real `*.jsonl`
- real `*.sqlite`, `*.sqlite-wal`, `*.sqlite-shm`
- credentials, auth files, installation IDs, private plugin caches, screenshots containing real session content

## Required Checks

Run before handoff after code changes:

```powershell
npm run audit:repo
npm run typecheck
npm test
npm run i18n:check
npm run package
npm run smoke:desktop:packaged
npm run audit:artifacts
git diff --check
git status --short
git diff --stat
```

For a CI-aligned release/prebuild handoff, run:

```powershell
npm run check:release
```

`npm run package` builds the unpacked app. `npm run package:pre` builds the
installer, portable executable, portable zip, and `agentscope-prebuild.json`.
`npm run verify:desktop-artifacts -- --strict-head` verifies that the manifest
references current-HEAD, non-empty release files and excludes local debug files.

## Local Artifact Cleanup

Audit before deleting:

```powershell
npm run audit:artifacts
npm run clean:artifacts
```

`clean:artifacts` is dry-run by default and only targets `apps/desktop/out`.
With `-- --apply`, the default cleanup removes local-only `ci-pre/` and
`builder-debug.yml`. It does not remove smoke screenshots or current release
files unless `-- --smoke` or `-- --releasables` is explicitly passed.

If a portable-only release was built into `apps/desktop/out-portable`, delete it
after preserving the needed release executable and hash:

```powershell
npm run clean:artifacts -- --portable --apply
```

Do not clean user data through repository scripts. Real `%USERPROFILE%\.codex`,
`%USERPROFILE%\.claude`, `%USERPROFILE%\.agentscope\backups`, and
`%USERPROFILE%\.agentscope\quarantine` are runtime state, not repository junk.

`npm run audit:repo` checks tracked files and untracked non-ignored files for:

- high-confidence secret patterns such as OpenAI-style `sk-*`, GitHub tokens, OAuth/JWT-like tokens, AWS key IDs, and Slack tokens.
- tracked generated/local artifact paths.
- real session/database extensions.
- hard-coded local user/project paths outside known test fixtures.

## Screenshot Rules

Smoke screenshots are useful for UI review, but they often include local paths and session titles.

- Store screenshots only under ignored paths such as `apps/desktop/out/smoke/`.
- Do not commit screenshots unless they are sanitized fixtures.
- Do not use real session screenshots in public docs.
- If a screenshot is needed for handoff, describe what was verified and keep the file local.

## If A Real Secret Is Found

Do not rewrite git history automatically.

1. Remove or redact the secret from current tracked or untracked non-ignored files.
2. Tell the user exactly where it was found.
3. Recommend rotate/revoke of the credential.
4. Ask before using `git filter-repo`, BFG, force-push, or any history rewrite.

## Runtime Leak Boundaries

Repository hygiene does not prove runtime safety. Keep these code-level boundaries:

- JSONL search must stay safe-field-only and must not return raw transcript excerpts.
- `auth.json` and `.credentials.json` are metadata-only.
- Electron `openPath` must not open transcript/history/log bodies, executables, scripts, SQLite/DB files, native modules, credentials, auth, config, plugins, skills, or rules.
- Snapshot export should be redacted by default.
- Notifications and inspectors should display compact paths by default and reveal full paths only through explicit allowlisted actions.
