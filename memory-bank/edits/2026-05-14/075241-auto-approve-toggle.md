---
kind: edit_chunk
id: 2026-05-14-auto-approve-toggle
created_at: 2026-05-14 07:52:41 IST
task_ids: [T13]
source_branch: main
source_commit: c8d2a0e30381757fa9a727ac7009ce2000ff8c15
---

#### 07:52:41 IST - T13: Add auto-approve toggle button to chat action bar
- Modified `src/components/ActionBar.tsx` - Added `autoApprove` and `onToggleAutoApprove` props; inserted toggle button between Load and Settings buttons with visual active/inactive states
- Modified `src/components/ChatApp.tsx` - Added `handleToggleAutoApprove()` callback that flips `plugin.settings.autoApply`, saves settings, and shows a Notice; wired props to ActionBar
- Modified `src/views/ObsidianAIChatView.ts` - Added `saveSettings(): Promise<void>` to `ChatPluginLike` interface so ChatApp can persist the toggle
- Modified `styles.css` - Added `.chat-auto-approve-btn` transition and `.chat-auto-approve-btn.is-active` accent styling
