---
source_branch: main
source_commit: 8a9d89b
---

#### 13:45:00 IST - T8a: Implement first Community Directory remediation batch
- Modified `manifest.json` - Raised minimum supported Obsidian version to 1.4.5.
- Modified `versions.json` - Matched the compatibility baseline.
- Modified `src/settings-sections/diagnostics.ts` - Guarded Node filesystem imports to desktop execution.
- Modified `src/lib/systemPrompt.ts` - Replaced navigator platform detection with Obsidian Platform.
- Modified `src/main.ts` - Stopped detaching leaves during unload.
- Modified `src/components/ChatInput.tsx` - Replaced unsafe/static DOM construction and direct style assignments.
- Modified `src/components/MessageBubble.tsx` - Replaced innerHTML clearing with replaceChildren.
- Modified `src/components/ObsidianIcon.tsx` - Replaced innerHTML clearing with replaceChildren.
- Modified `src/settings-sections/diagnostics.ts` - Replaced direct style assignments with setCssStyles.
- Modified `src/settings-sections/intelligence.ts` - Replaced direct style assignments with setCssStyles.
- Modified `src/settings-sections/syncSettings.ts` - Replaced innerHTML and direct style assignments with safe APIs.
- Modified `src/settings-sections/updaterSettings.ts` - Replaced static innerHTML with textContent.
- Modified `package.json` - Pinned React 18 and removed zip packaging from the package script.
- Modified `pnpm-lock.yaml` - Updated React dependency resolution.
- Modified `.github/workflows/release.yml` - Pinned Node, added attestations, release notes, checksums, tag validation, and supported-asset packaging.
- Modified `docs/release-announcement.md` - Prepared 1.3.3 release notes.
- Modified `memory-bank/tasks/T8a.md` - Recorded implementation progress and verification.
- Modified `memory-bank/implementation-details/community-review-remediation.md` - Recorded remediation evidence.
- Modified `memory-bank/activeContext.md` - Recorded the active remediation batch.
- Modified `memory-bank/progress.md` - Recorded verification and remaining gates.
