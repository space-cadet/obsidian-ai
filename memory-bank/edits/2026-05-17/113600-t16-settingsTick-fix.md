---
kind: edit_chunk
id: 2026-05-17-113600
created_at: 2026-05-17 11:36 IST
task_ids: [T16]
source_branch: main
source_commit: f0e5471
---

#### 11:36 IST - T16: Fix settingsTick increment on profile switch
- Modified `src/components/ChatApp.tsx` — Increment `settingsTick` when switching profile via dropdown so `resolvedProfile` useMemo updates immediately (+1 line)
