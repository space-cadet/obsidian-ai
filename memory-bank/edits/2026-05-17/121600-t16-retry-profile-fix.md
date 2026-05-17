---
kind: edit_chunk
id: 2026-05-17-121600
created_at: 2026-05-17 12:16 IST
task_ids: [T16]
source_branch: main
source_commit: 64276ca
---

#### 12:16 IST - T16: Fix resolvedProfile in handleSend deps
- Modified `src/components/ChatApp.tsx` — Added `resolvedProfile` to `handleSend` useCallback dependency array so retry uses correct profile after switch (+1 line, -1 line)
