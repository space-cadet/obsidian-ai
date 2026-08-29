# Active Context

*Last Updated: 2026-08-29 22:58:00 IST*

### 2026-08-29 — T65: Three-tier memory system (late evening) 🔄

Implemented the three-tier memory architecture (core/staged/archive) with
score-based auto-curation. Core tier (50-200 entries) feeds the system prompt.
Staged tier holds new memories awaiting evaluation. Archive tier is search-only.

Key commits: `e32f8da` (budget wiring), `5367ea0` (nested settings),
`f536c5b` (plugin info), `39c7f33` (ThreeTierMemoryStore),
`f84323e` (memoryCoreSize UI).

Next: Wire `ThreeTierMemoryStore` into `buildSystemPrompt()`, add agent
curation tools (`evaluate_staged`, `cull_core`), implement TF-IDF index for
archive search, add auto-curation hooks.

### 2026-08-29 — T64d, T26: Live token validation and agentic-memory audit

The agentic-memory review found that the flat persistent memory foundation is
implemented: `MemoryStore`, persona loading, CRUD/search tools, audit logging,
duplicate pruning, optional session-end summarization, and explicit
`search_past_sessions` are present in source. The T26 record had stale wording
that treated some of these as entirely missing; it now distinguishes
implemented, unverified, and future work.

The clearest small follow-up is wiring the editable
`identityContextBudget` setting into `buildSystemPrompt()`. The hot/cold
`core.json` / `archive.json` architecture, ranked search, automatic memory
curation, proactive memory, phrase-based past-session injection, and peer
plugin bridges remain deferred design work. No source code changed in this
audit.

### 2026-08-29 — T64d expanded live token validation ✅

This separate session recorded the live benchmark run against OpenRouter with
`openai/gpt-4o-mini`. The expanded run completed 20 requests across four
fixtures and five strategies, including the missing deterministic compaction
projection. Provider-reported prompt usage was lower than the local estimate
in 18 requests; the average difference was -54.7%, ranging from -98.88% to
+18.54%. Provider-reported benchmark cost was $0.00628440.

T64d is complete with the per-request results, cost evidence, and
recommendation. Do not apply one global correction to `estimateTokens()` yet.
T48d should prefer provider usage when available and label local values as
estimates otherwise. The benchmark validates the compaction payload projection,
not the separate production summary-generation request. T46
provider-switching acceptance was not tested by this fixture run.

### 2026-08-29 — T62a automatic agent-mode preservation ✅

The selected automatic agent-mode preservation policy is implemented.
`src/context/modelHistory.ts` is now the shared
entry point for model-facing history: it applies replay mode, checks tool
pairing, applies the request budget, and returns the messages sent to the
model. Agent turns automatically use preserve mode; normal chat keeps its
configured setting.

`TurnLifecycle`, `AgentLoop`, and `OpenResponsesLoop` now use the shared
history path or its continuation helpers. The saved transcript is unchanged.
Verification passed: 45 test files / 381 tests, TypeScript, formatting, and
the production bundle. Full provider acceptance, pairing through compaction,
and exact historical retrieval remain open.

### 2026-08-29 — Fresh architecture review and implementation plan

The fresh read-only review examined the post-refactor source at `63bce58`; the
dated reports are archived under `memory-bank/architecture-reviews/`. The
documentation archive is now on `main` and `origin/main` at `a08430b`. The
four review targets are now small coordinators or adapters:
`ToolExecutor.ts` is 326 lines, `useMessageActions.ts` is 220 lines,
`api.ts` is 363 lines, and `main.ts` is 228 lines. The extracted handler,
turn, provider, history, streaming, registration, event, and storage modules
are present.

T46a is complete. T46 remains active only for provider-switching and real-
provider runtime acceptance. The review's non-blocking cleanup items remain:
the long executor setup, the temporary `__ambiguous` file property, the late
cancellation check, pagination documentation, and a few `any` casts.
`ChatApp.tsx` remains about 1,023 lines but is still treated as a composition
layer rather than a new T46 extraction target.

T48b/T48c local work is recorded in commit `b49ad7d`: shared tool replay
serialization, pairing checks, compaction response validation, source IDs,
derived-summary marking, and the T64b retention sweep. T64b is complete.
Exact historical retrieval, an inspectable compaction record, and provider or
plugin acceptance remain open.

Current plan: consolidate model-history policy behind one model-ready history
boundary under T48/T48a/T48b/T48c/T62a, then reassess whether `TurnLifecycle`
needs another extraction. Capability-construction cleanup remains with
T60/T60a, and sync decomposition remains deferred. No new task or subtask was
created.

### 2026-08-29 — T61 self-settings integration acceptance ✅

Completed T61. Added end-to-end tests through `ToolExecutor` covering
sanitized settings reads, the Developer mode gate, valid updates, automatic
saving, audit records, invalid values, and immutable keys.

- Full verification passed: 44 test files / 373 tests, TypeScript, formatting,
  and the production build.
- Developer mode remains the user-controlled gate; no separate confirmation
  prompt was added.

### 2026-08-29 — T60a/T60c safety and registry completion ✅

Completed both requested architecture-review follow-ups.

- T60a now uses the resolved tool descriptors for group-chat prompts and the
  pending approval card. Provider names, titles, risk, and preview styles come
  from the same descriptor captured for the pending call.
- Provider enablement and read-only availability are resolved through the
  shared registry filter. Native, OpenResponses, group-chat, and approval
  paths use the same resolved definitions.
- T60c now limits batch reads to eight at a time, serializes conflicting
  mutations by normalized target, and returns a content fingerprint from
  `read_note` for optional stale-write checks.
- Full verification passed: 43 test files / 369 tests and TypeScript.
- T46 remains active only for provider-switching and real-provider acceptance;
  the user confirmed that its tests pass.

### 2026-08-29 — Memory Bank task registry cleanup ✅

Reconciled `memory-bank/tasks.md` with the individual task records after the
2026-08-29 pull and review.

- Moved completed tasks out of the active table, including T8, T8a, T13b, T44,
  T46a, T49, T55, T56, T57a–T57c, T58a–T58c, T60b, T60d, T60f, and T62.
- Kept T46 active only for provider-switching and real-provider acceptance.
- Recorded T61 as in progress: the implementation exists, but integration
  tests and final acceptance are still open.
- Preserved T60e and T18a as paused tasks and corrected the registry totals.
- No source code was changed.

### 2026-08-28 — T13b: Tool Call Result Display Consistency ✅

Fixed `ToolCallNotification.tsx` to show meaningful detail for all 18 built-in
tools instead of generic `"completed successfully"` text.

**Implementation:**
- Added explicit `web_search` rendering with result count header
- `search_note_content` shares matches table rendering with `search_notes`
- Generic fallback chain: `content` → `path` → `matches` → success
- All future tools returning these fields auto-render without code changes

**Commits:**
- `abde5df` — `(fix)T13b: Add smart tool result display, fix auto-sync toggle`
- `84b4ad9` — `(fix)T13b: Enhance tool result display + document exact behavior`

**Reference:** `memory-bank/implementation-details/agentic-tool-calling.md` → "Tool Call Notification Display — T13b"

### 2026-08-28 — Mastra SDK Evaluation 📋

Evaluated Mastra (by Vercel team) as alternative to Vercel AI SDK for workflow
orchestration with human-in-the-loop approval.

**Key features:** `suspend()`/`resume()`, state snapshots, type-safe workflows
**Verdict:** Not migrating. Current `PendingToolCard` + manual loop achieves
the same pattern — just with more code. Revisit if workflow complexity grows
(multi-agent, branching, persistent state).

**Key insight:** Streaming "chunkiness" with Kimi/Gemini is provider-level
behavior (server-side buffering), not fixable by switching SDKs.

**Reference:** `memory-bank/implementation-details/ai-sdk-migration.md` → "Future Alternatives: Mastra"

### 2026-08-28 — T41 v1.4.1 Community Review Fixes

Released v1.4.1 to fix blocking Obsidian Community Review errors:
- `no-unsupported-api`: Replaced `app.loadLocalStorage/saveLocalStorage` with browser `localStorage`
- `no-static-styles-assignment`: Refactored ~49 inline styles to CSS classes
- Fixed release tag from `v1.4.1` to `1.4.1` (Obsidian requires exact match with manifest version)
- Review status: ✅ Passed

### 2026-08-28 — T46/T46a review closeout and merge

PR #7 (`T46: Reconcile orchestration decomposition`) was merged into `main`
as `975bb7e`. Review follow-ups routed agent-provider slash commands through
`runChatTurn()`, reused the turn `ToolExecutor` across manual approvals, and
formatted `turnLifecycle.ts`.

Added regression coverage for the slash-command route and approval-resume
executor reuse. Verification passed with 42 test files / 363 tests,
TypeScript, the production build, the changed-file Prettier check, and
`git diff --check`. Provider-switching and real-provider acceptance remain
runtime gates for T46.

### 2026-08-27 — T46/T46a reconciliation

The reconciliation branch keeps the main-branch `TurnLifecycle`, `api.ts`, and
`main.ts` decompositions and integrates the feature branch's decomposed
`ToolExecutor`, resolved registry, `ChatTurnCoordinator`, and `ChatTurnOutput`.
`useMessageActions.ts` is 217 lines; `ToolExecutor.ts` is 292 lines;
`api.ts` is 363 lines; and `main.ts` is 226 lines.

Fresh verification passed: 43 test files / 362 tests, TypeScript, and the
production build. Provider-switching and real-provider acceptance remain
runtime gates. The reconciliation branch was subsequently merged into `main`.

### 2026-08-27 — T46a turn output extraction

Added `ChatTurnOutput.ts` to collect text, tool calls, tool results, and
content parts without React or Obsidian services. The hook still owns visible
streaming updates, interruption display, and approval prompts.

`useMessageActions.ts` is now 1,252 lines. Verification passed: 43 test files,
362 tests, TypeScript, and the production build. The next boundary is the
remaining UI callback and approval lifecycle code; `api.ts` and `main.ts`
remain later phases.

### 2026-08-27 — T46a turn persistence extraction

Added `ChatTurnPersistence.ts` and moved completed assistant-message creation
and session-message updates out of the hook. `useMessageActions.ts` is now
1,302 lines. The hook still owns UI-specific interruption display, approval
state, and runtime cleanup.

Verification remains green: 42 test files, 360 tests, TypeScript, and the
production build. The next boundary is the remaining UI callback and approval
lifecycle work; `api.ts` and `main.ts` remain later phases.

### 2026-08-27 — T46a request preparation extraction

Added `src/agent/ChatTurnRequest.ts` on the architecture branch. It now owns
system-prompt creation, tool-history projection, request budgeting, attachment
message assembly, and the final model-message list. The hook supplies inputs
and keeps UI updates and persistence.

`useMessageActions.ts` is now 1,305 lines. Focused tests, the full 359-test
suite, TypeScript, and the production build pass. The next T46a work is to
move the remaining turn callbacks and persistence boundary out of the hook.

### 2026-08-27 — T46 capability domains split

The next T46 slice is complete on `feat/t46-architecture-decomposition`.
The temporary `ToolHandlers.ts` grouping has been replaced with separate
modules for note, bulk, discovery, vault, web, memory, session, and settings
work. `ToolHandlerContext.ts` supplies the shared Obsidian services.

`ToolExecutor.ts` is now 292 lines. Focused tool/provider tests, the full
359-test suite, TypeScript, and the production build all pass. The next step is
the T46a request-lifecycle extraction; `api.ts` and `main.ts` remain later
phases.

### 2026-08-27 — T46/T46a implementation branch

Implementation is in progress on `feat/t46-architecture-decomposition`, based
on `a15c47646e1141239b269c8f608331889b1b32df`.

- `ToolExecutor.ts` is now 265 lines and delegates to the resolved registry.
- `ToolResolver.ts` and note handlers own path lookup and note changes.
- `ToolHandlers.ts` temporarily contains the remaining capability areas and is
  the next physical split.
- `ChatTurnCoordinator.ts` runs native and OpenResponses turns through one
  React-independent entry point.
- Prompt and OpenResponses tools use the same resolved definitions as
  execution.
- Verification: 41 test files, 359 tests, TypeScript, production build, and
  focused coordinator/hook tests pass.

The hook remains 1,350 lines and still owns request preparation, history,
persistence, and approval state. `api.ts` and `main.ts` remain future phases.

### 2026-08-27 — T64b Experiment Run: Message Window Simulation

Added `maxContextMessages` simulation to harness and ran against grammar migration
fixture (real session JSON, 13 assistant turns).

**Results** (tiktoken estimator):

| MsgCap | Mode | ToolTok | Total | Peak | vs Unlimited |
|--------|------|---------|-------|------|-------------|
| ∞ | preserve | 64000 | 146,747 | 23,450 | — |
| 10 | preserve | 64000 | 85,110 | 11,217 | **-42%** |
| 10 | preserve | 4000 | 76,510 | 10,708 | -41% |
| 10 | elide | 4000 | 6,868 | 803 | -95% |

**Conclusion**: `maxContextMessages: 10` is the dominant token-reduction mechanism
for this workload. The `maxToolResultTokens` threshold matters only in preserve
mode (11% difference between 4000 and 64000). The T64a bug (preserve still
truncates at the threshold) has small impact at 64000.

**For T62a**: Data supports auto-preserve for agent mode — with a 10-message
cap, preserve mode stays bounded at ~85K total tokens, making the "cost" of
full retention acceptable.

---

### 2026-08-27 — Architecture Modularity Review and Refactoring Plan

The read-only architecture review and file-size scan identified responsibility
concentration, not merely large files. Current primary candidates are
`ToolExecutor.ts` (2,159 lines), `useMessageActions.ts` (1,533), `main.ts`
(1,785), and `api.ts` (765). `ChatApp.tsx` is 1,029 lines but remains mostly
a composition layer after T22.

Durable ownership is now recorded as follows:

- T60/T60a own capability semantics, resolved availability, and execution
  pipeline; T46 owns their physical decomposition.
- T46a owns the proposed extraction of a testable chat-turn coordinator from
  `useMessageActions.ts`.
- T48b/T48c/T62a own model-history representation, compaction/retrieval, and
  elision policy; T64a-T64d provide benchmark evidence for the decision.
- Sync decomposition remains speculative and no new sync task is created.

Implementation order: complete T60a ownership/projection work, decompose
`ToolExecutor.ts`, select and consolidate model-history policy using T64b,
extract the T46a turn coordinator, then reassess `api.ts` and `main.ts`.

### 2026-08-27 — T64: Experiment Framework Design Complete

**Current focus:** Implementing T64 benchmark experiment framework.

Experiment framework designed with 7 experiments to determine optimal context
optimization settings. Priority order:
1. **T64b** — Preserve mode content retention (addresses active T62a bug)
2. **T64a** — Pareto frontier sweep (most actionable config data)
3. **T64c** — Fidelity-weighted scoring (quality-aware rankings)
4. **T64d** — Live estimator validation (costs money, deferred)

**Next step:** Implement harness extensions for parameterized strategies and
fidelity metrics, then run Experiment 2 (preserve retention).

---

### 2026-08-26 — T62 Elision Regression Discovered

**Critical UX issue:** Default `"elide"` mode breaks multi-turn agent workflows.

When the agent calls `read_note` and gets 22k chars of content, the next turn's
history replay shows `[22749 chars, elided]` — the agent cannot see the content
it just read. This makes it impossible to do multi-step analysis, pattern
extraction, or any work that builds on previously retrieved information.

**Root cause:** T62 was designed for token reduction in user-facing chat replay,
not agentic workflows where the agent needs to retain tool result context across
turns.

**Workaround:** Switch `toolHistoryMode` to `"preserve"` in Settings → Chat Defaults.

**Fix needed:** Options include smarter elision (summaries instead of `[elided]`),
agent-mode bypass, lazy loading, per-session toggle, and per-file/pin control.
**Follow-up task created:** T62a (see `tasks/T62a.md`) with 6 candidate solutions
and open questions.

### 2026-08-26 — T64: Context Optimization Benchmark Harness planned

Created standalone top-level task T64 for a benchmark harness that measures
and optimizes token usage without requiring the Obsidian runtime. The harness
is deliberately cross-cutting (serves T48, T48a, T48d, T6a, T60d) and
standalone rather than a T48 subtask to keep boundaries clean.

**Level 1** (no API calls): reconstructs model-facing history from session
fixtures using the same `buildBudgetedHistory` / `buildHistoryWithTools` code
paths as the plugin. Tests sliding window, tool eliding, compaction, budget
caps, and deduplication strategies.

**Level 2** (optional, live API): replays fixtures through real provider calls
to validate estimate accuracy against provider-reported usage.

Updated: T48c.md (diagnostic path → T64), T48a.md (provider-window discovery
→ T64), T48d.md (ground-truth measurements → T64), tasks.md (+T64 entry).
New files: `tasks/T64.md`, `implementation-details/context-benchmark-harness.md`.

T60a/T60c/T60d implementation and review fixes are on the feature branch;
T60f pagination is complete. Live testing succeeded for note and session list
pagination. The project passes 37 test files / 320 tests, TypeScript, and the
production build. T60a and T60c retain incomplete criteria; the native AI SDK
loop's cumulative context resend remains a separate follow-up.

### 2026-08-26 — T60f Result Pagination Plan

The tool inventory found nine result-limited built-in tools without a reliable
next-batch mechanism. T60f now owns bounded pagination and continuations,
separately from T60d's token-efficient search defaults. No source changes have
been made for T60f.

### 2026-08-25 — T60e/T15 Provider-Adaptive Streaming Plan

The current `b56f806` runtime streams visible text but delays tool-call UI
callbacks until a response step ends, hides reasoning deltas, and does not
surface partial tool arguments. A separate-branch follow-up was approved:
`feat/t60e-provider-adaptive-streaming-ui`.

T60e owns the provider-neutral event/lifecycle contract across AI SDK and
OpenResponses; T15 owns the visual progress states and provisional tool cards;
T60c owns complete-argument validation and execution hardening. No source code
has changed for this plan.

### 2026-08-25 — Runtime Finding: search_note_content Performance Issue

During T60b fix validation, user ran the same prompt that caused the original
500k-token incident. The agent now correctly uses `search_note_content` instead
of 17 sequential `search_notes` calls, but the tool itself is too slow for large
vaults:

**Problem:** `search_note_content` is **O(n) over all markdown files** with:
- No persistent index — reads and scans every file every time
- No early termination — continues scanning after finding enough matches
- Sequential I/O — single-threaded file reads
- No timeout — can block for 10+ seconds on 800+ file vaults

**Behavior observed:** Agent calls `search_note_content` repeatedly with no
visible result (each call takes too long), likely causing overlapping scans.

**Code location:** `ToolExecutor.ts:searchNoteContent()` — the loop has no
`break` when `limit` matches are found, and no cap on files scanned.

**This is separate from T60b** — the protocol fix works, but the tool has a
latency/timeout issue. Validates the need for T60d and adds performance as a
dimension.

**No source changes made yet** — user requested diagnosis only.

---

### 2026-08-25 — T60b OpenResponses loop bug diagnosis

- Verified 3 protocol bugs in the OpenResponses loop that cause unbounded token
growth during multi-step tool chains:
  1. **Duplicate input submission:** `streamAgentResponse({ input, tools })` is
     inside the `while` loop, resubmitting the full conversation on every tool
     round (direct cause of 500k-token incident)
  2. **Discarded continuation ID:** `previousResponseId` accepted by
     `continueWithToolResult()` but never serialized to request body;
     continuations are sent as stateless requests
  3. **Continuation handler gap:** Post-continuation stream only handles
     text/finish/error, not function_call/function_call_done — multi-round
     chains fall back to broken outer loop
- Minimal fix spec ready: move initial request outside loop, store response_id,
  use continuations via `previous_response_id`, shared handler with full event
  support
- **Implementation complete** (commit `38c352d`):
  - `AgentApiManager.ts`: Added `previousResponseId` to `AgentApiOptions`,
    serializes to `body.previous_response_id`, passes through `continueWithToolResult()`
  - `OpenResponsesLoop.ts`: Moved initial request outside loop; shared
    `consumeStream` handler with full event support; stateful continuations;
    tools preserved
  - Tests: 3 new tests covering continuation serialization, multi-round tool
    chains, and budget sharing. All 301 tests pass. Build passes.
- Impact: ~140× token reduction for multi-step chains (500k → 3.6k tokens)
- Memory-bank updated: 7 task files, 1 implementation detail doc, 1 edit chunk,
  1 new proposed task (T60d for search defaults)

### 2026-08-25 — T60 review correction and next gate

- Commit `68dc915` added a bounded T60a registry adapter and projection tests;
  it did not connect the registry to `ToolExecutor`.
- T60a remains active and incomplete. T60b and T60c remain paused.
- The first implementation step is now a failing integration test: a registry
  definition for `read_note` must execute and return the same result contract
  as the existing `ToolExecutor` path.
- The registry must retain provider metadata through execution, use one
  shared availability filter, support explicit titles, and reject unusable
  provider schemas. Tests should check behavior rather than tool counts or
  boilerplate version values.
- No additional task or design documents are needed until this integration
  gate passes.

### 2026-08-25 — T60 tool-system architecture plan

- Audited 24 built-in tools, the read-only peer-provider registry, native AI
  SDK loop, OpenResponses loop, council mode, approval UI, dispatch, prompt,
  result formatting, and focused tests.
- Created T60/T60a–c for the canonical capability registry, cross-loop
  transport parity, and validated execution boundary.
- Kept approval/audit in T38, provider lifecycle in T39a, physical
  decomposition in T46, advanced vault tools in T17, and exact historical
  retrieval in T48c.
- Created T18a for bounded web-page retrieval. No source implementation began.
- Recommended first implementation: T60a registry plus focused AI SDK and
  OpenResponses serializer tests.

### 2026-08-23 — T48c implementation validation and current boundary

- T48 implementation is merged to `main` through PR #5 as `6a205b9`.
- The merged slice provides request budgeting, bounded tool-result replay,
  semantic compaction, configurable trigger/release values, asynchronous
  summarization, and a visible completion notice.
- Live validation used trigger `8,000`, release `4,000`, and four preserved
  recent messages. The fourth turn triggered compaction and the recovery prompt
  recovered all four seeded markers and representative requirements.
- T48c remains active for diagnostic instrumentation, schema/provenance and
  tool-pair validation, repeated compaction coverage, exact historical
  retrieval, and summary inspection/persistence. T48d remains active for
  provider-aware usage reconciliation.

### 2026-08-23 — T48c compaction-strategy research

- Created `context-compaction-strategies-reference.md` as a durable survey of
  provider, framework, research, and OpenClaw approaches.
- Updated `conversation-compaction-design.md` with the selected hybrid ladder,
  structured/audited summary contract, provider extension points, and two-slice
  implementation path.
- T48c remains active; this was a documentation-only update.

### 2026-08-23 — T48 context-efficiency decomposition

- Expanded T48 from turn-count compaction to token-budgeted model context.
- Created T48a-T48d for request budgeting, bounded tool replay, rolling
  compaction, and usage reconciliation.
- Full transcript remains available to the user; model history uses a bounded
  canonical representation and compact tool-result summaries.
- T6a remains complete and supplies provider-usage accounting; T48 owns
  context construction and compaction.
- Quality guardrails approved for implementation: preserve the newest 3–5 turns
  verbatim (default 4), structure decisions/constraints/open work/tool
  outcomes, label summaries as derived context, retrieve exact older material
  on demand, and ask rather than invent when the summary is insufficient.

---

*Last Updated: 2026-08-23 01:27:43 IST*

### 2026-08-23 — T58/T58c/T58d session closeout and rebuild audit

- Completed and verified the T58d implementation slice: planning-stage
  progress, stable operation rows, latest-active shimmer, persistent
  completion progress, dry-run plugin-data planning, and chat-session rebuild
  progress with scan reuse and bounded concurrency.
- Confirmed plugin data is included in normal sync and dry-run planning and is
  shown separately from chat sessions, while the chat-session SyncIndex remains
  session-only.
- Audited the Rebuild action and recorded that it does not rebuild plugin-data
  shared state. A separate plugin-data rebuild/reconciliation phase remains
  follow-up; do not merge plugin files into the session index.
- Verification remains: 29 test files / 269 tests, TypeScript, Prettier, and
  production build passed. Focused UI/rebuild tests and live acceptance remain.
- Implementation commit `13efc4e` and documentation commit `ae79c7e` are pushed
  to `origin/main`; this closeout adds only Memory Bank documentation changes.

### 2026-08-23 — T58 task ID migration and approved progress/rebuild plan

- Restored T43 as the original Multi-User and Agent Chat task because that is
  its historical meaning in the task registry and Git history.
- Moved the integrated sync UI records to the canonical T58 namespace:
  T58, T58a, T58b, and T58c. The old T43a-c files now point to their renamed
  records so historical links remain usable.
- Created T58d to track the approved unified progress, dry-run plugin-data
  planning, stable operation rows, latest-item shimmer, persistent completion
  state, rebuild progress, conflict status, and rebuild performance work.
- No source code was changed; implementation and real-host acceptance remain
  open.

### 2026-08-23 — T58d implementation slice

- Added a shared sync progress contract with explicit planning, syncing,
  rebuilding, completion, and error phases.
- Sync planning now reports visible stages before transfers. Dry runs include
  selected plugin-data components through a read-only planner and do not write
  plugin files, shared state, retry records, or sync logs.
- Stable operation IDs update one row from active to terminal state. Only the
  latest active row receives the shimmer, and the final progress bar remains
  visible at completion.
- Rebuild reuses its first local/remote scan, reports planning and index-write
  progress, and uses bounded concurrency for independent transfers.
- Verification: TypeScript, Prettier, 269 tests across 29 files, and a
  production build passed. Focused UI/rebuild tests and real-host acceptance
  remain open.

### 2026-08-23 — T57c and provider usage reconciliation

- T57c is complete in code. Sync identity now covers vault, backend, server,
  account, remote path, and encryption identity and isolates cache, index,
  plugin-file state, and retry records.
- Durable retry records retain failed chat-session and plugin-data work with
  backoff; successful shared-state items remain skipped on later runs.
- The sync panel now includes plugin-data operations in progress and reports
  chat-session and plugin-data categories separately as complete, partial, or
  failed.
- The token discrepancy is addressed by persisting AI SDK provider usage per
  response. Usage stats no longer double-count the saved user estimate and use
  a full-request estimate for responses without provider usage.
- Verification: 29 test files / 268 tests passed, TypeScript clean, production
  build passed.
- Remaining: T57d SyncIt contract and overlap acceptance test; older raw
  plugin-file migration; live OpenRouter reconciliation still requires a real
  request because provider availability cannot be proven by local tests.

### 2026-08-22 — T57b Two-Way State, Recovery, and Deletions Implemented

- Added durable per-file shared state with encrypted remote state and local
  state persistence.
- Added explicit local, remote, both, and cancel conflict choices through a
  user-facing conflict modal.
- Added recovery copies before local replacement/deletion and conflict copies
  for keep-both.
- Added deletion tombstones carrying the prior shared checksum. Missing remote
  data without a matching tombstone is reported and left untouched.
- TypeScript passed, full build passed, and the full test suite passed: 263
  tests across 27 files.
- T57b is complete. T57c durable retries/identity, T57d SyncIt contract, and
  migration for older raw plugin files remain open.

### 2026-08-22 — T57a Shared Plugin-File Sync Implemented

- Added `PluginFileSyncManager` and routed plugin settings, memory, persona,
  audit, and usage transfers through it.
- Remote plugin files now use a versioned envelope with a checksum and shared
  encryption when enabled.
- WebDAV writes use a temporary file followed by replacement. Local downloads
  use Obsidian's atomic process operation when replacing an existing file.
- Malformed or tampered remote data is rejected without changing local data.
- In two-way mode, differing local and remote files are reported as conflicts;
  neither side is overwritten yet.
- TypeScript passed, the full build passed, and the full test suite passed:
  256 tests.
- Implementation commit: `38f9f9e`.
- T57b is now complete for remembered state, recovery, deletion records, and
  user choices.

### 2026-08-22 — T57 Plugin Data Sync Safety and SyncIt Boundary

The user approved the following direction:

- SyncIt owns whole-vault sync.
- Chat Lab keeps plugin-aware sync for its own data and must not add whole-vault
  sync.
- The existing `integrationProvider` remains an AI tool interface. A future
  `dataSyncProvider` is a separate contract.
- T57a–T57d cover the common file path, two-way conflicts and recovery,
  identity/retry/reporting, and the SyncIt integration boundary.

Beads issue creation was attempted but blocked because this checkout has no
`.beads` database. Do not initialize a new issue database without explicit
direction.

### 2026-08-22 — Sync and Memory Bank Audit Corrections

The remote-storage audit found that the session-sync path is more mature than the auxiliary plugin-data path. The Memory Bank now records this boundary plainly.

- T42 remains active: the WebDAV baseline is merged, but full sync scope is not complete.
- T42a–T42e are implemented in code but remain open for acceptance checks and safety review.
- T58c is historical where T55 changed its behavior; memory, persona, audit, and usage files are now optional components.
- Auxiliary plugin files are not yet protected by every chat-session-specific
  feature; the shared plugin-file path now has encryption, checksums,
  atomic-write, conflict, recovery, and deletion protections.
- Durable retry records, complete sync identity handling, and older raw-file
  migration remain open.
- T56 is a first reorganization pass; its FileSyncManager, shared index, and component-delta work remain open.

### 2026-08-21 — T58 Subtasks Complete

All three T58 subtasks completed:

| Subtask | Issue | Status |
|---------|-------|--------|
| **T58a** | Fix rebuildSyncIndex title resolution | ✅ Complete |
| **T58b** | Add activity indicators to sync UI | ✅ Complete; T58d follow-up open |
| **T58c** | Extend sync to all plugin data | ✅ Complete |

**T58a:** Applied `titleMap` pattern from `triggerSync()` to `rebuildSyncIndex()` — eliminates "Untitled Session" by resolving titles from local cache, sync cache, then truncated ID.

**T58b:** Added CSS animations for visual feedback during sync:
- Rotating spinner in status heading (pure CSS, low CPU)
- Pulsing progress bar during active sync
- Shimmer animation on pending list items

**T58c:** Extended sync beyond chat sessions to plugin data:
- `StorageAdapter` gained `readText()` method
- `syncPluginData()` serializes settings (minus API keys) + sync index
- Auto-called after successful session sync
- Last-write-wins conflict resolution with notification

---

### 2026-08-21 — T55: Component-Level Sync Selection ✅

**Commit:** `7e0821b`

Added `SyncComponentConfig` to settings with 7 toggles controlling which data components participate in remote sync and export/import:
- Chat sessions, Plugin settings, API keys, AI Memory, Memory audit log, AI Persona, Usage stats
- New "Sync Components" settings section placed between Multi-User Sync and Remote Storage
- Export/import filter by component; remote sync respects toggles
- Usage stats computed on upload, skipped on download
- API keys excluded by default; credential fields never overwritten from remote

**Files:** `src/settings.ts`, `src/settings-sections/syncComponents.ts` (new), `src/settings-sections/SettingsTab.ts`, `src/settings-sections/exportImport.ts`, `src/main.ts`

---

### 2026-08-21 — Planned Changes (Sync/Storage/Global Reorganization) — COMPLETED as T56

All three architectural improvements implemented in commit `45917c8`:

1. **Rename "Multi-User Sync" → "Multi-User Chat Relay"** ✅
   - Settings nav and UI labels updated

2. **Unified Plugin Data Management Layer** ✅
   - `PluginDataManager` created at `src/data/PluginDataManager.ts`
   - Single source of truth for serialization/deserialization
   - Used by both export/import and remote sync

3. **Global Reorganization** ✅ (Phase 1)
   - Eliminated ~210 lines of duplicated logic across exportImport.ts and main.ts
   - Coherent `extractSettings()` / `mergeSettings()` / `redactSecrets()` pipeline
   - Foundation laid for further modularization (FileSyncManager, delta sync, etc.)

See `tasks/T56.md` for full details.

---

### 2026-08-21 — T51: Telemetry DISABLED — Obsidian Policy Block

**Finding:** Obsidian's developer policies **explicitly prohibit client-side telemetry** for plugins in the official Community Plugins directory.
- The "Kindle Highlights" plugin was **delisted** for sending telemetry to Sentry
- Even opt-in, anonymized telemetry violates this policy
- Source: [Obsidian Developer Policies](https://docs.obsidian.md/Developer+policies)

**Action:** All telemetry code removed from the plugin:
- `src/lib/telemetry.ts` — deleted
- `src/settings-sections/telemetry.ts` — deleted
- `src/main.ts` — removed first-run dialog, init, flush
- `src/settings.ts` — removed `telemetryEnabled`, `telemetryId`, `telemetryAsked`
- `src/components/ChatApp.tsx` — removed `chat_started` event logging
- `src/agent/AgentLoop.ts` — removed `tool_used` event logging

**Archive:** Complete implementation preserved in `memory-bank/implementation-details/telemetry-implementation-archived.md`

---

**Task:** T58 — Integrate Sync UI into Chat Lab
- Replaced standalone `SyncSidebarView` with integrated sync tab inside Chat Lab
- Export button becomes dropdown with Export + Sync options
- Sync opens as non-session tab (`__sync__`) with rich progress UI
- Direction control: Two-way / Upload only / Download only
- T42f superseded by T58

**Commits:**
- `dd4a989` — Phase 1: Remove 2nd sidebar
- `486cd1d` — Phase 2: Add syncDirection setting
- `570be35` — Phase 3: Export dropdown + Sync tab
- `02e1ba2` — Phase 4: ChatSyncPanel with rich progress UI

**Files created:**
- `src/components/ChatSyncPanel.tsx`

**Files modified:**
- `src/main.ts` — Removed sync sidebar, updated triggerSync with direction/callbacks
- `src/settings.ts` — Added syncDirection
- `src/components/ChatApp.tsx` — Wired ChatSyncPanel for `__sync__` tab
- `src/components/ChatTabBar.tsx` — Special tab support
- `src/components/presentational/ActionBar.tsx` — Export dropdown menu
- `src/components/ChatToolbar.tsx` — onOpenSync prop
- `styles.css` — Sync panel styles

**Files deleted:**
- `src/ui/SyncSidebarView.ts`

---

### 2026-08-19 — Session Closeout: T6a, T49, T51 Complete; T41 Intermittent Bug Fixed

**Completed today:**
- **T6a** (`161fee3`): Token counter accuracy fix with settings toggle
- **T49** (`0061937`, `966e8fe`, `c68faa9`): Settings export/import with vault-native file ops
- **T51** (`05c53c8`): Opt-in telemetry with first-run dialog
- **T41 fix** (`b582dfa`, `8ae8650`, `dc0f173`): Updater cache-busting + mobile diagnostics

**Key decisions:**
- Export/import uses vault-native operations (works on mobile + desktop)
- Telemetry endpoint at `quantumofgravity.com/telemetry` (backend TBD)
- Updater diagnostics go to `debug.log` (mobile-accessible via Settings → Diagnostics)

---

# Active Context

*Last Updated: 2026-08-19 19:44 IST*

### 2026-08-19 — T42 Phase 6 Scoped: Port SyncIt Features

**New subtasks created for T42 (Remote Chat Storage & Sync):**

| Subtask | Feature | Priority | Status |
|---------|---------|----------|--------|
| **T42a** | Sync Index — Skip Unchanged Sessions | P1 | 🔄 review open |
| **T42b** | Atomic Writes | P1 | 🔄 review open |
| **T42c** | Concurrency Control | P1 | 🔄 review open |
| **T42d** | Server Signature / Cache Invalidation | P1 | 🔄 review open |
| **T42e** | Dry Run Mode | P2 | 🔄 review open |
| **T42f** | Progress UI Improvements | P2 | ⛔ SUPERSEDED by T58 |

**Design docs created:**
- `memory-bank/implementation-details/sync-index-design.md`
- `memory-bank/implementation-details/atomic-writes-design.md`
- `memory-bank/implementation-details/concurrency-control-design.md`
- `memory-bank/implementation-details/server-signature-design.md`
- `memory-bank/implementation-details/dry-run-design.md`
- `memory-bank/implementation-details/progress-ui-design.md`

---

# Active Context

*Last Updated: 2026-08-19 13:31:15 IST*

### 2026-08-19 — DeepSeek V4 Pricing Investigation + New Task Batch (T6a, T48, T49, T50, T51)

**New tasks created:**

| Task | Title | Priority | Status |
|------|-------|----------|--------|
| **T6a** | Token Counter Accuracy Fix — Full Request Payload Counting | HIGH | ✅ COMPLETE |
| **T48** | Conversation Compaction Mechanism | HIGH | 🔄 Active |
| **T49** | Settings Export and Import | MEDIUM | ✅ COMPLETE |
| **T50** | OpenAI Responses API / Threads Support (Stateful Sessions) | MEDIUM | 🔄 Active |
| **T51** | Opt-in Telemetry and Usage Data Collection | MEDIUM | ⛔ DISABLED |

- **T48**: Auto-summarize old conversation turns after N turns to reduce per-request payload.
- **T50**: OpenAI stateful sessions via Responses API.
- **T51**: REMOVED — Obsidian policy prohibits client-side telemetry.

**Implementation docs created/updated:**
- Updated `context-system-design.md` (T6a)
- Created `conversation-compaction-design.md` (T48)
- Created `settings-export-schema.md` (T49)
- Updated `openresponses-implementation.md` (T50)
- Created `telemetry-privacy-design.md` (T51) — archived

---

- **Commits**: `ac24ced` → ... → `e96b703` → `be3c3bb` → `29ad150` → `deff496`
- **Phase 1 (Architecture)**: StorageAdapter interface, LocalCache (IndexedDB), EncryptionLayer (AES-256-GCM via PBKDF2), SyncEngine (delta sync + 3 conflict strategies + state machine)
- **Phase 2 (WebDAV + Settings + Polish)**:
  - `WebDAVStorageAdapter.ts` — PROPFIND, GET, PUT, MKCOL, DELETE using Obsidian's `requestUrl()` for Electron sandbox compatibility
  - Settings types: `RemoteStorageConfig`, `WebDAVStorageConfig`, `S3StorageConfig`, `StorageBackendType`
  - Settings UI: enable toggle, backend selector, passphrase, auto-sync, conflict strategy, WebDAV credentials, test connection button, manual sync button
  - Wired into `SettingsTab` navigation and render pipeline
  - **ETag comparison** — replaced timestamp-based sync with ETag comparison to eliminate false re-downloads due to clock skew (`be3c3bb`)
  - **Terminal-style progress modal** — progress bar, per-session log, elapsed time, session titles instead of ID hashes (`29ad150`)
  - **Sync log files** — local (`sync.log`) + remote (`sync.log`) recording every operation (`29ad150`)
  - **Cancel support** — `_cancelled` flag checked between sessions, finishes current then stops (`deff496`)
- **Build**: TypeScript clean, all 236 tests pass
- **What's Working**: Full end-to-end sync with WebDAV (Nextcloud); 96 sessions populated; ETag prevents re-downloads; logs written locally and remotely; cancel stops sync between sessions
- **What's Next**: S3 backend, conflict resolution UI, sync status badge in chat UI, auto-sync on session changes
- **Task**: `memory-bank/tasks/T42.md` (updated)
- **Design doc**: `memory-bank/implementation-details/remote-chat-storage.md`
