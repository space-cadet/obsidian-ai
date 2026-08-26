# Context Optimization Benchmark Harness

*Created: 2026-08-26 20:23 IST*

## Purpose

Standalone benchmark harness for measuring and optimizing token usage in
obsidian-ai chat sessions. Runs outside the Obsidian runtime, enabling rapid
iteration on compaction strategies, budget policies, and tool-result handling.

This document connects to **T64: Context Optimization Benchmark Harness** and
satisfies the T48c acceptance item for a "diagnostic build/test path that
records summary metadata and test markers without exposing ordinary
conversation content by default."

## Why Outside Obsidian?

- **Speed**: No plugin reload, no DOM, no React lifecycle — pure Node.js
- **Repeatability**: Fixtures are deterministic; same input → same measurement
- **Cost control**: Level 1 requires zero API calls; Level 2 is optional
- **Isolation**: Test context-building logic without Obsidian's `App`, `Vault`, or `Workspace` dependencies

## Architecture

```
benchmarks/
├── fixtures/
│   ├── coding-session-50-turns.json      # Long coding session, many file reads
│   ├── research-session-30-turns.json    # Multi-tool research, web searches
│   └── attachment-session-20-turns.json  # Images, PDFs, large pastes
├── strategies/
│   ├── slidingWindow.ts
│   ├── toolEliding.ts
│   ├── budgetCap.ts
│   ├── compaction.ts
│   └── deduplication.ts
├── context-benchmark.ts                  # Level 1: no API calls
├── live-benchmark.ts                     # Level 2: real provider calls
└── report.ts                             # Formatted output
```

The harness imports directly from the plugin source:

```typescript
import { buildBudgetedHistory } from "../src/context/contextBudget";
import { buildHistoryWithTools } from "../src/lib/historyBuilder";
import { estimateTokens } from "../src/context/tokenEstimator";
import { planCompaction } from "../src/context/semanticCompaction";
```

No Obsidian runtime is required — these modules are pure TypeScript.

## Fixture Format

Anonymized session exports containing only what's needed for context
reconstruction:

```typescript
interface SessionFixture {
  name: string;
  description: string;
  messages: ChatMessage[];        // Persisted transcript (full fidelity)
  systemPrompt: string;           // System prompt used
  tools: ToolDefinition[];        // Tool schemas
  settings: {
    maxContextMessages: number;
    contextBudget: number;        // Request token budget
    responseReserve: number;
    preserveRecentMessages: number;
  };
}
```

Fixtures do **not** include user content verbatim — they are synthetic or
anonymized to avoid exposing private conversation content.

## Level 1: Context Construction Benchmark

Measures how different strategies affect the model-facing payload.

### Strategies Tested

| Strategy | What it does | Parameter |
|----------|-------------|-----------|
| **Baseline** | Full history, no truncation | — |
| **Sliding window** | Keep last N messages | `maxContextMessages: 10, 20, 50` |
| **Tool eliding** | Replace tool args/results with `[elided]` | `toolHistoryMode: "elide"` |
| **Budget cap** | Trim history to fit token budget | `contextBudget: 32k, 64k, 128k` |
| **Compaction** | Summarize old turns, keep recent verbatim | `trigger: 8000, release: 4000` |
| **Deduplication** | Don't re-send unchanged file content | Content hash comparison |

### Metrics Reported

- **Tokens per strategy**: estimated (chars/4) and optionally tiktoken-accurate
- **Messages dropped**: count and which turns
- **Tool results truncated**: how many, by how much
- **Quality indicators**: Are recent messages preserved? Is system prompt intact?
- **Time**: How long does each strategy take to compute?

### Running Level 1

```bash
cd benchmarks
npx tsx context-benchmark.ts --fixture fixtures/coding-session-50-turns.json
```

## Level 2: Live Token Benchmark (Optional)

Validates that estimates match reality by replaying fixtures through actual
API calls.

```bash
npx tsx live-benchmark.ts \
  --fixture fixtures/coding-session-50-turns.json \
  --provider openai \
  --model gpt-4o
```

Captures:
- Provider-reported `prompt_tokens` / `completion_tokens` / `total_tokens`
- Comparison: estimated vs. actual
- Per-tool-call overhead measurement

This costs money and should be used sparingly — primarily to validate the
estimator's accuracy, not for rapid iteration.

## Integration with Existing Workstreams

| Workstream | How T64 Helps |
|-----------|---------------|
| T48 (compaction) | Measures compaction quality: summary coverage, recent-message preservation |
| T48a (budget builder) | Validates budget trimming behavior across different window sizes |
| T48d (usage display) | Provides ground-truth token measurements to reconcile estimates |
| T6a (token accuracy) | Compares `estimateTokens()` against provider-reported usage |
| T60d (search defaults) | Measures impact of lowering `search_notes` default limit |

## Acceptance Criteria

See `memory-bank/tasks/T64.md` for full acceptance criteria.

## Open Questions

1. Should fixtures be auto-generated from real sessions (anonymized) or hand-crafted?
2. Should Level 2 use the same provider as the user's config, or test multiple?
3. How to measure "quality" — token count is easy, but does the model still reason correctly?
