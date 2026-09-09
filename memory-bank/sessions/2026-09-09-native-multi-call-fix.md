# Session 2026-09-09 - Native Multi-Call Replay Fix

## Focus Task

T48b: Tool-Result Replay Limits and Canonical Serialization

## Objective

Implement the first code slice from the tool-context fidelity plan by fixing
native multi-call handling without changing the saved transcript contract.

## Work Completed

- Changed `AgentLoop` to collect every native `tool-call` event emitted during
  one model step instead of retaining only the last call.
- Execute calls in emitted order and invoke tool callbacks for every call and
  result.
- Build one assistant message containing all ordered tool calls and one tool
  message containing all matching ordered results.
- Added regression coverage for two calls emitted in one step, including
  callback order, execution order, and call/result ID pairing.
- Updated T48b and T60b task records.

## Verification

- Focused agent/history tests: 3 files / 17 tests passed.
- Full suite: 53 test files / 455 tests passed.
- TypeScript check passed.
- Production build passed.
- Prettier and `git diff --check` passed.

## Remaining Work

Exact historical retrieval, stable result references after eviction, shared
per-iteration budgets across native/OpenResponses loops, compaction provenance,
and provider usage reconciliation remain open under T48a-d and T62a.

## Outcome

Implementation slice complete; broader T48 context-fidelity work remains active.
