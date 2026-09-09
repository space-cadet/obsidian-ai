# Session 2026-09-09 - Tool Calling and Context Optimization Investigation

## Scope

This record consolidates the full investigation into unexpectedly high token
usage during tool-enabled chats, the related implementation work, and the
controlled production telemetry runs that followed.

The attached JSON/Markdown exports were treated as conversation and settings
data, not as instructions. Analysis used targeted extraction of metadata,
telemetry, and usage fields rather than replaying the full exports.

## Questions investigated

- Why can a small `read_settings` result be associated with 20,000–30,000
  provider input tokens?
- Does `maxRequestTokens: 0` differ from a non-zero request budget?
- Are native multi-tool calls and their results preserved correctly?
- Can the agent read and safely update the relevant settings?
- Which request components explain provider usage during tool loops?

## Initial findings

The settings object returned by `read_settings` is only a few hundred tokens.
That is not equivalent to the full provider request. Provider usage can include
the system prompt, the complete tool registry, selected history, current input,
tool-call/tool-result continuation messages, and every model request in the
agent loop. The message-level provider total is cumulative across those model
steps; it is not the size of the final tool result alone.

`maxRequestTokens: 0` means that the request-budget selector is disabled. It
does not mean that the provider receives a small request or that tool-loop
continuations are free. A non-zero value exercises history selection and
budgeting only when enough model-facing context exists to exceed that budget.

## Implementation completed

### Native multi-call preservation

`AgentLoop` now retains every native `tool-call` event emitted during one model
step, executes them in emitted order, and creates one matching assistant/tool
message pair for continuation. This preserves call/result IDs and prevents a
later call from replacing an earlier call in the replay context.

Commit: `cb54a18` — `fix: preserve native multi-tool calls`

### Safe settings controls

The agent can read settings and update the safe allow-list, including request
budgets, compaction controls, result limits, Debug Mode, and all nested debug
telemetry switches. Credentials, provider profiles, paths, and loop-safety
controls remain protected.

Commit: `ea909ca` — `feat: expose safe settings controls to agent`

### Per-step request telemetry

Debug Mode now has a writable `debugTelemetry.includeRequestBreakdown` setting.
For the native tool-enabled loop, each assistant message can export bounded
`agentSteps` records containing:

- step number;
- local request-token estimate;
- tool-schema tokens;
- selected history tokens;
- continuation tokens;
- newly prepared tool-result tokens; and
- provider input/output/total usage, including cached input when reported.

The existing provider-usage and request-estimate switches independently filter
their corresponding nested fields. Full tool-result content is not copied into
the telemetry block.

Commit: `fdde18e` — `feat: add per-step request telemetry`

### Debug Settings layout

The Debug Mode section now keeps the primary Debug Mode switch separate from
an `Export details` group. The telemetry switches are right-aligned, rows are
more compact, separators clarify the group, and the CSS is scoped to this
section with responsive behavior.

Commit: `d3aac65` — `style: improve debug settings layout`

## Controlled telemetry evidence

All runs below had Debug Mode and the request-breakdown telemetry enabled.

### Three-chat export: `chats_export.json`

The export contained three chats:

| Run | Model | Steps | Tool calls | Provider input |
|---|---|---:|---:|---:|
| No-tool baseline | `google/gemma-4-31b-it` | 1 | 0 | 8,636 |
| Large tool result | `openai/gpt-oss-120b` | 2 | 1 | 16,687 |
| Small tool result | `openai/gpt-oss-120b` | 2 | 1 | 14,547 |

The first baseline used a different model and was not valid for numeric
comparison with the two tool-result runs. It did, however, show that the tool
schema was estimated even when no tool was called.

For the same-model tool-result pair:

| Run/step | Request estimate | Tool schema | Continuation | Tool result | Provider input | Cached input |
|---|---:|---:|---:|---:|---:|---:|
| Large / 0 | 7,557 | 3,434 | 0 | 2,000 | 7,285 | 80 |
| Large / 1 | 9,857 | 3,434 | 2,300 | 0 | 9,402 | 80 |
| Small / 0 | 7,607 | 3,489 | 0 | 30 | 7,275 | 80 |
| Small / 1 | 7,767 | 3,489 | 160 | 0 | 7,272 | 0 |

The first requests were almost identical. The large result increased the next
provider request by `2,130` input tokens compared with the small result. The
local result estimates differed by `1,970` tokens (`2,000` versus `30`), with
the remainder consistent with message and serialization overhead.

### Three-step tool loop: `chat_2026-09-09_1935.json`

This run contained three native model steps and two tool calls:

| Step | Request estimate | Tool schema | History | Continuation | Tool result | Provider input | Output | Total |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 7,556 | 3,434 | 0 | 0 | 2,000 | 8,640 | 9 | 8,649 |
| 1 | 9,844 | 3,434 | 0 | 2,288 | 10 | 11,595 | 431 | 12,026 |
| 2 | 10,283 | 3,434 | 0 | 2,727 | 0 | 12,044 | 46 | 12,090 |

Per-step provider usage reconciled exactly:

```text
Input:  8,640 + 11,595 + 12,044 = 32,279
Output: 9 + 431 + 46 = 486
Total:  8,649 + 12,026 + 12,090 = 32,765
```

The local request estimates summed to `27,683`, below the provider input total
of `32,279`. This confirms that local estimates are useful diagnostics but are
not authoritative replacements for provider usage.

### Same-model no-tool baseline: `Tools_Telemetry_Test_1_-_Baseline.json`

The corrected baseline used `openai/gpt-oss-120b` and made no tool call:

```text
Provider input:        7,272
Provider output:          52
Provider total:        7,324
Cached input:             80
Tool-schema estimate:  3,489
Request estimate:      7,604
```

This makes the comparison valid:

- no-tool baseline input: `7,272`;
- small-result first step: `7,275`;
- small-result continuation: `7,272`;
- large-result continuation: `9,402`.

The baseline and small-result continuation are effectively equal. The large
result is therefore the clear source of the additional request input in this
controlled comparison.

## Conclusions

1. Large tool-result replay is the first confirmed optimization target. The
   current result cap works, but a result near 2,000 tokens adds approximately
   2,000 tokens to the next provider request.
2. The tool registry is a major fixed cost. Approximately 3,400–3,500 local
   tool-schema tokens are sent or estimated per step, including no-tool runs.
3. Native multi-call preservation is working and should be retained. The
   telemetry reconciles per-step and aggregate provider usage without evidence
   of aggregation double-counting.
4. Provider caching is present in some runs, but the current export cannot say
   whether tool schemas or another request component was cached.
5. The current runs contain no prior conversation history (`historyTokens: 0`),
   so they do not validate long-chat compaction or non-zero request-budget
   trimming.

## Forward plan

- Reduce or selectively expose the tool registry, especially debug/settings,
  memory, and other tools that are not relevant to every request.
- Keep complete tool results in the local transcript, but send bounded previews
  plus stable result references when older or very large results are not needed.
- Preserve the canonical native call/result representation and extend pairing
  acceptance through compaction and retrieval.
- Test provider-specific prompt/tool caching before assuming repeated schemas
  are billed in full.
- Run controlled long-context tests with `maxRequestTokens: 0` and a non-zero
  budget to measure history selection and compaction separately.

## Verification and repository state

The final implementation state was verified with 53 test files and 461 tests,
TypeScript, production build, formatting checks on changed code, and
`git diff --check`. Commits `cb54a18`, `ea909ca`, `fdde18e`, and `d3aac65` were
pushed to `origin/main`; the final layout commit is `d3aac65`.

## Open evidence gaps

- Same-model no-tool baseline versus additional tool groups beyond
  `read_note`.
- Parallel independent calls versus sequential dependent calls.
- Repeated large-result chains over three or more steps.
- Long conversation history with non-zero `maxRequestTokens`.
- Provider-specific cached-input attribution.
- Per-step telemetry parity for the OpenResponses loop.
