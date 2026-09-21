#### 12:42:39 IST - T42g: Settings Sync Now button wired to progress modal

**Action:** Modified
**Files:**
- Modified: src/settings-sections/remoteStorageSettings.ts (settings "Sync Now" at :377 now passes `useModal: true`)

Commit `8fafd34` (main, 2026-09-21 12:42 IST, morning session). The audit
Gaps item 1 (every non-panel path is toast-only) partially closed: the
Settings button called bare `plugin.triggerSync()` while only the command
palette passed `{ useModal: true }`. One-line fix:
`triggerSync(false, { useModal: true })`. Auto-sync-on-save intentionally
stays modal-less — the T42g status-bar indicator covers the ambient path.
Build green; pushed.
