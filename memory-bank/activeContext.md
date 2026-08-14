# Active Context

*Last Updated: 2026-08-14 19:31:00 IST*

### 2026-08-14 T22/T44 Closeout

- T22 Phase 5 is reconciled as complete: `ChatToolbar`, `ChatMainArea`, and
  `ChatOverlays` are extracted and composed by `ChatApp.tsx`.
- T44.2b now renders the production toolbar/tabs, `ChatMessages`, `ChatInput`,
  and `ChatOverlays` in a standalone browser preview.
- Fixed preview CSS loading, icon shim sizing, layout containment, and the
  history modal's initial/open/close state. Playwright verified the production
  transcript/composer, modal interaction, and mobile no-overflow behavior.
- T44 remains active for richer fixture states, final boundary documentation,
  and acceptance evidence; the initial hand-written preview is smoke-only.

### 2026-08-14 Session Closeout

- T19a group-chat attachment full replay completed and pushed as `f694685`; local group and relay paths preserve `attachments` and `resolvedParts`.
- T20 message selection and Chat History copy/export workflows completed and pushed through `a9cad79`; implementation details are in `implementation-details/message-selection-chat-history.md`.
- T41 update modal metadata completed and pushed as `7a770f3`.
- No engineering tasks remain from this session; T22/T44, T42, and older backlog items remain unchanged.

### 2026-08-14 T44.2b Follow-up

- Corrected the T44 preview assessment: the first browser preview was a
  hand-written smoke harness, not the production chat UI.
- T22 Phase 5 is confirmed complete in the branch (`a219e07`, `48e747d`):
  `ChatToolbar`, `ChatMainArea`, and `ChatOverlays` are present.
- Started T44.2b with real production `ChatToolbar` and `ChatTabBar` rendered
  in the preview, fixture props, an Obsidian module shim, and production CSS.
- Preview build, TypeScript, and the 3 fixture contract tests pass.
- Remaining: wire `ChatMainArea`/`ChatOverlays`, then run Playwright against
  the faithful surface and update T44 acceptance evidence.

### T41: Plugin Auto-Updater with Stable/Dev Channels (2026-08-09)
**Status:** ✅ COMPLETE — Commit-hash fix applied, built, and released

- Built complete custom auto-updater for obsidian-ai plugin
- **Files:** `src/updater/PluginUpdater.ts`, `src/settings-sections/updaterSettings.ts`
- **Capabilities:** GitHub API fetch, semver compare, stable/dev channels, auto-install toggle, manual "Check Now", backup + rollback, cross-platform (desktop + mobile)
- **Fixes applied:** Settings nav links, mobile UI (removed Node.js imports), mobile toggles (`Setting.addToggle()`), dev channel prerelease filtering, version display with channel suffix, non-semver tag handling, **commit-hash comparison for dev channel**
- **Commit-hash fix:** `checkForUpdate()` fetches latest SHA from GitHub API, compares with local `GIT_COMMIT_HASH`. If match, returns `hasUpdate: false`. Prevents perpetual "update available" on dev channel.
- **Released:** `latest-dev` rebuilt from ae09179 with fix included
- Task tracking: `memory-bank/tasks/T41.md`

### T43: Multi-User and Agent Chat with LaTeX Support (2026-08-10 → 2026-08-11)
**Status:** ✅ COMPLETE — All 5 Phases Delivered and Merged

- **Evolution of T40** — builds on relay infrastructure and presence tracking from T40
- **New architecture:** Equal-footing participant model where AI agents and remote humans are peers
- **Implementation strategy:**
  - **Step 1:** `ParticipantRouter` wrapper around existing `Orchestrator` — validated successfully
  - **Step 2:** Refactor `Orchestrator` to be participant-agnostic (future, if needed)
- **Phase 1 Complete (2026-08-11):** Types, session state, sync adapter, ParticipantRouter skeleton
  - `ChatMessage` extended with `remote?: boolean`, `fromUserId?: string`
  - `ChatSession` extended with `remoteUsers?: string[]`
  - `WebSocketSyncAdapter` sets `remote: true` on received relay messages
  - `ParticipantRouter` skeleton created — wraps Orchestrator, adds relay dispatch
  - Commit: `539ca52`
- **Phase 2 Complete (2026-08-11):** Wired ParticipantRouter into ChatApp
  - Commit: `f83e5d0`
- **Phase 3 Complete (2026-08-11):** AI context includes remote messages with attribution
  - Commit: `9b2a498`
- **Phase 4 Complete (2026-08-11):** Human-only tabs use relay-only routing
  - `ParticipantRouter` supports relay-only dispatch (null orchestrator)
- **Phase 5 Complete (2026-08-11):** Attribution UI, typing indicators, participant bar
  - **Phase 5a:** Message attribution — `MessageBubble.tsx` shows `fromUserId` with colored dot
  - **Phase 5b:** Typing indicators — `SyncAdapter.sendTyping()`/`onTyping()`, WebSocket relay, 3s auto-clear, 2s throttle
  - **Phase 5c:** Participant bar — persistent bar below ActionBar showing agents + remote users
  - **Relay bug fix:** `relay/server.js` `Buffer`→`string` conversion in broadcast
  - **Post-phase fixes:** ActionBar badge `?? 0` fix, single-agent participant bar fix
  - Commits: `90503d9`, `ab23e5f`
- **Merged (2026-08-11):** `t43-multi-user-agent-chat` → `main` (fast-forward), pushed to GitHub
- **Tests:** Relay tested MacBook ↔ mobile; participant bar verified; typing indicators need 2-device test
- **2026-08-12 follow-up:** Mobile transcript scrolling was fixed with constrained flex sizing and touch scrolling behavior; mobile composer bottom padding was reduced; the host-owned view-selector gap was documented; model-selection badge count now uses selected model IDs directly with regression coverage.
- **Verification:** Reinstalled dependencies from the lockfile; `pnpm exec tsc --noEmit`, `pnpm run build`, 21 test files, 206 tests, changed-files-only Prettier, and `git diff --check` passed. The stale AI SDK mismatch is resolved.
- **Docs:** `memory-bank/implementation-details/multi-user-agent-chat.md`
- **Task tracking:** `memory-bank/tasks/T43.md`

### T40: Multi-User Chat with LaTeX Support (2026-08-10)
**Status:** 🔄 Phase 2 Complete (Presence Tracking + Bug Fixes), Phase 2b Pending

- Core architecture audit completed. Decision: NO Supabase. WebSocket relay + WebRTC peer-to-peer.
- **Phase 1 Complete:** WebSocket relay, SyncAdapter, BRAT distribution, relay verification
- **Phase 2 Complete:** Presence tracking with remote user dropdown
  - Bug fixes: `remoteUserCount` prop wiring, badge visibility, callback race condition, roster includes self
  - UI: Radio icon (📻) with badge, clickable dropdown showing room + users
  - Commits: `3765188`, `6746201`, `683d9d5`, `108858d`
- **Message Rendering Fixed (2026-08-10):** Adapter was checking `data.type === "message"` but relay sends `data.type === "chat"`. Fixed in commits `2897b1f` and `e7e29ce`.
- **Resolution:** The remote-message behavior was reclassified under T43's equal-footing participant model; T43 now routes remote messages through the participant router and supports relay-only human tabs.
- **Next:** End-to-end cross-device messaging test, then Phase 2b (attribution, typing, mentions)
- **Docs:** `memory-bank/implementation-details/presence-tracking.md` (full design + bug fixes)
- **Task tracking:** `memory-bank/tasks/T40.md`

### T42: Remote Chat Storage & Sync (2026-08-10)
**Status:** 🔄 Created — Design complete, implementation pending

- **Objective:** Persistent remote storage for chat sessions using relay server
- **Design doc:** `memory-bank/implementation-details/remote-chat-storage-design.md`
- **Key decision:** Storage lives on relay server (not Supabase), clients sync via WebSocket
- **Next:** Phase 1 implementation (relay storage endpoints, client sync protocol)
- **Task tracking:** `memory-bank/tasks/T42.md`

### T22: ChatApp Component Decomposition (2026-05-28 → current)
**Status:** 🔄 Phase 4 complete; Phase 5 pending

- Phase 4 landed in `da4af7d`: session, settings, export, search, and context
  hooks were extracted.
- The task record was stale and is now reconciled with the repository.
- Phase 5 remains: extract `ChatLayout`, `ChatToolbar`, `ChatMainArea`, and
  `ChatOverlays` while preserving T43 participant and mobile behavior.
- Current measurements: `ChatApp.tsx` 1,022 lines; `useMessageActions.ts`
  1,309 lines.
- Task tracking: `memory-bank/tasks/T22.md`

### T44: Standalone UI Preview and Obsidian Host Boundary (2026-08-12)
**Status:** 🔄 **T44.1 COMPLETE — T44.2-5 pending**

- **T44.1 DONE (2026-08-12 11:47 IST):** Host boundary implemented and committed (`1dc4b63`)
  - `src/host/ChatHost.ts` — neutral interface, zero Obsidian imports
  - `src/host/ObsidianChatHost.ts` — production adapter backed by Obsidian APIs
  - `src/host/FixtureChatHost.ts` — Storybook/browser preview adapter with stub markdown renderer
  - 11 clean presentational components moved to `src/components/presentational/`
  - All imports updated across controllers, tests, settings sections
  - Build passes (`pnpm run build`), all 206 tests green (`pnpm test`)
- **T44.2-5 pending:** Layout extraction prerequisite, standalone fixtures, Storybook setup, real-browser checks
- Task tracking: `memory-bank/tasks/T44.md`
- Design doc: `memory-bank/implementation-details/standalone-ui-preview.md`

---

## Current Focus
**T41 Plugin Auto-Updater** — ✅ COMPLETE. Commit-hash comparison fix implemented, built, and released. `latest-dev` release now contains correct hash (ae09179).
**T43 Multi-User and Agent Chat** — ✅ COMPLETE. Phase 5 UI, the 2026-08-12 mobile scrolling/composer/model-badge follow-up, and the dependency/typecheck cleanup are complete.
**T22 ChatApp Component Decomposition** — ✅ Phase 5 layout extraction is complete; faithful preview follow-up is tracked under T44.2b.
**T44 Standalone UI Preview and Host Boundary** — 🔄 **T44.1 and T22 prerequisite complete; T44.2b production-component preview active.**
**T40 Multi-User Chat with LaTeX Support** — Phase 2 complete. T43's participant-routing foundation is merged; next: end-to-end cross-device messaging test between two Obsidian instances.
**T37 Idempotent Bulk Note Creation and Batch Scope Decision** — completed 2026-08-05; `create_notes` skips existing files and reports its created/skipped result, while mutation batching remains deliberately operation-specific.
**T38 Tool Approval Policies, Batch Plans, and Operation Audit Log** — paused by user request for a later session; the agreed design is a graduated approval policy, previewed batch plans, and a bounded privacy-aware audit log.
**T36 Stable Per-Tab Model Selection and Restored Chat View State** — completed 2026-08-05; model switching has no session-feedback loop, and saved tabs, active tab, and scroll positions restore by default.
**T35 Gemini Tool Continuity, Bulk Note Creation, and Per-Tab Model Selection** — completed 2026-08-05; Gemini tool signatures are preserved, `create_notes` provides an honest 2–100-note batch operation, and tabs restore their own selected model.
**T34 Per-Tab Chat Process Isolation** — completed 2026-08-05; live streaming/tool runtime state is now keyed by originating chat session.
**T15 Settings navigation and draft-tab lifecycle** — completed 2026-08-05; Settings links stay in-panel, diagnostics are compact, and unsent tabs are excluded from history.
**T33: Desktop Chat View Singleton Repair** ✅ COMPLETED (2026-08-04)

### Per-Tab Process Isolation (2026-08-05)
**Status:** ✅ COMPLETED

- Root cause: `ChatApp` stores streaming text, content parts, pending tool calls, abort controller, resolver, and running token count once per panel instead of once per `sessionId`.
- Visible symptom: tab B renders tab A's active streaming bubble because `ChatMessages` receives active-session messages plus global stream state.
- Tool hazard: tool executors can read `activeSessionIdRef.current` after a tab switch, so active-session exclusion and context can drift away from the originating tab.
- Plan: introduce session-keyed runtime state, route all stream/tool updates by captured origin session ID, and test cross-tab streaming, stop, and tool approval behavior.
- Implemented: `useChatRuntimeState` owns per-session runtime entries; `useMessageActions` routes single-chat, group-chat, OpenResponses, tool approval, stop, retry, and edit paths by session; tab close/delete paths abort and clear affected runtimes.
- Validation: focused hook tests, full `pnpm test`, production `pnpm run build`, and `git diff --check` pass.
- Manual validation: user confirmed that responses now remain in their originating tabs.
- Documentation: `memory-bank/tasks/T34.md` and `memory-bank/implementation-details/per-tab-chat-process-isolation.md`.

### Desktop Sidebar Duplicate Repair (2026-08-04)
**Status:** ✅ COMPLETED

- The persistent copy was a second restored `obsidian-ai-chat-view` leaf, not a duplicate internal tab.
- `main.ts` reconciles restored duplicate leaves at layout readiness and preserves the focused chat leaf when possible.
- Concurrent chat-open calls share one activation promise, preventing another leaf from being created during workspace restoration.
- Validation: `pnpm run build` and `git diff --check` passed.

**T32: Security Hardening** ✅ COMPLETED (2026-08-02)

### Security Fixes (2026-08-02)
**Status:** ✅ COMPLETED

**Path Traversal Protection** ✅
- **File:** `src/agent/ToolExecutor.ts`
- **Fix:** Added `isPathAllowed()` blocking `.obsidian/`, `.trash/`, `.git/`, and `../` paths
- **Impact:** Prevents LLM from reading plugin config, other plugins' data, or escaping vault

**XSS Sanitization** ✅
- **Files:** `src/components/MessageBubble.tsx`, `src/components/ChatMessages.tsx`
- **Fix:** `sanitizeHtmlForRenderer()` strips `<script>`, `javascript:`, `on*` handlers, `data:text/html`, `<iframe>` before `MarkdownRenderer.render()`
- **Impact:** Prevents LLM from injecting executable code into rendered messages

**SSRF Validation** ✅
- **File:** `src/api/AgentApiManager.ts`
- **Fix:** `validateAgentUrl()` blocks localhost, private IPs (10.x, 172.16-31.x, 192.168.x), non-HTTP(S) schemes
- **Impact:** Prevents malicious agent profiles from accessing internal services

**ReDoS Fix** ✅
- **File:** `src/agent/ToolExecutor.ts`
- **Fix:** Replaced regex-based DuckDuckGo HTML scraping with `DOMParser`
- **Impact:** Eliminates catastrophic backtracking on untrusted HTML

**JSON Validation** ✅
- **File:** `src/storage/ChatStorage.ts`
- **Fix:** Per-line try/catch + schema validation in `_loadMessages()`
- **Impact:** Gracefully handles malformed session files

**Test Results:** 140 tests pass (8 files), including 15 new security tests

---

## Previous Work (2026-07-29)
**T15 follow-up complete** — Past-session search, inline result links, and shared internal tabs are implemented. Tab-heading visual polish is deferred.

### Bug: Desktop Chat View Duplication (2026-08-02)
**Status:** 🔄 **IN PROGRESS**

Two separate issues caused duplicate chat views on desktop:

**Issue 1: React-level duplication (fixed in `8d541c1`)**
- **File:** `src/views/ObsidianAIChatView.ts`
- **Root cause:** `onOpen()` + `setState()` both called `render()` during view initialization; race condition could duplicate React content in same container
- **Fix:** `this.contentEl.empty()` on open + `renderPending` guard with `queueMicrotask` clear

**Issue 2: Workspace-level race (fixed in `5f74700`)**
- **File:** `src/main.ts`
- **Root cause:** `activateChatView()` checked `getLeavesOfType(CHAT_VIEWTYPE)` immediately during plugin startup. Workspace restoration happens asynchronously — restored leaf exists but hasn't registered yet, so check returns empty and a second leaf is created
- **Fix:** Added `requestAnimationFrame` delay before `getRightLeaf()` fallback, giving workspace one frame to register the restored leaf

**Cleanup required:** User currently has stuck duplicate leaf. Fix:
```js
app.workspace.getLeavesOfType("obsidian-ai-chat-view").forEach(l => l.detach())
```
Then reopen chat once. New code prevents recurrence.

---

### Bug Fixes (2026-07-28)
**Status:** ✅ COMPLETED (4/4)

**T27: Gemini thought_signature Error** ✅
- **File:** `src/api.ts`
- **Fix:** Added `google: { structuredOutputs: false }` provider option for Gemini in `streamChatWithTools()`

**T28: Obsidian Note Link Click Crash** ✅
- **File:** `src/components/MessageBubble.tsx`
- **Fix:** Added `setupLinkInterception()` to intercept all `<a>` clicks in rendered messages

**T29: Android Background Processing** ⏸️ DEFERRED
- **File:** `src/components/ChatApp.tsx`
- **Status:** Investigation complete. Decision: accept mobile limitation.

**T30: System Information Context** ✅
- **File:** `src/lib/systemPrompt.ts`
- **Fix:** Injected `[System Context]` block into every system prompt

**T31: Chat Input Draft Auto-Save** ✅ COMPLETED (2026-07-29)
- **Files:** `src/types.ts`, `src/components/ChatInput.tsx`, `src/components/ChatApp.tsx`

## Active Tasks
- **[T11]**: 🔄 **IN PROGRESS** — Log size limit, startup crash fix, CI/CD archive fix.
- **[T22]**: 🔄 **IN PROGRESS** — Phase 4 complete; Phase 5 layout extraction pending. Current ChatApp.tsx: 1,022 lines.
- **[T44]**: 🔄 **IN PROGRESS — T44.1 COMPLETE** — Host boundary implemented. T44.2-5 pending.
- **[T16]**: 🔄 **IN PROGRESS** — Phases 1–17 implemented. Debate mode working.
- **[T14]**: 🔄 **IN PROGRESS** — Phase 3 integration test.
- **[T15]**: 🔄 **IN PROGRESS** — Past-session search and shared internal tabs complete. Tab-heading polish deferred.
- **[T17]**: ⏸️ **PENDING** — Advanced vault tools. Backlinks + YAML first.
- **[T26]**: 🔄 **IN PROGRESS** — AI Intelligence Layer. Phase 2 complete (SessionSummarizer). Phases 3–5 pending.
- **[T39]**: ⏸️ **PAUSED** — Integration Provider API. Versioned host/provider architecture planned; implementation deferred.
- **[T39a]**: ⏸️ **PAUSED** — Host registry, lifecycle, policy boundary, and provider tests.
- **[T39b]**: ⏸️ **PAUSED** — Obsidian Git as first bounded provider; no Git-checkout changes authorized.
- **[T8]**: 🔄 **IN PROGRESS** — Open source release prep.
- **[T34]**: ✅ **COMPLETED** — Per-tab chat process isolation for streaming, stop, token, and tool approval state.
- **[T32]**: ✅ **COMPLETED** — Security Hardening (Path Traversal, XSS, SSRF, ReDoS)
- **[T13]**: ✅ **COMPLETED**
- **[T18]**: ✅ **COMPLETED**
- **[T19]**: ✅ **COMPLETED**
- **[T21]**: ✅ **COMPLETED**
- **[T24]**: ✅ **COMPLETED**
- **[T23]**: ✅ **COMPLETED**

---

## Completed Tasks

### T1: Chat Panel - ItemView + React UI
**Completed:** 2026-05-02

### T2: Conversation Chain & Memory
**Completed:** 2026-05-04

### T3: Context & Mentions System
**Completed:** 2026-05-04

### T4: Streaming
**Completed:** 2026-05-02

### T5: In-Place Note Editing from Chat
**Completed:** 2026-05-04

### T6: Token & Context Management
**Completed:** 2026-05-04

### T7: Release System & CI/CD
**Completed:** 2026-05-02

### T9: Settings & Provider Profiles
**Completed:** 2026-05-02

### T10: Model Discovery & Picker UX
**Completed:** 2026-05-04

### T18: Web Search Tool for Chat
**Completed:** 2026-05-17
**Summary:** Web search tool with 5 providers (DuckDuckGo, Brave, Tavily, Exa, SearXNG).

### T19: File Attachments for Chat Messages
**Status:** 🔄 IN PROGRESS
**Priority:** HIGH
**Started:** 2026-05-25

#### Completed Steps
- ✅ `Attachment` interface in `src/types.ts`
- ✅ `AttachmentEngine.ts` — resolves markdown/image/PDF to AI SDK content parts
- ✅ ChatInput 📎 dropdown with note/image/PDF picker
- ✅ MessageBubble attachment chip rendering
- ✅ `api.ts` multimodal support (`SdkMessage`, `MessageContentPart`)
- ✅ `ChatApp.tsx` attachment resolution in `handleSend()`
- ✅ `Orchestrator.ts` accepts attachments param

#### Current Work
- 🔄 Group chat attachment broadcasting (deferred per user request)

#### Up Next
- ⬜ Test with Gemini (images + PDFs)
- ⬜ Test with OpenAI/Anthropic (images only)
- ⬜ Test with Kimi/DeepSeek/Ollama

### T21: CLI Test Harness for AI Features
**Status:** 🔄 IN PROGRESS
**Priority:** MEDIUM
**Started:** 2026-05-25

#### Completed Steps
- ✅ Task file created
- ✅ Implementation doc created (`memory-bank/implementation-details/cli-test-harness.md`)

#### Up Next
- ⬜ Create `scripts/test-attachments.ts`
- ⬜ Create `scripts/test-stream-chat.ts`
- ⬜ Create `scripts/test-tool-calling.ts`
- ⬜ Create `scripts/test-multimodal.ts`
- ⬜ Create `scripts/lib/mockApp.ts` and `loadSettings.ts`

---

## Paused Tasks

### T12: Chat Onboarding, Tips & Empty States
**Status:** ⏸️ PAUSED
**Priority:** MEDIUM

### T25: Unit Test Infrastructure for Streaming & Token Estimation
**Status:** ⏸️ PENDING
**Priority:** MEDIUM
**Created:** 2026-07-14

#### Description
Unit test coverage for streaming state accumulation, token estimation, and message rendering. Extract pure functions from `AgentLoop.ts`, `OpenResponsesLoop.ts`, `useMessageActions.ts`, and `ChatMessages.tsx`. Create mock-based tests for streaming loops.

#### Phases
1. Extract pure functions (low risk)
2. Unit tests for `tokenEstimator.ts`, `accumulateContentParts()`, `getRemainingText()`
3. Mock-based tests for `AgentLoop` and `OpenResponsesLoop`
4. E2E regression tests (future)

#### Deferred Until
After next release cycle. Fixes verified by build + manual QA.

### T31: Chat Input Draft Auto-Save
**Completed:** 2026-07-29
**Summary:** Persist unsent composer text across app restarts and tab switches via `ChatSession.draft`. Debounced 500ms save through existing session persistence pipeline.
