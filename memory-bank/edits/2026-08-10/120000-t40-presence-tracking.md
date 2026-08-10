---
kind: edit_chunk
id: t40-presence-tracking-impl
created_at: 2026-08-10 12:00:00 IST
task_ids: [T40]
source_branch: main
source_commit: 6746201c6f7c1d8a2cbe3f8f7e9e3c2d1b0a9f8e
---

#### 12:00:00 IST - T40: Presence tracking implementation - Phase 2 complete
- Modified `src/sync/SyncAdapter.ts` - Added onUserList and onPresence hooks to interface
- Modified `src/sync/WebSocketSyncAdapter.ts` - Implemented presence protocol (roster, join, leave)
- Modified `src/hooks/useChatUI.ts` - Added connectedUsers state tracking
- Modified `src/components/ActionBar.tsx` - Added remote user dropdown with radio icon and badge
- Modified `src/components/ChatApp.tsx` - Wired presence callbacks, register before connect
- Modified `relay/server.js` - Room state management, presence broadcast
- Modified `styles.css` - Dropdown styling with theme variables
- Created `memory-bank/implementation-details/presence-tracking.md` - Design doc for presence system
