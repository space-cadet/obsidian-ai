#### 21:28:23 IST - T24: picker preview shows indexed count, not "No messages"

**Action:** Modified
**Files:**
- Modified: src/components/presentational/SessionPickerModal.tsx (preview fallback renders "N messages — open to view" from index `messageCount` when `hydrated === false && msgCount > 0`)
- Modified: src/components/__tests__/SessionPickerModal.test.tsx (unhydrated-session regression fixture, messageCount 3)

Commit `1fb9263` (main, 2026-09-21 21:28 IST, afternoon session). The meta
line already showed the index-backed count via `sessionMessageCount()`; the
preview line hardcoded "No messages" for anything not in memory. Fix needs
zero session-file reads — the index loads once at boot. Tests 2/2; build
green; device-verified with the hydrate fix.
