# Edit History

*Last Updated: 2026-08-05*

---

## 2026-08-05

#### 17:48:15 IST - T39a: Read-only provider host implementation
- Created `src/integrations/types.ts`, `src/integrations/ProviderRegistry.ts`, and `src/integrations/__tests__/ProviderRegistry.test.ts` - Added the public v1 provider contract, discovery/validation, opt-in read-only execution, and focused tests.
- Created `src/settings-sections/integrations.ts` - Added provider availability and opt-in settings without credential display.
- Modified `src/main.ts`, settings, tool execution, chat wiring, and tool cards - Composed enabled read-only provider tools into normal chat and rendered generic provider labels.
- Modified `memory-bank/tasks/T39.md`, `memory-bank/tasks/T39a.md`, `memory-bank/implementation-details/integration-provider-api.md`, context, progress, cache, and session records - Recorded the implemented host slice and deferred boundaries.

#### 17:39:15 IST - T39: Provider integration UI plan
- Modified `memory-bank/implementation-details/integration-provider-api.md` - Added the settings, pending-operation, inline result/progress, and active-policy UI contracts with ASCII wireframes.
- Modified `memory-bank/tasks/T39.md` and `memory-bank/tasks/T39a.md` - Added provider-generic UI acceptance criteria, boundaries, and delivery detail.
- Modified `memory-bank/activeContext.md`, `memory-bank/progress.md`, `memory-bank/session_cache.md`, and `memory-bank/sessions/2026-08-05-night.md` - Synchronized the planned UI surfaces and preserved the no-duplicate-Git-sidebar decision.
- Modified `memory-bank/edit_history.md` - Added the generated-view entry sourced by this edit chunk.

#### 17:31:59 IST - T39: Integration Provider API planning
- Created `memory-bank/tasks/T39.md` - Defined the paused provider-platform umbrella task, dependencies, acceptance criteria, and safety boundary.
- Created `memory-bank/tasks/T39a.md` - Scoped host registration, lifecycle, policy, availability, and test work as the first subtask.
- Created `memory-bank/tasks/T39b.md` - Scoped Obsidian Git as the first bounded provider without authorizing changes to its separate checkout.
- Created `memory-bank/implementation-details/integration-provider-api.md` - Documented the versioned contract, ownership model, lifecycle, Git capabilities, safety policy, and delivery sequence.
- Modified `memory-bank/tasks/T26.md` - Redirected planned one-off plugin bridges to the T39 provider contract.
- Modified `memory-bank/tasks/T38.md` - Recorded approval and audit dependencies for provider mutations.
- Modified `memory-bank/implementation-details/agentic-tool-calling.md` and `memory-bank/implementation-details/ai-intelligence-layer.md` - Cross-linked the provider API and superseded direct private-plugin access as the implementation target.
- Modified `memory-bank/tasks.md`, `memory-bank/activeContext.md`, `memory-bank/progress.md`, `memory-bank/session_cache.md`, and `memory-bank/sessions/2026-08-05-night.md` - Synchronized the new paused plan and session context.
- Modified `memory-bank/edit_history.md` - Added the generated-view entry sourced by this edit chunk.

#### 13:23:15 IST - T38: Tool approval and operation audit plan
- Created `memory-bank/tasks/T38.md` - Recorded the deferred approval-policy, batch-plan, and audit-log design.
- Created `memory-bank/implementation-details/tool-approval-batch-audit-plan.md` - Defined the settings, execution, logging, privacy, and phased-delivery contracts.
- Modified `memory-bank/tasks.md` - Registered T38 as a paused task with its dependencies.
- Modified `memory-bank/tasks/T11.md` - Linked the dedicated audit-log follow-up.
- Modified `memory-bank/activeContext.md`, `memory-bank/progress.md`, `memory-bank/session_cache.md`, and `memory-bank/sessions/2026-08-05-night.md` - Synchronized the deferred plan state.

#### 13:10 IST - T37: Idempotent Bulk Note Creation and Batch Scope Decision
- Modified `src/agent/ToolExecutor.ts`, tool types, and `AgentLoop.ts` - Treated existing batch targets as safe skips and returned created/skipped partial-result details to the agent.
- Modified batch tool/prompt and tool-result UI files - Made the no-overwrite skip behavior visible before and after approval.
- Created `src/agent/__tests__/ToolExecutor.test.ts` - Covered a mixed batch containing an existing note and a new note.
- Created `memory-bank/tasks/T37.md` and synchronized the task, context, progress, cache, session, implementation, and edit-history records.

#### 12:45 IST - T36: Stable Per-Tab Model Selection and Restored Chat View State
- Modified `src/components/ChatApp.tsx` and `src/hooks/useSessionActions.ts` - Broke the tab-profile synchronization feedback loop by separating one-time restoration from user-initiated persistence.
- Modified `src/components/ActionBar.tsx` - Removed the participant-count debug console output.
- Modified `src/types.ts`, `src/hooks/useChatSession.ts`, `src/components/ChatMessages.tsx`, and `src/storage/ChatStorage.ts` - Persisted and restored saved open tabs, active tab, and each session's message-list scroll position for both legacy and JSONL storage.
- Modified Settings - Added default-on Restore chat tabs after reload in Chat Defaults.
- Modified `memory-bank/implementation-details/past-session-search-and-tabs.md` - Recorded the profile ownership boundary and the persisted tab-view-state contract.
- Created `memory-bank/tasks/T36.md` and synchronized the task, context, progress, cache, session, and edit-history records.

#### 12:25 IST - T35: Gemini Tool Continuity, Bulk Note Creation, and Per-Tab Model Selection
- Modified `src/api.ts` and `src/agent/AgentLoop.ts` - Preserved provider-owned metadata from a streamed function call onto the reconstructed next-step assistant part, retaining Gemini thought signatures.
- Modified `src/agent/tools.ts`, `src/agent/ToolExecutor.ts`, prompt and tool-card UI files - Added the honest, approval-gated `create_notes` tool for 2–100 new notes with preflight safety checks and compact batch feedback.
- Modified `src/components/ChatApp.tsx`, `src/hooks/useChatSession.ts`, and `src/hooks/useSessionActions.ts` - Made profile selection session-owned, restored on tab switch, and inherited by a new tab.
- Created `src/agent/__tests__/AgentLoop.test.ts` and extended tool/session tests - Covered signature preservation, batch schema limits, and model inheritance.
- Created `memory-bank/tasks/T35.md` and updated Gemini, agent-tool, T15, task-index, context, progress, cache, and session records.

#### 11:27:43 IST - T34: Per-Tab Chat Process Isolation Manual Verification
- Modified `memory-bank/tasks/T34.md` - Recorded the user's confirmation that replies remain isolated to their originating tabs.
- Modified `memory-bank/implementation-details/per-tab-chat-process-isolation.md` - Added manual validation evidence to the implementation record.
- Modified `memory-bank/activeContext.md`, `memory-bank/progress.md`, `memory-bank/session_cache.md`, and `memory-bank/sessions/2026-08-05-night.md` - Synchronized the completed and manually verified T34 status.
- Created `memory-bank/edits/2026-08-05/112743-T34-manual-verification.md` - Added the closeout edit chunk.

#### 10:55:22 IST - T34: Per-Tab Chat Process Isolation Planning
- Created `memory-bank/tasks/T34.md` - Added a high-priority corrective task for tab-scoped generation process state.
- Created `memory-bank/implementation-details/per-tab-chat-process-isolation.md` - Documented the root cause, runtime-state contract, phased fix plan, and regression coverage.
- Created `memory-bank/edits/2026-08-05/105522-T34-per-tab-process-isolation.md` - Added the edit chunk for this planning update.
- Modified `memory-bank/tasks.md` - Added T34 to active tasks and relationships.
- Modified `memory-bank/tasks/T15.md` - Linked T34 as the tabbed-chat runtime isolation follow-up.
- Modified `memory-bank/activeContext.md`, `memory-bank/progress.md`, and `memory-bank/sessions/2026-08-05-night.md` - Synchronized current focus and planning status.

#### 11:11:04 IST - T34: Per-Tab Chat Process Isolation Implementation
- Created `src/hooks/useChatRuntimeState.ts` - Added session-keyed runtime state for live streaming, tool approval, controllers, resolvers, and token totals.
- Modified `src/components/ChatApp.tsx` - Derived visible streaming UI, pending tool card, stop state, and token display from the active session runtime.
- Modified `src/hooks/useMessageActions.ts` - Routed send, stream deltas, OpenResponses, AgentLoop tools, standard streaming, stop, retry/edit guards, and tool approvals by originating session ID.
- Modified `src/hooks/useSessionActions.ts` - Aborted and cleared runtime state when tabs or sessions are closed.
- Modified hook tests - Added cross-tab stream routing and tool-session identity coverage.
- Updated T34 Memory Bank records - Marked implementation complete and recorded validation.

#### 01:53:30 IST - T15: Settings Navigation and Draft Tab Lifecycle
- Modified `src/settings-sections/SettingsTab.ts` - Repaired in-panel shortcut scrolling and the AI Intelligence Layer target.
- Modified `src/settings-sections/chatDefaults.ts` - Documented the tab-title width range and default.
- Modified `src/settings-sections/diagnostics.ts` - Rendered model usage as a structured table.
- Modified `src/settings.ts` - Added persisted tab-title width normalization.
- Modified `src/components/ChatApp.tsx` - Restricted history and export inputs to saved sessions.
- Modified `src/components/ChatTabBar.tsx` - Applied configurable tab-title width.
- Modified `src/components/SessionPickerModal.tsx` - Excluded zero-message drafts from the history modal.
- Modified `src/hooks/useChatSession.ts` - Introduced the draft/session persistence boundary and legacy empty-session cleanup.
- Modified `src/hooks/useSessionActions.ts` - Opened each new draft in a tab and discarded unsent tabs on close.
- Created `src/hooks/__tests__/useSessionActions.test.ts` - Covered repeated new-draft tab creation.
- Created `src/components/__tests__/SessionPickerModal.test.tsx` - Covered draft exclusion from history.
- Modified `styles.css` - Added compact diagnostics and Settings navigation styling.
- Modified `memory-bank/implementation-details/past-session-search-and-tabs.md` - Recorded the draft-tab contract and diagrams.

- Improved settings navigation, estimated LLM usage visualization, and stable-width chat tabs.

## 2026-08-04

#### T33: Desktop Chat View Singleton Repair
- Modified `src/main.ts` — reconciled restored duplicate chat leaves and serialized concurrent chat activation.
- Created `memory-bank/tasks/T33.md` and `memory-bank/implementation-details/chat-view-singleton.md` — documented the workspace lifecycle and persistence boundary.
- Created `memory-bank/sessions/2026-08-04-night.md` and `memory-bank/edits/2026-08-04/2330-T33-desktop-chat-singleton.md` — recorded scope and validation.
- Modified active context, session cache, task index, and progress — synchronized completion state.

## 2026-08-02

#### 18:55:00 IST - T32: Security Hardening — Path Traversal, XSS, SSRF, ReDoS
- Modified `src/agent/ToolExecutor.ts` - Added `isPathAllowed()` and `denyPath()` helpers; applied path checks to all file operation tools
- Created `src/lib/sanitizeHtml.ts` - `sanitizeHtmlForRenderer()` strips `<script>`, `javascript:`, `on*` handlers, `data:text/html`, `<iframe>`
- Modified `src/components/MessageBubble.tsx` - Applied `sanitizeHtmlForRenderer()` before all `MarkdownRenderer.render()` calls
- Modified `src/components/ChatMessages.tsx` - Applied `sanitizeHtmlForRenderer()` to streaming text parts
- Modified `src/api/AgentApiManager.ts` - Added `validateAgentUrl()` helper blocking localhost, private IPs, non-HTTP(S) schemes
- Modified `src/agent/ToolExecutor.ts` - Replaced regex-based DuckDuckGo HTML scraping with `DOMParser`
- Modified `src/storage/ChatStorage.ts` - Added per-line try/catch + schema validation in `_loadMessages()`
- Created `src/agent/__tests__/security.test.ts` - 15 tests covering XSS sanitization and SSRF validation
- Created `memory-bank/tasks/T32.md` - Security hardening task documentation
- Modified `memory-bank/tasks.md` - Added T32 to completed tasks
- Created `memory-bank/edits/2026-08-02/1855-T32-security-hardening.md` - Edit chunk for canonical record

## 2026-07-29

#### 13:47:51 IST - T15: Document past-session search and shared tab implementation
- Created `memory-bank/implementation-details/past-session-search-and-tabs.md` - Documented indexing, current-session exclusion, agent prompts, inline links, internal tabs, scrolling, composer shortcuts, verification, and attribution.
- Modified `memory-bank/tasks/T15.md` - Added the implemented feature set, documentation link, deferred tab-heading polish, and GPT 5.6 Terra Low attribution.
- Modified `memory-bank/sessions/2026-07-29-afternoon.md` - Closed the session with the final committed state and deferred follow-up.
- Modified `memory-bank/session_cache.md` - Marked the T15 session complete.
- Modified `memory-bank/implementation-details/chat-session-persistence.md` - Linked persistence storage to saved-session retrieval behavior.
- Modified `memory-bank/implementation-details/agentic-tool-calling.md` - Documented the read-only saved-session search tool and active-session exclusion.
- Modified `memory-bank/implementation-details/chat-ui-features.md` - Documented shared tabs, link navigation, shortcut behavior, and deferred tab-heading polish.
- Modified `memory-bank/progress.md` and `memory-bank/activeContext.md` - Synchronized completed feature status, deferred follow-up, and model attribution.

#### 13:38:56 IST - T15: Record past-session search and internal tab UI work
- Created `memory-bank/sessions/2026-07-29-afternoon.md` - Logged scope, modified files, current verification state, and GPT 5.6 Terra Low attribution for all work in the session.
- Modified `memory-bank/session_cache.md` - Set the active T15 session and recorded model attribution.
- Modified `memory-bank/activeContext.md` - Updated T15's current tab/search UI state and model attribution.


## 2026-07-14

#### 04:11:49 IST - T8: Promote release from pre-release to proper v1.2.4. GitHub release created with build assets.
- Updated `manifest.json` - Updated manifest.json
- Updated `versions.json` - Updated versions.json

#### 04:09:02 IST - T15: Fix token counter accumulation, remove green streaming border, add live tool result updates without re-rendering entire bubble
- Modified `src/components/ChatApp.tsx` - Modified src/components/ChatApp.tsx
- Modified `src/components/ChatMessages.tsx` - Modified src/components/ChatMessages.tsx
- Modified `styles.css` - Modified styles.css

#### 04:08:55 IST - T15: Fix 4 critical streaming/chat UI bugs: Android flicker, interrupted message loss, retry attachment loss, live token counting
- Modified `src/components/ChatMessages.tsx` - Modified src/components/ChatMessages.tsx
- Modified `src/hooks/useMessageActions.ts` - Modified src/hooks/useMessageActions.ts
- Modified `src/components/ChatApp.tsx` - Modified src/components/ChatApp.tsx
