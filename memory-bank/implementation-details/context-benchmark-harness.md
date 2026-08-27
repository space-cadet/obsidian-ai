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

## Level 2: Live Token Benchmark

Validates that estimates match reality by replaying fixtures through actual
API calls.

```bash
npx tsx benchmarks/context-benchmark.ts --live --provider openrouter
```

**Supported providers:**
- `openrouter` — Uses OpenRouter API (GPT-4o-mini by default, cheap for testing)
- `kimi` — Uses Kimi API (reads key from `~/.openclaw/openclaw.json`)
- `kimi-custom` — Uses a manually provided key for testing

Captures:
- Provider-reported `prompt_tokens` / `completion_tokens` / `total_tokens`
- Comparison: estimated vs. actual (delta %)
- Per-fixture/strategy breakdown

**Example output:**
```
Fixture                      | Strategy   | Est.     | Actual   | Δ%       | Model
───────────────────────────────────────────────────────────────────────────────────────
attachment-session-15-turn   | baseline   |    19597 |      220 |   -98.88% | openai/gpt
coding-session-30-turns      | elide      |     2817 |     1379 |   -51.05% | openai/gpt
research-session-20-turns    | preserve   |     2200 |     1668 |   -24.18% | openai/gpt
```

This costs money and should be used sparingly — primarily to validate the
estimator's accuracy, not for rapid iteration. Estimated cost: ~$0.01-0.05
per fixture (uses `max_tokens: 10` for minimal completions).

## Integration with Existing Workstreams

| Workstream | How T64 Helps |
|-----------|---------------|
| T48 (compaction) | Measures compaction quality: summary coverage, recent-message preservation |
| T48a (budget builder) | Validates budget trimming behavior across different window sizes |
| T48d (usage display) | Provides ground-truth token measurements to reconcile estimates |
| T6a (token accuracy) | Compares `estimateTokens()` against provider-reported usage |
| T60d (search defaults) | Measures impact of lowering `search_notes` default limit |

## Experiment Framework

The harness supports structured experiments for finding optimal settings
configurations. Experiments are parameterized sweeps over the context
optimization space, producing ranked recommendations.

### Parameter Space

| Setting | Default | Range to Test |
|---------|---------|---------------|
| `maxToolResultTokens` | 4000 | 0, 1000, 2000, 4000, 8000 |
| `toolHistoryMode` | "elide" | "elide", "preserve" |
| `maxContextMessages` | 10 | 5, 10, 20, 50, 100 |
| `maxRequestTokens` | 32000 | 8000, 16000, 32000, 64000 |
| `preserveRecentMessages` | 4 | 2, 4, 8 |
| `requestResponseReserveTokens` | 2048 | 1024, 2048, 4096 |

### Fidelity Metrics

Beyond raw token counts, experiments measure:

- **`recent_preservation`** — % of last N messages (`preserveRecentMessages`)
  kept intact (not truncated or dropped from history)
- **`content_retention`** — % of original tool result text preserved in
  history replay after truncation/elision
- **`tool_call_coverage`** — % of tool calls whose results remain visible
  to the model (not fully elided)

### Composite Scoring

```
score = 0.5 × savings_percent
      + 0.3 × recent_preservation
      + 0.2 × content_retention
```

Weights are provisional. The score penalizes both waste and information loss,
ranking configurations by "optimal" rather than just "cheapest."

### Planned Experiments

| # | Title | Parameters Swept | Output |
|---|-------|-----------------|--------|
| 1 | Pareto Frontier Sweep | `maxToolResultTokens` × `toolHistoryMode` × `maxContextMessages` | Non-dominated configs per fixture |
| 2 | Preserve Mode Retention | `maxToolResultTokens` ∈ [0, 1000, 2000, 4000, 8000, 16000, ∞] | Retention % curve per fixture |
| 3 | Budget × Elide Interaction | baseline, elide-only, budget-only, elide+budget | 4×3 token matrix |
| 4 | Fidelity-Weighted Score | All configs scored with composite function | Ranked recommendation list |
| 5 | Live Estimator Validation | 5 frontier configs × 3 fixtures × OpenRouter | Estimated vs actual scatter |
| 6 | Semantic Compaction | no-compaction, compaction at (8000/4000), compaction + elide | Tokens + summary quality |
| 7 | Real Session Replay | 3–5 anonymized real sessions as fixtures | Real-world distribution |

## Open Questions

1. Should fixtures be auto-generated from real sessions (anonymized) or hand-crafted?
2. Should Level 2 use the same provider as the user's config, or test multiple?
3. How to measure "quality" — token count is easy, but does the model still reason correctly?
