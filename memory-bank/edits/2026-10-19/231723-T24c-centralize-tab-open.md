---
kind: edit_chunk
id: 20261019-231723-T24c-centralize-tab-open
created_at: 2026-10-19 23:17:23 IST
task_ids: [T24c]
source_branch: ui-chat-fixes
source_commit: 8f755b407747624e51f42f9d5c6ec3140e9d8ebd
---

#### 23:17:23 IST - T24c: Centralize tab opening
- Modified `src/hooks/useSessionActions.ts` - Route new-chat tab creation through the same `openSessionInTab` operation used by session restore.
- Modified `src/hooks/__tests__/useSessionActions.test.ts` - Keep regression coverage for both new-chat and older-session restore paths.
- Updated `memory-bank/activeContext.md` - Record the shared tab-opening invariant and validation state.
- Updated `memory-bank/session_cache.md` - Record the centralized session-opening behavior.
- Updated `memory-bank/tasks.md` - Refresh the task registry update timestamp.
- Updated `memory-bank/tasks/T24c.md` - Record centralized tabless-session preservation.
- Updated `memory-bank/sessions/2026-10-19-session-state-coordination-plan.md` - Record the shared tab-opening rule and latest checks.
