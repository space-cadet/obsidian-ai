# Context Compaction Strategies — Research Reference

*Created: 2026-08-23 04:24:00 IST*
*Research reviewed: 2026-08-23*

This document records the broader context-management strategies reviewed while
planning T48c. It intentionally includes approaches that are not part of the
initial Obsidian AI implementation, so future design work does not need to
repeat the survey.

## Executive Summary

There is no single best compactor. Current systems combine several controls:

1. Keep stable instructions and reusable prefixes intact.
2. Bound or clear old tool results before applying semantic summarization.
3. Summarize only when token pressure requires it, with hysteresis.
4. Preserve recent turns and tool-call/result integrity.
5. Keep the complete transcript in an addressable archive.
6. Retrieve exact historical material when a summary is insufficient.
7. Keep safety constraints, active objectives, and permissions outside lossy
   context.

The strongest general pattern for Obsidian AI is therefore:

> Stable system/tools prefix + pinned constraints + compact rolling task state
> + newest exact turns + addressable archive.

## Strategy Catalogue

### 1. Provider-native opaque compaction

OpenAI's Responses API exposes a compaction operation that returns a compacted
context containing an opaque compaction item and retained high-value items. The
client carries the result forward rather than inventing its own portable summary
format. This is useful for long-running, tool-heavy agents, but it is provider
and API specific; it cannot replace the local fallback for stateless providers.

**Potential use for T48:** add a provider-compaction capability adapter later.
Do not make the local human-readable summary the only abstraction.

### 2. Semantic selective summarization

The Anthropic guidance emphasizes preserving architectural decisions,
unresolved bugs, implementation details, and current task state while removing
redundant dialogue. A structured external note can carry durable state without
pretending that every old sentence remains available.

**Potential use for T48:** structured decisions, constraints, pending work,
user intent, tool outcomes, and exact identifiers. Avoid uniform sentence-by-
sentence summarization.

### 3. Tool-result clearing and bounded replay

Large tool results are often the first safe target for reduction. Old results can
be head/tail trimmed or replaced with a bounded representation containing an
explicit omission marker. Recent active tool interactions should remain exact,
and tool calls must stay paired with their results.

**Potential use for T48:** T48b's bounded canonical replay is the first rung of
the compaction ladder; semantic summarization comes after it.

### 4. Token-aware trimming and checkpoints

LangGraph presents trimming, deletion, summarization, and checkpoint/retrieve
as separate controls. Token thresholds and valid message boundaries matter more
than a fixed message count. A checkpoint lets the application rebuild the model
context without destroying the user-visible history.

**Potential use for T48:** make the existing request-budget builder the source
of truth, and treat turn count only as a fallback.

### 5. Long-context and cache preservation

Google's long-context guidance cautions against compacting merely because a
conversation is long. When the provider has sufficient capacity, retaining
relevant context may be better than lossy summarization. Context caching and a
stable common prefix can reduce repeated input cost; common content belongs at
the beginning and the new query at the end.

**Potential use for T48:** provider capabilities should express context limits,
caching, and whether compaction is worthwhile. A large window is compaction-
resistant, not automatically compaction-free.

### 6. Hierarchical and addressable memory

MemGPT separates a small working memory from an archival tier. Recent research
has sharpened this into addressable historical observations: replace old tool
observations with stable identifiers or citations, then retrieve the exact
archived observation on demand instead of relying only on a semantic summary.

**Potential use for T48:** retain source message and tool-result IDs in the
summary, then add exact read-by-ID retrieval as a separate capability.

### 7. Safety-aware compaction

Recent work treats compaction as a safety boundary because a lossy summary can
erase a permission, policy constraint, or active user requirement. The system
should pin these items in a non-compacted channel and test their survival after
every compaction cycle. A failed audit should preserve the old model context or
fall back to bounded trimming; it should not install an unvalidated summary.

**Potential use for T48:** mark summaries as derived context, keep later
explicit user messages authoritative, and ask or retrieve rather than guess.

## OpenClaw's Built-in Strategy

The installed OpenClaw runtime was inspected directly on 2026-08-23. The
runtime observed was OpenClaw 2026.6.34 using the built-in legacy context
engine, with safeguard compaction and no optional context-pruning engine
configured.

Observed configuration included:

- `compaction.mode: safeguard`
- `reserveTokens: 31,072`
- `reserveTokensFloor: 20,000`
- a dedicated compaction model: `deepseek/deepseek-v4-flash`
- enabled pre-compaction memory flush with an 8,000-token soft threshold

The observed pipeline is:

1. Trigger on token pressure at the context-window boundary, not primarily on
   turn count; retry after a provider context-overflow error.
2. Run a silent durable-memory flush near compaction. This is separate from the
   conversation summary.
3. Choose a recent-token cut point and preserve recent turns, extending the
   preservation to matching tool results.
4. Shift boundaries to keep assistant tool calls paired with their results. If
   a large turn must be split, summarize its prefix separately and retain the
   suffix.
5. Summarize in token-bounded chunks and re-distill an existing summary with
   newly aged messages rather than appending summaries forever.
6. Require structured safeguard content covering decisions, open TODOs,
   constraints/rules, pending user asks, and exact identifiers such as paths,
   URLs, IDs, hashes, dates, and times.
7. Audit required sections, identifier preservation, and representation of the
   latest ask; retry generation once by default when the audit fails.
8. Fail closed when safe summarization cannot be completed.
9. Persist a compaction checkpoint in the JSONL transcript while rebuilding
   model-visible context from the checkpoint plus the recent tail.
10. Prune old tool results separately in memory: soft head/tail trimming first,
    then hard clearing, without rewriting the transcript.

OpenClaw's legacy engine preserves the transcript but does not itself provide a
general read-message-by-ID retrieval API. Optional context engines can add
search, description, and expansion capabilities.

## Approaches Not Chosen for Initial T48c

- **Fixed turn-count replacement:** too insensitive to prompt/tool size and
  can compact a small but important conversation or fail on a large one.
- **Replacing the persisted/UI message array:** destructive from the user's
  perspective and makes export/history inaccurate.
- **A single ever-growing rolling summary:** accumulates drift and loses source
  boundaries; use bounded re-distillation instead.
- **Summary-only historical memory:** cannot reliably reproduce exact filenames,
  code, quotes, or tool output; add addressable retrieval.
- **Always-on background compaction:** unnecessary work and possible races;
  background preparation is an optimization, not a correctness requirement.
- **Provider state as the universal solution:** OpenAI Responses statefulness
  does not help stateless DeepSeek, Anthropic, or Gemini requests.
- **Compaction as a substitute for tool replay limits:** old tool output should
  be bounded independently before semantic summarization.
- **Unvalidated model-generated summaries:** never install malformed or
  constraint-dropping output; use bounded trimming as the safe fallback.

## Sources

- [OpenAI Responses API compact method](https://developers.openai.com/api/reference/java/resources/responses/methods/compact)
- [OpenAI: Equip Responses API with a computer environment](https://openai.com/index/equip-responses-api-computer-environment/)
- [Anthropic: Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [LangGraph: Add memory](https://docs.langchain.com/oss/python/langgraph/add-memory)
- [Gemini: Long context](https://ai.google.dev/gemini-api/docs/long-context)
- [Gemini: Context caching](https://ai.google.dev/gemini-api/docs/caching)
- [MemGPT paper](https://arxiv.org/abs/2310.08560)
- [ARC addressable historical-observation preprint](https://arxiv.org/abs/2607.25066)
- [Compaction safety-boundary preprint](https://arxiv.org/abs/2606.22528)
- [OpenClaw compaction concepts](https://github.com/openclaw/openclaw/blob/main/docs/concepts/compaction.md)
- [OpenClaw session-management compaction reference](https://github.com/openclaw/openclaw/blob/main/docs/reference/session-management-compaction.md)
- [OpenClaw session pruning](https://github.com/openclaw/openclaw/blob/main/docs/concepts/session-pruning.md)
- [OpenClaw context engines](https://github.com/openclaw/openclaw/blob/main/docs/concepts/context-engine.md)

## Relationship to T48c

This is the broad reference. The implementation decision is recorded in
`conversation-compaction-design.md`; T48c should begin with the local,
provider-agnostic ladder and leave provider-native opaque compaction and exact
historical retrieval as explicit extension points.
