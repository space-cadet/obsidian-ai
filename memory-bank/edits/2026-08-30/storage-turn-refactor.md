---
id: storage-turn-refactor-20260830
task_ids: [T46, T67]
---

#### 2026-08-30 - Extract storage persistence and turn actions

- Added `src/lifecycle/persistence.ts` and moved settings/chat-data
  persistence, queued writes, backup rotation, and auto-sync scheduling into
  it.
- Added `src/agent/turnActions.ts` and moved stop, retry, edit, cancel-edit,
  and tool approval actions into it.
- Preserved the existing storage exports and kept `storage.ts` and
  `turnLifecycle.ts` as coordinators for the remaining behavior.
- Created T67 to track focused persistence tests and the remaining storage
  boundaries.
- Verification before final build/push: 46 test files / 404 tests, TypeScript,
  formatting, and `git diff --check` passed.
