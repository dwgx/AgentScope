# AgentScope 0.1.0 Release Summary - 2026-06-15

This document summarizes the June 15, 2026 work session that produced the first stable AgentScope release.

## Release

- Stable release: `v0.1.0`
- GitHub: `https://github.com/dwgx/AgentScope/releases/tag/v0.1.0`
- Commit: `0c1b2b9`
- Asset: `AgentScope-0.1.0-Portable-x64.exe`
- Size: `89,793,491` bytes
- SHA256: `078BE46458B4DABC33B6DD192EEEB7AE8E1D2408F91F6AAB55B2EA67C6A6DB3E`

The release is marked as a normal GitHub release, not a prerelease. Older prerelease tags still exist:

- `v0.1.0-pre`
- `v0.1.0-pre.1`

## What Changed

### MCP Tool Identity

AgentScope now labels Codex-launched MCP helper processes with evidence-backed names such as `MCP Tool / Playwright`, `MCP Tool / IDA Pro`, or a Model Context Protocol package name.

Important boundary:

- AgentScope does not read MCP stdio/HTTP payloads.
- AgentScope does not read browser page contents, screenshots, Playwright traces, hidden vendor reasoning, credentials, or memory bodies for MCP identity.
- MCP identity is derived only from safe process metadata, Codex MCP config tables, and parent process-tree inheritance.

Evidence sources:

- `process.mcp.config`: live process matched a safe Codex MCP config entry.
- `process.mcp.marker`: process command/path contained a known MCP marker.
- `process.mcp.parent_tree`: helper child inherited identity from a parent MCP helper.

Guardrails added:

- A generic command such as `node` does not by itself match an MCP server config.
- Sensitive arguments such as `--token value`, `--token=value`, and API-key style values are stripped from command summaries.

See `docs/mcp-tool-identity-2026-06-15.md`.

### UI And Localization

- Removed the sidebar tagline under the AgentScope brand.
- Localized Japanese and Korean high-frequency process/session/Codex Control/MCP Inspector strings that previously inherited English fallback text.
- Kept `Skill` as a Codex product term instead of translating it to a generic word.
- Kept technical terms such as `MCP`, `PID`, `cwd`, `config.toml`, and `SKILL.md` where preserving the exact term is clearer.

### Process And Codex Control UI Work From The Same Release Cycle

The release also includes the earlier June 15 polish batch:

- Better process titles and active-first process sorting.
- More readable top status counters.
- Skill card display names extracted from `SKILL.md` headings.
- Safer Windows Skill writes.
- More compact Codex Control cards and clearer Chinese wording.
- Improved allowlist error messaging.

See `docs/ui-polish-plan-and-summary-2026-06-15.md`.

## Verification Before Release

The final stable release was built after the following checks passed:

```powershell
npm.cmd run audit:repo
npm.cmd run i18n:check
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
```

Observed final results:

- Repository audit passed.
- i18n check passed with `683 keys checked across 4 locales`.
- Typecheck passed across shared, i18n, core, and desktop workspaces.
- ESLint passed.
- Vitest passed: `12 passed | 2 skipped`, `146 passed | 10 skipped`.

Smoke was intentionally not run for the final stable republish after the user requested no smoke. Earlier in the same cycle, the MCP/UI work had passed full packaged release checks including desktop smoke before the stable release republish.

## Build Notes

The stable portable executable was built into ignored `apps/desktop/out-portable/`.

Reason: earlier `apps/desktop/out/win-unpacked` had been locked by a running local AgentScope instance. The user later allowed killing processes, but `out-portable` remains useful for portable-only release builds because it avoids touching the main unpacked local iteration directory.

Portable-only build command used:

```powershell
npm.cmd run native:rebuild
npm.cmd --workspace @agentscope/desktop run build
Push-Location apps/desktop
npx.cmd electron-builder --win portable --x64 --publish never --config.directories.output=out-portable --config.extraMetadata.version=0.1.0
Pop-Location
npm.cmd run native:restore
```

The `native:restore` step is required after Electron packaging so `better-sqlite3` is restored for the Node test/runtime ABI.

## Current Repository State After Release

- Source commit `0c1b2b9` is pushed to `origin/main`.
- Stable tag `v0.1.0` points to `0c1b2b9`.
- Local release artifact directory `apps/desktop/out-portable/` is ignored and should remain untracked.
- `.gitignore` now ignores `out-portable/`.

## Maintenance Guidance

Start with:

1. `AGENTS.md`
2. `docs/development-runbook.md`
3. this document
4. `docs/mcp-tool-identity-2026-06-15.md`
5. `docs/ui-polish-plan-and-summary-2026-06-15.md`
6. `README.md`

Do not weaken the MCP identity evidence model. If new MCP servers are added, add tests showing:

- the exact marker or config evidence used;
- no sensitive arguments leak into display fields;
- generic process names do not trigger config matches;
- inherited child identity remains heuristic.

For future release work:

- Prefer `npm run check:release` for full CI-aligned release evidence when the user allows smoke.
- If the user explicitly says not to run smoke, run at least `audit:repo`, `i18n:check`, `typecheck`, `lint`, and `test`.
- Use `apps/desktop/out-portable/` for portable-only release assets and keep it ignored.
- Record the asset SHA256 in release notes.
