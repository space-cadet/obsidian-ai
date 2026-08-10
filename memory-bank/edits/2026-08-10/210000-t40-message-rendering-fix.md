---
kind: edit_chunk
id: t40-message-rendering-fix
created_at: 2026-08-10 21:00:00 IST
task_ids: [T40]
source_branch: main
source_commit: e7e29ce9f86997f4f974e792bdc139b9dc50dca2
---

#### 21:00:00 IST - T40: Fix message rendering - relay sends type 'chat' not 'message'
- Modified `src/sync/WebSocketSyncAdapter.ts` - Fixed message type check from 'message' to 'chat'
- Modified `src/sync/WebSocketSyncAdapter.ts` - Extract content directly from data instead of data.message
- Modified `src/sync/WebSocketSyncAdapter.ts` - Fixed echo check to use data.sender instead of inner.sender
- Modified `memory-bank/tasks/T40.md` - Documented known bugs section with AI-triggering issue
