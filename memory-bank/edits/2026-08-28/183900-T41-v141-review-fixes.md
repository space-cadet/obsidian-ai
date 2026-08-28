#### 18:39:00 IST - T41: v1.4.1 Community Review Fixes

**Action:** Modified
**Files:**
- `src/lifecycle/storage.ts` — replaced `app.loadLocalStorage/saveLocalStorage` with `window.localStorage`
- `src/sync/SyncLogger.ts` — replaced `app.loadLocalStorage/saveLocalStorage` with `window.localStorage`
- `src/modals/SyncProgressModal.ts` — refactored ~47 inline styles to CSS classes
- `src/settings-sections/syncComponents.ts` — extracted warning color to `.setting-item-warning`
- `src/settings-sections/remoteStorageSettings.ts` — extracted margin to `.sync-info-margin`, replaced `style.display` with `.is-hidden`
- `styles.css` — added sync-progress modal classes + `.is-hidden` utility
- `manifest.json` — version bumped to 1.4.1
- `versions.json` — version bumped to 1.4.1
- `memory-bank/implementation-details/community-review-remediation.md` — added v1.4.1 review section
- `memory-bank/implementation-details/release-process.md` — added v1.4.1 to releases table, added tag naming lesson
- `memory-bank/changelog.md` — added [1.4.1] section
- `memory-bank/progress.md` — added 2026-08-28 T41 entry
- `memory-bank/activeContext.md` — updated context to v1.4.1 work
- `memory-bank/errorLog.md` — added ERR-20260828-001
- `memory-bank/tasks/T41.md` — added v1.4.1 progress entry

Fixed Obsidian Community Review blocking errors (`no-unsupported-api`, `no-static-styles-assignment`). Corrected release tag from `v1.4.1` to `1.4.1`. Review passed.
