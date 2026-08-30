---
id: t65-zero-budget-fix-20260830
task_ids: [T65]
---

#### 2026-08-30 - Enforce zero memory budget

- Updated `ThreeTierMemoryStore.getSystemPromptContext()` to return empty
  context when `maxTokens` is zero or negative.
- Added a regression test for the zero-budget case.
- Verification: 46 test files / 404 tests, TypeScript, and the production build
  passed.
- T65 migration-event audit and versioned upgrade contract remain open.
