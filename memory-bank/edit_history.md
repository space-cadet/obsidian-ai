# Edit History
*Created: 2026-05-02 08:00:01 IST*
*Last Updated: 2026-05-15 06:45 IST*

*Newest entries first. Canonical chunks stored in `edits/YYYY-MM-DD/`.*

---

### 2026-05-15

#### 06:45:00 IST — T14: Tailscale progress, ufw blocker identified
- **No code commit** — infrastructure/networking session
- Updated `memory-bank/activeContext.md` — T14a 2/3 complete, ufw IPv4 blocker identified
- Updated `memory-bank/tasks/T14.md` — Phase 3 "in progress" (was "blocked on T14a")
- **Tailscale installed**: MacBook Air (`100.92.54.38`) + DO VPS (`100.89.228.41`) both authenticated
- **Obsidian configured**: Agent (OpenResponses) provider selected, endpoint `http://100.89.228.41:18789/v1/responses`
- **Blocker**: VPS ufw firewall only has IPv6 rules for `tailscale0`. Need `ufw allow in on tailscale0` for IPv4.
- **Verification pending**: ufw fix → ping test → curl test → Obsidian test connection

---

### 2026-05-14

#### 09:19:00–09:51:00 IST — T13: Vault management tools, AgentLoop extraction, PendingToolCard, tool result formatting
- **Commit 1 (e0869b1)**: Added 4 vault management tools — `create_folder`, `move_note`, `delete_note`, `list_folders`
  - Modified `src/agent/tools.ts` — 4 new Zod tool schemas with descriptions
  - Modified `src/agent/ToolExecutor.ts` — `createFolder()`, `moveNote()` (auto-creates parents), `deleteNote()` (system trash), `listFolders()` (tree from loaded files)
  - Modified `src/agent/types.ts` — added `oldPath`, `folders`, `parent` to `ToolResult`
  - Modified `src/components/ChatApp.tsx` — pending tool preview cases for new tools; system prompt lists all 13 tools
- **Commit 2 (e2d727d)**: Extracted inline tool loop → `src/agent/AgentLoop.ts`
  - Created `src/agent/AgentLoop.ts` — `AgentLoop` class with `run()` method; callback interface (`onTextDelta`, `onToolCall`, `requestApproval`); AbortSignal propagation; step logging
  - Modified `src/components/ChatApp.tsx` — replaced ~70 line inline loop with `new AgentLoop({...}).run()`
- **Commit 3 (dcee512)**: Created `PendingToolCard.tsx` component
  - Created `src/components/PendingToolCard.tsx` — all 13 tool preview summaries in dedicated component (line count, preview excerpt, patch rows)
  - Modified `src/components/ChatApp.tsx` — removed inline `PendingToolCallPreview`; renders `<PendingToolCard />`
- **Commit 4 (c2307b6)**: Tool result formatting as markdown
  - Modified `src/agent/AgentLoop.ts` — added `formatToolResult()` function
    - `search_notes`/`list_notes` → markdown tables with `[[wiki-links]]`
    - `list_folders` → bulleted list
    - `get_note_metadata` → formatted summary (size, dates, word count)
    - `read_note` → clean content; edit/create/move/delete → simple success text
    - Passed as `type: "text"` to LLM instead of raw `type: "json"` blobs
- Updated `memory-bank/tasks/T13.md` — marked all Phase 1/2/3 items complete
- Updated `memory-bank/tasks.md` — T13 moved to ✅ COMPLETED (10 completed, 3 active)
- Updated `memory-bank/activeContext.md` — T13 status updated; next actions listed
- Updated `memory-bank/session_cache.md` — full session context with all 4 commits
- Created `memory-bank/edits/2026-05-14/091900-t13-complete.md` — canonical edit chunk
- All 4 commits: `tsc -noEmit -skipLibCheck && esbuild` — clean builds

---
- Modified `src/components/ActionBar.tsx` — Added `autoApprove` and `onToggleAutoApprove` props; inserted toggle button between Load and Settings buttons with visual active/inactive states
- Modified `src/components/ChatApp.tsx` — Added `handleToggleAutoApprove()` callback that flips `plugin.settings.autoApply`, saves settings, and shows a Notice; wired props to ActionBar
- Modified `src/views/ObsidianAIChatView.ts` — Added `saveSettings(): Promise<void>` to `ChatPluginLike` interface so ChatApp can persist the toggle
- Modified `styles.css` — Added `.chat-auto-approve-btn` transition and `.chat-auto-approve-btn.is-active` accent styling
- Created `memory-bank/edits/2026-05-14/075241-auto-approve-toggle.md` — canonical edit chunk

---

### 2026-05-12

#### 13:47:10 IST - T9/META-1: Document GPT 5.4 Medium Settings rewrite, regression context, and memory sync

- Updated `memory-bank/tasks/T9.md` — Added Regression Context section documenting lost re-entrancy guards, infinite re-entrant loops, memory leaks, and GPT 5.4 Medium rewrite credit
- Updated `memory-bank/implementation-details/settings-provider-design.md` — Added 2026-05-12 Regression and Rewrite section with symptom description, GPT 5.4 Medium credit, and guard mechanism code block
- Updated `memory-bank/sessions/2026-05-12.md` — Added GPT 5.4 Medium credit to focus task and work completed; documented Settings panel regression (lost guards → infinite loops + memory leaks)
- Updated `memory-bank/edits/2026-05-12/111359-t11-t2-t9-memory-sync.md` — Added GPT 5.4 Medium Session Context section explaining the regression and rewrite
- Updated `memory-bank/activeContext.md` — Updated Last Updated timestamp
- Updated `memory-bank/session_cache.md` — Updated Last Updated timestamp
- Updated `memory-bank/tasks.md` — Updated Last Updated timestamp
- Created `memory-bank/edits/2026-05-12/134710-t9-gpt54-memory-sync.md` — Canonical edit chunk following template format

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

---

### 2026-05-09

#### 11:51:05 IST - T11/T13: File debug logger, ErrorBoundary, crash debugging, new agent tools

- Created `src/logger.ts` — `FileLogger` class writing console output to `.obsidian/plugins/obsidian-ai/debug.log`; intercepts `window.onerror` and `window.onunhandledrejection`; logs memory metrics every 10s; exposes `window.__obsidianAiLogger`
- Created `src/components/ErrorBoundary.tsx` — `ChatErrorBoundary` catches render errors, logs to disk, shows fallback UI
- Modified `src/main.ts` — Logger initialized first in `onload()`; added `clear-debug-log` command; cleanup in `onunload()`
- Modified `src/views/ObsidianAIChatView.ts` — Wraps `ChatApp` in `<ChatErrorBoundary>`
- Modified `src/components/MessageBubble.tsx` — 5-step defensive logging around `MarkdownRenderer.render`
- Modified `src/components/ChatMessages.tsx` — `StreamingBubble` 5-step logging; `unmounted` cleanup flag; `scrollIntoView({ behavior: "auto" })`
- Modified `src/agent/ToolExecutor.ts` — Implemented `patchNote()` and `editSection()` tools
- Modified `src/agent/tools.ts` — Added `patch_note` and `edit_section` Zod schemas
- Modified `src/modules/WidgetExtension.ts` — Debug logging in `destroy()` and `acceptAction()`
- Modified `src/modules/diffExtension.ts` — Debug logging in `dispatchAIChanges()` and `applyDiffPlugin`
- Modified `src/noteEditing/NoteEditingBridge.ts` — try/catch wrappers and detailed logging in `applyToNote()` and `applyToTargetNote()`
- Updated `memory-bank/tasks/T13.md` — `patch_note`, `edit_section`, crash debugging progress
- Updated `memory-bank/tasks/T11.md` — Status ⏸️ → 🔄 IN PROGRESS; logger, ErrorBoundary, diagnostics progress
- Updated `memory-bank/tasks.md` — T11 status updated
- Updated `memory-bank/activeContext.md` — T11 active, T13 crash debugging
- Updated `memory-bank/progress.md` — T11 and T13 sections updated
- Updated `memory-bank/changelog.md` — 2026-05-09 entries added
- Updated `memory-bank/session_cache.md` — Latest session registered
- Created `memory-bank/sessions/2026-05-09.md` — Session 2 crash debugging and new tools
- Created `memory-bank/edits/2026-05-09/logger-errorboundary-new-tools.md` — canonical edit chunk

---

### 2026-05-08

#### 01:55:58 IST - T13: Basename resolution fix, diagnostics panel, tool description polish

- Modified `src/agent/ToolExecutor.ts` — Added `resolveNote()` private helper with three-tier resolution (exact → append `.md` → `metadataCache.getFirstLinkpathDest()`)
- Modified `src/agent/tools.ts` — Updated tool descriptions to human-friendly basename examples (`"Project Notes"`)
- Modified `src/components/ChatApp.tsx` — Removed raw `[tool_name: ok/error]` status tag injection from visible messages
- Modified `src/settings.ts` — Added `displayDiagnostics()` with 6-metric grid, Refresh, DevTools, Clear History
- Fixed `src/settings.ts` — Added missing `this.displayDiagnostics(containerEl)` call in `display()`
- Rebuilt `main.js` — Verified compiled output
- Updated `memory-bank/tasks/T13.md` — progress updated with basename fix and diagnostics
- Updated `memory-bank/tasks/T11.md` — status changed to 🔄 IN PROGRESS
- Updated `memory-bank/activeContext.md` — T13 progress updated
- Updated `memory-bank/progress.md` — T13 and T11 sections updated
- Created `memory-bank/sessions/2026-05-08.md` — Session 1 basename fix and diagnostics
- Created `memory-bank/edits/2026-05-08/t13-basename-fix-and-diagnostics.md` — canonical edit chunk

---

### 2026-05-07

#### 06:57:28 UTC - T14: Memory bank update for remote agent connectivity task
- Created `memory-bank/tasks/T14.md` — full design doc with architecture and completion criteria
- Updated `memory-bank/tasks.md` — added T14 to registry, updated active task counts
- Updated `memory-bank/activeContext.md` — T14 set as primary focus
- Created `memory-bank/sessions/2026-05-07-morning.md` — session log for T14 design work
- Updated `memory-bank/session_cache.md` — updated focus task, session history, task registry
- Updated `memory-bank/progress.md` — added T14 section, updated timestamps
- Modified `memory-bank/tasks/T13.md` — updated status to reflect current progress
- Created `memory-bank/edits/2026-05-07/065728-t14-mb-update.md` — canonical edit chunk

---

### 2026-05-06

#### 09:30:00 IST - T13: Agentic tool calling MVP foundation and settings wiring
- Created `src/agent/types.ts` — `StreamEvent` union, `ToolCall`, `ToolResult` interfaces
- Created `src/agent/tools.ts` — 4 Zod tool schemas (`read_note`, `edit_note`, `append_to_note`, `create_note`)
- Created `src/agent/ToolExecutor.ts` — `ToolExecutor` class with vault operations
- Modified `src/api.ts` — added `streamChatWithTools()` generator
- Modified `src/components/ChatApp.tsx` — integrated tool loop, `pendingToolCall` state, approve/reject handlers
- Modified `src/settings.ts` — added `enableAgentTools`, `autoApply`, `maxAgentSteps` settings
- Modified `styles.css` — pending tool call approval card styles
- Updated `memory-bank/tasks/T13.md` — marked settings completion criteria as done; added progress entries
- Updated `memory-bank/tasks.md` — T13 status changed from ⬜ to 🔄 IN PROGRESS
- Updated `memory-bank/session_cache.md` — focus task shifted to T13
- Updated `memory-bank/activeContext.md` — current focus and implementation focus updated to T13
- Created `memory-bank/sessions/2026-05-06.md` — session file documenting MVP build
- Created `memory-bank/edits/2026-05-06/T13-settings-and-mvp.md` — canonical edit chunk

---

### 2026-05-04

#### 22:46:16 IST - T6/T10: Token estimator and model discovery cache completion
- Modified `src/components/ChatApp.tsx` — token estimation display wired into send flow
- Modified `src/api.ts` — model list caching with `fetchedAt` timestamp
- Modified `src/settings.ts` — model fetch/search UI restored after provider profile refactor
- Updated `memory-bank/tasks/T6.md` — completion criteria marked done
- Updated `memory-bank/tasks/T10.md` — completion criteria marked done
- Updated `memory-bank/tasks.md` — T6 and T10 marked ✅ COMPLETED
- Updated `memory-bank/session_cache.md` — task registry updated
- Updated `memory-bank/progress.md` — T6 and T10 sections added
- Created `memory-bank/edits/2026-05-04/224616-T6-T10-completion.md` — canonical edit chunk

#### 18:11:57 IST - T2/T3/T5: Session history, context system, and note editing completion
- Modified `src/components/ChatApp.tsx` — session-based chat history with persistence
- Created `src/components/ContextPicker.tsx` — mention-based context selection with tabs
- Modified `src/noteEditing/NoteEditingBridge.ts` — apply, append, create, target note operations
- Modified `src/settings.ts` — custom commands section with add/delete
- Updated `memory-bank/tasks/T2.md` — marked COMPLETED
- Updated `memory-bank/tasks/T3.md` — marked COMPLETED
- Updated `memory-bank/tasks/T5.md` — marked COMPLETED
- Updated `memory-bank/tasks.md` — T2, T3, T5 moved to completed table
- Updated `memory-bank/session_cache.md` — registry and history updated
- Updated `memory-bank/progress.md` — T2, T3, T5 sections completed
- Created `memory-bank/edits/2026-05-04/181157-T2-T3-T5-completion.md` — canonical edit chunk

#### 14:59:36 IST - T3/T5: Context system implementation and note editing improvements
- Modified `src/components/ChatApp.tsx` — context items XML block in system prompt; mention parsing with `@`
- Created `src/components/ContextPicker.tsx` — modal for selecting notes, folders, tags as context
- Modified `src/noteEditing/NoteEditingBridge.ts` — `applyToTargetNote()` for editing non-active notes
- Modified `src/settings.ts` — `customCommands` array with add/delete UI
- Updated `memory-bank/tasks/T3.md` — progress updated
- Updated `memory-bank/tasks/T5.md` — progress updated
- Created `memory-bank/edits/2026-05-04/145936-t3-t5-mem-update.md` — canonical edit chunk

---

### 2026-05-03

#### 02:47:31 IST - T3: Context system implementation
- Modified `src/components/ChatApp.tsx` — context items resolved into XML block prepended to system prompt
- Created `src/components/ContextPicker.tsx` — modal for selecting context items (notes, folders, tags)
- Modified `src/settings.ts` — `includeActiveNote` setting toggle
- Updated `memory-bank/tasks/T3.md` — design decisions and progress documented
- Updated `memory-bank/session_cache.md` — T3 progress updated
- Created `memory-bank/edits/2026-05-03/024731-T3-context-system-impl.md` — canonical edit chunk

#### 00:52:00 IST - T2: Session history implementation
- Modified `src/components/ChatApp.tsx` — `loadChatData()` / `saveChatData()` integration; `New Chat` and `Load` buttons
- Modified `src/main.ts` — `loadChatData()` / `saveChatData()` with `this.saveData()` / `this.loadData()`
- Created `src/components/SessionPicker.tsx` — modal listing saved sessions with rename/delete
- Updated `memory-bank/tasks/T2.md` — completion criteria updated
- Updated `memory-bank/session_cache.md` — T2 progress updated
- Created `memory-bank/edits/2026-05-03/005200-T2-session-history-impl.md` — canonical edit chunk

#### 00:18:43 IST - T2: Session history design
- Created `src/types.ts` — `StoredChatData`, `ChatSession`, `ChatMessage` interfaces
- Modified `src/main.ts` — `loadChatData()` and `saveChatData()` stubs
- Updated `memory-bank/tasks/T2.md` — design decisions and file map added
- Created `memory-bank/edits/2026-05-03/001843-T2-session-history-design.md` — canonical edit chunk

---

### 2026-05-02

#### 23:56:30 IST - T5/T2: Note targeting fix and persistence hardening
- Fixed `src/noteEditing/NoteEditingBridge.ts` — `getEditorForNote()` now uses `app.workspace.getMostRecentLeaf()` for active note fallback instead of `getLastViewState()`
- Modified `src/noteEditing/NoteEditingBridge.ts` — `applyToTargetNote()` uses `app.workspace.openLinkText()` then `app.workspace.getActiveFile()` for robust targeting
- Modified `src/components/ChatApp.tsx` — stale closure fix in `handleApproveTool` and `handleRejectTool` (cached `resolveToolRef` pattern)
- Modified `src/main.ts` — `saveChatData()` now checks `data.activeSessionId` before saving to prevent empty overwrites
- Updated `memory-bank/tasks/T5.md` — note targeting fix documented
- Updated `memory-bank/tasks/T2.md` — persistence guard documented
- Updated `memory-bank/session_cache.md` — progress and history updated
- Created `memory-bank/edits/2026-05-02/235630-T5-T2-note-targeting-persistence.md` — canonical edit chunk

#### 23:21:14 IST - T4/T5/T3: Streaming fixes and note editing buttons
- Fixed `src/api.ts` — `streamChat()` generator now yields `finish` event so UI stops spinner
- Modified `src/components/MessageBubble.tsx` — added targeted action buttons (Apply, Append, Create, Retry) with conditional rendering
- Modified `src/components/ChatApp.tsx` — retry handler wired to `MessageBubble`; `createNote()` / `appendToNote()` handlers added
- Modified `src/settings.ts` — `customCommands` stub added for future slash commands
- Updated `memory-bank/tasks/T4.md` — streaming completion fix documented
- Updated `memory-bank/tasks/T5.md` — targeted action buttons documented
- Created `memory-bank/edits/2026-05-02/232114-T4-T5-T3-fixes.md` — canonical edit chunk

#### 23:21:14 IST - T7: CI/CD release pipeline fix
- Modified `.github/workflows/release.yml` — fixed artifact path for `main.js`
- Modified `manifest.json` — version bump to 1.2.0
- Updated `memory-bank/tasks/T7.md` — CI fix documented
- Created `memory-bank/edits/2026-05-02/232114-T7-ci-fix.md` — canonical edit chunk

#### 17:48:45 IST - Memory bank setup and initial task documentation
- Created `memory-bank/tasks.md` — task registry with T1–T14
- Created `memory-bank/tasks/T1.md` through `memory-bank/tasks/T14.md` — individual task files
- Created `memory-bank/activeContext.md` — current focus and active tasks
- Created `memory-bank/session_cache.md` — session state and history
- Created `memory-bank/progress.md` — implementation progress tracking
- Created `memory-bank/projectbrief.md` — project overview
- Created `memory-bank/systemPatterns.md` — architecture and patterns
- Created `memory-bank/techContext.md` — technical details
- Created `memory-bank/implementation-details/` — detailed docs for each subsystem
- Created `memory-bank/sessions/2026-05-02.md` — first session log
- Created `memory-bank/edits/2026-05-02/174845-mem-update.md` — canonical edit chunk

#### 11:12:44 IST - T8: Open source release with branding
- Created `README.md` — project branding, installation, usage, development
- Modified `manifest.json` — updated description and author
- Created `LICENSE` — MIT license
- Updated `memory-bank/tasks/T8.md` — open-source release criteria marked done
- Created `memory-bank/edits/2026-05-02/111244-T8.md` — canonical edit chunk

#### 09:41:00 IST - T7: Release system and CI/CD
- Created `.github/workflows/release.yml` — GitHub Actions workflow for release
- Created `.github/workflows/ci.yml` — GitHub Actions workflow for CI
- Modified `package.json` — added `release` script
- Updated `memory-bank/tasks/T7.md` — release system documented
- Created `memory-bank/edits/2026-05-02/094100-T7.md` — canonical edit chunk

#### 09:34:00 IST - T1: Chat panel foundation
- Created `src/views/ObsidianAIChatView.ts` — `ItemView` with React root
- Created `src/components/ChatApp.tsx` — main chat component with send/receive
- Created `src/components/ChatMessages.tsx` — message list with streaming bubble
- Created `src/components/MessageBubble.tsx` — user/assistant message rendering
- Created `src/components/ActionBar.tsx` — new/load chat buttons
- Created `src/components/ChatInput.tsx` — textarea with send button
- Created `src/components/ErrorBoundary.tsx` — error boundary for chat panel
- Modified `styles.css` — chat panel styles (bubbles, input, action bar)
- Modified `src/main.ts` — registered chat view and ribbon icon
- Updated `memory-bank/tasks/T1.md` — chat panel completion criteria marked done
- Created `memory-bank/edits/2026-05-02/093400-T1.md` — canonical edit chunk
