# Edit History

*Last Updated: 2026-08-27 18:04:06 IST*

## 2026-08-27

#### 18:04:06 IST - T46a: Extract completed turn persistence from the React hook
- Created `src/agent/ChatTurnPersistence.ts` - Assistant-message creation and session-message updates
- Created `src/agent/__tests__/ChatTurnPersistence.test.ts` - Focused persistence coverage
- Modified `src/hooks/useMessageActions.ts` - Delegated completed message creation and session updates
- Modified `memory-bank/tasks/T46.md` - Recorded the persistence slice and current size
- Modified `memory-bank/tasks/T46a.md` - Recorded the persistence boundary and remaining lifecycle work
- Modified `memory-bank/activeContext.md` - Recorded the new extraction and verification
- Modified `memory-bank/session_cache.md` - Recorded the new extraction and next step
- Modified `memory-bank/progress.md` - Recorded the current implementation milestone
- Modified `memory-bank/changelog.md` - Updated the current test count
- Modified `memory-bank/sessions/2026-08-27-architecture-modularity.md` - Appended the persistence update
- Modified `memory-bank/implementation-details/orchestration-decomposition.md` - Recorded persistence ownership
- Modified `memory-bank/implementation-details/refactored-architecture.md` - Updated the hook size evidence

#### 17:58:34 IST - T46a: Extract request preparation from the React hook
- Created `src/agent/ChatTurnRequest.ts` - Prompt, history, budget, attachment, and model-message assembly
- Modified `src/hooks/useMessageActions.ts` - Delegated request preparation while retaining UI and persistence behavior
- Modified `memory-bank/tasks/T46.md` - Recorded the request-preparation slice and current size
- Modified `memory-bank/tasks/T46a.md` - Recorded the request builder and remaining lifecycle work
- Modified `memory-bank/activeContext.md` - Recorded the new extraction and verification
- Modified `memory-bank/session_cache.md` - Recorded the new extraction and next step
- Modified `memory-bank/progress.md` - Added the request-preparation milestone
- Modified `memory-bank/changelog.md` - Recorded the request builder
- Modified `memory-bank/sessions/2026-08-27-architecture-modularity.md` - Appended the request-preparation update
- Modified `memory-bank/implementation-details/orchestration-decomposition.md` - Recorded request assembly ownership
- Modified `memory-bank/implementation-details/refactored-architecture.md` - Added the request builder and updated sizes

#### 17:53:12 IST - T46: Split capability handlers by domain
- Created `src/agent/tools/ToolHandlerContext.ts` - Shared host services and continuation state
- Created `src/agent/tools/handlers/bulkHandlers.ts` - Multi-note creation
- Created `src/agent/tools/handlers/discoveryHandlers.ts` - Note search and inspection
- Created `src/agent/tools/handlers/memoryHandlers.ts` - Saved memory operations
- Created `src/agent/tools/handlers/sessionHandlers.ts` - Past-session search
- Created `src/agent/tools/handlers/settingsHandlers.ts` - Guarded settings operations
- Created `src/agent/tools/handlers/vaultHandlers.ts` - Folder and note movement operations
- Created `src/agent/tools/handlers/webHandlers.ts` - Web search and PDF extraction
- Modified `src/agent/tools/handlers/noteHandlers.ts` - Shared handler context and bulk separation
- Modified `src/agent/ToolExecutor.ts` - Constructed and routed domain handlers
- Deleted `src/agent/tools/ToolHandlers.ts` - Removed the temporary mixed-domain grouping
- Modified `memory-bank/tasks/T46.md` - Recorded the completed domain split
- Modified `memory-bank/activeContext.md` - Recorded current implementation state
- Modified `memory-bank/session_cache.md` - Recorded verification and next step
- Modified `memory-bank/progress.md` - Added the domain split milestone
- Modified `memory-bank/changelog.md` - Recorded the handler reorganization
- Modified `memory-bank/sessions/2026-08-27-architecture-modularity.md` - Appended the domain split update
- Modified `memory-bank/implementation-details/orchestration-decomposition.md` - Updated the verified structure
- Modified `memory-bank/implementation-details/refactored-architecture.md` - Added the handler layout

#### 17:41:07 IST - T46: Implement first architecture decomposition slice
- Created `src/agent/ChatTurnCoordinator.ts` - Shared native and OpenResponses turn runner
- Created `src/agent/__tests__/ChatTurnCoordinator.test.ts` - React-independent coordinator coverage
- Created `src/agent/tools/ToolResolver.ts` - Safe path, note, and folder lookup
- Created `src/agent/tools/ToolHandlers.ts` - Remaining capability handlers during transition
- Created `src/agent/tools/handlers/noteHandlers.ts` - Note content handlers
- Modified `src/agent/ToolExecutor.ts` - Reduced to registry construction, validation, and delegation
- Modified `src/agent/toolRegistry.ts` - Kept resolved definitions and handlers aligned
- Modified `src/agent/tools/toOpenResponses.ts` - Added resolved-registry projection
- Modified `src/hooks/useMessageActions.ts` - Used shared turn coordinator and resolved tools
- Modified `src/lib/systemPrompt.ts` - Used resolved definitions for tool descriptions
- Modified `memory-bank/tasks/T46.md` - Recorded implementation progress and gates
- Modified `memory-bank/tasks/T46a.md` - Recorded coordinator progress and branch
- Modified `memory-bank/tasks/T60a.md` - Recorded completed registry projection gates
- Modified `memory-bank/activeContext.md` - Recorded branch, implementation, and remaining work
- Modified `memory-bank/session_cache.md` - Recorded current branch and verification
- Modified `memory-bank/progress.md` - Added implementation milestone
- Modified `memory-bank/changelog.md` - Added unreleased architecture entry
- Modified `memory-bank/sessions/2026-08-27-architecture-modularity.md` - Appended implementation update
- Modified `memory-bank/implementation-details/orchestration-decomposition.md` - Updated verified structure and sizes
- Modified `memory-bank/implementation-details/refactored-architecture.md` - Updated current module map and size evidence
- Modified `memory-bank/implementation-details/tool-capability-registry-and-execution-pipeline.md` - Recorded shared resolved registry boundary

#### 13:21:49 IST - Record architecture modularity review and refactoring plan
- Pulled remote Memory Bank changes through `85a5f4c` before updating records.
- Created `memory-bank/tasks/T46a.md` - Proposed chat-turn coordinator
  decomposition under T46.
- Modified `memory-bank/tasks/T46.md` - Refreshed current file sizes, scope,
  implementation order, and ownership boundaries.
- Modified `memory-bank/tasks/T60.md`, `T60a.md`, and `T60c.md` - Recorded
  registry ownership and execution-pipeline coordination with T46/T46a.
- Modified `memory-bank/tasks/T48b.md`, `T48c.md`, and `T62a.md` - Recorded
  model-history ownership and the T64b evidence dependency.
- Modified `memory-bank/tasks/T64.md` and `T22.md` - Reconciled benchmark
  documentation and the useMessageActions reconsideration threshold.
- Modified `memory-bank/tasks.md` - Registered T46/T46a under active work and
  added their relationship records.
- Modified `memory-bank/activeContext.md` and `memory-bank/progress.md` -
  Added the current architecture plan and size evidence.
- Modified `memory-bank/implementation-details/orchestration-decomposition.md`,
  `tool-capability-registry-and-execution-pipeline.md`, and
  `refactored-architecture.md` - Refreshed architecture ownership, sizes, and
  sequencing.
- No source implementation was made; verification is documentation-focused.

## 2026-08-26

#### 03:23:54 IST - T60: Record implementation and live pagination validation
- Modified `memory-bank/tasks/T60.md` - Recorded the completed pagination
  implementation and the remaining native-loop context issue.
- Modified `memory-bank/tasks/T60a.md` - Recorded implementation and review
  fixes while preserving unfinished criteria.
- Modified `memory-bank/tasks/T60c.md` - Recorded the partial validation and
  cancellation boundary.
- Modified `memory-bank/tasks/T60d.md` - Marked token-efficient search work
  complete and recorded verification.
- Modified `memory-bank/tasks/T60f.md` - Marked pagination complete and recorded
  successful note/session live tests.
- Modified `memory-bank/tasks.md` - Reconciled T60a/c/d/f statuses.
- Modified `memory-bank/activeContext.md` - Added the current implementation
  and validation handoff.
- Modified `memory-bank/progress.md` - Replaced the stale planned T60f entry.
- Modified `memory-bank/session_cache.md` - Added the current handoff.
- Created `memory-bank/sessions/2026-08-26-night.md` - Recorded work, tests,
  decisions, error, and deferred context work.
- Verification: 37 test files / 320 tests, TypeScript, and production build.

## 2026-08-25

#### 23:55:03 IST - T60e: Record provider-adaptive streaming plan
- Created `memory-bank/tasks/T60e.md` - Defined the separate-branch transport, lifecycle, validation, and UI-progress follow-up.
- Modified `memory-bank/tasks.md` - Registered T60e and added it to the T60 relationship tree.
- Modified `memory-bank/tasks/T60.md` - Cross-linked the T60e follow-up and split transport ownership from T15 UI ownership.
- Modified `memory-bank/tasks/T14.md` - Recorded the OpenResponses streaming-observability boundary.
- Modified `memory-bank/tasks/T15.md` - Recorded the coordinated UI scope and required branch.
- Modified `memory-bank/implementation-details/provider-adaptive-streaming-ui.md` - Documented the event contract, display/execution boundary, progress states, and verification plan.
- Modified `memory-bank/implementation-details/agentic-tool-calling.md` - Recorded the native-loop buffering gap and T60e boundary.
- Modified `memory-bank/implementation-details/openresponses-implementation.md` - Recorded the parser/loop observability gap and follow-up boundary.
- Modified `memory-bank/implementation-details/chat-ui-features.md` - Recorded planned provider-adaptive progress presentation.
- Modified `memory-bank/implementation-details/T25-test-strategy.md` - Added planned event-order, buffering, validation, cancellation, and persistence coverage.
- Modified `memory-bank/activeContext.md` - Recorded the approved plan and separate-branch requirement.
- Modified `memory-bank/progress.md` - Recorded the planned T60e/T15 split and unchanged source boundary.
- Modified `memory-bank/session_cache.md` - Added the current planning handoff.
- Modified `memory-bank/sessions/2026-08-25-evening.md` - Appended the planning decision and scope.

#### 14:45 IST - T60a: Wire registry into execution
- Created `src/agent/__tests__/toolExecutor.integration.test.ts` — 4 integration tests proving registry execution parity with direct ToolExecutor dispatch.
- Modified `src/agent/toolRegistry.ts` — Added `createBuiltInToolDefinitionsWithExecutors()` factory to attach execute handlers to canonical definitions.
- Modified `src/agent/ToolExecutor.ts` — Added `builtInRegistry` field; constructor builds registry with 24 bound handlers; `execute()` delegates to registry before falling back to switch statement.
- Modified `memory-bank/tasks/T60a.md` — Marked criteria 1-3, 5, 9 complete; added progress entry.
- Created `memory-bank/sessions/2026-08-25-afternoon-execution.md` — Session log for execution wiring work.
- Commit `e731220`: 4 files changed, 292 insertions(+), 6 deletions(-).

#### 13:47:27 IST - T60: Correct registry integration boundary after review
- Modified `memory-bank/tasks/T60.md` - Recorded the bounded adapter status and made registry-to-execution integration an acceptance gate.
- Modified `memory-bank/tasks/T60a.md` - Made the integration slice active and added the test-first execution contract, provider-preservation, availability, schema, title, and behavior-test requirements.
- Modified `memory-bank/tasks/T60b.md` - Kept transport parity paused until registry integration passes.
- Modified `memory-bank/tasks/T60c.md` - Kept the validation pipeline paused behind registry integration and transport parity.
- Modified `memory-bank/tasks.md` - Marked T60a active in the task registry.
- Modified `memory-bank/implementation-details/tool-capability-registry-and-execution-pipeline.md` - Distinguished implemented adapter work from the target architecture.
- Modified `memory-bank/activeContext.md` - Recorded the corrected next gate and reduced planning scope.
- Modified `memory-bank/progress.md` - Recorded the adapter result and remaining integration work.
- Modified `memory-bank/session_cache.md` - Updated the session handoff with the test-first integration sequence.
- Modified `memory-bank/sessions/2026-08-25-afternoon.md` - Preserved the planning record and appended the review correction.

#### 12:56:44 IST - T60: Record tool capability registry and execution-pipeline plan
- Created `memory-bank/tasks/T60.md` - Added the tool-system hardening umbrella and ownership boundaries.
- Created `memory-bank/tasks/T60a.md` - Added canonical registry and dynamic exposure scope.
- Created `memory-bank/tasks/T60b.md` - Added native, OpenResponses, and council transport-parity scope.
- Created `memory-bank/tasks/T60c.md` - Added validated execution, cancellation, and concurrency scope.
- Created `memory-bank/tasks/T18a.md` - Added bounded ordinary web-page retrieval scope.
- Created `memory-bank/implementation-details/tool-capability-registry-and-execution-pipeline.md` - Defined the canonical descriptor, execution state machine, ownership, validation, and exclusions.
- Modified `memory-bank/tasks/T14.md` - Added the OpenResponses tool-transport audit boundary.
- Modified `memory-bank/tasks/T17.md` - Added content, outline, bounded-read tools and safe frontmatter dependencies.
- Modified `memory-bank/tasks/T18.md` - Linked bounded web-page retrieval follow-up.
- Modified `memory-bank/tasks/T38.md` - Expanded risk, council approval, fingerprint, and shared-pipeline requirements.
- Modified `memory-bank/tasks/T39.md` - Recorded provider registry transport and validation gaps.
- Modified `memory-bank/tasks/T39a.md` - Added provider conversion, collision, validation, and refresh acceptance work.
- Modified `memory-bank/tasks/T46.md` - Reframed decomposition around the canonical registry and pipeline.
- Modified `memory-bank/tasks/T48b.md` - Added parallel-call pairing and serializer-parity acceptance.
- Modified `memory-bank/tasks/T48c.md` - Added exact persisted message and tool-result retrieval contracts.
- Modified `memory-bank/implementation-details/agentic-tool-calling.md` - Recorded the current 24-tool audit boundary and corrected stale search-content documentation.
- Modified `memory-bank/implementation-details/tool-approval-batch-audit-plan.md` - Added risk taxonomy, council approval, fingerprints, and pipeline placement.
- Modified `memory-bank/implementation-details/integration-provider-api.md` - Added OpenResponses and local provider-validation requirements.
- Modified `memory-bank/implementation-details/orchestration-decomposition.md` - Added registry, pipeline, serializer, and formatter modules.
- Modified `memory-bank/implementation-details/conversation-compaction-design.md` - Added exact historical retrieval tool ownership.
- Modified `memory-bank/implementation-details/web-search.md` - Promoted bounded page retrieval to T18a.
- Updated `memory-bank/tasks.md` - Registered T60/T60a–c and T18a with dependencies.
- Updated `memory-bank/activeContext.md` - Recorded the planning decision and recommended first slice.
- Updated `memory-bank/progress.md` - Added a planning-only audit entry.
- Updated `memory-bank/session_cache.md` - Added the current tool-system planning handoff.
- Created `memory-bank/sessions/2026-08-25-afternoon.md` - Recorded the documentation-only planning session.

## 2026-08-23

#### 17:05:26 IST - T48c: Record semantic-compaction implementation validation
- Updated `memory-bank/tasks/T48.md` - Recorded the merged implementation, completed criteria, live validation, and remaining acceptance gaps.
- Updated `memory-bank/tasks/T48.md` - Corrected the algorithm and integration notes to describe a non-destructive model-history projection rather than transcript replacement.
- Updated `memory-bank/tasks/T48a.md` - Recorded request-budget implementation and validation settings.
- Updated `memory-bank/tasks/T48b.md` - Recorded bounded replay implementation and remaining tool-pair coverage.
- Updated `memory-bank/tasks/T48c.md` - Recorded implementation status, live validation, and diagnostic follow-up.
- Updated `memory-bank/tasks.md` - Recorded the T48 implementation start date in the task registry.
- Updated `memory-bank/implementation-details/conversation-compaction-design.md` - Documented the implemented slice and current boundary.
- Created `memory-bank/implementation-details/T48c-validation-2026-08-23.md` - Recorded the live test procedure, result, and evidence boundary.
- Updated `memory-bank/sessions/2026-08-23-night.md` - Appended implementation validation and closeout details.
- Updated `memory-bank/session_cache.md` - Recorded current T48c status and remaining work.
- Updated `memory-bank/activeContext.md` - Recorded the merged implementation and current T48c focus.
- Updated `memory-bank/progress.md` - Recorded the merged implementation and live validation milestone.
- Updated `memory-bank/changelog.md` - Recorded the T48 implementation and validation.
- Updated `memory-bank/errorLog.md` - Recorded and resolved the Obsidian-AI/OpenClaw context conflation.

#### 04:24:00 IST - T48c: Record context-compaction research and strategy
- Created `memory-bank/implementation-details/context-compaction-strategies-reference.md` - Recorded provider-native, semantic, tool-replay, caching, hierarchical-memory, safety-aware, and OpenClaw compaction strategies with sources.
- Modified `memory-bank/implementation-details/conversation-compaction-design.md` - Replaced turn-count replacement with the token-triggered hybrid ladder, separate model-history projection, structured audited summary contract, provider compatibility, and two-slice T48c path.
- Modified `memory-bank/activeContext.md` - Recorded the research and documentation-only T48c update.
- Modified `memory-bank/session_cache.md` - Recorded the research reference, strategy update, and unchanged task status.
- Modified `memory-bank/sessions/2026-08-23-night.md` - Recorded decisions and remaining T48c direction.

#### 02:17:00 IST - T48c: Record quality safeguards for context compaction
- Modified: `memory-bank/tasks/T48c.md` with recent-turn, structured-summary, derived-context, retrieval, and uncertainty safeguards.
- Modified: `memory-bank/implementation-details/conversation-compaction-design.md` with quality-preservation rules and expected quality tradeoff.
- Modified: `memory-bank/activeContext.md` with the approved quality guardrails.

#### 02:17:00 IST - T48a: Begin implementation on feature branch
- Created: `src/context/contextBudget.ts` with token-budgeted history selection while leaving the persisted transcript untouched.
- Modified: settings and chat request construction to expose a request budget, response reserve, and recent-message preservation count.
- Created: `src/context/__tests__/contextBudget.test.ts` covering trimming, ordering, and legacy fallback behavior.

#### 02:17:00 IST - T48 updater: Port advanced development-build browsing
- Modified: updater to detect same-tag dev updates by commit hash and enumerate published branch builds.
- Modified: updater settings and main plugin wiring with a branch-build browser and installer.
- Modified: `src/context/contextBudget.ts` and chat settings with bounded
  tool-result replay (head/tail plus an explicit truncation marker).

#### 02:02:32 IST - T48: Record token-budgeted context-efficiency plan
- Updated `memory-bank/tasks/T48.md` - Expanded compaction scope to token budgets, bounded replay, and separate display/model history.
- Created `memory-bank/tasks/T48a.md` - Added token-budgeted context builder subtask.
- Created `memory-bank/tasks/T48b.md` - Added tool-result replay and canonical serialization subtask.
- Created `memory-bank/tasks/T48c.md` - Added rolling summary and compaction subtask.
- Created `memory-bank/tasks/T48d.md` - Added usage display and provider reconciliation subtask.
- Updated `memory-bank/implementation-details/conversation-compaction-design.md` - Added token-budget and tool replay design.
- Updated `memory-bank/implementation-details/context-system-design.md` - Added request budget hierarchy.
- Updated `memory-bank/implementation-details/agentic-tool-calling.md` - Added bounded model replay policy.
- Updated `memory-bank/tasks.md` - Registered T48a-T48d.
- Updated `memory-bank/activeContext.md` - Recorded the T48 decomposition.
- Updated `memory-bank/progress.md` - Recorded diagnosis and implementation order.
- Updated `memory-bank/sessions/2026-08-23-night.md` - Recorded plan and next steps.
- Updated `memory-bank/session_cache.md` - Recorded active T48 subtasks.

#### 01:27:43 IST - T58/T58c/T58d: Record sync implementation and plugin rebuild audit
- Modified `memory-bank/tasks/T58.md` - Recorded the T58d implementation and the separate plugin-data rebuild follow-up.
- Modified `memory-bank/tasks/T58c.md` - Recorded that plugin data is covered by normal sync and dry run but not the Rebuild action.
- Modified `memory-bank/tasks/T58d.md` - Reconciled the implementation status, acceptance criteria, verification, and chat-session/plugin-data rebuild boundary.
- Modified `memory-bank/implementation-details/plugin-data-sync-and-syncit-boundary.md` - Documented the current Rebuild boundary and future separate plugin-data phase.
- Modified `memory-bank/tasks.md`, `memory-bank/activeContext.md`, and `memory-bank/progress.md` - Synchronized task registry and current progress.
- Modified `memory-bank/session_cache.md` and `memory-bank/sessions/2026-08-23-night.md` - Recorded the complete session work, decisions, verification, and remaining acceptance gates.
- Modified `memory-bank/changelog.md` - Added the T58/T58c/T58d implementation and audit summary.

#### 01:14:20 IST - T58d: Implement shared sync progress and dry-run planning

- Created `src/sync/SyncProgress.ts` - Defined shared progress phases, snapshots, stable log entries, and engine events.
- Modified `src/sync/SyncEngine.ts` - Added planning/rebuild progress events, reused rebuild scans, and bounded independent rebuild transfers.
- Modified `src/sync/PluginFileSyncManager.ts` and `src/sync/PluginFileSyncManager.test.ts` - Added read-only plugin-data planning and no-write regression coverage.
- Modified `src/main.ts` - Wired planning, plugin-data, rebuild, completion, and stable-row progress callbacks; skipped sync-log writes during dry runs.
- Modified `src/components/ChatSyncPanel.tsx`, `src/views/ObsidianAIChatView.ts`, and `styles.css` - Kept the progress bar visible, deduplicated rows, and limited shimmer to the latest active row.
- Verified TypeScript, Prettier, 269 tests across 29 files, and the production build.

#### 00:44:16 IST - T58: Resolve task ID conflict and record progress plan

- Modified `memory-bank/tasks/T43.md` - Restored the original Multi-User and Agent Chat task and documented the ID clarification.
- Created `memory-bank/tasks/T58.md` - Moved the integrated sync UI task to its canonical namespace.
- Modified `memory-bank/tasks/T43a.md` - Added a compatibility pointer to T58a.
- Modified `memory-bank/tasks/T43b.md` - Added a compatibility pointer to T58b.
- Modified `memory-bank/tasks/T43c.md` - Added a compatibility pointer to T58c.
- Created `memory-bank/tasks/T58a.md` - Canonicalized the rebuild title-resolution subtask.
- Created `memory-bank/tasks/T58b.md` - Canonicalized the sync activity-indicator subtask and recorded its follow-up boundary.
- Created `memory-bank/tasks/T58c.md` - Canonicalized plugin-data sync and corrected the session-index boundary.
- Created `memory-bank/tasks/T58d.md` - Recorded the approved unified progress, dry-run, rebuild, and performance plan.
- Modified `memory-bank/tasks.md` - Registered T58 and T58a-T58d while retaining historical T43.
- Modified `memory-bank/tasks/T42.md` - Updated sync phase references, T57 status, and current limits.
- Modified `memory-bank/tasks/T42a.md` - Recorded the session-only index boundary and T58d follow-up.
- Modified `memory-bank/tasks/T42c.md` - Recorded the rebuild concurrency and repeated-scan limitation.
- Modified `memory-bank/tasks/T42e.md` - Expanded dry-run acceptance to plugin-data planning and visible planning state.
- Modified `memory-bank/tasks/T42f.md` - Pointed the superseded sidebar record to T58.
- Modified `memory-bank/tasks/T55.md` - Updated the integrated-sync parent and predecessor references.
- Modified `memory-bank/tasks/T56.md` - Updated the integrated-sync related-task reference.
- Modified `memory-bank/tasks/T57.md` - Updated the plugin-data dependency reference to T58c.
- Modified `memory-bank/tasks.md` - Added the T42/T57/T58 relationship graph and reconciled the task status totals.
- Modified `memory-bank/changelog.md` - Added the T43-to-T58 migration and T58d follow-up summary.
- Modified `memory-bank/implementation-details/integrated-sync-ui-design.md` - Added planning, stable-row, persistent-completion, plugin-data, and rebuild progress requirements.
- Modified `memory-bank/implementation-details/dry-run-design.md` - Added plugin-data plan-only behavior and progress requirements.
- Modified `memory-bank/implementation-details/sync-index-design.md` - Clarified the session-only index and rebuild boundary.
- Modified `memory-bank/implementation-details/concurrency-control-design.md` - Added index-rebuild concurrency and scan-reuse requirements.
- Modified `memory-bank/implementation-details/plugin-data-sync-and-syncit-boundary.md` - Recorded the dry-run and index boundary.
- Modified `memory-bank/implementation-details/progress-ui-design.md` - Marked the old sidebar design as historical and linked T58d.
- Modified `memory-bank/implementation-details/sync-component-selection.md` - Updated the canonical plugin-data subtask reference.
- Modified `memory-bank/activeContext.md` - Recorded the T58 migration and T58d plan as current context.
- Modified `memory-bank/progress.md` - Recorded the task migration and renamed current sync references.
- Modified `memory-bank/session_cache.md` - Recorded the current T58 handoff and canonical subtask names.
- Modified `memory-bank/sessions/2026-08-23-night.md` - Appended the task migration and approved follow-up plan.
- Modified `memory-bank/edit_history.md` - Added the generated-view entry for the T58 documentation update.

## 2026-08-22

#### 23:19:11 IST - T57: Build and Memory Bank closeout
- Updated `memory-bank/tasks/T57.md` - Recorded the successful build, 256 passing tests, and implementation commit.
- Updated `memory-bank/tasks/T57a.md` - Recorded final verification for the shared plugin-file sync layer.
- Updated `memory-bank/tasks.md` - Refreshed the task registry timestamp.
- Updated `memory-bank/activeContext.md` - Recorded build, test, and commit evidence.
- Updated `memory-bank/progress.md` - Recorded the T57a verification milestone.
- Updated `memory-bank/session_cache.md` - Recorded the closeout handoff.
- Updated `memory-bank/changelog.md` - Recorded the successful verification.
- Created `memory-bank/sessions/2026-08-22-night.md` - Recorded the session closeout.
- Created `memory-bank/edits/2026-08-22/231911-t57-closeout.md` - Added this edit chunk.

## 2026-08-21

#### 00:21:02 IST - T43: Close integrated Sync tab and record session closeout
- Modified `src/components/ChatTabBar.tsx` - Show the close button for the special Sync tab.
- Updated `memory-bank/tasks/T43.md` - Recorded the completed Sync panel and rebuild work.
- Updated `memory-bank/activeContext.md` - Recorded the final T43 session state.
- Updated `memory-bank/changelog.md` - Added the unreleased Sync-tab closeout changes.
- Updated `memory-bank/session_cache.md` - Recorded the session handoff and closeout.
- Created `memory-bank/sessions/2026-08-21-night.md` - Recorded the session summary.

## 2026-08-19

#### 19:44 IST - T42 Phase 6: SyncIt Feature Port — Subtasks and Design Docs Created

Created six subtasks (T42a–T42f) and six design docs to port proven SyncIt features into obsidian-ai's sync engine.

**Subtasks created:**
- `memory-bank/tasks/T42a.md` — Sync Index (skip unchanged sessions)
- `memory-bank/tasks/T42b.md` — Atomic Writes (temp + MOVE)
- `memory-bank/tasks/T42c.md` — Concurrency Control (parallel uploads)
- `memory-bank/tasks/T42d.md` — Server Signature (cache invalidation)
- `memory-bank/tasks/T42e.md` — Dry Run Mode (preview without transfer)
- `memory-bank/tasks/T42f.md` — Progress UI (persistent status)

**Design docs created:**
- `memory-bank/implementation-details/sync-index-design.md`
- `memory-bank/implementation-details/atomic-writes-design.md`
- `memory-bank/implementation-details/concurrency-control-design.md`
- `memory-bank/implementation-details/server-signature-design.md`
- `memory-bank/implementation-details/dry-run-design.md`
- `memory-bank/implementation-details/progress-ui-design.md`

**Files modified:**
- `memory-bank/tasks/T42.md` — Added Phase 6 section with subtask table and rationale
- `memory-bank/activeContext.md` — Added T42 Phase 6 to current tasks
- `memory-bank/progress.md` — Added Phase 6 entry

**Key decisions recorded:**
- Port SyncIt's proven patterns without changing obsidian-ai's architecture
- Keep obsidian-ai's encryption, IndexedDB cache, per-session granularity
- T42a–T42d are P1 (mechanical/safety improvements)
- T42e–T42f are P2 (UX improvements)
- All features are incremental — can be implemented independently

#### 15:25 IST - T49: Export/Import vault-native file operations
- **Action**: Modified
- **Files**: `src/settings-sections/exportImport.ts`, `src/settings-sections/SettingsTab.ts`
- **Details**: Replaced broken `<a download>` and HTML file input with Obsidian-native vault operations. Export now uses `vault.adapter.write()` to save JSON to vault root. Import uses `FuzzySuggestModal` to pick from vault JSON files. Works on both desktop and mobile.

#### 15:32 IST - T49: Security fix for API key redaction
- **Action**: Modified
- **Files**: `src/settings-sections/exportImport.ts`
- **Details**: Added `tavilyApiKey`, `exaApiKey`, `braveApiKey` to SENSITIVE_KEYS redaction list. Previously these API keys were leaking in exported JSON files.

#### 15:35 IST - T51: Telemetry settings and module
- **Action**: Created
- **Files**: `src/lib/telemetry.ts`, `src/settings-sections/telemetry.ts`
- **Details**: Created telemetry module with event queue, 60s batching, silent-fail sending. Added Telemetry & Privacy settings section with toggle, anonymous ID display, and full data disclosure. First-run opt-in dialog with complete transparency.

#### 15:48 IST - T51: Telemetry wiring into main.ts and ChatApp
- **Action**: Modified
- **Files**: `src/main.ts`, `src/components/ChatApp.tsx`, `src/agent/AgentLoop.ts`, `src/settings.ts`
- **Details**: Wired telemetry initialization into plugin lifecycle. Added `telemetryEnabled`, `telemetryId`, `telemetryAsked` to settings schema. Added `chat_started` event logging in ChatApp and `tool_used` event logging in AgentLoop. Flush on plugin unload.

#### 16:45 IST - T41: Updater diagnostic logging
- **Action**: Modified
- **Files**: `src/updater/PluginUpdater.ts`, `src/main.ts`
- **Details**: Added `UpdaterLogger` interface to PluginUpdater. All updater diagnostics now go to file logger (debug.log) instead of console, making them visible on mobile via Settings → Diagnostics. Added trace logging at every step of check/download/install.

#### 17:05 IST - T41: Updater cache-busting fix
- **Action**: Modified
- **Files**: `src/updater/PluginUpdater.ts`
- **Details**: Added `&_cb=${Date.now()}` cache-busting to all GitHub API calls (releases, commits, latest stable). Fixed fetchJson to check HTTP status codes. Added rate limit detection. Root cause of intermittent "works once then fails" bug was CDN caching stale release data.

#### 17:50 IST - Memory-bank updates for T6a, T49, T51, T41
- **Action**: Modified, Created
- **Files**: `memory-bank/tasks/T6a.md`, `memory-bank/tasks/T49.md`, `memory-bank/tasks/T51.md`, `memory-bank/tasks/T41.md`, `memory-bank/progress.md`, `memory-bank/activeContext.md`
- **Details**: Marked T6a, T49, T51 as COMPLETE with commits. Added T41 intermittent bug fix documentation. Updated progress and active context with session closeout.

#### 17:55 IST - Memory-bank implementation docs
- **Action**: Created
- **Files**: `memory-bank/implementation-details/settings-export-import.md`, `memory-bank/implementation-details/telemetry-implementation.md`
- **Details**: Created implementation documentation for settings export/import (vault-native ops, redaction, schema) and telemetry module (opt-in flow, events, endpoint spec).

## 2026-08-15

#### 14:53:44 IST - T8a: Record Community Directory closeout and dev polish
- Updated `memory-bank/tasks/T8a.md` - recorded review acceptance, dev polish, verification, and remaining smoke tests.
- Updated `memory-bank/implementation-details/community-review-remediation.md` - appended closeout implementation evidence.
- Updated `memory-bank/activeContext.md` - recorded T8a closeout state and open smoke-test item.
- Updated `memory-bank/progress.md` - recorded release remediation completion.
- Updated `memory-bank/session_cache.md` - recorded final session handoff.
- Created `memory-bank/sessions/2026-08-15-afternoon.md` - recorded the session work and closeout state.

#### 14:40:00 IST - T8a: Record follow-up review fixes and 1.3.4 release
- Modified `memory-bank/tasks/T8a.md` - Recorded scanner fixes, release 1.3.4, and the next review gate.
- Modified `memory-bank/progress.md` - Recorded follow-up verification and publication.
- Modified `memory-bank/activeContext.md` - Updated the active release-review state.

#### 13:55:00 IST - T8a: Publish and record 1.3.3 release evidence
- Modified `memory-bank/tasks/T8a.md` - Recorded release tag, CI run, assets, and remaining review gate.
- Modified `memory-bank/progress.md` - Recorded successful 1.3.3 publication.
- Modified `memory-bank/activeContext.md` - Recorded release publication and next action.

#### 13:45:00 IST - T8a: Implement first Community Directory remediation batch
- Modified `manifest.json` - Raised minimum supported Obsidian version to 1.4.5.
- Modified `versions.json` - Matched the compatibility baseline.
- Modified `src/settings-sections/diagnostics.ts` - Guarded Node filesystem imports to desktop execution.
- Modified `src/lib/systemPrompt.ts` - Replaced navigator platform detection with Obsidian Platform.
- Modified `src/main.ts` - Stopped detaching leaves during unload.
- Modified `src/components/ChatInput.tsx` - Replaced unsafe/static DOM construction and direct style assignments.
- Modified `src/components/MessageBubble.tsx` - Replaced innerHTML clearing with replaceChildren.
- Modified `src/components/ObsidianIcon.tsx` - Replaced innerHTML clearing with replaceChildren.
- Modified `src/settings-sections/diagnostics.ts` - Replaced direct style assignments with setCssStyles.
- Modified `src/settings-sections/intelligence.ts` - Replaced direct style assignments with setCssStyles.
- Modified `src/settings-sections/syncSettings.ts` - Replaced innerHTML and direct style assignments with safe APIs.
- Modified `src/settings-sections/updaterSettings.ts` - Replaced static innerHTML with textContent.
- Modified `package.json` - Pinned React 18 and removed zip packaging from the package script.
- Modified `pnpm-lock.yaml` - Updated React dependency resolution.
- Modified `.github/workflows/release.yml` - Pinned Node, added attestations, release notes, checksums, tag validation, and supported-asset packaging.
- Modified `docs/release-announcement.md` - Prepared 1.3.3 release notes.
- Modified `memory-bank/tasks/T8a.md` - Recorded implementation progress and verification.
- Modified `memory-bank/implementation-details/community-review-remediation.md` - Recorded remediation evidence.
- Modified `memory-bank/activeContext.md` - Recorded the active remediation batch.
- Modified `memory-bank/progress.md` - Recorded verification and remaining gates.

#### 13:19:00 IST - T8a: Document Community Directory review remediation
- Created `memory-bank/tasks/T8a.md` - Added child task for 1.3.3 review remediation.
- Created `memory-bank/implementation-details/community-review-remediation.md` - Recorded review evidence, findings, and acceptance gates.
- Modified `memory-bank/tasks/T8.md` - Linked T8a and updated release follow-up criteria.
- Modified `memory-bank/tasks.md` - Registered T8a and task relationship.
- Modified `memory-bank/activeContext.md` - Recorded the current review-remediation focus.
- Modified `memory-bank/progress.md` - Recorded documentation completion and implementation status.
- Modified `memory-bank/session_cache.md` - Set T8a as the active task.
- Modified `memory-bank/implementation-details/release-readiness-audit.md` - Marked the earlier decision superseded by the review findings.

#### 12:15:40 IST - T8: Document release audit blockers and remediation plan
- Modified `memory-bank/tasks.md` - Reopened T8 as the active release-readiness task.
- Modified `memory-bank/tasks/T8.md` - Added policy findings, blockers, completed cancellation work, and release checklist.
- Created `memory-bank/implementation-details/release-readiness-audit.md` - Recorded audit decision, findings, required sequence, and verification snapshot.
- Modified `memory-bank/activeContext.md` - Added current release-audit context and remediation priorities.
- Modified `memory-bank/progress.md` - Recorded T8 reopening and audit results.
- Modified `memory-bank/sessions/2026-08-14-evening.md` - Appended follow-up audit notes.

## 2026-08-14

#### 14:11:49 IST - T19a: Implement group-chat attachment replay
- Created `memory-bank/tasks/T19a.md` - Added the group-chat attachment replay subtask and acceptance criteria.
- Updated `memory-bank/tasks/T19.md` - Linked the deferred group-chat attachment work.
- Updated `memory-bank/tasks.md` - Registered T19a as an active project task.
- Updated `memory-bank/implementation-details/chat-ui-features.md` - Documented persisted group multimodal replay.
- Updated `memory-bank/implementation-details/multi-user-agent-chat.md` - Documented the relay contract extension.
- Modified `src/hooks/useMessageActions.ts` - Resolved and persisted group attachment parts and passed them into dispatch.
- Modified `src/agent/ParticipantRouter.ts` - Propagated resolved parts to agents and relay messages.
- Modified `src/agent/Orchestrator.ts` - Built multimodal historical and current group context.
- Modified `src/sync/WebSocketSyncAdapter.ts` - Preserved resolved parts on incoming remote messages.
- Modified `src/components/ChatApp.tsx` - Preserved resolved parts in legacy relay sync.
- Modified `src/agent/__tests__/Orchestrator.test.ts` - Added group multimodal replay coverage.
- Modified `src/agent/__tests__/ParticipantRouter.test.ts` - Added relay resolved-parts coverage.

## 2026-08-12

#### 11:11:56 IST - T22, T44: Reconcile UI decomposition and plan standalone preview
- Modified `memory-bank/tasks/T22.md` - Marked Phase 4 complete from `da4af7d`, retained Phase 5 as pending, and reconciled current file sizes.
- Created `memory-bank/tasks/T44.md` - Define standalone UI preview, host boundary, fixtures, browser checks, and acceptance boundaries.
- Created `memory-bank/implementation-details/standalone-ui-preview.md` - Record host-adapter architecture, fixture states, tool layers, and verification boundaries.
- Modified `memory-bank/implementation-details/chatapp-settings-decomposition.md` - Record current T22 state and link the T44 boundary.
- Modified `memory-bank/implementation-details/refactored-architecture.md` - Update current measurements and record planned layout/host modules.
- Modified `memory-bank/tasks.md` - Add T22 and T44 to the active registry, move completed T41 to the completed registry, and update relationships/counts.
- Modified `memory-bank/activeContext.md` - Record T22 reconciliation and T44 planning as current follow-up work.
- Modified `memory-bank/progress.md` - Record T22 Phase 4 completion and T44 planning.
- Modified `memory-bank/session_cache.md` - Add T22/T44 context and update next-session focus.
- Modified `memory-bank/sessions/2026-08-12-morning.md` - Append the documentation follow-up and no-push boundary.

#### 10:54:55 IST - T43: Reinstall dependencies and clear the TypeScript check
- Modified `tsconfig.json` - Enable `skipLibCheck` in the base configuration to match the existing production build and check configuration.
- Updated `memory-bank/tasks/T43.md` - Record the dependency reinstall, TypeScript configuration fix, and passing typecheck/build verification.
- Updated `memory-bank/implementation-details/multi-user-agent-chat.md` - Document the stale AI SDK installation diagnosis and dependency/typecheck resolution.
- Updated `memory-bank/activeContext.md` - Mark the AI SDK mismatch resolved and record final verification.
- Updated `memory-bank/progress.md` - Record dependency alignment and passing TypeScript/build checks.
- Updated `memory-bank/changelog.md` - Record the TypeScript/build verification cleanup.
- Updated `memory-bank/errorLog.md` - Record the stale dependency diagnosis and resolution.
- Updated `memory-bank/session_cache.md` - Add the dependency and typecheck completion to the current T43 session.
- Updated `memory-bank/sessions/2026-08-12-morning.md` - Append the dependency reinstall, TypeScript fix, and verification results.
- Updated `memory-bank/edit_history.md` - Add this edit-history entry for the canonical edit chunk.

#### 10:35:04 IST - T43, T15, T8: Mobile chat hardening, model badge fix, and format-gate cleanup
- Modified `src/components/ChatApp.tsx` - Count selected model IDs directly for the model-selection badge.
- Created `src/components/__tests__/ActionBar.test.tsx` - Cover zero, one, and two model selections and separate remote-user counts.
- Modified `styles.css` - Constrain the chat flex scroll chain, add touch scrolling behavior, and remove mobile composer bottom padding.
- Modified `memory-bank/tasks/T43.md` - Record mobile hardening, badge correction, tests, formatting, and verification.
- Modified `memory-bank/implementation-details/multi-user-agent-chat.md` - Document mobile scroll/composer behavior and badge count rules.
- Modified `memory-bank/activeContext.md` - Record the completed follow-up and current verification state.
- Modified `memory-bank/progress.md` - Record the completed mobile and selection-count follow-up.
- Modified `memory-bank/changelog.md` - Add the unreleased mobile, badge, test, and format-gate changes.
- Modified `memory-bank/tasks.md` - Move T43 to the completed registry.
- Modified `memory-bank/session_cache.md` - Close T43 and record the current session and history.
- Created `memory-bank/sessions/2026-08-12-morning.md` - Record the completed session and requested title.
- Modified `memory-bank/edit_history.md` - Add this generated-view entry because the local SQLite regeneration dependency is unavailable.

## 2026-08-11

#### 11:40 IST - T43: Phase 5 Completion + Bug Fixes (obsidian-ai)
- Modified `memory-bank/tasks/T43.md` — Marked Phase 5 COMPLETE with full details on attribution UI, typing indicators, participant bar, relay bug fix, post-phase bug fixes, and branch merge
- Modified `memory-bank/implementation-details/multi-user-agent-chat.md` — Added Phase 5 section with message attribution, typing indicators, participant bar, relay buffer fix, and post-phase bug fixes
- Modified `memory-bank/activeContext.md` — Updated T43 status to COMPLETE, removed from current focus
- Modified `memory-bank/progress.md` — Updated T43 status to COMPLETE with all 5 phases and commit details
- Created `memory-bank/edits/2026-08-11/114043-T43-phase5-completion.md` — Edit chunk documenting this memory-bank update
- **Key events**:
  - Phase 5a: Message attribution — MessageBubble.tsx shows fromUserId with colored dot
  - Phase 5b: Typing indicators — SyncAdapter.sendTyping()/onTyping(), WebSocketSyncAdapter implementation, 3-second auto-clear, 2-second throttle
  - Phase 5c: Participant bar — persistent bar below ActionBar showing agents + remote users with colored/green dots
  - Relay bug fix: broadcast() was receiving Buffer objects, fixed with raw.toString()
  - Post-Phase 5 fixes: ActionBar badge showing "1" when 0 agents (changed to ?? 0), participant bar missing single agents (added selectedAgents array)
  - Branch merged: t43-multi-user-agent-chat → main (fast-forward), pushed to GitHub
  - Commits: 90503d9 (Phase 5), ab23e5f (post-phase fixes)
- **Files changed**: src/sync/SyncAdapter.ts, src/sync/WebSocketSyncAdapter.ts, src/components/ChatApp.tsx, src/components/ChatInput.tsx, src/components/ChatMessages.tsx, src/components/MessageBubble.tsx, src/components/ActionBar.tsx, styles.css, relay/server.js
- **Testing**: Relay tested MacBook ↔ mobile devices; typing indicators not yet end-to-end tested; participant bar works after ab23e5f fix

## 2026-08-10

#### 21:00:00 IST - T40: Fix message rendering - relay sends type 'chat' not 'message'
- Modified `src/sync/WebSocketSyncAdapter.ts` - Fixed message type check from 'message' to 'chat'
- Modified `src/sync/WebSocketSyncAdapter.ts` - Extract content directly from data instead of data.message
- Modified `src/sync/WebSocketSyncAdapter.ts` - Fixed echo check to use data.sender instead of inner.sender
- Modified `memory-bank/tasks/T40.md` - Documented known bugs section with AI-triggering issue

#### 16:00:00 IST - T42: Create remote chat storage task and design doc
- Created `memory-bank/tasks/T42.md` - Remote chat storage task definition
- Created `memory-bank/implementation-details/remote-chat-storage-design.md` - Architecture design

#### 15:30:00 IST - T40: UI bug fixes for presence tracking
- Modified `src/components/ChatApp.tsx` - Added remoteUserCount prop to ActionBar
- Modified `src/components/ActionBar.tsx` - Fixed badge visibility, improved globe icon state
- Modified `src/hooks/useChatUI.ts` - Fixed callback race condition (register before connect)
- Modified `relay/server.js` - Include self in roster, fix join/leave broadcast order

#### 12:00:00 IST - T40: Presence tracking implementation - Phase 2 complete
- Modified `src/sync/SyncAdapter.ts` - Added onUserList and onPresence hooks to interface
- Modified `src/sync/WebSocketSyncAdapter.ts` - Implemented presence protocol (roster, join, leave)
- Modified `src/hooks/useChatUI.ts` - Added connectedUsers state tracking
- Modified `src/components/ActionBar.tsx` - Added remote user dropdown with radio icon and badge
- Modified `src/components/ChatApp.tsx` - Wired presence callbacks, register before connect
- Modified `relay/server.js` - Room state management, presence broadcast
- Modified `styles.css` - Dropdown styling with theme variables
- Created `memory-bank/implementation-details/presence-tracking.md` - Design doc for presence system

#### 03:06:00 IST - T40: Memory-bank restructuring

**Action:** Updated
**Scope:** memory-bank/ (presence-tracking.md, T40.md, activeContext.md)

**What changed:**
1. **presence-tracking.md** — Added comprehensive bug fix section (4 bugs found/fixed during session), callback ordering rule, screenshot of working dropdown UI, CSS file reference
2. **T40.md** — Trimmed from 200+ lines to high-level task tracker. Moved all implementation details to presence-tracking.md
3. **activeContext.md** — Condensed T40 section to ~10 lines with status + links to implementation doc
4. **assets/t40-remote-user-dropdown.jpg** — Added screenshot of working remote user dropdown

**Principle applied:** Implementation details live in `implementation-details/` docs, not in task files or active context.

## 2026-08-09

#### 23:59:00 IST - T40: Presence Tracking Implementation

**Action:** Modified, Updated
**Files:**
- `relay/server.js` — Added presence tracking (join/leave/roster)
- `src/sync/SyncAdapter.ts` — Added `onUserList`, `onPresence` hooks
- `src/sync/WebSocketSyncAdapter.ts` — Implemented presence protocol
- `src/hooks/useChatUI.ts` — Added `connectedUsers` state
- `src/components/ActionBar.tsx` — Added remote user dropdown
- `src/components/ChatApp.tsx` — Wired presence callbacks to UI

**Details:**
- Relay now tracks room membership and broadcasts roster on join
- SyncAdapter v2 interface adds presence hooks
- WebSocketSyncAdapter filters self-echo messages
- Adjacent dropdown in ActionBar shows connected human users
- Build passes, all 188 tests pass
- Commit: `6746201`

#### 23:17:00 IST - T40: Updated task plan for Phase 2 (Presence & User List)

- **Action:** Modified
- **Files:** `memory-bank/tasks/T40.md`
- **Details:**
  - Updated architecture diagram to show `ChatApp` instead of `GroupChatApp`
  - Added note about GroupChatView removal (2026-08-09)
  - Restructured Phase 2 into Presence & User List (current) and Rich Features (next)
  - Added specific subtasks:
    - Relay presence tracking (join/leave/roster broadcast)
    - SyncAdapter v2 with `onUserList`, `onPresence` hooks
    - Adjacent dropdown in ActionBar for remote users
    - Message attribution (AI vs human)
  - Updated file modification list for Phase 2 implementation

## 2026-08-08

#### 18:15 IST - T40: Architecture audit for multi-user chat
**Action:** Audited
**Files:** `src/storage/ChatStorage.ts`, `src/components/GroupChatApp.tsx`, `src/agent/Orchestrator.ts`, `src/components/MessageBubble.tsx`, `src/types.ts`, `src/api.ts`
**Description:** Comprehensive audit of obsidian-ai chat architecture for multi-user sync feasibility. Findings: LaTeX rendering, group chat UI, message types, and storage interface all support multi-user with minimal changes. Main gap is real-time sync layer (Supabase adapter). Created audit doc, task file, and updated memory-bank tracking.

## 2026-08-05

#### 17:48:15 IST - T39a: Read-only provider host implementation
- Created `src/integrations/types.ts`, `src/integrations/ProviderRegistry.ts`, and `src/integrations/__tests__/ProviderRegistry.test.ts` - Added the public v1 provider contract, discovery/validation, opt-in read-only execution, and focused tests.
- Created `src/settings-sections/integrations.ts` - Added provider availability and opt-in settings without credential display.
- Modified `src/main.ts`, settings, tool execution, chat wiring, and tool cards - Composed enabled read-only provider tools into normal chat and rendered generic provider labels.
- Modified `memory-bank/tasks/T39.md`, `memory-bank/tasks/T39a.md`, `memory-bank/implementation-details/integration-provider-api.md`, context, progress, cache, and session records - Recorded the implemented host slice and deferred boundaries.

#### 17:39:15 IST - T39: Provider integration UI plan
- Modified `memory-bank/implementation-details/integration-provider-api.md` - Added the settings, pending-operation, inline result/progress, and active-policy UI contracts with ASCII wireframes.
- Modified `memory-bank/tasks/T39.md` - Added the provider-generic UI boundary and linked it to the existing architecture.
- Modified `memory-bank/tasks/T39a.md` - Added UI acceptance criteria, file boundaries, and the first-read-only-slice scope.
- Modified `memory-bank/activeContext.md` - Recorded the Integrations settings and generic consent/progress-card direction.
- Modified `memory-bank/progress.md` - Recorded the provider UI delivery sequence and preserved the single Git-sidebar boundary.
- Modified `memory-bank/session_cache.md` - Added the T39 UI contract to current planning context.
- Modified `memory-bank/sessions/2026-08-05-night.md` - Appended the UI planning addendum while preserving prior session content.
- Modified `memory-bank/edit_history.md` - Added the generated-view entry for this edit chunk.

#### 17:31:59 IST - T39: Integration Provider API planning
- Created `memory-bank/tasks/T39.md` - Defined the paused provider-platform umbrella task, dependencies, acceptance criteria, and safety boundary.
- Created `memory-bank/tasks/T39a.md` - Scoped host registration, lifecycle, policy, availability, and test work as the first subtask.
- Created `memory-bank/tasks/T39b.md` - Scoped Obsidian Git as the first bounded provider without authorizing changes to its separate checkout.
- Created `memory-bank/implementation-details/integration-provider-api.md` - Documented the versioned contract, ownership model, lifecycle, Git capabilities, safety policy, and delivery sequence.
- Modified `memory-bank/tasks/T26.md` - Redirected planned one-off plugin bridges to the T39 provider contract.
- Modified `memory-bank/tasks/T38.md` - Recorded approval and audit dependencies for provider mutations.
- Modified `memory-bank/implementation-details/agentic-tool-calling.md` - Cross-linked the planned provider API at the existing agent-tool boundary.
- Modified `memory-bank/implementation-details/ai-intelligence-layer.md` - Marked direct private-plugin bridges as historical exploration and linked T39.
- Modified `memory-bank/tasks.md` - Registered T39 and its two paused subtasks with dependency relationships.
- Modified `memory-bank/activeContext.md` - Added the current provider-platform decision and task state.
- Modified `memory-bank/progress.md` - Added the deferred delivery sequence and Git capability boundary.
- Modified `memory-bank/session_cache.md` - Recorded T39 and its subtasks in current task context.
- Modified `memory-bank/sessions/2026-08-05-night.md` - Appended the provider-platform planning addendum while preserving the completed session record.
- Modified `memory-bank/edit_history.md` - Added the generated-view entry for this edit chunk.

#### 13:23:15 IST - T38: Tool approval, batch, and audit plan
- Created `memory-bank/tasks/T38.md` - Recorded the paused implementation plan and acceptance criteria.
- Created `memory-bank/implementation-details/tool-approval-batch-audit-plan.md` - Defined the approval policies, batch plan contract, audit record, privacy limits, and delivery sequence.
- Modified `memory-bank/tasks.md` - Registered the paused task and dependencies.
- Modified `memory-bank/tasks/T11.md` - Linked the audit-log follow-up.
- Modified `memory-bank/activeContext.md` - Recorded the deferred design context.
- Modified `memory-bank/progress.md` - Recorded the deferred task state.
- Modified `memory-bank/session_cache.md` - Recorded the paused task in the session cache.
- Modified `memory-bank/sessions/2026-08-05-night.md` - Appended the deferred plan to the existing session.
- Modified `memory-bank/edit_history.md` - Added the generated-view entry for this edit chunk.

#### 13:10 IST - T37: Idempotent bulk note creation
- Modified `src/agent/ToolExecutor.ts` - Existing targets now skip safely while missing targets continue to be created; partial results preserve created and skipped paths.
- Modified agent tool schemas, prompt text, and tool result UI - Documented the no-overwrite behavior before approval and reported it after execution.
- Created `src/agent/__tests__/ToolExecutor.test.ts` - Verified that an existing note does not block creation of the rest of a batch.
- Modified Memory Bank task, implementation, context, progress, cache, session, task-index, and edit-history records - Recorded the fix and the decision to keep other mutation batching operation-specific.

#### 11:27:43 IST - T34: Per-tab chat process isolation manual verification
- Modified `memory-bank/tasks/T34.md` - Recorded the user's confirmation that replies stay in their originating tabs.
- Modified `memory-bank/implementation-details/per-tab-chat-process-isolation.md` - Added manual validation evidence.
- Modified `memory-bank/activeContext.md`, `memory-bank/progress.md`, `memory-bank/session_cache.md`, and `memory-bank/sessions/2026-08-05-night.md` - Synchronized the verified completion state.
- Modified `memory-bank/edit_history.md` - Logged this documentation closeout.

#### 10:55:22 IST - T34: Per-tab chat process isolation planning
- Created `memory-bank/tasks/T34.md` - Added the high-priority bugfix task for session-keyed streaming/process state.
- Created `memory-bank/implementation-details/per-tab-chat-process-isolation.md` - Documented diagnosis, required contract, phased implementation plan, and regression tests.
- Modified `memory-bank/tasks.md` - Added T34 to active tasks and task relationships.
- Modified `memory-bank/tasks/T15.md` - Linked T34 as the tabbed-chat runtime isolation follow-up.
- Modified `memory-bank/activeContext.md` - Set the current focus to T34 and recorded the root-cause summary.
- Modified `memory-bank/progress.md` - Added the T34 active progress entry.
- Modified `memory-bank/edit_history.md` - Logged this documentation and planning update.
- Modified `memory-bank/sessions/2026-08-05-night.md` - Appended the T34 planning status to the current session record.

#### 11:11:04 IST - T34: Per-tab chat process isolation implementation
- Created `src/hooks/useChatRuntimeState.ts` - Added the session-keyed runtime map and helpers.
- Modified `src/components/ChatApp.tsx` - Rendered streaming UI and pending tools from the active session runtime only.
- Modified `src/hooks/useMessageActions.ts` - Routed generation state, stop, tool executors, approval resolvers, and token totals through the origin session.
- Modified `src/hooks/useSessionActions.ts` - Aborted and cleared runtime state when tabs/sessions are closed.
- Modified hook tests - Covered cross-tab stream routing and tool session identity.
- Verification passed: focused hook tests, full `pnpm test`, `pnpm run build`, and `git diff --check`.

#### 01:53:30 IST - T15: Settings navigation and draft tab lifecycle
- Modified `src/settings-sections/SettingsTab.ts` - Repaired in-panel navigation and the AI Intelligence Layer shortcut target
- Modified `src/settings-sections/chatDefaults.ts` - Documented the allowed tab-title width range
- Modified `src/settings-sections/diagnostics.ts` - Replaced the unstructured usage line with a model table
- Modified `src/settings.ts` - Persisted and normalized the tab-title width setting
- Modified `src/components/ChatApp.tsx` - Passed only saved sessions to history and export views
- Modified `src/components/ChatTabBar.tsx` - Applied the configured tab-title width
- Modified `src/components/SessionPickerModal.tsx` - Filtered zero-message drafts from history
- Modified `src/hooks/useChatSession.ts` - Separated drafts from persisted sessions and cleaned legacy empty sessions
- Modified `src/hooks/useSessionActions.ts` - Opened each new draft tab and discarded unsent tabs on close
- Created `src/hooks/__tests__/useSessionActions.test.ts` - Covered repeated draft-tab creation
- Created `src/components/__tests__/SessionPickerModal.test.tsx` - Covered history filtering
- Modified `styles.css` - Added compact diagnostics and Settings navigation styles
- Modified `memory-bank/implementation-details/past-session-search-and-tabs.md` - Documented the tab contract and diagrams

## 2026-08-02

#### 18:23 IST - T32: Security Audit Initiated
- Modified `memory-bank/tasks/T32.md` - Created security hardening task tracking path traversal, XSS, SSRF, ReDoS

#### 18:35 IST - T32: Path Traversal Protection
- Modified `src/agent/ToolExecutor.ts` - Added `isPathAllowed()` and `denyPath()` helpers; blocks `.obsidian/`, `.trash/`, `.git/`, `../` paths
- Modified `src/agent/ToolExecutor.ts` - Applied path checks to `readNote`, `editNote`, `appendToNote`, `createNote`, `patchNote`, `editSection`, `createFolder`, `moveNote`, `deleteNote`

#### 18:40 IST - T32: XSS Sanitization
- Created `src/lib/sanitizeHtml.ts` - `sanitizeHtmlForRenderer()` strips `<script>`, `javascript:`, `on*` handlers, `data:text/html`, `<iframe>`
- Modified `src/components/MessageBubble.tsx` - Applied `sanitizeHtmlForRenderer()` before all `MarkdownRenderer.render()` calls
- Modified `src/components/ChatMessages.tsx` - Applied `sanitizeHtmlForRenderer()` to streaming text parts and remaining text

#### 18:43 IST - T32: SSRF Validation
- Modified `src/api/AgentApiManager.ts` - Added `validateAgentUrl()` helper blocking localhost, private IPs, non-HTTP(S) schemes
- Modified `src/api/AgentApiManager.ts` - Added SSRF check at `streamAgentResponse()` entry point

#### 18:45 IST - T32: ReDoS Fix
- Modified `src/agent/ToolExecutor.ts` - Replaced regex-based DuckDuckGo HTML scraping with `DOMParser`

#### 18:46 IST - T32: JSON Validation
- Modified `src/storage/ChatStorage.ts` - Added per-line try/catch + schema validation in `_loadMessages()`

#### 18:51 IST - T32: Security Tests
- Created `src/agent/__tests__/security.test.ts` - 15 tests covering XSS sanitization and SSRF validation
- Modified `package.json` - No changes (vitest already configured)

#### 18:55 IST - T32: Task Completion
- Modified `memory-bank/tasks/T32.md` - Updated with implementation details and test results
- Modified `memory-bank/tasks.md` - Marked T32 as completed

## 2026-07-28

#### 17:35 IST - T29: Android Background Processing — INVESTIGATION COMPLETE, DEFERRED

**Work Done:**
- Cloned and examined AI Tagger Universe source code (https://github.com/Agents365-ai/obsidian-ai-tagger-universe)
- Examined Obsidian API types (`obsidian.d.ts`) for mobile lifecycle hooks
- Analyzed difference between AI Tagger Universe and obsidian-ai streaming behavior

**Key Findings:**
1. AI Tagger Universe has NO special background handling — it simply doesn't stream (single request/response pattern)
2. Obsidian API provides NO mobile lifecycle hooks (`onResume`, `onPause`, `onBackground`, etc.)
3. Android WebView pauses JavaScript execution when app backgrounds — this is platform behavior, not a plugin bug
4. EventSource/fetch connections abort when app backgrounds

**Files Modified:**
- `memory-bank/tasks/T29.md` — Updated with investigation results, marked as DEFERRED
- `memory-bank/activeContext.md` — Updated T29 status from IN PROGRESS to DEFERRED

**Decision:** Accept mobile limitation. Don't implement complicated solutions. Desktop = full streaming, Mobile = pauses on background.

**Tags:** #wontfix #platform-limitation #mobile #android #defer

## 2026-07-14

#### 02:55 IST - T25: Unit Test Infrastructure Task Created
**Action**: Created
**Files**:
- `memory-bank/tasks/T25.md` — New task file for unit test infrastructure
- `memory-bank/implementation-details/T25-test-strategy.md` — Implementation doc with phased approach
**Rationale**: Project has zero project-level unit tests. Streaming fixes from this session are hard to verify without tests. T25 deferred until after release cycle.

#### 02:50 IST - T4: Streaming Bug Fixes (OpenResponses path)
**Action**: Modified
**Files**:
- `src/agent/OpenResponsesLoop.ts` — Added `totalAccumulatedText` to persist text across tool-call steps. Both `streamAgentResponse` and `continueWithToolResult` now append to it and pass cumulative text to `onTextDelta`.
- `src/agent/AgentLoop.ts` — Added incremental token counting during `text-delta` streaming (`runningTotal += estimateTokens(event.text)`). Removed redundant end-of-step text recounts to prevent double-counting.
- `src/components/ChatMessages.tsx` — Fixed `StreamingBubble` remaining-text logic (fallback when `lastIndexOf` returns -1) and React root cleanup (collect `toolRoots[]`, unmount in cleanup).
**Rationale**: Three bugs where async streaming state accumulation broke tool call rendering, token counting, and text display. Text-based workflow used for all memory-bank updates.

## 2026-05-30

#### 03:20:36 IST - T19/T22: ChatInput UI/UX fixes and reasoning content bug

**Commit `8f6b94a`**: ChatInput layout refactor + reasoning fix
- Modified `src/agent/AgentLoop.ts` — Removed `{ type: "reasoning" }` from assistant message content parts before they are sent back to the LLM. The Vercel AI SDK OpenAI provider silently strips reasoning parts, causing Kimi API to reject with "reasoning_content is missing". Fix: accumulate reasoning for potential display but exclude from conversation history loop.
- Modified `src/components/ChatInput.tsx` — Removed pin-current button (📌) as redundant with @mention. Removed reference chips above textarea (reverted to inline formatting). Reorganized layout: Row 1 = textarea + send/stop button; Row 2 = attachment chips + attach dropdown + thinking toggle. Added `pressEnterToSend` prop support.
- Modified `src/components/ChatApp.tsx` — Removed `onToggleActiveNote` and `hasActiveNote` props from ChatInput. Passed `pressEnterToSend` setting.
- Modified `src/settings.ts` — Added `pressEnterToSend: boolean` (default `true`) to `ObsidianAISettings` interface and defaults.
- Modified `src/settings-sections/chatDefaults.ts` — Added Settings UI toggle for "Press Enter to send".
- Modified `styles.css` — Added `.chat-input-toolbar` and `.chat-input-toolbar-left` classes. Removed `.chat-input-left` styling. Adjusted gaps for new layout.

**Commit `653d84b`**: Restore attachments/context items on edit
- Modified `src/hooks/useMessageActions.ts` — `handleEditMessage` now restores `msg.attachments` and `msg.contextItems` from the original message. `handleCancelEdit` clears them. `handleSend` finally block clears `messageAttachments`.
- Modified `src/components/ChatInput.tsx` — Added `contextItems` and `onRemoveContextItem` props. Showed reference chips for attachments, context items, and parsed `[[wiki-links]]` from textarea value.
- Modified `src/components/ChatApp.tsx` — Passed `contextItems` and `handleRemoveContextItem` to ChatInput.
- Modified `styles.css` — Added `.chat-reference-chips`, `.chat-reference-chip`, `.chat-context-chip`, `.chat-wikilink-chip` styling.

**Commit `baf7b39`**: Three chat UI/API bugs
- Modified `src/agent/types.ts` — Added `reasoning-delta` to `StreamEvent` type.
- Modified `src/api.ts` — Added `reasoning-delta` handling in `streamChatWithTools`.
- Modified `src/agent/AgentLoop.ts` — Accumulated `stepReasoning` from reasoning-delta events, added reasoning content part to assistant message.
- Modified `src/components/ChatInput.tsx` — Replaced "Resubmit"/"Cancel" text buttons with icon-only compact buttons (▶ / ✕).
- Modified `styles.css` — Increased `.chat-input-row` gap from 6px to 8px, `.chat-input-left/right` gap from 4px to 6px.

## 2026-05-25

#### 22:44:00 IST - T19: File attachments core implementation
- Created `src/context/AttachmentEngine.ts` - Resolve vault files (markdown/image/PDF) to AI SDK content parts
- Modified `src/types.ts` - Added `Attachment` interface with id/type/path/name fields
- Modified `src/components/ChatInput.tsx` - Added 📎 dropdown for note/image/PDF picker, attachment chips with remove button, showThinking prop
- Modified `src/components/MessageBubble.tsx` - Render attachment chips below user messages, conditional stripThinkingTags via showThinking prop
- Modified `src/api.ts` - Added SdkMessage and MessageContentPart types; streamChat/streamChatWithTools accept multimodal messages; MESSAGE_HISTORY_LIMIT → maxContextMessages
- Modified `src/components/ChatApp.tsx` - handleSend resolves attachments via AttachmentEngine; messageAttachments state; showThinking state; selectedProfileIds fallback to active profile
- Modified `src/components/ChatMessages.tsx` - showThinking prop pass-through
- Modified `src/agent/Orchestrator.ts` - parseAndRoute accepts optional attachments param

#### 22:50:00 IST - T21: CLI test harness task created
- Created `memory-bank/tasks/T21.md` - Task file for CLI test harness with completion criteria and architecture
- Created `memory-bank/implementation-details/cli-test-harness.md` - Implementation doc with mock vault, settings loader, test script examples

#### 22:51:00 IST - T18: Web search implementation doc moved
- Created `memory-bank/implementation-details/web-search.md` - Moved from `memory-bank/implementation-details/T18-web-search.md`
- Deleted `memory-bank/implementation-details/T18-web-search.md` - Stale location, content now in implementation-details

#### 23:03:00 IST - META-1: Memory bank update for T19/T21
- Modified `memory-bank/tasks/T19.md` - Marked core implementation complete, updated Last Active, added commit a071a24
- Modified `memory-bank/tasks/T16.md` - Added Phase 17 thinking display toggle, updated Last Active
- Modified `memory-bank/tasks.md` - Added T21 to registry, updated active count to 6, updated T19 description
- Modified `memory-bank/activeContext.md` - Updated current focus to T19, added T21 section
- Modified `memory-bank/progress.md` - Added T19 and T21 sections, updated Last Updated
- Modified `memory-bank/session_cache.md` - Updated for T19 completion and T21 creation
- Modified `memory-bank/sessions/2026-05-25.md` - Appended night session for T19 implementation
- Modified `memory-bank/techContext.md` - Added Attachment System architecture and multimodal message types

#### 20:45:00 IST - META-1: Format normalize task files + add T19 to registry
- Modified `memory-bank/tasks.md` - Added T19 to registry (Active: 5), updated META-1 description to T1–T19, added T19 active task section
- Modified `memory-bank/tasks/T1.md` - Fixed frontmatter format (--- spacing), restructured headers to use ## sections instead of bold lines, added Started/Last Active/Dependencies fields
- Modified `memory-bank/tasks/T10.md` - Same format normalization: frontmatter fix, header restructuring, added Started/Last Active/Dependencies/Related Files
- Modified `memory-bank/tasks/T11.md` - Same format normalization
- Modified `memory-bank/tasks/T12.md` - Same format normalization
- Deleted `memory-bank/tasks/T14-impl.md` - Removed stale/duplicate implementation file (content merged into T14a.md and implementation docs)
- Modified `memory-bank/tasks/T14a.md` - Added frontmatter, restructured headers, added Completion Criteria/Related Files/Progress/Context sections
- Modified `memory-bank/tasks/T18.md` - Fixed frontmatter placement (moved to top), restructured headers, consolidated duplicate Dependencies section, added Related Files
- Modified `memory-bank/tasks/T7.md` - Same format normalization
- Modified `memory-bank/tasks/T8.md` - Same format normalization
- Modified `memory-bank/tasks/T9.md` - Same format normalization

#### 13:01:00 IST - T16: Fix model fetching for all providers in ProfileCard
- Modified `src/components/ProfileCard.tsx` - Replaced inline handleFetchModels with ChatApiManager.fetchModels() delegation
- Modified `src/components/ProfileCard.tsx` - Added plugin prop to ProfileEditForm, ProfileCard, ProfileCardProps interface
- Modified `src/components/ProfileCard.tsx` - ProfileList passes plugin to each ProfileCard
- Modified `src/components/ProfileCard.tsx` - handleFetchModels now uses: new ChatApiManager(plugin.settings, plugin.app).fetchModels(draft)

#### 12:55:00 IST - T16: Fix duplicate profile ID on copy
- Modified `src/components/ProfileCard.tsx` - handleDuplicate now destructures id before spreading source fields: const { id: _unused, ...sourceWithoutId } = source
- Modified `src/components/ProfileCard.tsx` - createProviderProfile receives sourceWithoutId instead of full source, ensuring new unique ID generation

## 2026-05-24

#### 17:05:00 IST - T16: Profile dropdown single-select + auto-scroll fixes
- Modified `src/components/ChatApp.tsx` - Added check for `selectedProfileIds.size === 1` in non-group-chat path to use selected profile instead of Settings default
- Modified `src/components/ChatMessages.tsx` - Added `currentAiMessage` to auto-scroll `useEffect` dependency array so chat scrolls on every streaming chunk
- Modified `memory-bank/tasks/T16.md` - Updated known issues (resolved #10 and #11), added commits to progress log, updated source_commit to 8055cd5

## 2026-05-23

#### 23:54:00 IST - T13: Fixed folder context overload, enhanced list_notes, fixed count_notes accuracy
- Modified `src/context/ContextEngine.ts` - Folder and tag context items now return file listings with tool-usage instructions instead of reading full file contents. Prevents token bloat when large folders are attached as context.
- Modified `src/agent/tools.ts` - Added `include_subfolders` (boolean, default true) and `depth` (number, default 1, max 3) parameters to `list_notes` tool definition
- Modified `src/agent/ToolExecutor.ts` - `listNotes()` now returns `subfolders` array alongside `files`; `countNotes()` reports 5-count breakdown (totalCount, markdownCount, directCount, directMarkdownCount, subfolderCount)
- Modified `src/components/ChatApp.tsx` - `buildSystemPrompt()` now describes enhanced `list_notes` and `count_notes` capabilities to the LLM

## 2026-05-17

#### 12:16 IST - T16: Fix resolvedProfile in handleSend deps
- Modified `src/components/ChatApp.tsx` — Added `resolvedProfile` to `handleSend` useCallback dependency array so retry uses correct profile after switch (+1 line, -1 line)

#### 11:36 IST - T16: Fix settingsTick increment on profile switch
- Modified `src/components/ChatApp.tsx` — Increment `settingsTick` when switching profile via dropdown so `resolvedProfile` useMemo updates immediately (+1 line)

#### 11:25 IST - T16: Profile dropdown mid-session switching
- Modified `src/components/ChatApp.tsx` — Dropdown uses radio buttons in 1:1 mode, checkbox in council mode; clicking profile in 1:1 mode updates `activeProviderProfileId` + saves settings (+24 lines)
- Modified `src/components/ActionBar.tsx` — Badge always shows at least 1 instead of 0 (-1 line, +8 lines net)

#### 11:12 IST - T16: Message metadata (model name + response time) in bubbles
- Modified `src/types.ts` — Added `modelName?: string` and `responseTimeMs?: number` to `ChatMessage` (+4 lines)
- Modified `src/components/ChatApp.tsx` — Track `streamStartTime`, attach model/timing to assistant messages (+5 lines)
- Modified `src/components/MessageBubble.tsx` — Render metadata row with model | timing | tokens (+16 lines)
- Modified `styles.css` — `.chat-message-metadata` styling, flex row with gaps (+32 lines)

#### 11:01 IST - T18: Add Tavily and Exa search providers
- Modified `src/agent/ToolExecutor.ts` — Added `searchTavily()` and `searchExa()` methods (+88 lines)
- Modified `src/settings.ts` — Extended `WebSearchProvider` type, added `tavilyApiKey` and `exaApiKey` fields, updated dropdown (+46 lines)

## 2026-05-16

#### 15:53:00 IST - T16: Fix Session Switch Race Condition
- Modified `src/components/ChatApp.tsx` - handleLoadSession: setParticipants() before setActiveSessionId()
- Modified `src/components/ChatApp.tsx` - handleDeleteSession: setParticipants() before setActiveSessionId()
- Fixed: participants-to-session sync effect was overwriting new session with old participant list

#### 15:48:00 IST - T16: Sync Participants When Switching Sessions
- Modified `src/components/ChatApp.tsx` - handleLoadSession: restore participants from loaded session
- Modified `src/components/ChatApp.tsx` - handleNewChat: clear participants for new sessions
- Modified `src/components/ChatApp.tsx` - handleDeleteSession: restore participants when auto-switching to most recent

#### 15:40:00 IST - T16: Persist Participants Across Plugin Reloads
- Modified `src/components/ChatApp.tsx` - On load: restore participants from active session's stored data
- Modified `src/components/ChatApp.tsx` - Added useEffect to sync participants into active session on change

#### 15:22:00 IST - T16: Reframe Debate Prompts for Agent Participation
- Modified `src/agent/Orchestrator.ts` - buildDebatePrompt() now includes original user question explicitly
- Modified `src/agent/Orchestrator.ts` - System prompt reframed: "collaborative discussion" instead of "respond to other agents"
- Modified `src/agent/Orchestrator.ts` - PASS instruction simplified: "if satisfied with what's been said"

#### 15:13:00 IST - T16: Fix Debate Mode Toggle Visibility
- Modified `src/components/ActionBar.tsx` - Changed condition from participantCount > 1 to (participantCount ?? 0) >= 2
- Modified `src/components/ActionBar.tsx` - Added debug console.log for participantCount tracking

#### 13:31:00 IST - T16: Debate Mode — Agents Talk to Each Other
- Modified `src/agent/Orchestrator.ts` - Added debate() method: Round 1 all agents respond to user, Round 2 agents see each other's responses and can add follow-ups (or reply PASS)
- Modified `src/agent/Orchestrator.ts` - Added buildDebatePrompt() and isPass() helpers
- Modified `src/components/ActionBar.tsx` - Added debateMode and onToggleDebateMode props, debate toggle button (message-circle/message-square icon)
- Modified `src/components/ChatApp.tsx` - Added debateMode state, wired to handleSend (uses debate() when on, dispatch() otherwise)
- Modified `styles.css` - Added .chat-debate-indicator styling

#### 13:26:00 IST - T16: Hide Separate GroupChatView from Plugin UI
- Modified `src/main.ts` - Commented out GroupChatView registration, ribbon icon, and command (code preserved)
- GroupChatApp.tsx and GroupChatView.ts remain in codebase for future use

#### 13:12:00 IST - T16: Move Participant Button to ActionBar
- Modified `src/components/ActionBar.tsx` - Added participantCount and onToggleParticipantDropdown props, users icon with badge
- Modified `src/components/ChatApp.tsx` - Removed separate participant bar row, wrapped ActionBar in .chat-action-bar-wrapper with inline dropdown
- Modified `styles.css` - ActionBar horizontal scroll on mobile (overflow-x: auto, scrollbar hidden), removed participant bar styles

#### 12:59:00 IST - T16: Participant Dropdown with Checkboxes
- Modified `src/components/ChatApp.tsx` - Replaced chip-based roster with dropdown trigger, checkbox list for profile selection
- Modified `styles.css` - Dropdown styling: absolute positioning, hover states, badge styling, full-width on mobile
- Removed `chat-participant-chip` CSS (replaced by dropdown)

#### 12:48:00 IST - T16: Mobile-Responsive UI + Zen Mode
- Modified `src/components/ChatApp.tsx` - Added zenMode state, zen CSS class on panel, floating exit button
- Modified `src/components/ActionBar.tsx` - Added zen mode toggle button (eye icon)
- Modified `src/components/ChatInput.tsx` - Auto-expand textarea (1-4 lines), compact icon-only send/stop buttons
- Modified `styles.css` - Zen mode styles (.is-zen hides chrome), mobile media queries, message actions always-visible on touch
- Created `mobile-redesign-proposal.md` - Design doc for mobile-responsive chat overhaul

#### 09:30:00 IST - T16: Fix handleSend dependency array (stale orchestrator)
- Modified `src/components/ChatApp.tsx` — handleSend dependency array: [isStreaming, plugin] → [isStreaming, plugin, orchestrator, isGroupChat, participants, typingAgents]
- Modified `src/components/ChatApp.tsx` — handleRetry dependency array: added orchestrator, isGroupChat, participants

#### 09:20:00 IST - T16: Fix main.ts CHAT_VIEWTYPE registration
- Modified `src/main.ts` — restored CHAT_VIEWTYPE registration alongside GROUP_CHAT_VIEWTYPE; activateChatView() restored before activateGroupChatView()

#### 09:15:00 IST - T16: Unified ChatApp with participant roster + council mode toggle
- Modified `src/components/ChatApp.tsx` — merged group chat into same panel: imports (Orchestrator, MentionParser, GroupChatParticipant, getAgentColor, getAgentIcon), participant state, orchestrator useMemo, handleSend branches (group chat path at top), handleAddParticipant, handleRemoveParticipant, handleToggleGroupChat, participant bar UI below ActionBar
- Modified `src/components/ChatApp.tsx` — helper functions: getAgentColor(provider), getAgentIcon(provider)
- Modified `styles.css` — .chat-participant-bar, .chat-participant-chip, .chat-participant-chip-name, .chat-participant-typing (chat-typing-pulse animation), .chat-participant-remove, .chat-council-toggle, .chat-council-toggle-label

#### 09:00:00 IST - T16: Group Chat MVP — MentionParser, Orchestrator, GroupChatView, GroupChatApp
- Created `src/agent/MentionParser.ts` — parseMentions(), hasMentions() with @AgentName regex
- Created `src/agent/Orchestrator.ts` — Orchestrator class: sequential dispatch, full/isolated context strategies, profile resolution
- Created `src/views/GroupChatView.ts` — GROUP_CHAT_VIEWTYPE ItemView with React root, getDisplayText "AI Council", getIcon "users"
- Created `src/components/GroupChatApp.tsx` — participant roster, typing indicators, simple action bar, group chat rendering
- Modified `src/types.ts` — ChatMessage: +agentId, +agentName, +agentColor; +GroupChatParticipant; ChatSession: +isGroupChat, +participants
- Modified `src/components/MessageBubble.tsx` — agent identity dot (colored) + agentName display
- Modified `src/main.ts` — registerView(GROUP_CHAT_VIEWTYPE), addRibbonIcon("users"), addCommand("open-ai-council")
- Modified `styles.css` — .group-chat-roster, .group-chat-participant, .group-chat-typing (pulse animation), .chat-bubble-agent-dot

## 2026-05-15

#### 09:57:00 IST - T15/T16: Task creation and architecture design
- Created `memory-bank/tasks/T15.md` — Tabbed Chat Interface with Multi-Profile Support
  - 6 phases: Settings UI profile list, core data model, ChatApp refactor, tab bar UI, conversation isolation, integration test
  - Architecture: per-panel `profileId`, `ChatEngine`/`useChat`/`ChatApp` accept optional profile prop
  - Settings UI overhaul: profile cards with provider icon, masked API keys, add/edit/delete/test buttons
  - Lazy engine init for inactive tabs
- Created `memory-bank/tasks/T16.md` — Group Chat (Multi-Agent Conversation)
  - 7 phases: identity-aware messages, mention-based orchestration, agent identity UI, context sharing, tool locking, parallel/sequential modes, integration test
  - Architecture: `Orchestrator` class, `MentionParser`, `@AgentName` routing
  - Context strategies: Full Transparency (default) vs Isolated
  - Tool execution: per-agent attribution, file-level locking for concurrent edits
- Modified `memory-bank/tasks.md` — Added T15 and T16 to registry table; updated active tasks and pending tasks sections
- Modified `memory-bank/activeContext.md` — Updated current focus to T15; added T15 and T16 architecture details; updated next steps
- Modified `memory-bank/session_cache.md` — Updated task registry with T15 (🔄) and T16 (⏸️)
- Created `memory-bank/edits/2026-05-15/20250515-095700-t15-t16-task-creation.md` — This edit chunk

## 2026-05-14

#### 07:52:41 IST - T13: Add auto-approve toggle button to chat action bar
- Modified `src/components/ActionBar.tsx` - Added `autoApprove` and `onToggleAutoApprove` props; inserted toggle button between Load and Settings buttons with visual active/inactive states
- Modified `src/components/ChatApp.tsx` - Added `handleToggleAutoApprove()` callback that flips `plugin.settings.autoApply`, saves settings, and shows a Notice; wired props to ActionBar
- Modified `src/views/ObsidianAIChatView.ts` - Added `saveSettings(): Promise<void>` to `ChatPluginLike` interface so ChatApp can persist the toggle
- Modified `styles.css` - Added `.chat-auto-approve-btn` transition and `.chat-auto-approve-btn.is-active` accent styling

#### 07:52:41 IST - T13: Redesign pending tool call UI with summary preview; add search_notes tool
- Modified `src/components/ChatApp.tsx` - Replaced raw `JSON.stringify(pendingToolCall.args)` with `PendingToolCallPreview` component that shows tool-specific summaries: line count, char count, preview excerpt for edits; find/replace rows for patches; heading info for section edits; query for searches. Added `search_notes` mention to system prompt.
- Modified `src/agent/types.ts` - Added `matches`, `count`, `query` optional fields to `ToolResult` interface for search_notes return values
- Modified `src/agent/tools.ts` - Added `searchNotesTool` with Zod schema; included in `noteTools` export
- Modified `src/agent/ToolExecutor.ts` - Added `searchNotes()` handler that filters vault files by basename/path substring match, returns up to 50 matches
- Modified `styles.css` - Added `.pending-tool-summary`, `.pending-tool-title`, `.pending-tool-meta`, `.pending-tool-preview`, `.pending-tool-patch-row/value/label` styles; set `max-height: 280px` and `overflow-y: auto` on `.pending-tool-call`; made Approve/Reject buttons sticky at bottom

## 2026-05-12

#### 13:47:10 IST - T9/META-1: Document GPT 5.4 Medium Settings rewrite, regression context, and memory sync

- Updated `memory-bank/tasks/T9.md` — Added Regression Context section documenting lost re-entrancy guards, infinite re-entrant loops, memory leaks, and GPT 5.4 Medium rewrite credit
- Updated `memory-bank/implementation-details/settings-provider-design.md` — Added 2026-05-12 Regression and Rewrite section with symptom description, GPT 5.4 Medium credit, and guard mechanism code block
- Updated `memory-bank/sessions/2026-05-12.md` — Added GPT 5.4 Medium credit to focus task and work completed; documented Settings panel regression (lost guards → infinite loops + memory leaks)
- Updated `memory-bank/edits/2026-05-12/111359-t11-t2-t9-memory-sync.md` — Added GPT 5.4 Medium Session Context section explaining the regression and rewrite
- Updated `memory-bank/activeContext.md` — Updated Last Updated timestamp
- Updated `memory-bank/session_cache.md` — Updated Last Updated timestamp
- Updated `memory-bank/tasks.md` — Updated Last Updated timestamp

#### 11:13:59 IST - T11: Settings rewrite (GPT 5.4 Medium), persistence diagnosis, and memory sync
- Updated `memory-bank/activeContext.md` - Shifted focus to T11 and recorded settings rewrite plus persistence hardening decisions
- Updated `memory-bank/session_cache.md` - Added 2026-05-12 session context and T11/T2/T9 progress details
- Updated `memory-bank/tasks/T11.md` - Documented debug-log spam root cause and queued persistence fix
- Updated `memory-bank/tasks/T2.md` - Recorded post-completion persistence hardening for save storms and startup overwrite
- Updated `memory-bank/tasks/T9.md` - Recorded Settings panel rewrite and guarded refresh/model picker restoration
- Updated `memory-bank/tasks.md` - Synced registry timestamp, active counts, and T11 summary
- Updated `memory-bank/implementation-details/debug-logging-design.md` - Added root-cause analysis for save-related log noise
- Updated `memory-bank/implementation-details/chat-session-persistence.md` - Added hardening notes for debounced autosave, queued writes, and hydration guard
- Updated `memory-bank/implementation-details/settings-provider-design.md` - Recorded the sectioned settings UI refresh and proper header
- Created `memory-bank/sessions/2026-05-12.md` - Logged the 2026-05-12 settings/persistence/debugging session

## GPT 5.4 Medium Session Context

The Settings panel rewrite was performed by GPT 5.4 Medium. The original T9 Settings panel had included `isDisplaying`/`pendingRefresh` re-entrancy guards, but these were lost in a subsequent edit. The corrupted panel exhibited:
- **Infinite re-entrant loops**: `saveSettings(true)` called `display()` while `display()` was already running, triggering further cascading calls
- **Memory leaks**: Each nested `display()` call recreated DOM nodes and closures while the previous render was still active

GPT 5.4 Medium's rewrite restored the guard mechanism and restructured the panel into a cleaner sectioned layout. This session also investigated and fixed the chat persistence save-storm and startup overwrite issues.

## 2026-05-09

#### 11:51:05 IST - T11: File debug logger, ErrorBoundary, crash debugging; T13: patch_note, edit_section, safety fixes

- Created `src/logger.ts` — `FileLogger` class writing all console output to `.obsidian/plugins/obsidian-ai/debug.log`. Intercepts `window.onerror` and `window.onunhandledrejection`. Logs memory metrics (`performance.memory`) every 10s. Exposes `window.__obsidianAiLogger` for React components. `flushNow()` and `scheduleFlush()` with 5MB max size.
- Modified `src/main.ts` — Logger initialized FIRST in `onload()` before any other setup; `clear-debug-log` command added; `logger.stopMemoryLogging()` and `logger.flushNow()` in `onunload()`.
- Created `src/components/ErrorBoundary.tsx` — `ChatErrorBoundary` React class component wrapping `ChatApp`. Catches render errors via `componentDidCatch`, logs to disk via `window.__obsidianAiLogger`, shows fallback UI with debug log path.
- Modified `src/views/ObsidianAIChatView.ts` — Wraps `ChatApp` in `<ChatErrorBoundary>` inside `onOpen()`.
- Modified `src/components/MessageBubble.tsx` — Added 5-step synchronous flush logging around `MarkdownRenderer.render` (Steps 1–5) to pinpoint exactly which sub-step crashes during streaming completion transition.
- Modified `src/components/ChatMessages.tsx` — `StreamingBubble` also has 5-step defensive logging around `MarkdownRenderer.render`. Added `unmounted` cleanup flag to abort stale render callbacks. Changed `scrollIntoView({ behavior: "smooth" })` to `"auto"` to mitigate Chromium `SIGTRAP` crash during rapid DOM mutations.
- Modified `src/agent/ToolExecutor.ts` — Implemented `patchNote()` (search/replace with `replace_all` option) and `editSection()` (rewrite content under a specific heading). Both use `resolveNote()` for basename resolution.
- Modified `src/modules/WidgetExtension.ts` — Added debug logging to `destroy()` and `acceptAction()` for crash tracing.
- Modified `src/modules/diffExtension.ts` — Added debug logging to `dispatchAIChanges()` and `applyDiffPlugin` effect handler.
- Modified `src/noteEditing/NoteEditingBridge.ts` — Wrapped `editorView.dispatch` in try/catch with detailed logging in `applyToNote()`. Added logging to `applyToTargetNote()` at every step (resolve, open, find leaf, apply).
- Rebuilt `main.js` at 2026-05-09 11:51:05 IST — verified all new code present in compiled output.

## 2026-05-08

#### 01:55:58 IST - T13: Basename resolution fix, diagnostics panel, tool description polish

- Modified `src/agent/ToolExecutor.ts` — Added `resolveNote()` private helper (line 54) with three-tier resolution: exact path → append `.md` → `metadataCache.getFirstLinkpathDest()`. Applied to `readNote`, `editNote`, `appendToNote`, `createNote`, and new `patchNote`/`editSection` handlers.
- Modified `src/agent/tools.ts` — Updated all tool `path` parameter descriptions to use human-friendly basename examples (`"Project Notes"` instead of `"Project Notes.md"`). Added `patch_note` and `edit_section` tool definitions with Zod schemas.
- Modified `src/components/ChatApp.tsx` — Removed raw `[tool_name: ok/error]` status tag injection from visible assistant messages. Tool results still logged to console.
- Modified `src/settings.ts` — Added `displayDiagnostics()` private method (line 846) with 6-metric grid (JS Heap Used/Total/Limit, DOM Nodes, Chat Sessions, Total Messages), Refresh button, DevTools opener, and Clear History with confirmation modal.
- Fixed `src/settings.ts` — Added missing `this.displayDiagnostics(containerEl)` call inside `display()` method (line 309) so the Diagnostics section actually renders in Obsidian.
- Rebuilt `main.js` — Verified compiled output contains `displayDiagnostics` definition and call site.

## 2026-05-07

#### 06:57:28 UTC - T14: Memory bank update for remote agent connectivity task
- Created `memory-bank/tasks/T14.md` — full design doc with architecture and completion criteria
- Updated `memory-bank/tasks.md` — added T14 to registry, updated active task counts
- Updated `memory-bank/activeContext.md` — T14 set as primary focus
- Created `memory-bank/sessions/2026-05-07-morning.md` — session log for T14 design work
- Updated `memory-bank/session_cache.md` — updated focus task, session history, task registry
- Updated `memory-bank/progress.md` — added T14 section, updated timestamps
- Modified `memory-bank/tasks/T13.md` — updated status to reflect current progress

## 2026-05-06

#### 09:30:00 IST - T13: Agentic tool calling MVP foundation and settings wiring

- Created `src/agent/types.ts` — `StreamEvent` union, `ToolCall`, `ToolResult` interfaces; SDK-agnostic event types insulating UI from SDK changes
- Created `src/agent/tools.ts` — 4 Zod tool schemas (`read_note`, `edit_note`, `append_to_note`, `create_note`) using `tool()` helper with `any` cast workaround for AI SDK v6 TypeScript OOM
- Created `src/agent/ToolExecutor.ts` — `ToolExecutor` class executing vault operations (`vault.read`, `vault.modify`, `vault.create`) with error handling and Obsidian `Notice` feedback
- Modified `src/api.ts` — added `streamChatWithTools()` generator method using `streamText({ tools, stopWhen: stepCountIs(1) })`; translates `fullStream` events (`text-delta`, `tool-call`, `tool-result`, `tool-error`, `finish`, `error`) into `StreamEvent` union
- Modified `src/components/ChatApp.tsx` — integrated tool loop into `handleSend` with step counter and message assembly; added `pendingToolCall` state, `resolveToolRef`, `handleApproveTool`, `handleRejectTool`; replaced hardcoded `USE_TOOLS`/`AUTO_APPROVE`/`MAX_AGENT_STEPS` with `plugin.settings.enableAgentTools`, `autoApply`, `maxAgentSteps`
- Modified `src/settings.ts` — added `enableAgentTools: boolean`, `autoApply: boolean`, `maxAgentSteps: number` to `ObsidianAISettings` interface, `DEFAULT_SETTINGS`, and `normalizeSettings`; added `displayAgentToolsSettings()` UI section with toggle and number inputs
- Modified `styles.css` — pending tool call approval card styles (`.pending-tool-call`, `.pending-tool-actions`)
- Updated `memory-bank/tasks/T13.md` — marked settings completion criteria as done; added progress entries for 2026-05-06
- Updated `memory-bank/tasks.md` — T13 status changed from ⬜ to 🔄 IN PROGRESS
- Updated `memory-bank/session_cache.md` — focus task shifted to T13
- Updated `memory-bank/activeContext.md` — current focus and implementation focus updated to T13
- Created `memory-bank/sessions/2026-05-06.md` — session file documenting MVP build, v6 compatibility, TS OOM workaround, and testing checklist

## 2026-05-04

#### 22:46:16 IST - T6,T10: Token management and model discovery completion

- Created `src/context/tokenEstimator.ts` - Shared token estimation module with chars/4 approximation
- Modified `src/context/ContextEngine.ts` - Imports shared tokenEstimator; removed local duplicate
- Modified `src/components/ChatApp.tsx` - Applied maxContextMessages limit to conversation history; added contextTokenCount state; imports shared tokenEstimator
- Modified `src/components/ContextBar.tsx` - Added token usage indicator with green/amber/red color-coded thresholds
- Modified `src/settings.ts` - Added maxContextMessages setting; replaced modal picker with inline searchable model list; modelCache persisted on fetch and invalidated on profile changes; profile fields use onChange for immediate save
- Modified `styles.css` - Added chat-token-usage-low, chat-token-usage-medium, chat-token-usage-high classes
- Updated `memory-bank/tasks/T6.md` - Marked task as COMPLETED with lightweight v1 scope
- Updated `memory-bank/tasks/T10.md` - Marked task as COMPLETED with cache fix and inline picker redesign
- Updated `memory-bank/tasks.md` - Moved T6 and T10 to completed tasks; updated summary counts
- Updated `memory-bank/session_cache.md` - Updated focus to T8; marked T6 and T10 complete
- Updated `memory-bank/activeContext.md` - Updated timestamps and task statuses
- Updated `memory-bank/implementation-details/model-discovery-design.md` - Marked provider fetchers, cache, and refresh controls as implemented
- Created `memory-bank/sessions/2026-05-04-night.md` - Session file documenting T6 and T10 implementation
- Updated `memory-bank/changelog.md` - Added T6 and T10 entries

#### 18:11:57 IST - T2,T3,T5: Core chat features completion

- Updated `memory-bank/tasks/T2.md` - Marked task as COMPLETED, added message editing and session renaming features
- Updated `memory-bank/tasks/T3.md` - Marked task as COMPLETED, added token estimation and context UI completion
- Updated `memory-bank/tasks/T5.md` - Marked task as COMPLETED, added slash commands and in-place editing completion
- Updated `memory-bank/tasks.md` - Updated registry to reflect T2, T3, T5 as completed, updated summary counts
- Updated `memory-bank/session_cache.md` - Updated current session focus and task statuses
- Updated `memory-bank/activeContext.md` - Updated with current task completion status
- Created `memory-bank/sessions/2026-05-04-evening.md` - Session file documenting memory bank update
- Updated `memory-bank/edit_history.md` - Added new memory bank update entry
- Modified `src/components/ChatApp.tsx` - Session persistence, message editing, session renaming, slash commands
- Modified `src/components/ChatInput.tsx` - Message editing state, slash command wikilink autocomplete
- Modified `src/components/ChatMessages.tsx` - Message editing functionality
- Modified `src/components/ContextBar.tsx` - Token estimation, context tracking UI
- Modified `src/components/MessageBubble.tsx` - Context display, token counts, edit button, retry functionality
- Modified `src/components/SessionPickerModal.tsx` - Session renaming functionality
- Modified `src/settings.ts` - Added autoNameSessions setting
- Modified `src/types.ts` - Extended ChatMessage with contextItems and estimatedTokens
- Modified `styles.css` - Styles for context tracking, token counts, message editing, session renaming

#### 14:59:36 IST - T3/T5: Memory Bank Update for Uncommitted Changes
- Modified `memory-bank/tasks/T3.md` — Marked embedExpander completion criteria as done
- Modified `memory-bank/tasks/T5.md` — Marked applyToTargetNote, createNote, slash commands, retry, appendToTarget as complete
- Modified `memory-bank/tasks.md` — Updated T3/T5 summaries and timestamps
- Modified `memory-bank/activeContext.md` — Updated current focus and T5 status
- Modified `memory-bank/session_cache.md` — Updated session history, T3/T5 progress, timestamps
- Created `memory-bank/sessions/2026-05-04-afternoon.md` — Session file documenting retry, embedExpander, slash commands, applyToTargetNote implementation

## 2026-05-03

#### 00:52:00 IST - T2/META-1: Sync memory bank after session history implementation

- Updated `memory-bank/tasks/T2.md` — marked all completion criteria ✅; progress steps 3–9 marked done; step 10 added for real-world testing
- Updated `memory-bank/activeContext.md` — T2 section rewritten to reflect implementation completion; implementation focus updated; next actions revised
- Updated `memory-bank/progress.md` — added T2 section with completed/current/up-next steps; marked T4 as completed
- Updated `memory-bank/changelog.md` — added session-based chat history and shared types entries

#### 00:45:00 IST - T2/T5: Implement session-based chat history with SessionPickerModal

- Created `src/types.ts` — shared TypeScript interfaces: ChatMessage, ChatSession, StoredChatData
- Modified `src/views/ObsidianAIChatView.ts` — replaced loadChatMessages/saveChatMessages with loadChatData/saveChatData on ChatPluginLike; added settings: ObsidianAISettings to interface
- Modified `src/main.ts` — implemented loadChatData() with migration from old flat chatMessages array; implemented saveChatData(); removed old loadChatMessages/saveChatMessages
- Modified `src/components/ChatApp.tsx` — refactored from flat messages state to session-based state (sessions[] + activeSessionId); added archive-on-New with auto-titling and pruning; added handleLoadSession and handleDeleteSession; added showSessionPicker state; messages derived via useMemo from active session
- Modified `src/components/ActionBar.tsx` — Load button now enabled when history exists; onLoadChat prop opens SessionPickerModal
- Created `src/components/SessionPickerModal.tsx` — modal overlay listing sessions with title, message count, relative time, preview; load and delete actions; active session highlighted
- Modified `src/components/ChatMessages.tsx` — import ChatMessage from ../types instead of ./ChatApp
- Modified `src/components/MessageBubble.tsx` — import ChatMessage from ../types instead of ./ChatApp
- Modified `styles.css` — added modal overlay, modal container, session list, session item, session title/meta/preview, badge, and danger button styles
- Updated `memory-bank/sessions/2026-05-03-night.md` — recorded implementation completion

#### 00:18:43 IST - T2: Session history modal design and memory bank docs

- Created `memory-bank/implementation-details/chat-session-persistence.md` — design doc for session-based chat persistence: data model (ChatSession, StoredChatData), plugin API (loadSessions, saveSession, archiveSession, deleteSession, pruneSessions), SessionPickerModal UI spec, auto-titling logic, pruning behaviour, migration from flat chatMessages array
- Updated `memory-bank/tasks/T2.md` — updated Last Updated timestamp; progress steps 4–8 revised to reflect session-store approach instead of standalone ConversationManager class; related files updated to actual source files (removed src/conversation/*, added ActionBar, new SessionPickerModal); ChatMessage interface fixed to match actual code (role excludes "system"); completion criteria updated
- Updated `memory-bank/tasks.md` — T2 summary updated to reflect session-history modal design and planned implementation
- Updated `memory-bank/activeContext.md` — T2 section updated with session-store architecture decisions; next actions revised; current decisions updated
- Updated `memory-bank/implementation-details/chat-panel-design.md` — Conversation Persistence section updated to match session-store model; ActionBar description changed from dropdown to modal
- Updated `memory-bank/session_cache.md` — new session registered; T2 progress updated
- Created `memory-bank/sessions/2026-05-03-night.md` — session file documenting session history design work

## 2026-05-02

#### 23:56:30 IST - T5/T2/T3: Fix note targeting, stale closure, persistence, UX clarity

- Modified `src/noteEditing/NoteEditingBridge.ts` - Renamed applyToActiveNote→applyToNote, appendToActiveNote→appendToNote; methods now receive resolved MarkdownView/TFile from caller; removed internal getLeavesOfType leaf discovery
- Modified `src/components/ChatApp.tsx` - Added workspace.on('active-leaf-change') tracking (lastMarkdownLeafRef + targetNoteName state); added includeActiveNoteRef to fix stale closure in handleSend; added handleApply/handleAppend callbacks using tracked leaf; added loadChatMessages on mount, saveChatMessages on message change, clear on new chat; removed getActiveNoteName helper; pass new props to ChatMessages
- Modified `src/components/ChatMessages.tsx` - Added targetNoteName, onApply, onAppend props; pass through to each MessageBubble
- Modified `src/components/MessageBubble.tsx` - Removed direct NoteEditingBridge calls; uses onApply/onAppend callbacks; shows target note name in button labels; improved tooltips explaining diff vs direct-write
- Modified `src/views/ObsidianAIChatView.ts` - Extended ChatPluginLike interface with loadChatMessages() and saveChatMessages()
- Modified `src/main.ts` - Added loadChatMessages and saveChatMessages methods; fixed saveSettings to merge existing data rather than replace, preserving chatMessages key
- Modified `package.json` - Added zod ^3.24.0 dependency (required by ai-sdk v6)
- Created `package-lock.json` - Lockfile generated by npm install --legacy-peer-deps

#### 23:21:14 IST - T4,T5,T3: Fix note detection, streaming render, button clutter, active note context

- Modified `src/noteEditing/NoteEditingBridge.ts` - applyToActiveNote and appendToActiveNote use getLeavesOfType('markdown') instead of getActiveViewOfType so note detection works when chat sidebar is focused
- Modified `src/components/ChatMessages.tsx` - Add StreamingBubble component using MarkdownRenderer.render() via useEffect; streaming text now renders as HTML not raw markdown
- Modified `src/components/ContextBar.tsx` - Add includeActiveNote/activeNoteName/onToggleActiveNote props; render active note toggle chip
- Modified `src/components/ChatApp.tsx` - Add includeActiveNote state, getActiveNoteName helper, handleToggleActiveNote, context XML injection in handleSend; import MarkdownView
- Modified `styles.css` - Hide .chat-bubble-actions by default, show on .chat-bubble:hover; add chip styles for .chat-context-chip and .chat-context-chip-active

#### 23:21:14 IST - T7: Fix manual-build artifact name with forward slash in branch name

- Modified `.github/workflows/manual-build.yml` - Add "Set safe branch name" step that runs tr '/' '-' on github.ref_name into SAFE_BRANCH env var; update artifact name to use PLUGIN_NAME-SAFE_BRANCH

#### 22:32:52 IST - T4,T5: Streaming wiring and NoteEditingBridge

- Modified `src/components/ChatApp.tsx` - Replace callApi() with streamChat() async iterator loop; add currentAiMessage state and messagesRef for progressive rendering
- Modified `src/components/ChatMessages.tsx` - Accept currentAiMessage prop; render streaming bubble while chunks arrive, typing indicator before first chunk
- Modified `src/components/MessageBubble.tsx` - Add Apply to Note (diff) and Append to Note buttons for assistant messages; import NoteEditingBridge
- Created `src/noteEditing/NoteEditingBridge.ts` - applyToActiveNote() dispatches full-doc selection + response effects in single transaction; appendToActiveNote() writes via vault.modify with Notice

#### 17:48:45 IST - META-1: Memory bank sync for T4 migration, T9 completion, T10-T12 creation
- Updated `memory-bank/tasks.md` — added T9 (✅), T10 (⏸️), T11 (⏸️), T12 (⏸️); updated T4 status to 🔄; updated summary counts
- Updated `memory-bank/tasks/T4.md` — status changed to 🔄 IN PROGRESS; marked provider-layer criteria complete; updated remaining work to chat-panel UI wiring
- Updated `memory-bank/tasks/META-1.md` — recorded T9–T12 creation and new implementation docs in progress
- Updated `memory-bank/tasks/T1.md` — added T9 as completed dependency
- Updated `memory-bank/session_cache.md` — synced task registry with T9 completion and T4 primary focus
- Updated `memory-bank/edit_history.md` — appended mem-update entry

#### 11:12:44 IST - T8: Open Source Branding + Memory Sync — in progress
- Updated `README.md` — pnpm commands, heading encoding, GPL-3.0 license wording, and open-source release structure
- Updated `package.json` — branded metadata, repository links, keywords, GPL-3.0 license, and timestamped package script
- Updated `package-lock.json` — root package license aligned to GPL-3.0
- Updated `.github/workflows/release.yml` — switched release build workflow to pnpm install/build
- Updated `.github/workflows/pre-release.yml` — switched rolling pre-release workflow to pnpm install/build
- Updated `.github/workflows/format.yml` — switched format check workflow to pnpm and `pnpm exec prettier`
- Updated `.github/FUNDING.yml` — changed sponsorship identity to `space-cadet`
- Updated `.gitignore` — ignored local `dist/` package artifacts
- Updated `.prettierignore` — excluded memory-bank and lockfiles from project format checks
- Created `CONTRIBUTING.md` — contributor workflow, bug reports, PR process, and code style guidance
- Created `CODE_OF_CONDUCT.md` — community behavior and enforcement guidance
- Created `.github/ISSUE_TEMPLATE/bug_report.yml` — structured bug report form
- Created `.github/ISSUE_TEMPLATE/feature_request.yml` — structured feature request form
- Created `.github/PULL_REQUEST_TEMPLATE.md` — PR summary and testing checklist
- Created `docs/release-announcement.md` — draft release announcement
- Updated `memory-bank/activeContext.md` — current focus and T8 sync status
- Updated `memory-bank/session_cache.md` — current T8 session state and task registry
- Updated `memory-bank/progress.md` — T1/T7 completion, T8 status, and recent accomplishments
- Updated `memory-bank/tasks.md` — T8 active context and completed/pending task state
- Updated `memory-bank/tasks/T8.md` — acceptance criteria, progress, and remaining release-readiness follow-ups
- Updated `memory-bank/sessions/2026-05-02-morning.md` — appended Session 4 branding/open-source sync details
- Updated `memory-bank/changelog.md` — added Session 3 and Session 4 entries
- Updated `memory-bank/edit_history.md` — added T8 edit history entry
- Updated memory-bank implementation docs — corrected stale plugin ID, pnpm workflow, and `ObsidianAIChatView.ts` references

#### 09:41:00 IST - T1: Chat Panel — ItemView + React UI — completed
- Modified `package.json` — added react, react-dom, @types/react, @types/react-dom
- Modified `esbuild.config.mjs` — added jsx: automatic, jsxImportSource: react
- Modified `src/main.ts` — registered ObsidianAIChatView, ribbon icon, open-chat command, activateChatView()
- Created `src/views/ObsidianAIChatView.ts` — ItemView class, ChatPluginLike interface
- Created `src/components/ChatApp.tsx` — root component, conversation state, send stub via callApi()
- Created `src/components/ActionBar.tsx` — New Chat, disabled Load, Settings link
- Created `src/components/ChatMessages.tsx` — scrollable thread, empty state, typing indicator
- Created `src/components/MessageBubble.tsx` — MarkdownRenderer.render(), copy button, timestamps
- Created `src/components/ContextBar.tsx` — placeholder for T3
- Created `src/components/ChatInput.tsx` — textarea, Enter/Shift+Enter, Send/Stop button
- Modified `styles.css` — appended chat panel CSS (panel, bubbles, input, buttons, typing indicator)
- Updated `memory-bank/tasks/T1.md` — marked complete, all criteria checked
- Updated `memory-bank/tasks.md` — T1 status ✅, summary updated, completed table updated
- Updated `memory-bank/activeContext.md` — focus shifted to T4
- Updated `memory-bank/sessions/2026-05-02-morning.md` — T1 completion block appended
- Updated `memory-bank/session_cache.md` — T1 complete, next focus T4

#### 09:34:00 IST - T7: Release System & CI/CD — completed
- Modified `versions.json` — added missing 1.2.4 entry
- Created `.github/workflows/pre-release.yml` — auto pre-release on push to main, rolling latest-dev tag
- Created `memory-bank/tasks/T7.md` — task file for Release System & CI/CD
- Created `memory-bank/implementation-details/release-ci-design.md` — two-track pipeline design, version bumping workflow, manual testing steps
- Updated `memory-bank/tasks.md` — added T7 row, updated summary counts, added completed tasks table
- Updated `memory-bank/activeContext.md` — updated focus, next steps
- Updated `memory-bank/sessions/2026-05-02-morning.md` — session 3 update appended
- Updated `memory-bank/session_cache.md` — T7 complete, focus shifted to T1
