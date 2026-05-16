---
kind: edit_chunk
id: t16-session-sync
created_at: 2026-05-16 15:48:00 IST
task_ids: [T16]
source_branch: main
source_commit: 7e485a71067aa29de2ac87c28eac4bd28d4eed9c
---

#### 15:48:00 IST - T16: Sync Participants When Switching Sessions
- Modified `src/components/ChatApp.tsx` - handleLoadSession: restore participants from loaded session
- Modified `src/components/ChatApp.tsx` - handleNewChat: clear participants for new sessions
- Modified `src/components/ChatApp.tsx` - handleDeleteSession: restore participants when auto-switching to most recent
