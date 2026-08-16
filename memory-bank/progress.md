# Implementation Progress
*Last Updated: 2026-08-16 19:05 IST*

### 2026-08-16 — T45: PDF Text Extraction Tool (COMPLETE)

- Server-side: PyMuPDF + Flask extraction service on VPS port 8082, proxied through `/relay/pdf-extract/`
- Client-side: pdfjs-dist for offline extraction in Obsidian Electron
- Agent tool: `readPdfTool` with URL/path support, max_pages parameter
- Settings UI: extraction method dropdown, server URL, max pages slider (0-200)
- MessageBubble: PDF attachment cards with Save to Vault / Open buttons
- Files: `src/utils/PdfExtractor.ts`, `src/agent/tools.ts`, `src/agent/ToolExecutor.ts`, `src/settings.ts`, `src/settings-sections/pdfExtraction.ts`, `src/components/MessageBubble.tsx`
- Verification: 236 tests, production build, diff check pass
- User confirmed working

### 2026-08-16 — T13a: Tool Call Context Persistence Bug Fix (COMPLETE)

- **Bug**: Tool call results stripped from conversation history — LLM forgot prior tool executions
- **Root cause**: `useMessageActions.ts` `buildReplayContent()` only included text, ignoring `contentParts`/`toolCalls`
- **Fix**: `buildHistoryWithTools()` reconstructs Vercel AI SDK message shapes (assistant + tool messages)
- Files: `src/hooks/useMessageActions.ts` (+159 lines, -9 lines)
- Verification: 236 tests, production build pass
- User confirmed working

### 2026-08-15 T8a Implementation Batch

- Implemented compatibility baseline `1.4.5`, mobile filesystem guard, platform/lifecycle fixes, safe DOM/style changes, React 18 pin, and release workflow hardening.
- Verification passes: 23 test files, 234 tests, TypeScript, production build, and `git diff --check`.
- Release remains pending policy scanner rerun, final 1.3.3 version bump, CI attestation verification, and manual desktop/mobile smoke tests.

### 2026-08-15 Release Closeout

- T8a Community Directory remediation completed through review acceptance at 1.3.4.
- Final polish shipped to `latest-dev` in `cac9688`; 236 tests and production build pass.
- Remaining: manual desktop/mobile smoke testing only.

### 2026-08-15 T8a Release 1.3.3

- Bumped manifest/package/version metadata to `1.3.3` and published exact tag `1.3.3`.
- CI release run `31874348465` passed build, asset validation, attestations, and release upload.
- Release includes only supported plugin assets plus checksums; fresh Community review is now the remaining external gate.

### 2026-08-15 T8a Follow-up Release 1.3.4

- Fixed the remaining review findings: directive comments, preview innerHTML/style usage, logger navigator access, and unsupported leaf reveal API.
- Local gates pass: 234 tests, TypeScript, build, audit, and diff check.
- Published `1.3.4`; tagged CI run `31874989163` passed attestations and release upload.
- Next: request fresh Community review for 1.3.4 and complete manual smoke tests.

### 2026-08-15 Community Directory Review — T8a Created

- Parsed the supplied review PDF for release `1.3.2` at commit `056428c`.
- Documented all reported failures and warnings, including unsupported APIs, unsafe DOM operations, dynamic scripts, Node filesystem access, artifact mismatch, unsupported zip packaging, missing attestations, and release-note metadata.
- Created the remediation child task T8a under T8; implementation work has not started.

### 2026-08-15 Release Audit — T8 Reopened

- Audited the AI optimization, memory layer, and Obsidian policy/guideline readiness.
- Fixed cancellation propagation and added regression coverage; 234 tests and production build pass.
- Identified release blockers: prohibited `obsidian-ai` manifest ID, production `fetch()` usage, incomplete network/privacy disclosures, destructive AI prune without recovery, and non-resilient dual-file memory writes.
- Remediation sequence is documented in `implementation-details/release-readiness-audit.md`.

### 2026-08-14 Evening Session — T8 Complete

- T8 (Open Source Release with Branding) completed and ready for community plugin submission.
- README: "Chat Lab: Obsidian AI" branding, feature highlights table, accurate descriptions.
- Version 1.3.0 bumped and tagged (`v1.3.0`).
- Security audit passed (no hardcoded secrets, XSS sanitized, path traversal protected).
- `docs/security-audit-2026-08-14.md` and `.coderabbit.yaml` created.
- Forked `obsidianmd/obsidian-releases`; entry added to `community-plugins.json`.
- PR link prepared for user submission.

### 2026-08-14 Session Closeout

- T19a completed: group-chat attachments are persisted, replayed, and propagated through relay messages (`f694685`).
- T20 completed: long-press message selection, multi-message Markdown copy, Chat History rename, and Copy/Export dropdowns (`b980d7a` through `a9cad79`).
- T41 completed follow-up: updater modal exposes commit hash, message, author, and timestamp (`7a770f3`).

### T43: Multi-User and Agent Chat with LaTeX Support (2026-08-10 → 2026-08-11)
**Status:** ✅ COMPLETE — All 5 Phases Delivered and Merged

- **Evolution of T40** — equal-footing participant model (agents + remote humans as peers)
- **Branch:** `t43-multi-user-agent-chat` (from `main` at `19f780d`); merged into `main` on 2026-08-11
- **All phases complete:**
  - **Phase 1:** Types, session state, sync adapter, ParticipantRouter skeleton (`539ca52`)
  - **Phase 2:** Wired ParticipantRouter into ChatApp (`f83e5d0`)
  - **Phase 3:** AI context includes remote messages with attribution (`9b2a498`)
  - **Phase 4:** Human-only tabs use relay-only routing (`8b6f70f`)
  - **Phase 5:** Attribution UI, typing indicators, participant bar (`90503d9`)
    - Phase 5a: Message attribution — MessageBubble.tsx shows fromUserId with colored dot
    - Phase 5b: Typing indicators — SyncAdapter.sendTyping()/onTyping(), 3s auto-clear, 2s throttle
    - Phase 5c: Participant bar — persistent bar below ActionBar showing agents + remote users
    - Relay bug fix: Buffer→string conversion in broadcast
    - Post-phase fixes: ActionBar badge ?? 0 fix, single-agent participant bar fix (`ab23e5f`)
- **Tests:** Relay tested MacBook ↔ mobile; participant bar verified; typing indicators need 2-device test
- **Verification:** 20+ test files, 202+ tests passed; `git diff --check` passed
- **Docs:** `memory-bank/implementation-details/multi-user-agent-chat.md`
- **Task:** `memory-bank/tasks/T43.md`
- **2026-08-12 follow-up:** Fixed mobile transcript scrolling with constrained flex sizing and touch behavior; removed mobile composer bottom padding; documented the host-owned view-selector gap; corrected the model badge to count selected model IDs rather than the group-only participant array; added four badge regression assertions.
- **Dependency/typecheck cleanup (2026-08-12):** Reinstalled dependencies from `pnpm-lock.yaml` and enabled `skipLibCheck` in the base TypeScript config to match the production build policy.
- **Verification:** `pnpm exec tsc --noEmit`, `pnpm run build`, 21 test files, 206 tests, changed-files-only Prettier, and `git diff --check` passed.

### T42: Remote Chat Storage & Sync (2026-08-10)
**Status:** 🔄 CREATED — Design complete, implementation pending

- **Objective:** Persistent remote storage for chat sessions using relay server
- **Architecture:** Storage lives on relay server (not Supabase), clients sync via WebSocket
- **Design doc:** `memory-bank/implementation-details/remote-chat-storage-design.md`
- **Next:** Phase 1 implementation (relay storage endpoints, client sync protocol)
- **Task:** `memory-bank/tasks/T42.md`

### T22: ChatApp Component Decomposition (2026-05-28 → current)
**Status:** 🔄 Phase 4 complete; Phase 5 pending

- Phase 4 landed in `da4af7d`, extracting session, settings, export, search,
  and context hooks.
- The task record now reflects the implementation instead of the old Phase 3
  status.
- Phase 5 remains: extract `ChatLayout`, `ChatToolbar`, `ChatMainArea`, and
  `ChatOverlays` while preserving T43 participant and mobile behavior.
- Current measurements: `ChatApp.tsx` 1,022 lines and
  `useMessageActions.ts` 1,309 lines.
- **Task:** `memory-bank/tasks/T22.md`

### T44: Standalone UI Preview and Obsidian Host Boundary (2026-08-12 → 2026-08-14)
**Status:** ✅ COMPLETE

- T44.1: Host boundary implemented (`ChatHost.ts`, `ObsidianChatHost.ts`, `FixtureChatHost.ts`)
- T22 Phase 5: Layout extraction (`ChatToolbar`, `ChatMainArea`, `ChatOverlays`)
- T44.2b: Production-component preview with 8 fixture states
- T44.3: Playwright e2e tests verify mobile/desktop viewports, scrolling, modals
- All gates pass: `pnpm test` (22 files, 213 tests), `pnpm exec tsc --noEmit`, `pnpm run build`
- Boundary documentation: standalone preview ≠ Obsidian host acceptance
- **Task:** `memory-bank/tasks/T44.md`
- **Design:** `memory-bank/implementation-details/standalone-ui-preview.md`

### T40: Multi-User Chat with LaTeX Support (2026-08-10)
**Status:** 🔄 Phase 2 Complete, Phase 2b Pending

- **Phase 1 Complete (2026-08-09):** WebSocket relay, SyncAdapter, BRAT distribution
- **Phase 2 Complete (2026-08-10):** Presence tracking with remote user dropdown
  - Relay user list, join/leave/roster protocol
  - SyncAdapter v2 with onUserList/onPresence hooks
  - Remote user indicator (📻 radio icon with badge)
  - Clickable dropdown showing room + connected users
  - Bug fixes: remoteUserCount prop wiring, badge visibility, callback race condition, roster includes self
  - Commits: `6746201`, `683d9d5`, `108858d`
- **Message Rendering Fixed (2026-08-10):** Adapter was checking `data.type === "message"` but relay sends `data.type === "chat"`. Fixed in commits `2897b1f` and `e7e29ce`.
- **Known Bug:** Remote messages trigger AI response — when remote messages arrive, ChatApp treats them as local input and sends to AI. Fix pending (add `skipAI` or `remote` flag).
- **Next:** Fix AI-triggering bug, end-to-end cross-device test, Phase 2b (attribution, typing, mentions)
- **Docs:** `memory-bank/implementation-details/presence-tracking.md`, `memory-bank/implementation-details/multi-user-chat-design.md`
- **Task:** `memory-bank/tasks/T40.md`

### T41: Plugin Auto-Updater with Stable/Dev Channels (2026-08-09)
**Status:** ✅ COMPLETE — Commit-hash fix applied, built, and released

- Built complete custom auto-updater for obsidian-ai plugin
- **Core capabilities:**
  - ✅ GitHub API fetch for releases
  - ✅ Stable vs Dev (pre-release) channel support
  - ✅ Auto-install stable updates silently (optional toggle)
  - ✅ Manual "Check Now" button in settings
  - ✅ Backup before install, rollback on failure
  - ✅ Cross-platform: desktop AND mobile (uses `requestUrl` + `app.vault.adapter`)
- **Fixes applied:**
  - Settings nav links for Sync/Updates sections
  - Mobile UI garbled → removed Node.js imports, used Obsidian APIs
  - Mobile toggles rectangles → `Setting.addToggle()` / `Setting.addDropdown()`
  - Dev channel checked stable releases → now filters `prerelease: true`
  - Version display → added `(stable)` / `(dev channel)` suffix
  - Non-semver dev tags → `latest-dev` treated as newer than semver
  - **Perpetual "update available" on dev → commit-hash comparison fix**
    - `checkForUpdate()` fetches latest commit SHA from GitHub API
    - Compares with local `GIT_COMMIT_HASH` baked in at build time
    - If match → returns `hasUpdate: false`, no prompt
    - `latest-dev` release rebuilt from ae09179 with fix included
- Files: `src/updater/PluginUpdater.ts`, `src/settings-sections/updaterSettings.ts`
- Task: `memory-bank/tasks/T41.md`

### T40: Multi-User Chat with LaTeX Support (2026-08-09)
**Status:** 🔄 IN PROGRESS — Phase 1 Complete, Phase 2 Pending

- Architecture audit reveals obsidian-ai has strong foundation:
  - ✅ LaTeX rendering already works (Obsidian's built-in MathJax/KaTeX)
  - ✅ GroupChatApp UI already renders multi-participant conversations
  - ✅ Message types support `agentId`/`agentName`/`agentColor` — map to user fields
  - ✅ Clean `ChatStorage` interface — easy to add sync wrapper
  - ✅ Context/mention system already powerful
- **Decision: WebSocket + WebRTC, NO Supabase.**
  - WebSocket relay for immediate PoP testing (tiny Node.js server)
  - WebRTC for production peer-to-peer (uses WebSocket relay as signaling)
  - Both implement unified `SyncAdapter` interface
  - GroupChatApp is transport-agnostic
- **Phase 1 Complete (2026-08-09):**
  - ✅ BRAT beta distribution verified — plugin installs/updates via BRAT successfully
  - ✅ Relay server connection verified — WebSocket adapter connects to relay
  - ✅ GroupChatView re-enabled (was commented out)
  - ✅ Message handling logic fixed for sync mode
  - ✅ UI: "AI Council" → "Group Chat" throughout
  - ⬜ End-to-end cross-device messaging — deferred to next session
- Estimated: 4-6 weeks for solid MVP
- Full audit: `memory-bank/implementation-details/multi-user-chat-audit.md`
- Design doc: `memory-bank/implementation-details/multi-user-chat-design.md`
- Task: `memory-bank/tasks/T40.md`

---

## Active Tasks

### T39: Integration Provider API for External Obsidian Plugins (2026-08-05)
**Status:** 🔄 IN PROGRESS — read-only host slice implemented

- Establish a versioned, optional peer-plugin provider contract instead of
  hard-coding private Dataview/Tasks/Templater access into the agent.
- T39a will deliver host discovery, lifecycle, namespaces, schema/risk
  validation, availability state, approval/audit routing, and tests.
- T39b will make Obsidian Git the first provider through narrow GitManager
  operations, preserving its credentials and mobile-safe transport.
- Read-only Git status/history/change tools are the first candidate slice;
  stage/commit require a plan and pull/push require separate confirmation.
- UI plan: an Integrations settings list for availability/enablement, generic
  pending-operation and inline progress/result cards, plus the later T38
  active-policy indicator. Obsidian AI will not duplicate the Git sidebar.
- Implemented provider discovery/version validation, opt-in settings, normal
  chat read-only tool composition, ToolExecutor dispatch, and registry tests.
- Deferred: Git provider, mutations, audit/policy UI, detailed progress, and
  OpenResponses provider-tool conversion.
- Tracking: `memory-bank/tasks/T39.md` and
  `memory-bank/implementation-details/integration-provider-api.md`.

### T38: Tool Approval Policies, Batch Plans, and Operation Audit Log (2026-08-05)
**Status:** ⏸️ PAUSED — deferred by user for a later implementation session

- Plan a Tool Safety & Approval settings section that replaces the binary
  `autoApply` switch with graduated approval modes, ending in an explicitly
  confirmed YOLO mode.
- Plan a shared preview → approve → apply contract for additional batch
  mutations, with preflight validation, per-file previews, expected-content
  guards, and applied/skipped/failed results.
- Plan a privacy-aware JSONL tool-operation audit log with rotation, total-size
  limits, export/clear controls, and no raw note content or secrets by default.
- Tracking task: `memory-bank/tasks/T38.md`.

### T37: Idempotent Bulk Note Creation and Batch Scope Decision (2026-08-05)
**Status:** ✅ COMPLETED

- Changed `create_notes` so an existing file is reported as a safe skip while the rest of the approved batch proceeds; forbidden and duplicate paths remain no-write validation failures.
- Added the execution/result contract to report created and skipped paths in the UI and to the agent, including an existing-file race during vault writes.
- Decided against a generic batch wrapper for edit, append, move, or delete operations. Future mutation batching needs an operation-specific preview, collision/expected-content checks, one approval, and an explicit partial-result contract.
- Validation: 154 tests across 15 files, production build, and `git diff --check` passed.
- Tracking task: `memory-bank/tasks/T37.md`.

### T36: Stable Per-Tab Model Selection and Restored Chat View State (2026-08-05)
**Status:** ✅ COMPLETED

- Broke the shared picker/session profile feedback loop and removed its ActionBar console logging.
- Added default-on restoration of saved internal tabs, active tab, and each tab's scroll position after plugin or app reload.
- Added the Chat Defaults toggle; unsent drafts remain outside persistent storage by design.
- Validation: 153 tests across 14 files, production build, and `git diff --check` passed.

### T35: Gemini Tool Continuity, Bulk Note Creation, and Per-Tab Model Selection (2026-08-05)
**Status:** ✅ COMPLETED

- Preserved the AI SDK provider metadata, including Gemini's opaque thought signature, through manual agent tool-result continuations.
- Added `create_notes` for 2–100 genuinely batched new notes, with one approval card and no-overwrite handling for existing, duplicate, and forbidden paths. T37 refined existing-path behavior to safe skips.
- Made the shared model picker restore and persist profile selection per chat tab; new tabs inherit the active tab's model.
- Validation: 153 tests across 14 files, production build, and `git diff --check` passed.
- Tracking task: `memory-bank/tasks/T35.md`.

### T34: Per-Tab Chat Process Isolation (2026-08-05)
**Status:** ✅ COMPLETED

- Confirmed the tabbed chat bug: live generation state is shared across the `ChatApp` panel while saved messages are selected per active session.
- Added session-keyed runtime state for streaming text, content parts, pending tools, abort controllers, resolvers, and running token totals.
- Routed stream deltas, stop, retry/edit guards, tool approval, and tool executors through the originating session ID captured at send time.
- Added tab close/delete cleanup for affected session runtimes.
- Added regression coverage for cross-tab stream routing and tool session identity.
- Validation: focused hook tests, full `pnpm test`, `pnpm run build`, and `git diff --check` pass.
- Manual validation: user confirmed independent tab behavior after the repair.
- Implementation doc: `memory-bank/implementation-details/per-tab-chat-process-isolation.md`.
- Tracking task: `memory-bank/tasks/T34.md`.

### T33: Desktop Chat View Singleton Repair (2026-08-04)
**Status:** ✅ COMPLETED

- Removed duplicate restored `obsidian-ai-chat-view` leaves after workspace layout restoration.
- Serialized chat activation and reused one canonical sidebar leaf.
- Internal chat tabs remain within one React `ChatApp`; saved sessions are unaffected.
- Validation: `pnpm run build` and `git diff --check` passed.

### T15: Past-Session Search and Shared Tabs (2026-07-29)
**Status:** ✅ IMPLEMENTED; tab-heading visual polish deferred

- Saved-session search works for JSONL and legacy storage and excludes the active conversation.
- Agents are prompted to use `search_past_sessions`; replies include titled links and matching excerpts.
- Links open the matched message in a shared internal tab, retaining one toolbar and composer.
- Compact tab labels horizontally scroll; closing a tab preserves the saved session.
- Implementation doc: `memory-bank/implementation-details/past-session-search-and-tabs.md`.

**Attribution:** GPT 5.6 Terra Low performed all implementation work in this session.

### T15: Settings Navigation and Draft Tabs (2026-08-05)
**Status:** ✅ IMPLEMENTED; cosmetic draft-title follow-up remains

- Settings shortcuts scroll within the settings container; the Intelligence shortcut targets AI Intelligence Layer correctly.
- Diagnostics usage data is a table and metrics use a compact responsive grid.
- Tab width defaults to 160 px and is configurable from 120–360 px.
- Every `+` creates a live draft tab; drafts are promoted only on the first message and cannot appear in saved history, export, or storage.
- Implementation doc: `memory-bank/implementation-details/past-session-search-and-tabs.md`.

### T26: AI Intelligence Layer — Persistent Identity, Memory & Context
**Status:** 🔄 **IN PROGRESS**
**Priority:** HIGH
**Started:** 2026-07-21

Design complete. Five-phase implementation plan:
1. **P1 — Persistent Identity & Memory:** Auto-load persona + memory into system prompt
2. **P2 — Session Memory Creation:** `create_memory` tool + auto-summarization
3. **P3 — Cross-Session Retrieval:** AI searches its own chat history
4. **P4 — Plugin Bridges:** Dataview, Tasks, Templater integration
5. **P5 — Proactive Suggestions:** Limited proactivity while Obsidian is open

**Key decisions:**
- All memory files live in plugin directory (`.obsidian/plugins/obsidian-ai/intelligence/`), NOT the vault
- Memory format: markdown for human readability + optional SQLite for structured queries
- Feedback loop: AI reads memory at session start, writes memory during/after sessions

**Files created:**
- `memory-bank/tasks/T26.md`
- `memory-bank/implementation-details/ai-intelligence-layer.md`

### Repo Migration: Break Fork Relationship (2026-07-28)
**Status:** ✅ COMPLETED
**Priority:** HIGH

Clean separation from upstream fork. Project is now fully independent.

**Actions:**
- Renamed old repo → `obsidian-ai-archive` (preserves all history, issues, PRs)
- Created fresh `space-cadet/obsidian-ai` (not a fork on GitHub)
- Pushed all 324 commits (197 Deepak commits + 127 FBarrca base commits)
- Updated local origin remote, removed upstream remote

**Verification:**
- `isFork: false` confirmed via GitHub API
- 324 commits on origin match local
- No upstream remote remains
- GitHub auto-redirects from old name to archive

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
