# Session 2026-10-19 — Shared Session-State Coordination Plan
*Created: 2026-10-19 20:56:45 IST*
*Last Updated: 2026-10-19 20:58:03 IST*

## Focus Task
`OBSIDIANAI-brl`: Coordinate shared chat session state and persistence operations

**Status**: 🔄 OPEN — proposed work; implementation has not started.

## Session Summary

**Objective**: Record the architectural response to repeated chat persistence
review findings as one bounded, reviewable implementation plan.

**Scope**: Read-only source architecture assessment, Beads task creation, and
Memory Bank documentation. No product source files were changed.

**Work Completed**:

1. Created Beads issue `OBSIDIANAI-brl`, labeled `T24c`, with P1 priority and
   linked the implementation plan as its specification.
2. Created `memory-bank/implementation-details/session-state-coordination.md`
   with the proposed state owner, operation rules, migration path, boundaries,
   risks, and validation cases.
3. Linked the plan from T24b and recorded that the latest hydration P1 remains
   unresolved and outside T24b's narrower transcript-integrity acceptance.

## Context and Working State

**Code Status**: The source audit used `ui-chat-fixes` at `cd4478b`
(`T24b: Preserve deletions across queued saves`). Beads initialization added
local setup commit `bbd3dab`. No product source edits or tests were performed.
Automatic approval review rejected syncing the new Beads issue and design
metadata to the configured GitHub Dolt remote; the issue remains local. No
alternate sync path was used.

**Documentation Status**: The plan is explicitly marked proposed. The latest
Codex review identified a storage/UI hydration-readiness split; source review
also found possible stale session targeting and sync-snapshot races. The latter
risks are not presented as device-reproduced failures.

**Key Decisions Made**:

- Use one plugin-owned session state owner for all views sharing the plugin.
- Keep transcript readiness with messages installed into that shared state.
- Reuse the current JSONL/index format, `ChatStorage` transactions, and sync
  engine; do not add a generic state framework or parallel permanent store.
- Keep metadata-only updates lazy and preserve intentional edit/retry
  truncation.
- Migrate every persistent mutation path before claiming the ownership issue
  is solved.

## Critical Files

- `memory-bank/implementation-details/session-state-coordination.md`
- `memory-bank/tasks/T24b.md`
- `memory-bank/activeContext.md`
- `memory-bank/session_cache.md`

## Next Steps

1. Implement the plan under `OBSIDIANAI-brl` after reviewing its operation
   contract against current source.
2. Migrate hydration, session actions, message/context updates, agent callbacks,
   deletion, sync application, and shutdown flushing through the shared owner.
3. Add the focused race and lifecycle coverage listed in the plan.
4. Keep source tests/build and live Obsidian/device acceptance as separate
   evidence.

## Session Outcome

**Status**: ✅ PLAN RECORDED — issue and associated design are open for
implementation; no source fix is claimed.
