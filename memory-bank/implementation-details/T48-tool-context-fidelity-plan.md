# T48 Tool Calling and Context Fidelity Plan

*Created: 2026-09-09*

## Goal

Finish T48 as one coordinated model-context pipeline:

- Keep the complete conversation and tool results in the local transcript.
- Build a bounded model-facing request before every provider call.
- Preserve active and recent tool work without orphaning calls or results.
- Replace aged large results with compact previews and stable references.
- Retrieve exact historical evidence only when a later model turn needs it.
- Keep native AI SDK and OpenResponses behavior equivalent.

The existing `src/context/modelHistory.ts` entry point remains the single
model-history boundary. No second history policy should be introduced in a
provider loop.

## Target flow

```text
Tool executes
  -> complete result remains in the saved transcript
  -> immediate continuation receives a bounded result
  -> later requests receive a preview and stable reference
  -> model calls read_tool_result when exact detail is needed
  -> the retrieved section is included only in that request
```

## Work packages

### A. Stable result references — T48b/T48c

Add a pure result-reference module. The initial identity is the composite
`sessionId + toolCallId`; include `messageId` when available for diagnostics.
References may also carry tool name, safe source metadata, content fingerprint,
and total content length.

Use the existing persisted result as the source of truth. Do not add a second
result database in this phase. Legacy messages without reference metadata must
remain addressable through `contentParts` and the older `toolCalls` format.

### B. Exact bounded retrieval — T48c

Add a read-only `read_tool_result` capability:

```ts
read_tool_result({
  session_id: string,
  tool_call_id: string,
  offset?: number,
  limit?: number,
  query?: string,
})
```

The result must be exact with respect to the stored content, but every response
must be bounded. Return range metadata, fingerprint, source identity,
`has_more`, and `next_offset` where applicable. Reject missing, ambiguous,
invalid, and in-flight-only results rather than guessing.

The handler is read-only and receives a session lookup callback from the turn
owner. It must work with both JSONL and legacy storage through the loaded
`ChatSession` representation.

### C. Shared model-result projection — T48b

Move model-facing tool-result formatting and bounding into a shared helper used
by both `AgentLoop` and `OpenResponsesLoop`.

Projection policy:

- Small immediate results remain complete.
- Large immediate results use a bounded head/tail preview plus a reference.
- Recent results stay exact within the configured allowance.
- Older results become compact previews plus references.
- Retrieved sections remain exact but bounded.
- Parallel results share the continuation allowance.

The full `ToolResult` passed to persistence and UI callbacks remains unchanged
except for optional reference metadata.

### D. Fidelity horizon and compaction — T48b/T48c/T62a

Update `historyBuilder.ts` and `modelHistory.ts` so agent mode does not mean
preserving every historical result indefinitely.

- Active exchange: bounded and exact where possible.
- Recent exchange: preserved according to the configured tail.
- Aged result: preview plus stable reference.
- Budget-evicted exchange: represented in a bounded result catalog.
- Saved transcript: never mutated.

The result catalog is derived context, not user text. It must be token-bounded,
must not create an unpaired synthetic tool result, and must tell the model how
to retrieve the exact content.

Bound compaction prompts with the same result projection. Persist inspectable
compaction metadata, including source message IDs, source tool-call IDs,
summary version, timestamp, and transcript fingerprint. If validation fails,
fall back to deterministic bounded trimming.

### E. Request budget and attachments — T48a

Apply the budget once to the fully serialized model-ready request before every
provider call, including native tool-loop iterations.

Reserve space for system prompt, selected tools, current user text, response
and continuation allowance, attachments, derived context, and recent history.
Cap attached notes, expanded embeds, active-note content, PDF/file extraction,
and multimodal replay before serialization. Never silently remove typed user
text.

### F. Provider parity and fixed registry cost — T60b/T48d

Make native and OpenResponses loops consume the same result projection and
report the same per-step telemetry shape. Preserve stateful OpenResponses
continuations and never resend the original transcript after the first request.

After fidelity is safe, measure deterministic tool groups and selectively omit
unavailable, Developer-only, and irrelevant tool definitions. Preserve tools
already used in the active chain and avoid a brittle classifier that can hide
an essential capability.

## Implementation sequence

1. Add characterization tests, reference types, and pure lookup/projection
   helpers.
2. Register `read_tool_result`, connect it through the resolved registry and
   `ToolExecutor`, and verify JSONL/legacy compatibility.
3. Use the shared projection in both loops and add references to large results.
4. Add the omitted-result catalog, bounded compaction input, and persisted
   compaction metadata.
5. Apply attachment-aware request budgeting and add OpenResponses telemetry
   parity.
6. Measure tool-registry reduction, run controlled provider tests, reconcile
   T48a-d/T62a status, and close only evidence-backed criteria.

## Acceptance tests

### References and retrieval

- Stable identity generation and fingerprint consistency.
- Current `contentParts` and legacy `toolCalls` lookup.
- Exact offset and query retrieval with bounded responses.
- Continuation metadata and invalid-range handling.
- Duplicate, missing, and in-flight result rejection.
- No mutation of persisted messages.

### History and pairing

- Small result remains complete.
- Large result becomes a preview plus reference.
- Omitted history receives a bounded catalog entry.
- Every model-visible result has a preceding matching call.
- Pairing survives message ceilings, token budgets, compaction, and retrieval.
- Repeated compaction preserves source provenance and remains inspectable.

### Provider loops

- Native multiple calls preserve emission and execution order.
- OpenResponses sends one initial request and stateful continuations only.
- Sequential and parallel calls retain matching IDs.
- Rejection, cancellation, execution errors, and oversized results behave the
  same in both transports.
- Per-step provider usage sums exactly to the stored aggregate.

### Persistence and export

- Complete results survive save/reload, JSONL, legacy storage, export, import,
  and sync.
- References and compaction metadata survive restart.
- Debug exports contain bounded diagnostics without duplicating raw results.

### Controlled provider evidence

Run same-model comparisons for no-tool, small-result, large-result,
reference-projected, exact-retrieval, sequential-chain, parallel-call, and
long-history budgeted sessions.

Success requires lower repeated result exposure, exact-detail recovery without
full-transcript replay, valid pairing, and no task-success regression. Provider
usage remains authoritative; local estimates remain labelled diagnostics.

## Scope exclusions

This plan does not require a second result database, vector search, a storage
rewrite, a new umbrella task, a usage-dashboard redesign, provider-native
compaction, or changes to the visible chat transcript.

## Implementation checkpoints

### 2026-09-09 — retrieval and bounded projection

- Added stable result references and canonical/legacy persisted-result lookup.
- Added the read-only `read_tool_result` capability with bounded offset and
  query retrieval.
- Added the shared model-result projection used by native and OpenResponses
  loops.
- Large results now carry a bounded preview and retrieval reference when the
  configured result budget can fit the reference envelope.
- Full persisted results remain unchanged for UI and export.
- Focused and full automated verification remains required after each provider
  request-shape change.

### 2026-09-10 — omitted-result catalog

- Added a bounded derived catalog for completed tool results that fall outside
  the selected model-history replay.
- Catalog entries retain the session and tool-call address, a compact summary,
  and explicit `read_tool_result` retrieval guidance without fabricating a
  synthetic tool message.
- Reused canonical result serialization for history projection, including
  structured results that do not have a `content` or `error` field.
- Revalidated native/legacy lookup, oversized replay projection, pairing, and
  full-suite behavior: 55 test files and 470 tests passed; TypeScript passed.

Remaining in this work package: bound the semantic-compaction input with the
same projection rules and persist inspectable compaction provenance/metadata.
