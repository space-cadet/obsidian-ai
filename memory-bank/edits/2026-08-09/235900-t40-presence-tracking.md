#### 23:59:00 IST - T40: Presence Tracking Implementation

**Action:** Modified, Updated
**Files:**
- `relay/server.js` — Added presence tracking (join/leave/roster)
- `src/sync/SyncAdapter.ts` — Added `onUserList`, `onPresence` hooks
- `src/sync/WebSocketSyncAdapter.ts` — Implemented presence protocol
- `src/hooks/useChatUI.ts` — Added `connectedUsers` state
- `src/components/ActionBar.tsx` — Added remote user dropdown
- `src/components/ChatApp.tsx` — Wired presence callbacks to UI

**Details:**
- Relay now tracks room membership and broadcasts roster on join
- SyncAdapter v2 interface adds presence hooks
- WebSocketSyncAdapter filters self-echo messages
- Adjacent dropdown in ActionBar shows connected human users
- Build passes, all 188 tests pass
- Commit: `6746201`
