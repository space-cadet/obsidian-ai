---
source_branch: main
source_commit: 4a751b6b2f644f73ec45769b9fab223136a75690
---

# T8b: 1.5.0 Community Scan Follow-up

*Created: 2026-09-09 IST*
*Last Updated: 2026-09-24 IST*

**Description**: Record and close the Community Directory scanner findings
identified after the Chat Lab AI `1.5.0` release was submitted.
**Status**: ✅ **COMPLETE — 1.6.0 review passed; version online**
**Priority**: HIGH
**Dependencies**: T8, T8a

## Findings and fixes

- `obsidianmd/no-static-styles-assignment` flagged seven direct style
  assignments in `src/settings-sections/SettingsTab.ts`. Visibility state now
  uses CSS classes, with supporting rules in the source CSS partials and
  regenerated `styles.css`.
- The scanner flagged a raw HTML heading element in `SettingsTab.ts`. It now
  uses `new Setting(header).setName(title).setHeading()`.

## Release evidence

- Fix commit: `4a751b6` (`fix: satisfy settings scanner checks`)
- Release tag: `1.5.0` with no `v` prefix
- Remote `main` and the dereferenced `1.5.0` tag resolve to `4a751b6`.
- Verification: 52 test files / 451 tests, TypeScript, production build,
  package generation, and `git diff --check` passed.

## 1.6.0 scan follow-up — 2026-09-24

- The annotated `1.6.0` tag is published at release commit `e8b6629`, and the
  GitHub release workflow completed successfully.
- Deepak confirmed the corrected Community Directory review passed and the new
  version is online. This closes the scanner follow-up.
