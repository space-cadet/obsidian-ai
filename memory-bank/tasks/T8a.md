---
source_branch: main
source_commit: 2b81b96
---

# T8a: Community Directory Review Remediation
*Created: 2026-08-15 13:19:00 IST*
*Last Updated: 2026-08-29 09:45:48 IST*

**Description**: Resolve the failed automated Community Directory checks for the Chat Lab AI release and produce a reproducible, policy-compliant 1.3.3 release.
**Status**: ✅ COMPLETE — v1.4.1 published in Community Directory (2026-08-28)
**Priority**: HIGH
**Started**: 2026-08-15
**Last Active**: 2026-08-28 18:57 IST
**Dependencies**: T8, T7

## Completion Criteria
- [x] Resolve or intentionally raise `minAppVersion` for every unsupported Obsidian API finding.
- [x] Remove unsafe production DOM patterns and eliminate or explain all dynamic script creation.
- [x] Guard Node `fs`/`path` access for desktop-only execution and preserve mobile compatibility.
- [x] Remove `detachLeavesOfType()` from `onunload` and address platform/API compatibility findings.
- [x] Build the release from the exact tag with pinned toolchain/lockfile and verify artifact hashes.
- [x] Add GitHub artifact attestations and publish only supported plugin assets.
- [x] Re-run tests, typecheck, build, dependency audit, and Community Directory checks.

## Related Files
- `memory-bank/implementation-details/community-review-remediation.md`
- `memory-bank/implementation-details/release-readiness-audit.md`
- `.github/workflows/release.yml`
- `manifest.json`
- `README.md`

## Progress
1. ✅ Review PDF extracted and findings classified.
2. ✅ Repository state checked against the review at commit `056428c`.
3. ✅ Remediation plan and acceptance criteria documented.
4. ✅ First remediation batch implemented and verified.
5. ✅ Publish 1.3.3 with attested assets.
6. ✅ Fresh Community Directory review passed for 1.3.4.
7. ✅ Dev polish pushed through `latest-dev`.
8. ✅ v1.4.1 published in Community Directory (2026-08-28).

## Context
The 1.3.2 review found errors in compatibility, DOM safety, dynamic script detection, mobile filesystem access, release reproducibility, asset packaging, and provenance attestations. The source README currently matches `manifest.json`; the reported mismatch may come from the reviewed release artifact and must be rechecked after a clean CI build.

## 2026-08-28 v1.4.1 Community Directory Publication

- **Published:** v1.4.1 in Obsidian Community Directory (confirmed by user at 18:57 IST).
- **Release URL:** https://github.com/space-cadet/obsidian-ai/releases/tag/1.4.1
- **Changes:**
  - `no-unsupported-api`: Replaced `app.loadLocalStorage/saveLocalStorage` with browser `localStorage`
  - `no-static-styles-assignment`: Refactored ~49 inline styles to CSS classes
  - Fixed release tag from `v1.4.1` to `1.4.1` (Obsidian requires exact match with manifest version)
  - Review status: ✅ Passed

## 2026-08-15 Implementation Batch

- Raised `minAppVersion` and `versions.json` from `0.15.0` to `1.4.5` based on the review environment/API baseline.
- Replaced diagnostics Node filesystem requires with desktop-guarded dynamic imports.
- Removed leaf detachment during unload and replaced `navigator.platform` with Obsidian `Platform`.
- Replaced production `innerHTML` and direct style assignments with safe DOM APIs and `setCssStyles`.
- Downgraded React 19 to React 18.3.1 to remove React 19's bundled `hoistableScripts` scanner signal.
- Updated release workflow to pin Node 22.22.3, require tag/manifest agreement, add attestations, include release notes, and omit the unsupported zip.
- Verification: 23 test files, 234 tests, TypeScript, production build, and `git diff --check` pass.

## 2026-08-15 Release Evidence

- Release tag `1.3.3` published from commit `0d970a0`.
- CI run `31874348465` passed all steps, including both build attestations.
- Release assets are `main.js`, `manifest.json`, `styles.css`, and `release-sha256sums.txt`; no unsupported zip is attached.
- Release URL: https://github.com/space-cadet/obsidian-ai/releases/tag/1.3.3

## 2026-08-15 Follow-up Review Fixes

- Added descriptions to all six flagged directive comments.
- Removed preview `innerHTML` assignments using parsed DOM nodes and replaced preview stub style assignments with `setCssStyles`.
- Removed logger `navigator.userAgent` usage and replaced it with Obsidian `Platform`.
- Replaced the remaining unsupported `workspace.revealLeaf` call with `setActiveLeaf`.
- Published follow-up release `1.3.4` from commit `75c83be`; CI run `31874989163` passed both attestations and asset upload.
- Release URL: https://github.com/space-cadet/obsidian-ai/releases/tag/1.3.4

## 2026-08-15 Dev Polish

- Registered `Open Chat Lab AI sidebar` before asynchronous startup work so the Command Palette can discover it reliably; retained the legacy open-chat command.
- Renamed the ItemView display title from `Obsidian AI Chat` to `Chat Lab AI` to align the sidebar with the directory-facing plugin name.
- Updated README command guidance, aligned dev/build artifact naming to `chat-lab`, and pinned CI Node to `22.22.3` with current action major versions in dev workflows.
- Added regression tests for command identity and sidebar display identity.
- Verification: 25 test files, 236 tests, TypeScript, production build, and `git diff --check` pass.
- Commit `cac9688`; dev workflow `31876440415`; stable `1.3.4` unchanged.

## Remaining Closeout

- ✅ All tasks complete. T8a officially closed on 2026-08-28.
