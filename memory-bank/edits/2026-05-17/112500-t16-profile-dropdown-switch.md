---
kind: edit_chunk
id: 2026-05-17-112500
created_at: 2026-05-17 11:25 IST
task_ids: [T16]
source_branch: main
source_commit: 7ddeeca
---

#### 11:25 IST - T16: Profile dropdown mid-session switching
- Modified `src/components/ChatApp.tsx` — Dropdown uses radio buttons in 1:1 mode, checkbox in council mode; clicking profile in 1:1 mode updates `activeProviderProfileId` + saves settings (+24 lines)
- Modified `src/components/ActionBar.tsx` — Badge always shows at least 1 instead of 0 (-1 line, +8 lines net)
