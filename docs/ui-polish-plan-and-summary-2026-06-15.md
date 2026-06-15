# AgentScope UI Polish Plan And Summary - 2026-06-15

## Scope

This pass addresses the UI and control-surface issues reported from the June 15
screenshots:

- searchable dropdowns caused visible scroll or UI reset behavior when opened;
- Codex Control rows and cards were too cramped in several panels;
- raw status words and short risk labels were unclear in Chinese UI;
- "Skill" should stay as the Codex term, and Skill cards should show the real
  Skill name when it can be extracted from `SKILL.md`;
- shell path failures showed a raw allowlist error and rejected known local
  Claude job paths;
- process rows should use cleaner process titles and default to the most active
  work at the top;
- the top-right process, match, Codex, Claude, and warning counters needed to
  fit the desktop-console style instead of looking like plain badges.

## Implementation Plan

1. Stabilize searchable dropdown behavior.
   Capture the active scroll containers before focusing the dropdown search
   field, focus with scroll prevention, then restore the captured scroll
   positions. Verify with the desktop smoke by opening the font picker inside a
   scrolled settings panel.

2. Improve Codex Control density and wording.
   Expand card and grid spacing, keep status tags compact, localize risk and
   status labels, and keep "Skill" untranslated where it is a Codex term.

3. Extract Skill display names without exposing sensitive content.
   Read only the small `SKILL.md` text needed for metadata, use the first
   Markdown H1 as the display name, then fall back to frontmatter `name`, then
   the directory name. Do not render hidden vendor reasoning, credentials, logs,
   or memory bodies.

4. Fix Skill editing on Windows.
   Use a non-hidden same-directory temporary filename for atomic writes because
   Windows can reject renaming a hidden temp file over `SKILL.md`.

5. Make process ordering and titles more useful.
   Add `displayTitle` and `lastActivityAt` to the shared process model, derive
   smart titles in core from candidate session titles, cwd names, window titles,
   and process roles, include session recency as activity evidence, and make the
   process list default to active-first sorting.

6. Make local path errors actionable.
   Keep open-path restrictions strict, but allow reveal/open actions for known
   AgentScope, Codex, and Claude local trace roots. Return a Chinese error that
   tells the user the path is outside the local trace allowlist.

7. Redesign the top status counters.
   Convert the counters into compact icon buttons that navigate to the relevant
   view while preserving the dense desktop-console layout.

## Implemented Changes

- `packages/core/src/codexControl.ts`
  - extracts Skill card names from the first `# Heading` in `SKILL.md`, falling
    back to frontmatter `name` and then the directory name;
  - exposes extracted Skill display text only for Skill summary cards so normal
    surfaces continue to use i18n;
  - changes atomic write temp names from hidden dot-prefixed files to visible
    same-directory temp files.

- `packages/core/src/scope.ts`
  - decorates indexed processes with `displayTitle` and `lastActivityAt`;
  - promotes high-confidence candidate session titles into process row titles;
  - prefixes weak candidate titles with the process role so weak evidence is not
    overstated;
  - falls back to cwd basename when no task title is available;
  - adds process activity evidence from matched session candidates and process
    timestamps.

- `packages/shared/src/index.ts`
  - extends shared types for process display metadata and Codex Control display
    overrides.

- `apps/desktop/src/main/main.ts`
  - expands local trace allowlists to known Codex and Claude trace directories;
  - improves blocked path errors with Chinese wording and path context.

- `apps/desktop/src/renderer/src/App.tsx`
  - makes the process list default to active-first sorting;
  - renders smart process titles;
  - restyles top counters as clickable icon chips;
  - removes mojibake separators from process and search labels.

- `apps/desktop/src/renderer/src/components/controls.tsx`
  - prevents searchable combobox focus from forcing scroll jumps;
  - restores scroll containers after the menu opens.

- `apps/desktop/src/renderer/src/components/codexControl.tsx`
  - localizes Codex Control status badges;
  - uses extracted Skill display names when provided by core;
  - keeps real Skill names in the detail panel instead of replacing them with a
    generic localized label.

- `apps/desktop/src/renderer/src/styles.css`
  - adjusts spacing, card density, toolbar wrapping, summary-card line clamps,
    and status-chip hover states.

- `packages/i18n/src/resources/*.ts`
  - adds active sorting labels and Codex Control status labels;
  - keeps the Chinese Codex Control tab label as `Skill`;
  - replaces ambiguous risk initials with readable Chinese labels.

- `scripts/smoke-desktop-clicks.mjs`
  - verifies the top status chips;
  - verifies Skill H1 extraction in the Codex Control UI;
  - verifies searchable font-picker scroll stability.

Additional pre-submit changes after manual screenshot review:

- Process rows now use candidate session titles such as the current task title
  when AgentScope has enough evidence to associate that session with the live
  process. Weak candidates still show the process role prefix, for example
  `Codex CLI / <task title>`, so the row is distinguishable without claiming a
  strong match.
- Skill display extraction now supports frontmatter-only `SKILL.md` files and
  renderer tests ensure real Skill names survive detail-panel localization.

## Verification Plan

Use the release-aligned checks as the main gate:

```powershell
npm.cmd run audit:repo
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run i18n:check
npm.cmd run package:pre
npm.cmd run smoke:desktop:packaged
npm.cmd run smoke:desktop:ipc-negative
npm.cmd run smoke:desktop:portable
npm.cmd run verify:desktop-artifacts -- --strict-head
npm.cmd run audit:artifacts
```

The dev Electron smoke may fail on this machine if
`node_modules/electron/dist/electron.exe` is missing. In that case the packaged
desktop smoke is the authoritative UI verification because it exercises the
actual built `AgentScope.exe`.

## Verification Results

Completed on 2026-06-15:

- `npm.cmd run check:release` passed.
  This covered `audit:repo`, `lint`, `typecheck`, `i18n:check`, the full Vitest
  suite, synthetic AgentScope smoke, `package:pre`, strict artifact verification,
  packaged desktop click smoke, IPC negative smoke, and portable smoke.
- Full Vitest result inside the final `check:release`: 12 files passed, 2 files
  skipped; 140 tests passed, 10 tests skipped.
- The first release-check attempt was blocked by old
  `apps/desktop/out/win-unpacked/AgentScope.exe` processes holding the package
  output directory. Those stale packaged smoke processes were closed, then the
  full release check was rerun successfully.
- `npm.cmd run smoke:desktop:packaged` passed after the smoke was tightened to
  fail if a confirmation overlay remains before the final screenshot.
- `npm.cmd run smoke:desktop:ipc-negative` passed.
- `npm.cmd run smoke:desktop:portable` passed.
- `npm.cmd run audit:artifacts` passed for the prebuild artifacts and reported
  only expected cleanup candidates: `builder-debug.yml` and the smoke screenshot
  directory.
- `git diff --check` passed. Git still reports expected Windows line-ending
  warnings for files that will be normalized by Git.
- Targeted pre-submit tests after the process-title and Skill-frontmatter fixes
  passed:
  `npm.cmd test -- packages/core/src/scope.test.ts packages/core/src/codexControl.test.ts apps/desktop/src/renderer/src/components/codexControl.test.ts`
  and `npm.cmd run typecheck`.

Visual evidence:

- Packaged smoke final screenshot:
  `apps/desktop/out/smoke/packaged-clicks/desktop-clicks-final.png`
- Codex Control Skill edit screenshot:
  `apps/desktop/out/smoke/packaged-clicks/codex-control-skill-review-helper-edit.png`
- Process tree screenshot:
  `apps/desktop/out/smoke/packaged-clicks/process-tree-expanded.png`

Packaging evidence:

- `apps/desktop/out/AgentScope-0.1.0-pre-Portable-x64.exe`
- `apps/desktop/out/AgentScope-0.1.0-pre-Setup-x64.exe`
- `apps/desktop/out/AgentScope-0.1.0-pre-win-x64.zip`
- `apps/desktop/out/win-unpacked/AgentScope.exe`

## Manual Test Notes

When manually testing, focus on these screens:

- Settings -> Appearance:
  - open searchable font dropdowns while the settings panel is scrolled;
  - confirm the panel does not jump or reset.

- Codex Control:
  - check Overview, Storage, Files, and Skill panels for spacing;
  - confirm status chips are readable in Chinese;
  - confirm Skill entries show the Skill name from `SKILL.md` when available;
  - edit a user Skill and verify save succeeds on Windows.

- Processes:
  - confirm default ordering shows the most recently active processes first;
  - confirm rows use readable titles instead of raw mojibake or only command
    fragments.
  - confirm weak candidate titles keep the role prefix and strong matches can
    use the task title directly.

- Top bar:
  - click Process, Match, Codex, Claude, and Warning chips;
  - confirm each chip navigates to the expected view.

- Path actions:
  - reveal/open known local Codex and Claude trace paths;
  - confirm unknown paths still show a blocked allowlist error.

## Remaining Risk

- Activity ordering depends on available session timestamps and process
  timestamps. If an agent writes no recent session evidence, AgentScope falls
  back to process start time.
- Skill display extraction intentionally uses only the first Markdown H1 or
  frontmatter `name`. Skills without either still fall back to their directory
  name.
- Release artifacts built before the final commit should be rebuilt after the
  commit if the artifact manifest needs to point at the submitted revision.
