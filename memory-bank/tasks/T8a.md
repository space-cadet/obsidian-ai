---
source_branch: main
source_commit: 2b81b96
---

# T8a: Community Directory Review Remediation
*Created: 2026-08-15 13:19:00 IST*
*Last Updated: 2026-08-15 13:55:00 IST*

**Description**: Resolve the failed automated Community Directory checks for the Chat Lab AI release and produce a reproducible, policy-compliant 1.3.3 release.
**Status**: 🔄 IN PROGRESS
**Priority**: HIGH
**Started**: 2026-08-15
**Last Active**: 2026-08-15 13:55:00 IST
**Dependencies**: T8, T7

## Completion Criteria
- [ ] Resolve or intentionally raise `minAppVersion` for every unsupported Obsidian API finding.
- [ ] Remove unsafe production DOM patterns and eliminate or explain all dynamic script creation.
- [ ] Guard Node `fs`/`path` access for desktop-only execution and preserve mobile compatibility.
- [ ] Remove `detachLeavesOfType()` from `onunload` and address platform/API compatibility findings.
- [ ] Build the release from the exact tag with pinned toolchain/lockfile and verify artifact hashes.
- [ ] Add GitHub artifact attestations and publish only supported plugin assets.
- [ ] Re-run tests, typecheck, build, dependency audit, and Community Directory checks.

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
4. 🔄 First remediation batch implemented and verified.
5. ✅ Publish 1.3.3 with attested assets.
6. ⬜ Request fresh Community Directory review and complete manual smoke tests.

## Context
The 1.3.2 review found errors in compatibility, DOM safety, dynamic script detection, mobile filesystem access, release reproducibility, asset packaging, and provenance attestations. The source README currently matches `manifest.json`; the reported mismatch may come from the reviewed release artifact and must be rechecked after a clean CI build.

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
