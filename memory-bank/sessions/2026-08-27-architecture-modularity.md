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

## Implementation Update — 2026-08-27 17:40 IST

The approved implementation work continued on branch
`feat/t46-architecture-decomposition`, based on
`a15c47646e1141239b269c8f608331889b1b32df`.

- Reduced `src/agent/ToolExecutor.ts` to 265 lines.
- Created `src/agent/tools/ToolResolver.ts` for safe path and note lookup.
- Created note and remaining-capability handler modules.
- Created `src/agent/ChatTurnCoordinator.ts` for the shared native and
  OpenResponses turn path.
- Connected the prompt and OpenResponses projection to resolved definitions.
- Added focused tests for the coordinator and resolved tool projections.
- Full verification passed: 41 test files, 359 tests, TypeScript, production
  build, and focused coordinator/hook tests.

The remaining handler areas are still grouped temporarily. The hook remains
responsible for request preparation, history, persistence, and approval state.
The `api.ts` and `main.ts` phases have not started.

## Capability Domain Split — 2026-08-27 17:52:10 IST

- Replaced `src/agent/tools/ToolHandlers.ts` with separate handler modules for
  note, bulk, discovery, vault, web, memory, session, and settings work.
- Added `src/agent/tools/ToolHandlerContext.ts` for shared services.
- Reduced `ToolExecutor.ts` to 292 lines.
- Verified 49 focused tool/provider tests, 359 full-suite tests, TypeScript,
  and the production build.
- Next step: continue T46a by extracting request preparation and lifecycle
  state from `useMessageActions.ts`.
