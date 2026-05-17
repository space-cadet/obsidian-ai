---
kind: edit_chunk
id: 2026-05-17-111200
created_at: 2026-05-17 11:12 IST
task_ids: [T16]
source_branch: main
source_commit: fa060c1
---

#### 11:12 IST - T16: Message metadata (model name + response time) in bubbles
- Modified `src/types.ts` — Added `modelName?: string` and `responseTimeMs?: number` to `ChatMessage` (+4 lines)
- Modified `src/components/ChatApp.tsx` — Track `streamStartTime`, attach model/timing to assistant messages (+5 lines)
- Modified `src/components/MessageBubble.tsx` — Render metadata row with model | timing | tokens (+16 lines)
- Modified `styles.css` — `.chat-message-metadata` styling, flex row with gaps (+32 lines)
