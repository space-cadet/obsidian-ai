# Edit Chunk: T60b — OpenResponses Loop Bug Diagnosis
*Recorded: 2026-08-25 16:56:00 IST*
*Task: [T60b](../tasks/T60b.md)*

## Diagnosis

Three protocol bugs identified in the OpenResponses loop that cause unbounded
token growth during multi-step tool chains. The 500k-token incident
(2026-08-25) was a direct result.

### Bug 1: Duplicate Input Submission
**File:** `src/agent/OpenResponsesLoop.ts:92-108`
`streamAgentResponse({ input, tools })` is inside the `while` loop. The `input`
array contains the full original conversation. After each tool execution, the
loop returns to the top and resubmits everything. A 17-step chain sends the
original input 17 times.

### Bug 2: Discarded Continuation ID
**File:** `src/api/AgentApiManager.ts:214-230`
`continueWithToolResult()` accepts `previousResponseId` but never serializes
it. `AgentApiOptions` has no `previousResponseId` field. The comment says
"currently ignored by OpenClaw" but the gateway supports it. Continuations
are stateless.

### Bug 3: Continuation Handler Gap
**File:** `src/agent/OpenResponsesLoop.ts:264-282`
Post-continuation stream only handles `text-delta`/`finish`/`error`, not
`function_call`/`function_call_done`. Multi-round chains fall back to the
broken outer loop.

## Files Read
- `src/agent/OpenResponsesLoop.ts` — full file, 350 lines
- `src/api/AgentApiManager.ts` — full file, 220 lines
- `src/agent/types.ts` — full file, 80 lines
- `src/agent/AgentLoop.ts` — full file, 430 lines

## Files to Modify (not yet changed)
- `src/agent/OpenResponsesLoop.ts` — move initial request outside loop; add shared handler
- `src/api/AgentApiManager.ts` — add `previousResponseId`; pass through continuations
- `src/agent/__tests__/openResponsesLoop.test.ts` — add 6 new test assertions

## Token Math
- **Before fix:** 17 steps × (200 input + 3,000 result) accumulating = ~500k tokens
- **After fix:** 200 input once + 17 × (200 result) = ~3.6k tokens
- **Reduction:** ~140×

## Memory-Bank Updates
- Updated `tasks/T14.md` — added bug findings to Current Tool-Transport Boundary
- Updated `tasks/T60b.md` — rewrote with bug details, fix spec, test plan
- Updated `tasks/T60.md` — added protocol bug note to Current State
- Created `implementation-details/openresponses-loop-bugs.md` — full diagnosis doc
- Updated `tasks/T48.md` — noted protocol duplication as separate issue
- Updated `tasks/T48a.md` — added 500k incident cross-reference
- Updated `tasks/T48b.md` — added search result size lesson
- Created `tasks/T60d.md` — proposed search default limit reduction
- Updated `tasks/T13a.md` — cross-referenced T60b finding
