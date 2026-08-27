# Session: 2026-08-27 — Architecture Modularity Plan

## Objective

Pull the latest Memory Bank changes and record the approved architecture
modularity plan from the code review and file-size scan.

## Completed

- Pulled `main` from `759af20` to `85a5f4c`.
- Reconciled the new T64 experiment subtasks with the architecture plan.
- Created proposed `T46a — Chat Turn Coordinator Decomposition`.
- Refreshed T46 with current sizes and the responsibility-led implementation
  order.
- Recorded capability ownership across T60/T60a/T60c and physical extraction
  ownership under T46/T46a.
- Linked model-history policy ownership across T48b, T48c, T62a, and T64b.
- Refreshed `orchestration-decomposition.md`,
  `tool-capability-registry-and-execution-pipeline.md`, and
  `refactored-architecture.md`.
- Corrected the T46 task-index placement and reconciled T64 documentation.

## Current Evidence

| File | Current size | Plan |
|------|--------------|------|
| `src/agent/ToolExecutor.ts` | 2,159 lines | First decomposition target |
| `src/hooks/useMessageActions.ts` | 1,533 lines | T46a turn coordinator |
| `src/main.ts` | 1,785 lines | Later lifecycle decomposition |
| `src/api.ts` | 765 lines | Later API decomposition |
| `src/components/ChatApp.tsx` | 1,029 lines | Monitor; composition layer remains useful |

## Verification

- `git diff --check` passed.
- No source files were changed.
- The local worktree contains only Memory Bank documentation changes after
  the pull.

## Remaining Gates

- Obtain implementation approval before changing source modules.
- Complete T60a capability ownership/projection work.
- Use T64b evidence before selecting the T62a elision policy.
- Implement T46 and T46a as separate, testable refactoring slices.
