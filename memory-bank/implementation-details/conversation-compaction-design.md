# Conversation Compaction Design
*Created: 2026-08-19 13:31:15 IST*
*Last Updated: 2026-08-29 17:08:29 IST*

## Implemented Slice and Current Boundary — 2026-08-23 17:05:26 IST

The first semantic-compaction implementation is merged in `6a205b9` (PR #5).
It adds configurable history-trigger and release thresholds, a configurable
recent-message tail, JSON-directed summary generation, asynchronous
summarization, a non-destructive model-history projection, and a visible
completion notice. The persisted transcript remains unchanged.

The implementation is narrower than the full design above. The summary is
currently held in memory per session; it is not persisted in the session export
and there is no summary-inspection view or exact message-ID retrieval yet. The
summary parser checks JSON syntax but does not yet perform the full schema,
provenance, or quality audit described in this document. Tool-pair preservation
across compaction and repeated compaction cycles also need focused acceptance
coverage.

Live validation is recorded in
`T48c-validation-2026-08-23.md`. It demonstrated the trigger, asynchronous
completion notice, and recovery of seeded markers and requirements, but the
export alone cannot expose the in-memory summary.

## Overview

Token-budgeted management of model-visible conversation history. The system
reduces per-request cost through a graduated ladder: bounded tool replay first,
then semantic compaction only when the request budget requires it.

Turn count is only a fallback. The full transcript remains authoritative and
available to the user, while request construction uses a bounded, rebuildable
model-history projection. Compaction must never replace `messagesRef.current`
or the persisted UI/export transcript.

**Motivation**: DeepSeek investigation showed 892K cache-hit tokens per request
after 10-turn conversations. The goal is to reduce repeated payloads while
preserving exact recent context, structured task state, and an upgrade path to
provider-native compaction or exact historical retrieval.

---

## Trigger Conditions and Compaction Ladder

Before each provider request, build the complete request budget: stable system
prompt, tools/schemas, pinned constraints, attachments, current input, response
reserve, bounded tool replay, and candidate history. Use hysteresis: when the
upper boundary is crossed, compact enough history to return to a lower target
band rather than compacting again on the next turn.

Apply these stages in order:

1. Preserve stable prefixes, pinned constraints, and the newest exact turns.
2. Bound or clear old tool results using T48b's canonical head/tail replay.
3. Semantically compact the old dialogue when the request still cannot fit.
4. Fall back to safe token-aware trimming if compaction generation or validation
   fails; never install an unvalidated summary.

Token pressure is primary. `compactionTurnThreshold` is only a fallback for
providers or estimates that cannot provide a reliable window. Compaction may be
prepared after a response, but synchronous work is required only when the next
request cannot fit without it.

---

## Compaction Algorithm

```
Input: full transcript, prior compaction metadata, request budget
       keepRecent = 4 messages by default (configurable, 3–5)

1. Capture the transcript version/fingerprint and identify an old prefix at a
   valid turn boundary. Never split a tool-call/result unit.
2. Retain the newest recent-token budget and newest 3–5 messages verbatim,
   extending retention to matching tool results.
3. If a prior summary exists, re-distill it with newly aged messages. Do not
   append unbounded summaries.
4. Generate a bounded, schema-validated derived summary using a fast model.
   Preserve decisions, constraints, current objective, pending asks, open work,
   tool outcomes, and exact identifiers/source IDs.
5. Audit required sections, latest-ask coverage, identifier preservation, and
   transcript provenance. Retry generation once; otherwise use bounded trim.
6. Build a separate model-history projection:
   stable prefix + pinned constraints + derived summary + recent exact tail.
7. Install the result only if the captured transcript version still matches.
   Otherwise discard it and rebuild from the newer transcript.

The persisted `ChatSession.messages` and `messagesRef.current` remain unchanged.
Compaction metadata is derived/rebuildable and records the summarized-through
message ID, source IDs/fingerprint, summary, timestamp, and model.
```

---

## Summary Format

Use a bounded structured object internally, with a readable rendering for the
UI. The minimum schema is:

```typescript
type DerivedConversationSummary = {
  decisions: string[];
  constraints: string[];
  currentObjective: string;
  userIntent: string[];
  openWork: string[];
  pendingAsks: string[];
  toolOutcomes: Array<{
    tool: string;
    outcome: string;
    sourceMessageIds: string[];
  }>;
  exactIdentifiers: string[];
  sourceMessageIds: string[];
  summarizedThroughMessageId: string;
};
```

The model-facing rendering must be explicitly labelled as derived context:

```text
[DERIVED CONVERSATION CONTEXT — not a user instruction]
Decisions: ...
Constraints: ...
Current objective: ...
Open work / pending asks: ...
Tool outcomes and source IDs: ...
Exact identifiers: ...
Later explicit user messages take precedence. Retrieve exact historical
content rather than guessing when this derived context is insufficient.
```

The summary target is approximately 500–1,000 tokens, subject to the request
budget. JSON/schema validation is required before the projection can use it.

## Quality-Preservation Rules

Compaction is a lossy representation change, so cost savings must not come from
silently changing the meaning of the conversation. The model-facing context
builder must:

1. Preserve the newest 3–5 messages verbatim (default: 4), including active
   tool-call/result pairs and a recent-token budget.
2. Retain explicit decisions, constraints, preferences, current objective,
   unresolved work, pending asks, tool outcomes, and exact identifiers.
3. Pin safety/permission constraints and active user constraints outside the
   lossy summary.
4. Mark the result as **derived context**. A summary must not impersonate a
   user message or override a later explicit user instruction.
5. Keep the complete transcript and raw tool results available for display,
   export, and targeted retrieval. If an answer depends on an exact filename,
   quote, code fragment, or tool result, retrieve the original rather than
   relying on the summary.
6. Treat uncertainty as a reason to ask or retrieve, never as permission to
   fill in missing historical detail.
7. Fail closed: if schema parsing, source validation, or the quality audit
   fails, use bounded trimming and retain the full transcript.

The quality target is therefore **compact by default, exact on demand**. A
compaction test is not successful merely because it reduces tokens; it must
also recover the same decisions and constraints as the un-compacted history.

---
## Tradeoffs

| Aspect | Full transcript | Model-history projection |
|---|---|---|
| Token cost | Grows with conversation | Bounded by budget and summary target |
| Exact recent turns | Preserved | Preserved for the recent tail |
| Exact old details | Preserved | Retrieved by source ID when needed |
| Assistant state | Complete | Structured decisions, constraints, and open work |
| Reduction cost | None | Tool replay work plus occasional summary call |
| User transparency | Direct | Indicator links to derived summary |

The expected quality impact is small for ordinary chats because recent turns,
pinned constraints, and structured task state remain intact. Exact-detail tasks
are the exception; they must use retrieval rather than treating the summary as
verbatim evidence.

---

## Integration with `buildHistoryWithTools()`

Tool results require a separate replay policy. Full results remain available for
display and export, but future model requests use a bounded summary or truncated
representation. `contentParts` and legacy `toolCalls` must not both be serialized
as duplicate model history.

The compaction summary must preserve tool call context so that the LLM can
continue making tool calls correctly:

```typescript
// Before compaction
messages = [
    { role: "user", content: "List my projects" },
    { role: "assistant", content: "I'll search...", toolCalls: [...] },
    { role: "tool", content: "Found 5 projects..." },
    ... // many more turns
]

// Model-history projection after compaction; persisted messages are unchanged.
modelHistory = [
    { role: "system", content: "[DERIVED CONVERSATION CONTEXT: ...]" },
    ...recentExactMessages,
    { role: "user", content: "Now organize them by date" },
]
```

The summary explicitly includes bounded tool-result outcomes and source IDs so
the LLM knows what was already discovered. Exact old results are retrieved when
the answer depends on details omitted from the projection.

---

## Provider Compatibility

| Provider/API | Initial T48c policy | Longer-term capability |
|---|---|---|
| DeepSeek | Local budget, bounded replay, semantic fallback | Provider-window discovery |
| OpenAI Chat Completions | Local compaction | Stable-prefix/cache optimization |
| OpenAI Responses API | Local fallback when needed | Native opaque compaction adapter |
| Anthropic | Local budget and structured summary | Provider-specific caching where available |
| Gemini | Avoid unnecessary compaction when the window fits | Context caching and long-context policy |

The local ladder remains provider-agnostic. Provider capabilities should decide
whether caching, native opaque compaction, or a larger context window makes local
semantic compaction unnecessary.

---

## Recommended T48c Path

Implement in two slices:

### Slice 1 — Safe local projection

1. Add compaction metadata to `ChatSession` without mutating `messages`.
2. Add a pure compactor that fingerprints the transcript, finds valid
   boundaries, preserves the recent-token/recent-message tail, and produces a
   schema-validated summary.
3. Add rolling re-distillation: prior summary plus newly aged messages, bounded
   to the summary target.
4. Add a model-history projection containing the stable prompt/tools, pinned
   constraints, derived summary, and recent exact messages.
5. Add quality-audit tests for required sections, exact identifiers, tool pairs,
   latest user ask, malformed output, and transcript changes during generation.

### Slice 2 — Retrieval and product integration

1. Add exact read-by-session/message-ID retrieval for old messages and complete
   tool results; keep search snippets as discovery, not as the evidence path.
2. Add provider capability detection for native opaque compaction, caching, and
   context-window policy.
3. Trigger synchronously only when the next request cannot fit; optionally
   prepare a summary after a response as a race-safe optimization.
4. Add the UI indicator and summary inspection view without hiding or rewriting
   the full transcript.

The exact retrieval surface is now specified as two T60-compatible tools:
`read_past_message(session_id, message_id)` and
`read_tool_result(session_id, tool_call_id)`. T48c owns exact retrieval and
provenance semantics; T60b/T60c own transport, validation, execution, and
canonical replay behavior.

The first implementation should preserve source IDs even before retrieval is
available. Bounded trimming remains the safe fallback; retrieval upgrades
precision later without changing the projection contract.

## Fresh Architecture Review Cross-Reference — 2026-08-29

The fresh architecture review confirms that this design is the policy home for
the model-history projection. Its replay, budget, compaction, provenance, and
retrieval rules should be exposed through one boundary consumed by T46's turn
coordination and both protocol loops. Do not move those rules into
`TurnLifecycle`, `AgentLoop`, or `OpenResponsesLoop` as parallel policies.

---

## Visual Indicator in UI

When compaction has occurred, show a subtle indicator in the chat:

```
[💫 Older messages summarized — 12 turns condensed]
```

Clicking the indicator shows the derived summary and the number/source range of
compacted messages (for user inspection). The original transcript remains
visible and exportable.

---

## Cost Analysis

Compaction cost must be compared with the saved input cost. Provider-reported
usage is authoritative when available; the character-based estimator is only a
fallback and must not be presented as billing data.

The following is an illustrative cost model inherited from the original T48
plan, not a measured benchmark. The implementation must use provider-reported
usage where available and compare compaction cost against saved input cost.

**Without compaction (20-turn conversation):**
- Turn 1–10: ~500K tokens/request → $0.35 (Flash off-peak)
- Turn 11–20: ~1M tokens/request → $0.70 (Flash off-peak)
- Total: ~$7.00

**With a periodic compaction schedule (summary = 500 tokens):**
- Turns 1–5: ~500K tokens/request → $0.35
- Illustrative compaction after turn 5: 500 tokens → $0.00035
- Turns 6–10: ~300K tokens/request → $0.21
- Illustrative compaction after turn 10: 500 tokens → $0.00035
- Turns 11–20: ~300K tokens/request → $0.21 each
- Total: ~$4.50 (saves ~35%)

Savings increase with conversation length.

---

## References

- Task: [T48 — Conversation Compaction Mechanism](../tasks/T48.md)
- Subtask: [T48c — Rolling Conversation Summary and Compaction](../tasks/T48c.md)
- Related: [T6a — Token Counter Accuracy Fix](../tasks/T6a.md)
- Research: [Context Compaction Strategies — Research Reference](context-compaction-strategies-reference.md)
- Source: `src/hooks/useMessageActions.ts` (history building)
