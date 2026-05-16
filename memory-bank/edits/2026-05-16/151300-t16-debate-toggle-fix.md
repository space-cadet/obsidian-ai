---
kind: edit_chunk
id: t16-debate-toggle-fix
created_at: 2026-05-16 15:13:00 IST
task_ids: [T16]
source_branch: main
source_commit: 1bd1e89a68c1714cb2d10eaf19afd080f9927c5e
---

#### 15:13:00 IST - T16: Fix Debate Mode Toggle Visibility
- Modified `src/components/ActionBar.tsx` - Changed condition from participantCount > 1 to (participantCount ?? 0) >= 2
- Modified `src/components/ActionBar.tsx` - Added debug console.log for participantCount tracking
