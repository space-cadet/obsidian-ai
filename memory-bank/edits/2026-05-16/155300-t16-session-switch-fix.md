---
kind: edit_chunk
id: t16-session-switch-fix
created_at: 2026-05-16 15:53:00 IST
task_ids: [T16]
source_branch: main
source_commit: 971c63cc867d0fee88b6292ecf44f34a6a105d01
---

#### 15:53:00 IST - T16: Fix Session Switch Race Condition
- Modified `src/components/ChatApp.tsx` - handleLoadSession: setParticipants() before setActiveSessionId()
- Modified `src/components/ChatApp.tsx` - handleDeleteSession: setParticipants() before setActiveSessionId()
- Fixed: participants-to-session sync effect was overwriting new session with old participant list
