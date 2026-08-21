# Active Context

*Last Updated: 2026-08-21 11:20 IST*

### 2026-08-21 — T43 Subtasks Complete

All three T43 subtasks completed:

| Subtask | Issue | Status |
|---------|-------|--------|
| **T43a** | Fix rebuildSyncIndex title resolution | ✅ Complete |
| **T43b** | Add activity indicators to sync UI | ✅ Complete |
| **T43c** | Extend sync to all plugin data | ✅ Complete |

**T43a:** Applied `titleMap` pattern from `triggerSync()` to `rebuildSyncIndex()` — eliminates "Untitled Session" by resolving titles from local cache, sync cache, then truncated ID.

**T43b:** Added CSS animations for visual feedback during sync:
- Rotating spinner in status heading (pure CSS, low CPU)
- Pulsing progress bar during active sync
- Shimmer animation on pending list items

**T43c:** Extended sync beyond chat sessions to plugin data:
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

**Task:** T43 — Integrate Sync UI into Chat Lab
- Replaced standalone `SyncSidebarView` with integrated sync tab inside Chat Lab
- Export button becomes dropdown with Export + Sync options
- Sync opens as non-session tab (`__sync__`) with rich progress UI
- Direction control: Two-way / Upload only / Download only
- T42f superseded by T43

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
| **T42a** | Sync Index — Skip Unchanged Sessions | P1 | ✅ |
| **T42b** | Atomic Writes | P1 | ✅ |
| **T42c** | Concurrency Control | P1 | ✅ |
| **T42d** | Server Signature / Cache Invalidation | P1 | ✅ |
| **T42e** | Dry Run Mode | P2 | ✅ |
| **T42f** | Progress UI Improvements | P2 | ⛔ SUPERSEDED by T43 |

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
