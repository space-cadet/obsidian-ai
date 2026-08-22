# Conversation Compaction Design
*Created: 2026-08-19 13:31:15 IST*
*Last Updated: 2026-08-23 02:02:32 IST*

## Overview

Automatic summarization of old conversation turns to reduce per-request token
usage. After N turns, older messages are replaced with a condensed summary,
reducing the payload sent on every subsequent API call.

The revised design is token-budget driven: turn count is only a fallback. The
full transcript remains available to the user, while request construction uses
a bounded model-history view.

**Motivation**: DeepSeek investigation showed 892K cache hit tokens per request
after 10-turn conversations. Compaction can reduce this by ~80% for long
conversations while preserving essential context.

---

## Trigger Conditions

Compaction fires when **either** condition is met:

1. **Token threshold**: the serialized request exceeds the available context
   budget after system, tools, current input, and response reserve are counted.
2. **Turn threshold**: `messages.length >= compactionTurnThreshold` (fallback).

The check runs after each successful assistant response (before the next user
message is processed).

---

## Compaction Algorithm

```
Input: messages[] (full conversation history)
       keepRecent = 3 (configurable, default 3)

1. Build a request budget and determine compaction window:
   toSummarize = messages[0 : -keepRecent]
   keepAsIs = messages[-keepRecent:]

2. Generate summary:
   summaryPrompt = buildCompactionPrompt(toSummarize)
   summary = await llm.summarize(summaryPrompt)
   // Uses fast/cheap model (e.g., DeepSeek-V4-Flash)

3. Replace history:
   compactedMessages = [
       { role: "system", content: "[Prior conversation summary: " + summary + "]" },
       ...keepAsIs
   ]

4. Update model-history state while retaining the full display transcript:
   messagesRef.current = compactedMessages
```

---

## Summary Format

The summary is structured markdown with these sections:

```markdown
## Key Decisions
- User asked to create a note about X
- Agent suggested Y approach, user approved

## Tool Results
- read_note("Projects.md"): found project list
- create_notes(["Note A", "Note B"]): 2 created, 0 skipped

## User Intent
- User is organizing their vault with project notes
- Wants automated tagging system

## Open Questions
- User asked about Z but didn't get a clear answer
```

---
## Tradeoffs

| Aspect | Full History | Compacted History |
|---|---|---|
| Token cost | High (grows linearly) | Low (bounded by summary size) |
| Exact tool call details | Preserved | Lost (summarized as bullet) |
| Assistant "memory" | Perfect | Good for key facts, fuzzy on details |
| Summarization cost | None | One extra API call per compaction |
| User transparency | Clear | Needs visual indicator in UI |

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

// After compaction
messages = [
    { role: "system", content: "[Prior conversation summary: ...tool results...]" },
    { role: "user", content: "Now organize them by date" },
]
```

The summary explicitly includes tool result summaries so the LLM knows what
was already discovered.

---

## Provider Compatibility

| Provider | Compaction Needed? | Notes |
|---|---|---|
| DeepSeek | ✅ Yes | Stateless API, sends full history every time |
| OpenAI (Chat Completions) | ✅ Yes | Stateless, sends full history |
| OpenAI (Responses API) | ⚠️ Partial | Stateful, but only available for OpenAI |
| Anthropic | ✅ Yes | Stateless, sends full history |
| Gemini | ✅ Yes | Stateless, sends full history |

Compaction is provider-agnostic and benefits all users except those on
OpenAI Responses API with stateful sessions.

---

## Visual Indicator in UI

When compaction has occurred, show a subtle indicator in the chat:

```
[💫 Older messages summarized — 12 turns condensed]
```

Clicking the indicator shows the full summary text (for user inspection).

---

## Cost Analysis

Compaction cost must be compared with the saved input cost. Provider-reported
usage is authoritative when available; the character-based estimator is only a
fallback and must not be presented as billing data.

**Without compaction (20-turn conversation):**
- Turn 1–10: ~500K tokens/request → $0.35 (Flash off-peak)
- Turn 11–20: ~1M tokens/request → $0.70 (Flash off-peak)
- Total: ~$7.00

**With compaction (every 5 turns, summary = 500 tokens):**
- Turns 1–5: ~500K tokens/request → $0.35
- Compaction at turn 5: 500 tokens → $0.00035
- Turns 6–10: ~300K tokens/request → $0.21
- Compaction at turn 10: 500 tokens → $0.00035
- Turns 11–20: ~300K tokens/request → $0.21 each
- Total: ~$4.50 (saves ~35%)

Savings increase with conversation length.

---

## References

- Task: [T48 — Conversation Compaction Mechanism](../tasks/T48.md)
- Related: [T6a — Token Counter Accuracy Fix](../tasks/T6a.md)
- Source: `src/hooks/useMessageActions.ts` (history building)
