# Active Context

*Last Updated: 2026-08-10 22:45 IST*

### T41: Plugin Auto-Updater with Stable/Dev Channels (2026-08-09)
**Status:** ✅ COMPLETE — Commit-hash fix applied, built, and released

- Built complete custom auto-updater for obsidian-ai plugin
- **Files:** `src/updater/PluginUpdater.ts`, `src/settings-sections/updaterSettings.ts`
- **Capabilities:** GitHub API fetch, semver compare, stable/dev channels, auto-install toggle, manual "Check Now", backup + rollback, cross-platform (desktop + mobile)
- **Fixes applied:** Settings nav links, mobile UI (removed Node.js imports), mobile toggles (`Setting.addToggle()`), dev channel prerelease filtering, version display with channel suffix, non-semver tag handling, **commit-hash comparison for dev channel**
- **Commit-hash fix:** `checkForUpdate()` fetches latest SHA from GitHub API, compares with local `GIT_COMMIT_HASH`. If match, returns `hasUpdate: false`. Prevents perpetual "update available" on dev channel.
- **Released:** `latest-dev` rebuilt from ae09179 with fix included
- Task tracking: `memory-bank/tasks/T41.md`

### T40: Multi-User Chat with LaTeX Support (2026-08-10)
**Status:** 🔄 Phase 2 Complete (Presence Tracking + Bug Fixes), Phase 2b Pending

- Core architecture audit completed. Decision: NO Supabase. WebSocket relay + WebRTC peer-to-peer.
- **Phase 1 Complete:** WebSocket relay, SyncAdapter, BRAT distribution, relay verification
- **Phase 2 Complete:** Presence tracking with remote user dropdown
  - Bug fixes: `remoteUserCount` prop wiring, badge visibility, callback race condition, roster includes self
  - UI: Radio icon (📻) with badge, clickable dropdown showing room + users
  - Commits: `3765188`, `6746201`, `683d9d5`, `108858d`
- **Message Rendering Fixed (2026-08-10):** Adapter was checking `data.type === "message"` but relay sends `data.type === "chat"`. Fixed in commits `2897b1f` and `e7e29ce`.
- **NEW BUG (2026-08-10):** Remote messages trigger AI response — when remote messages arrive via relay, ChatApp treats them as local user input and sends them to AI. Fix pending (add `skipAI` or `remote` flag).
- **Next:** Fix AI-triggering bug, end-to-end cross-device messaging test, then Phase 2b (attribution, typing, mentions)
- **Docs:** `memory-bank/implementation-details/presence-tracking.md` (full design + bug fixes)
- **Task tracking:** `memory-bank/tasks/T40.md`

### T43: Multi-User and Agent Chat with LaTeX Support (2026-08-10)
**Status:** 🔄 Architecture Design — Two-Step Implementation Plan

- **Evolution of T40** — builds on relay infrastructure and presence tracking from T40
- **New architecture:** Equal-footing participant model where AI agents and remote humans are peers
- **Implementation strategy:**
  - **Step 1:** `ParticipantRouter` wrapper around existing `Orchestrator` (current)
    - Minimal risk — agent logic untouched
    - Adds relay routing for remote users alongside agent dispatch
    - Validates model before deeper refactor
  - **Step 2:** Refactor `Orchestrator` to be participant-agnostic (only if Step 1 works)
- **Phase 1 Complete (2026-08-11):** Types, session state, sync adapter, ParticipantRouter skeleton
  - `ChatMessage` extended with `remote?: boolean`, `fromUserId?: string`
  - `ChatSession` extended with `remoteUsers?: string[]`
  - `WebSocketSyncAdapter` sets `remote: true` on received relay messages
  - `ParticipantRouter` skeleton created — wraps Orchestrator, adds relay dispatch
  - All 188 tests pass
  - Commit: `539ca52`
- **Key decisions:**
  - All participants (agents, remote users, local user) treated equally
  - Messages broadcast to ALL participants in a tab
  - Agents receive full context including remote user messages
  - Human-only tabs possible (no AI agents)
- **Phase 2:** Add relay routing to wrapper, test message flow
- **Phase 3:** AI context includes remote messages with attribution
- **Phase 4:** Human-only tabs (relay-only mode)
- **Phase 5:** Attribution, typing indicators, participant UI
- **Branch:** `t43-multi-user-agent-chat` (from `main` at `19f780d`)
- **Docs:** `memory-bank/implementation-details/multi-user-agent-chat.md`
- **Task tracking:** `memory-bank/tasks/T43.md`

### T42: Remote Chat Storage & Sync (2026-08-10)
**Status:** 🔄 Created — Design complete, implementation pending

- **Objective:** Persistent remote storage for chat sessions using relay server
- **Design doc:** `memory-bank/implementation-details/remote-chat-storage-design.md`
- **Key decision:** Storage lives on relay server (not Supabase), clients sync via WebSocket
- **Next:** Phase 1 implementation (relay storage endpoints, client sync protocol)
- **Task tracking:** `memory-bank/tasks/T42.md`

---

## Current Focus
**T41 Plugin Auto-Updater** — ✅ COMPLETE. Commit-hash comparison fix implemented, built, and released. `latest-dev` release now contains correct hash (ae09179).
**T40 Multi-User Chat with LaTeX Support** — Phase 1 complete. BRAT distribution works. Relay server connections established. Next: end-to-end cross-device messaging test between two Obsidian instances.
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
- **[T22]**: 🔄 **IN PROGRESS** — Phases 0–3 complete. ChatApp.tsx: 1,948 → 636 lines. Phases 4–5 pending.
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
