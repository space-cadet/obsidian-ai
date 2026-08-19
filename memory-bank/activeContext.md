# Active Context

*Last Updated: 2026-08-19 19:44 IST*

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
| **T42a** | Sync Index — Skip Unchanged Sessions | P1 | 🔄 |
| **T42b** | Atomic Writes | P1 | 🔄 |
| **T42c** | Concurrency Control | P1 | 🔄 |
| **T42d** | Server Signature / Cache Invalidation | P1 | 🔄 |
| **T42e** | Dry Run Mode | P2 | 🔄 |
| **T42f** | Progress UI Improvements | P2 | 🔄 |

**Design docs created:**
- `memory-bank/implementation-details/sync-index-design.md`
- `memory-bank/implementation-details/atomic-writes-design.md`
- `memory-bank/implementation-details/concurrency-control-design.md`
- `memory-bank/implementation-details/server-signature-design.md`
- `memory-bank/implementation-details/dry-run-design.md`
- `memory-bank/implementation-details/progress-ui-design.md`

**Rationale:** After comparing obsidian-ai's sync with SyncIt's proven implementation, six mechanical improvements were identified that make obsidian-ai's sync faster (index skip, concurrency), safer (atomic writes, server signature), and more user-friendly (dry run, progress UI) without changing the core architecture.

---

# Active Context

*Last Updated: 2026-08-19 13:31:15 IST*

### 2026-08-19 — DeepSeek V4 Pricing Investigation + New Task Batch (T6a, T48, T49, T50, T51)

- **Context**: User noticed DeepSeek V4 pricing was higher than expected. Investigation revealed
  the plugin's token counter significantly undercounts actual API usage — showing only the
  current user message tokens (~8K) while the full request payload includes system prompt +
  10 turns of history (~850K tokens, 842K cached).
- **Root cause**: `estimateTokens()` in `tokenEstimator.ts` only counts `text.length / 4` for
  the user message text. It ignores system prompt, conversation history, and tool call context.
- **DeepSeek Responses API**: Confirmed stateless (`previous_response_id` not supported per
  official compatibility docs). Cache hit pricing is cheap ($0.007/M) but the UI lies about
  actual usage.

**New tasks created:**

| Task | Title | Priority | Status |
|------|-------|----------|--------|
| **T6a** | Token Counter Accuracy Fix — Full Request Payload Counting | HIGH | 🔄 Active |
| **T48** | Conversation Compaction Mechanism | HIGH | 🔄 Active |
| **T49** | Settings Export and Import | MEDIUM | 🔄 Active |
| **T50** | OpenAI Responses API / Threads Support (Stateful Sessions) | MEDIUM | 🔄 Active |
| **T51** | Opt-in Telemetry and Usage Data Collection | MEDIUM | 🔄 Active |

- **T6a**: 20-line fix. Show full payload tokens (system + history + message) instead of
  message-only count. Settings toggle for backward compatibility.
- **T48**: Auto-summarize old conversation turns after N turns to reduce per-request payload.
  Estimated ~80% token savings on long conversations. Provider-agnostic (works with DeepSeek).
- **T49**: JSON export/import for plugin settings. API keys redacted by default. Schema versioning.
- **T50**: OpenAI stateful sessions via Responses API. Deprioritized for DeepSeek users (their
  Responses API is stateless). Only benefits OpenAI power users.
- **T51**: Opt-in anonymized telemetry. Strictly disabled by default. Full disclosure. Collects
  provider type, feature usage, error rates — never message content or API keys.

**Implementation docs created/updated:**
- Updated `context-system-design.md` (T6a) — token counting behavior section
- Created `conversation-compaction-design.md` (T48)
- Created `settings-export-schema.md` (T49)
- Updated `openresponses-implementation.md` (T50) — provider compatibility matrix
- Created `telemetry-privacy-design.md` (T51)

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
