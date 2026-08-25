### 2026-08-25 — T60b OpenResponses Loop Bug Fix ✅ COMPLETE

- Diagnosed and **fixed** 3 protocol bugs in OpenResponses loop causing 500k-token blowup:
  1. **Duplicate input submission:** `streamAgentResponse({ input, tools })` was
     inside the `while` loop, resubmitting full conversation on every tool round
  2. **Discarded continuation ID:** `previousResponseId` accepted but never
     serialized; continuations were stateless
  3. **Continuation handler gap:** Post-continuation stream didn't handle
     `function_call`/`function_call_done`, forcing fallback to broken outer loop
- **Implementation:**
  - `AgentApiManager.ts`: Added `previousResponseId` to `AgentApiOptions`,
    serializes to `body.previous_response_id`, passes through `continueWithToolResult()`
  - `OpenResponsesLoop.ts`: Moved initial request outside loop; added shared
    `consumeStream` handler supporting all event types; continuations use
    stateful `previous_response_id`; tools preserved
  - Tests: 3 new tests (OpenResponsesLoop + AgentApiManager). All 301 tests pass.
  - Build passes.
- Impact: ~140× token reduction for multi-step chains (500k → 3.6k)
- Memory-bank updated: 7 task files, 1 implementation detail doc, 1 edit chunk,
  1 new proposed task (T60d)
- Commit: `38c352d` on `origin/main`

### 2026-08-25 — T60 Tool-System Architecture Plan 🔄

- Completed a read-only audit of built-in and provider tool availability,
  transport loops, approval, validation, dispatch, rendering, and tests.
- Recorded T60/T60a–c and the canonical registry/execution-pipeline design.
- Updated T14, T17, T18, T38, T39/T39a, T46, T48b, and T48c ownership and
  acceptance boundaries; created T18a for bounded web-page retrieval.
- At the planning stage, no source code had changed and no implementation
  claim was made; the bounded T60a adapter was added afterward in commit
  `68dc915`.

### 2026-08-25 — T60a registry review correction 🔄

- Commit `68dc915` added the registry adapter, provider normalization,
  availability filtering, OpenResponses projection support, and focused tests.
- The adapter is not yet connected to `ToolExecutor`; T60a remains incomplete.
- The next step is a failing integration test for the registry execution
  contract, followed by the smallest wiring change that makes it pass.
- T60b transport parity and T60c validation remain paused. No new planning
  subtasks or design documents are being added at this stage.

### 2026-08-23 — T48c implementation validation and merged closeout 🔄

- Recorded the T48 implementation merged through PR #5 as `6a205b9`, including
  request budgeting, bounded tool-result replay, semantic compaction,
  asynchronous summarization, configurable thresholds, and the completion
  notice.
- Validated live compaction with trigger `8,000`, release `4,000`, and four
  preserved recent messages. The first three turns stopped at the message
  count guard; the fourth turn triggered compaction and displayed the notice.
- The recovery prompt returned all four seeded markers and the requested
  representative requirements.
- Remaining: diagnostic summary metadata, schema/provenance and tool-pair
  audits, repeated-cycle coverage, exact historical retrieval, and summary
  inspection/persistence. See `implementation-details/T48c-validation-2026-08-23.md`.

### 2026-08-23 — T58/T58c/T58d: Sync progress implementation and plugin rebuild audit 🔄

- Completed the planned progress and dry-run implementation: planning stages,
  stable operation rows, latest-active shimmer, persistent completion state,
  read-only plugin-data planning, and chat-session rebuild progress.
- Rebuild now reuses its initial scan and uses bounded concurrency for
  independent transfers. Verification passed: 29 test files / 269 tests,
  TypeScript, Prettier, and production build.
- Confirmed plugin data participates in normal sync and dry-run planning but
  not in the Rebuild action. Its identity-scoped shared state remains separate
  from the chat-session SyncIndex; a distinct plugin-data rebuild is still
  required if that recovery operation is desired.
- Focused UI/rebuild tests and real-host acceptance remain open.

### 2026-08-23 — T58d implementation slice 🔄

- Implemented shared planning/progress phases for normal sync, dry-run, and
  index rebuild.
- Added read-only plugin-data planning for dry runs and kept dry runs from
  writing plugin state, retry records, or sync logs.
- Fixed duplicate progress rows by using stable operation IDs; shimmer now
  applies only to the latest active row, and completion progress remains
  visible.
- Rebuild now reuses the initial scan and uses bounded concurrency for
  independent transfers.
- Verification: 29 test files / 269 tests, TypeScript, Prettier, and
  production build passed. Device/UI acceptance remains open.

### 2026-08-23 — T58 task ID migration and progress/rebuild plan 🔄

- Restored T43 as the original Multi-User and Agent Chat task from Git history.
- Moved the integrated sync UI records to T58 and T58a-T58c, retaining T43a-c
  compatibility pointers for historical links.
- Created T58d for planning-stage progress, plugin-data dry-run planning,
  stable operation rows, latest-item shimmer, persistent completion state,
  rebuild progress, conflict status, and rebuild performance.
- T58d implementation has started; real-host acceptance and remaining focused
  UI/rebuild tests remain open.

### 2026-08-22 — T57b: Two-Way State, Recovery, and Deletions ✅

- Added durable per-file shared state and encrypted remote state persistence to
  `PluginFileSyncManager`.
- Added user-facing local/remote/both/cancel conflict choices and visible
  conflict reporting.
- Added recovery copies before local replacement or deletion, plus keep-both
  conflict copies.
- Added deletion tombstones tied to the previous shared checksum; unexplained
  missing remote data is never auto-deleted or overwritten.
- Added focused acceptance coverage. TypeScript, full build, and full suite
  passed: 263 tests across 27 files.

### 2026-08-23 — T57c and token billing reconciliation ✅

- Added a complete sync identity covering vault, backend, server, account,
  remote path, and encryption identity. The identity namespaces the local
  cache and invalidates the sync index and plugin-file state when setup changes.
- Added durable identity-scoped retry records with exponential backoff. Failed
  chat sessions and plugin-data items remain retryable; successful items clear
  their records and are not needlessly repeated.
- Added per-item plugin-data progress and separate chat-session/plugin-data
  completion status in the sync panel, including partial and failed outcomes.
- Captured AI SDK provider usage on assistant messages. Diagnostics and session
  totals now prefer provider-reported prompt/completion/total tokens and use a
  full-request estimate only when provider usage is unavailable.
- Verification: 29 test files, 268 tests passed; TypeScript and production
  build passed.

### 2026-08-21 — T58 Subtasks Complete

**T58a: Fix Rebuild Sync Index Title Resolution** ✅
- Applied `titleMap` pattern from `triggerSync()` to `rebuildSyncIndex()`
- Eliminates "Untitled Session" by resolving titles from local cache → sync cache → truncated ID
- File: `src/main.ts`

**T58b: Add Activity Indicators to Sync UI** ✅
- Added CSS spinner animation (`sync-v2-spin`) for status heading
- Added pulsing progress bar animation (`sync-v2-pulse-bar`)
- Added shimmer animation on pending items (`sync-v2-shimmer`)
- Pure CSS — no JS animation overhead, tablet-friendly
- Files: `src/components/ChatSyncPanel.tsx`, `styles.css`

**T58c: Extend Sync to All Plugin Data** ✅
- `StorageAdapter` gained `readText()` method
- `WebDAVStorageAdapter` implemented `readText()`
- Added `_serializePluginData()` — bundles settings (minus API keys) + sync index
- Added `_deserializePluginData()` — merges remote data, preserves local credentials
- `syncPluginData()` auto-called after successful session sync
- Last-write-wins conflict resolution with notification
- Files: `src/sync/StorageAdapter.ts`, `src/sync/WebDAVStorageAdapter.ts`, `src/main.ts`

---

### 2026-08-22 — T57a: Shared Plugin-File Sync Implemented ✅

- Added `src/sync/PluginFileSyncManager.ts` and focused tests.
- Routed plugin settings, memory, persona, audit, and usage transfers through
  the common manager.
- Added version, checksum, encryption, temporary remote writes, safe local
  replacement, damaged-file rejection, and per-file result reporting.
- Two-way differences are reported as conflicts without overwriting either
  side. T57b now provides last-known-state choices, recovery, and deletions;
  durable retries remain open in T57c.
- TypeScript passed, full build passed, and full test suite passed: 256 tests.
- Implementation commit: `38f9f9e`.

### 2026-08-22 — T57 Approved: Plugin Data Sync Safety and SyncIt Boundary

- SyncIt is recorded as the owner of whole-vault sync.
- Chat Lab remains responsible for plugin-aware sync and will not add whole-vault sync.
- Created T57 and subtasks T57a–T57d.
- Created `implementation-details/plugin-data-sync-and-syncit-boundary.md`.
- Kept the existing AI integration provider separate from the future data-sync provider contract.
- Beads issue creation was attempted but blocked because this checkout has no `.beads` database.
- No sync code was changed in the original planning pass; T57a is now the
  first implementation slice.

### 2026-08-22 — Remote Sync Documentation and Safety Boundary Review

- T42 now records the WebDAV baseline as merged while keeping the full sync scope open.
- T42a–T42e are implemented, but acceptance work remains for cache clearing, temporary-file cleanup, concurrent cache updates, and full dry-run coverage.
- T58c, T55, and T56 now distinguish chat-session encryption from the separate auxiliary-file path.
- Durable retry records and complete sync identity handling remain open in T57c.

---

### 2026-08-21 — T55: Component-Level Sync Selection ✅

**Commit:** `7e0821b`

Added fine-grained control over which data components participate in remote sync and export/import:

| Component | Default | Behavior |
|-----------|---------|----------|
| Chat sessions | ✅ | Bidirectional |
| Plugin settings | ✅ | Bidirectional |
| API keys | ❌ | Bidirectional (opt-in) |
| AI Memory | ✅ | Bidirectional |
| Memory audit log | ❌ | Bidirectional |
| AI Persona | ✅ | Bidirectional |
| Usage stats | ❌ | Upload-only |

**Changes:**
- `SyncComponentConfig` interface added to settings (7 toggles)
- New "Sync Components" settings section between Multi-User Sync and Remote Storage
- Export/import filters by component
- Remote sync respects toggles: `_serializePluginData()` conditionally includes, `_deserializePluginData()` only merges enabled, `_syncTextFile()` for individual files
- Usage stats computed fresh on upload, skipped on download
- API keys excluded by default; credential fields never overwritten from remote

**Files:** `src/settings.ts`, `src/settings-sections/syncComponents.ts` (new), `src/settings-sections/SettingsTab.ts`, `src/settings-sections/exportImport.ts`, `src/main.ts`

---

### 2026-08-21 — T56: Unify Plugin Data Management Layer — First Pass ✅

**Commit:** `45917c8`

Implemented the first pass on the three architectural improvements from the T55 post-delivery review:

1. **Rename "Multi-User Sync" → "Multi-User Chat Relay"**
   - `syncSettings.ts` section title and DOM ID updated
   - `SettingsTab.ts` nav label updated

2. **Unified PluginDataManager**
   - New `src/data/PluginDataManager.ts` — centralizes all serialization/deserialization
   - `createExportBundle()` / `createSyncBundle()` — unified filtering by syncComponents
   - `applyExportBundle()` / `applySyncBundle()` — unified merge with credential preservation
   - `validateImport()` — schema validation
   - 14 unit tests added

3. **Refactored callers**
   - `exportImport.ts`: Replaced ~80 lines of duplicated logic with PluginDataManager calls
   - `main.ts`: Replaced ~130 lines of inline serialize/deserialize with one-line delegations

**Result:** Shared settings serialization and merge logic for portability. File syncing and index handling still have separate paths. All 250 tests passing.

**Files:** `src/data/PluginDataManager.ts` (new), `src/data/__tests__/PluginDataManager.test.ts` (new), `src/settings-sections/syncSettings.ts`, `src/settings-sections/SettingsTab.ts`, `src/settings-sections/exportImport.ts`, `src/main.ts`

---

### 2026-08-21 — T51: Telemetry DISABLED — Obsidian Policy Block

**Status:** ⛔ **REMOVED from plugin** (was: ✅ COMPLETE)

**Finding:** Obsidian's developer policies explicitly prohibit client-side telemetry for official plugins. The "Kindle Highlights" plugin was delisted for this reason. Even opt-in, anonymized telemetry violates the policy.

**Action:** All telemetry code removed:
- `src/lib/telemetry.ts` — deleted
- `src/settings-sections/telemetry.ts` — deleted
- `src/main.ts` — removed first-run dialog, init, flush
- `src/settings.ts` — removed telemetry fields
- `src/components/ChatApp.tsx` — removed event logging
- `src/agent/AgentLoop.ts` — removed event logging

**Archive:** `memory-bank/implementation-details/telemetry-implementation-archived.md`

---

**Task:** T58 — Integrate Sync UI into Chat Lab
**Status:** ✅ COMPLETE — All 6 phases implemented and committed

**What was done:**
- Removed standalone `SyncSidebarView` and related sidebar registration
- Added `syncDirection` setting ("both" | "upload" | "download") to RemoteStorageConfig
- Export button → dropdown menu with "Export sessions…" and "Sync with remote…"
- `__sync__` special tab in ChatTabBar with "🔄 Sync" label
- `ChatSyncPanel` component with rich progress UI:
  - Direction selector, dry-run toggle, settings link
  - Status indicator (idle/syncing/success/error)
  - Progress bar with operation counters
  - Completion summary cards
  - Scrolling log area with color-coded operation icons
  - Sync/Cancel buttons
- Updated `triggerSync()` to accept direction override, onProgress/onLog callbacks
- CSS styles for sync panel

**Commits:**
- `dd4a989` — Phase 1: Remove 2nd sidebar
- `486cd1d` — Phase 2: Add syncDirection setting  
- `570be35` — Phase 3: Export dropdown + Sync tab
- `02e1ba2` — Phase 4: ChatSyncPanel with rich progress UI

**Files:** `memory-bank/tasks/T58.md`, `memory-bank/implementation-details/integrated-sync-ui-design.md`

---

### 2026-08-19 — T42 Phase 6: SyncIt Feature Port — Subtasks and Design Docs Created

**Phase 6 subtasks created (T42a–T42f):**

| Subtask | Feature | Priority | Status | Design Doc |
|---------|---------|----------|--------|------------|
| T42a | Sync Index — Skip Unchanged Sessions | P1 | 🔄 review open | `sync-index-design.md` |
| T42b | Atomic Writes | P1 | 🔄 review open | `atomic-writes-design.md` |
| T42c | Concurrency Control | P1 | 🔄 review open | `concurrency-control-design.md` |
| T42d | Server Signature / Cache Invalidation | P1 | 🔄 review open | `server-signature-design.md` |
| T42e | Dry Run Mode | P2 | 🔄 review open | `dry-run-design.md` |
| T42f | Progress UI Improvements | P2 | ⛔ SUPERSEDED by T58 |

**What each feature ports from SyncIt:**
- **T42a**: `SyncIndexManager` — persist `{checksum, ETag}` to skip unchanged sessions
- **T42b**: `AtomicWrite.ts` — temp file + MOVE for corruption-free uploads
- **T42c**: `runWithConcurrency()` — parallel uploads/downloads (default: 3 concurrent)
- **T42d**: `makeServerSignature()` — auto-invalidate cache on server config change
- **T42e**: `performDryRun()` — preview sync plan without transferring
- **T42f**: `SyncSidebarView` pattern — persistent sync status indicator

**Updated files:**
- `memory-bank/tasks/T42.md` — Added Phase 6 section with subtask table
- `memory-bank/activeContext.md` — Added T42 Phase 6 to current tasks
- `memory-bank/tasks/T42a.md` through `T42f.md` — Subtask definitions
- `memory-bank/implementation-details/*.md` — Six design docs

---

### 2026-08-17 — T42: Remote Chat Storage & Sync — ETag, Progress Modal, Logs, Cancel

- **ETag comparison**: Replaced timestamp-based sync with ETag comparison to eliminate false re-downloads caused by server/client clock skew. `StorageAdapter.putSession()` returns `{ etag?: string; modifiedAt?: number }`, `LocalCache.markSynced()` stores `_etag`, `SyncEngine.computeSyncPlan()` compares ETags with timestamp fallback.
- **Terminal-style progress modal**: Rewrote `SyncProgressModal` with progress bar, per-session log lines with titles, elapsed time counter, and status icons. Shows upload/download/conflict operations in a scrollable terminal-like view.
- **Sync log files**: Created `SyncLogger` class that writes every sync operation to both local file (`.obsidian/plugins/obsidian-ai/sync.log`) and remote (`obsidian-ai-sync/sync.log` via `StorageAdapter.writeText()`). Logs include timestamp, device ID, action, session ID/title, and result.
- **Cancel support**: Added `_cancelled` flag to `SyncEngine` with `cancel()` method. Checked between sessions (not mid-upload) to avoid half-written files. Modal cancel button calls `syncEngine.cancel()` and shows "Cancelling..." state.
- **Files modified**: `src/sync/StorageAdapter.ts`, `src/sync/LocalCache.ts`, `src/sync/SyncEngine.ts`, `src/sync/WebDAVStorageAdapter.ts`, `src/sync/SyncLogger.ts` (new), `src/modals/SyncProgressModal.ts`, `src/main.ts`
- **Commits**: `be3c3bb` → `29ad150` → `deff496`
- **Build**: TypeScript clean, production build passes

### 2026-08-16 — T45: PDF Text Extraction Tool (COMPLETE)

- Server-side: PyMuPDF + Flask extraction service on VPS port 8082, proxied through `/relay/pdf-extract/`
- Client-side: pdfjs-dist for offline extraction in Obsidian Electron
- Agent tool: `read_pdf` with URL/path support, max_pages parameter
- Settings UI: extraction method dropdown, server URL, max pages slider (0-200)
- MessageBubble: PDF attachment cards with Save to Vault / Open buttons
- Files: `src/utils/PdfExtractor.ts`, `src/agent/tools.ts`, `src/agent/ToolExecutor.ts`, `src/settings.ts`, `src/settings-sections/pdfExtraction.ts`, `src/components/MessageBubble.tsx`
- Verification: 236 tests, production build, diff check pass
- User confirmed working

### 2026-08-16 — T13a: Tool Call Context Persistence Bug Fix (COMPLETE)

- **Critical bug**: Tool call results were not passed as conversation context in multi-turn chats
- Root cause: `useMessageActions.ts` history builder only included text content, stripping `toolCalls` and `contentParts`
- Fix: `buildHistoryWithTools()` reconstructs Vercel AI SDK-compatible message shapes (assistant with tool-call parts + tool-result messages)
- Build passes, all 236 tests pass
- **User confirmed: "The tool context fix works!"**
- Commits: `88dff94`
- Task: `memory-bank/tasks/T13a.md`
- Updated doc: `memory-bank/implementation-details/agentic-tool-calling.md`

### 2026-08-14 — T19a: Group-Chat Attachment Full Replay

- Fixed attachment replay in group chat: attachments now included in all message bubbles
- Fixed inline image display in group chat
- Fixed sender avatar/icon display for user messages
- Files: `src/components/ChatMessages.tsx`, `src/components/MessageBubble.tsx`
- Tests: 188 passing

### 2026-08-14 — T20: Message Selection and Chat History Exports

- Added message selection mode (checkboxes on hover)
- Export selected messages to markdown file
- Export full session to markdown
- Files: `src/components/ChatMessages.tsx`, `src/components/MessageBubble.tsx`, `src/hooks/useMessageActions.ts`

### 2026-08-13 — T34: Settings Panel UI/UX Improvements

- Removed duplicate headings, styled usage bars, hover-reveal actions
- Added accent color CSS variable respecting Obsidian theme
- Files: `src/settings-sections/*.ts`, `styles.css`
- CI fix: removed double-zipping in manual build workflow

### 2026-08-12 — T41: Plugin Auto-Updater

- Stable/dev channel support
- Cache-busting for GitHub API
- Mobile diagnostics via `debug.log`
- Commits: `b582dfa`, `8ae8650`, `dc0f173`

### 2026-08-10 — T40: Multi-User Chat with LaTeX Support

- Real-time collaborative chat via WebSocket relay
- LaTeX rendering in group chat messages
- Agent participation in group chat
- Files: `src/components/ChatMessages.tsx`, `src/api/AgentApiManager.ts`

### 2026-08-07 — T34: Settings Panel UI/UX Improvements

- Clean hero section, usage bar charts, memory chips
- Hover-reveal profile actions, larger textareas
- Files: `src/settings-sections/*.ts`, `styles.css`

### 2026-08-07 — T26 Phase 2: Memory CRUD System + AI SDK 7.x Migration

- Migrated `@ai-sdk/google` 3.0.79 → 4.0.37, `ai` 6.0.174 → 7.0.56
- Fixed system message parameter for SDK 7.x
- MemoryStore with 5 tools: create_memory, update_memory, delete_memory, list_memories, search_memories
- Legacy migration from `memory.md` → `memory.json`
- Audit log: append-only `memory-audit.jsonl`
- Settings UI for memory stats, export, audit log viewer
- 26 new unit tests (184 total)
- Commits: `4988b31` → `3045603` (8 commits)

### 2026-08-06 — T21 AI Web Worker Refactor + T20 Post-Game Analysis

- **Web Worker for AI search** (28KB chunk) to keep main thread responsive
- **CRITICAL FIX**: Removed `timeLimitMs` from game-move search — time limits on depth-based search break AI quality
- Stockfish-based analysis modal with eval graph, blunder detection, accuracy
- Fixed 0% accuracy bug (sparse sampling → evaluate all positions)
- Auto-save completed games on game over

### 2026-08-05 — T64: CPPP Transparency Portal

- Pivoted from MCA corporate scraping (blocked by Akamai) to Sarthak Sidhant's scraped CPPP dataset
- 4.9M award records + 3.9M tender notices
- Cloud-hosted on Turso (9GB free)
- 5-phase plan: upload → portal → anomaly dashboard → network analysis → CJP integration

### 2026-08-04 — T61: Constituency Map Enhancement (CJP Website)

- Phase 2 complete: Party-colored rendering with 2024 results
- Interactive legend with click-to-filter
- Center-India button
- Full state persistence (zoom/layers/filters/tab)

### 2026-08-03 — T33: Analytics Dashboard

- GoAccess reports (daily cron at 06:00 UTC)
- AWStats with Cloudflare IP restoration
- Lightweight privacy-respecting tracker (pixel + JS)
- Password-protected at `/stats/` (auth: deepak / Qog275X!)
- fail2ban Apache jails restored

### 2026-08-02 — T33.4: Analytics Dashboard

- Security hardening: disabled `code.quantumofgravity.com`
- Security documentation created

### 2026-08-01 — Filestash Fork

- Rebuilt from source (Go 1.23.7)
- Runs as native binary via systemd
- Local backend for `/home/quantumofgravity/public_html/`
- Admin password: `QuantumFile2026!`

### 2026-07-31 — Website Fixes

- Fixed hamburger menu (null check in animateParticles)
- Fixed light mode section colors
- Fixed hero stats grid width
- Fixed chess: stale closure bug, board square alignment, rank/file labels
- Created repo-sync.sh for batch git sync

### 2026-07-30 — String Motion Simulator

- Interactive web app for classical and relativistic string dynamics
- Classical wave equation solver complete
- Live at `quantumofgravity.com/projects/strings-sim/`

### 2026-07-29 — Flatnotes Web Notes

- Browser-based markdown note editor
- Deployed at `https://quantumofgravity.com/notes/`
- LaTeX math support via KaTeX
- ~55 MB RAM, mobile-responsive

### 2026-07-27 — Astro Learn

- 3D celestial learning app
- T1 (heliocentric/geocentric) ✅, T2 (seasonal frame) ✅, T3 (observer sky) ✅
- Built with React Three Fiber, Astronomy Engine v2.1.19

### 2026-07-25 — Ludo 3D

- Board grid aligned, clockwise direction, flicker eliminated
- Piece smooth movement, dynamic dice position
- Player setup screen with per-player Human/AI/None toggle
- Sound effects via Web Audio API
- State persistence with localStorage

### 2026-07-20 — Cron Management Skill

- Created `cron-management` skill in openclaw-tools repo
- Provides `cronctl` CLI for listing, pausing, resuming, health-checking cron jobs
- Includes maintenance mode flag (`/tmp/cron-paused`)

### 2026-07-17 — Chess2 T13: Code Quality + Countdown Timer Fix

- Hooks extraction (`useChessGame`, `useBoardSelection`)
- Engine input validation (`isValidSquare`)
- Review-status bug fix
- Countdown timer winner bug fix (Black timer running out → Black wins)
- 4 regression tests added

### 2026-07-15 — Chess2 T12: Mobile Review Enhancements

- Horizontal move timeline below mobile "Play from here" button
- Chess icons instead of piece letters (♙e4, ♘f3)
- Committed and deployed: `cb55c8c`

### 2026-07-15 — Chess2 T13: Code Quality Audit

- Full review of chess2 module
- Scores: Modularity B+, Immutability A, Testability A-, State Management B, Error Handling C+, Type Safety B+, Consistency B
- Key risks documented

### 2026-07-14 — Projects/ Migration

- `space-cadet.github.io/projects/` → `quantumofgravity.com/projects/`
- Timesarrow + QHE-BHE live
- GitHub Action deploy FIXED

### 2026-07-13 — OpenClaw Upgrade Failure

- `npm install -g openclaw@latest` triggered Kimi guardrail, wiped node_modules
- Fixed with `--ignore-scripts`
- Cloudy offline for 6 days

### 2026-07-10 — T74: Cron Job Token Optimization

- Bash pre-processor pattern: bash does fetching, AI only does reasoning
- beads-executor empty runs: ~18.8K → ~4.1K tokens (~78% reduction)
- Applied `lightContext: true` + restricted `toolsAllow`

### 2026-07-07 — Token Usage Skill v1.0.2

- Added `--by-cron` flag for per-job token breakdown
- Fixed `estimate_cost` function nested inside `to_cron_json()`
- ClawHub CLI bug: `skill publish` fails on update

### 2026-07-04 — Chess2 Bug Fix Session

- SPA routing (`hasExtension` check)
- Renderer init clash (skip `super.init()`)
- Infinite recursion in check detection
- Color-agnostic play (human as Black, board flip)
- Live timers (500ms React re-render)
- Notification deduplication
- Cloudy move preservation
- Castling bug (`undefined piece` in `addKingMoves`)

### 2026-07-02 — Blog Styling Fix

- Server-side CSS override for `/blog/`
- All 49+ HTML files cache-busted
- Source committed to `space-cadet/blog` repo
- OOM on server render — must render locally

### 2026-07-02 — Blog Styling DISASTER

- CRITICAL FAILURES documented
- `_quarto.yml` had `css: []` instead of `css: styles.css`
- Never auto-commit, stop means stop

### 2026-07-01 — Game Center: Chess2 T9 Modular Rewrite

- 1108-line `game.js` split into 6 modules
- Color-agnostic design with `humanPlayer` property

### 2026-06-29 — Game Center: React Migration

- Vite + React Router + Canvas 2D
- Full chess rules, AI, correspondence mode
- Push notifications, state persistence, dual timers, chat

### 2026-06-27 — PEOPLE.md Created

- Relationship models for people encountered
- Entries: Deepak, Sage, fern_soulgarden, sisyphuslostinloop

### 2026-06-27 — Playwright Screenshot Verification

- Caught 4 bugs that passed code review + syntax checks
- Deepak's phrase: "Aankhon dekhi"

### 2026-06-26 — mb-hygiene Phase 4 Complete

- 10 projects converted to DB-native workflow
- Total: 124 tasks, 75 edits, 50 sessions parsed

### 2026-06-25 — cjp-website Migrated to DB-native

- Copied corrected mb-hygiene memory bank
- All 30 tasks preserved

### 2026-06-24 — Cron Notification Frequency

- Individual check jobs: silent on success
- One daily overview at 9 AM IST

### 2026-06-23 — Cron Model Migration

- ALL jobs switched from k2.6/k2p6 → k2.7/k2.7-code
- Fixed isolated agent timeout pattern

### 2026-06-22 — Memory Bank Protocol v6.12

- 4-tier system: bootstrap → critical → essential → reference
- `techContext.md` = stack overview ONLY
- Feature algorithms in `implementation-details/<feature>.md`

### 2026-06-21 — Bootstrap Context Compaction

- T65 (MEMORY.md) ✅, T66 (HEARTBEAT.md) ✅, T68 (Crash Recovery) ✅
- Heartbeat config: `lightContext: true`

### 2026-06-20 — Self-Improvement Dual System

- `.learnings/` (markdown) + `.mulch/` (structured JSONL)
- On-demand mulch protocol
- Nightly cron cross-references both

### 2026-06-19 — Token Usage Skill

- Published to ClawHub
- Tracks token usage across sessions

### 2026-06-18 — Graph Memory T63

- Knowledge graph implementation complete
- Query bridge: `code/graph-memory/scripts/query-bridge.cjs`

### 2026-06-17 — Game Center: Ludo T4

- Full 2-4 player local mode
- AI spectator, animations, sound effects
- 23 tests passing

### 2026-06-16 — Game Center: Chess2 T3/T8

- Single-player feature-complete
- Modular engine, full rules, AI opponent
- Dual timers, pause/resume/resign/draw

### 2026-06-15 — Data Hub: T10 (GeoJSON), T11 (Census), T12 (JP Cleanup)

- GeoJSON boundaries loaded
- Census data integration

### 2026-06-14 — Bot2Bot: T2 (Telegram), T3 (Timestamp)

- Cloudy ↔ Sage bot-to-bot protocol
- Git-based message passing

### 2026-06-13 — Quantum Dungeon: T26 (Co-op)

- Stair/AI fixes done

### 2026-06-12 — Blog: Cron Schedule

- Mon/Wed/Fri 9 PM IST
- Max 4 posts/week

### 2026-06-11 — Cron-digests

- T20 (server migration) ✅
- T21 (calendar redesign + modularization + history nav) ✅
- T22 (fix Moltbook empty entries) pending

### 2026-06-10 — CJP Website: T61 (Constituency)

- Constituency map page
- 2024 election results

### 2026-06-09 — CJP Website: T44 (Learning Maps)

- Interactive learning maps

### 2026-06-08 — CJP Website: T53/T59 (Data Viz)

- Data visualization components

### 2026-06-07 — CJP Website: T64 (CPPP Procurement Transparency Portal)

- Pivoted from MCA to CPPP dataset
- 4.9M award records

### 2026-06-06 — Econ-Sim

- Networked intertemporal optimization simulator
- Interactive Ramsey planner on graphs
- Live at `quantumofgravity.com/projects/econ-sim/`

### 2026-06-05 — Self-Improvement Week-1 Review

- T73 finalized
- Keep both `.learnings/` and `.mulch/`
- On-demand approach validated

### 2026-06-04 — Graph Memory T63 → COMPLETE

- Already implemented and running
- Task status updated

### 2026-06-03 — Token-Usage T72 → COMPLETE

- Skill published and working
- Task status updated

### 2026-06-02 — Cron Management System

- `cronctl.sh` script
- Persistent logging to `logs/cronctl.log`

### 2026-06-01 — Message Pump Health Check cron DISABLED

- Was burning ~8M tokens/day
- Can re-enable with `cronctl resume`

---

## Active Priorities

1. **Econ-Sim** — T1-T6 ✅ complete
2. **String Motion Simulator** — T1-T4, T7, T8 ✅; T5, T6 pending
3. **obsidian-ai (Chat Lab)** — T42 WebDAV baseline merged; sync safety review remains open
4. **Game Center** — Chess2 single-player ✅, Ludo T4 ✅
5. **cloudy-blog** — 4 posts live
6. **Cron-digests** — T20 ✅, T21 ✅, T22 pending
7. **CJP Website** — T61, T64 in progress
8. **Data Hub** — T10, T11, T12
9. **Bot2Bot** — T2, T3
10. **Graph Memory** — T3, T63
11. **Quantum Dungeon** — T26

## Completed Tasks Summary

- **T1-T5, T7-T9, T10-T13, T15-T23, T25-T26, T29, T33-T34, T40-T41, T43, T45, T49, T51(removed), T61, T64**

## Blocked / Pending

- **T48**: Conversation Compaction Mechanism
- **T50**: OpenAI Responses API / Threads Support
- **T46**: Core Orchestration Decomposition

## Notes

- All timestamps in IST (+05:30)
- Node modules auto-delete on session end
- Timestamps: ALL in IST
- Blog: push to space-cadet/website triggers auto-deploy
# 2026-08-23 — T48 context-efficiency plan

- Diagnosed the gap between visible message estimates and provider billing:
  repeated history, large tool results, attachments, and system/tool payloads
  are not adequately represented by a fixed message count.
- Decomposed T48 into T48a-T48d: token budgeting, tool-result replay limits,
  rolling summaries, and usage display.
- No source code changed; implementation remains pending.

---
