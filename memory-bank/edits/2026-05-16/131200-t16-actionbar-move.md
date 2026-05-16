---
kind: edit_chunk
id: t16-actionbar-move
created_at: 2026-05-16 13:12:00 IST
task_ids: [T16]
source_branch: main
source_commit: f0cd52f863fbefc591707b18fc268abd46b04877
---

#### 13:12:00 IST - T16: Move Participant Button to ActionBar
- Modified `src/components/ActionBar.tsx` - Added participantCount and onToggleParticipantDropdown props, users icon with badge
- Modified `src/components/ChatApp.tsx` - Removed separate participant bar row, wrapped ActionBar in .chat-action-bar-wrapper with inline dropdown
- Modified `styles.css` - ActionBar horizontal scroll on mobile (overflow-x: auto, scrollbar hidden), removed participant bar styles
