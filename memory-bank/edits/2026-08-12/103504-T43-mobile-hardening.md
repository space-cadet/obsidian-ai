---
kind: edit_chunk
id: 2026-08-12-103504-t43-mobile-hardening
created_at: 2026-08-12 10:35:04 IST
task_ids: [T43, T15, T8]
source_branch: main
source_commit: 263fda1a00bc7e12ed7fcc1a824ebffe4ec62230
---

#### 10:35:04 IST - T43, T15, T8: Mobile chat hardening, model badge fix, and format-gate cleanup
- Modified `src/components/ChatApp.tsx` - Count selected model IDs directly for the model-selection badge.
- Created `src/components/__tests__/ActionBar.test.tsx` - Cover zero, one, and two model selections and separate remote-user counts.
- Modified `styles.css` - Constrain the chat flex scroll chain, add touch scrolling behavior, and remove mobile composer bottom padding.
- Modified `memory-bank/tasks/T43.md` - Record mobile hardening, badge correction, tests, formatting, and verification.
- Modified `memory-bank/implementation-details/multi-user-agent-chat.md` - Document mobile scroll/composer behavior and badge count rules.
- Modified `memory-bank/activeContext.md` - Record the completed follow-up and current verification state.
- Modified `memory-bank/progress.md` - Record the completed mobile and selection-count follow-up.
- Modified `memory-bank/changelog.md` - Add the unreleased mobile, badge, test, and format-gate changes.
- Modified `memory-bank/tasks.md` - Move T43 to the completed registry.
- Modified `memory-bank/session_cache.md` - Close T43 and record the current session and history.
- Created `memory-bank/sessions/2026-08-12-morning.md` - Record the completed session and requested title.
- Modified `memory-bank/edit_history.md` - Add this generated-view entry because the local SQLite regeneration dependency is unavailable.
