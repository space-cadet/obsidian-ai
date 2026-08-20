### 2026-08-20 — T43: Integrated Sync UI — Task and Design Doc Created

**Task created:** `memory-bank/tasks/T43.md`
**Design doc created:** `memory-bank/implementation-details/integrated-sync-ui-design.md`

**Scope:** Replace standalone sync sidebar with integrated sync tab in Chat Lab
- Remove `SYNC_SIDEBAR_VIEW_TYPE` (separate sidebar)
- Export button → dropdown with Export + Sync options
- Sync opens as `__sync__` tab in ChatTabBar
- Rich progress UI: direction selector, dry run, per-session logs, completion cards
- Settings: `syncDirection` default ("both" | "upload" | "download")

**6 Implementation Phases:**
1. Remove 2nd sidebar (SyncSidebarView, ribbon icon, commands)
2. Add `syncDirection` setting
3. Export dropdown + sync tab in ChatTabBar
4. ChatSyncPanel with rich progress UI
5. SyncEngine direction parameter
6. Integration & testing

**T42f superseded by T43.**

---

### 2026-08-19 — T42 Phase 6: SyncIt Feature Port — Subtasks and Design Docs Created

**Phase 6 subtasks created (T42a–T42f):**

| Subtask | Feature | Priority | Status | Design Doc |
|---------|---------|----------|--------|------------|
| T42a | Sync Index — Skip Unchanged Sessions | P1 | 🔄 | `sync-index-design.md` |
| T42b | Atomic Writes | P1 | 🔄 | `atomic-writes-design.md` |
| T42c | Concurrency Control | P1 | 🔄 | `concurrency-control-design.md` |
| T42d | Server Signature / Cache Invalidation | P1 | 🔄 | `server-signature-design.md` |
| T42e | Dry Run Mode | P2 | 🔄 | `dry-run-design.md` |
| T42f | Progress UI Improvements | P2 | 🔄 | `progress-ui-design.md` |

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
