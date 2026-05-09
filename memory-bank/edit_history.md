# Edit History
*Created: 2026-05-02 08:00:01 IST*
    *Last Updated: 2026-05-09 11:51:05 IST*

*Newest entries first. Canonical chunks stored in `edits/YYYY-MM-DD/`.*

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

---

### 2026-05-06

#### 09:30:00 IST - T13: Agentic tool calling MVP foundation and settings wiring

- Created `src/agent/types.ts` — `StreamEvent` union, `ToolCall`, `ToolResult` interfaces
- Created `src/agent/tools.ts` — 4 Zod tool schemas (`read_note`, `edit_note`, `append_to_note`, `create_note`) with `any` cast workaround for AI SDK v6 TS OOM
- Created `src/agent/ToolExecutor.ts` — vault operations executor with error handling
- Modified `src/api.ts` — added `streamChatWithTools()` using `streamText({ tools, stopWhen: stepCountIs(1) })` with SDK-agnostic event translation
- Modified `src/components/ChatApp.tsx` — integrated tool loop into `handleSend` with approve/reject handlers; wired `plugin.settings.enableAgentTools`, `autoApply`, `maxAgentSteps`
- Modified `src/settings.ts` — added `enableAgentTools`, `autoApply`, `maxAgentSteps` to `ObsidianAISettings`, `DEFAULT_SETTINGS`, `normalizeSettings`; added `displayAgentToolsSettings()` UI section
- Modified `styles.css` — pending tool call approval card styles
- Updated `memory-bank/tasks/T13.md` — marked settings criteria complete; added progress entries
- Updated `memory-bank/tasks.md` — T13 status changed to 🔄 IN PROGRESS
- Updated `memory-bank/session_cache.md` — focus shifted to T13
- Updated `memory-bank/activeContext.md` — current focus updated to T13
- Created `memory-bank/sessions/2026-05-06.md` — session file documenting MVP build

---

### 2026-05-04

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

---

### 2026-05-03

#### 02:47:31 IST - T3/T5/T13: Context system implementation, Apply button, agentic tool calling design

- Created `src/context/ContextEngine.ts` — resolves ContextItem[] to XML context blocks with token budget and truncation
- Created `src/components/ContextPickerModal.tsx` — modal with Notes/Folders/Tags tabs for multi-select context addition
- Modified `src/types.ts` — added ContextItem union and contextItems field to ChatSession
- Modified `src/components/ChatApp.tsx` — replaced includeActiveNote with contextItems state; handleSend uses ContextEngine; dynamic system prompt; context persists per-session
- Modified `src/components/ContextBar.tsx` — multi-chip display with removable chips, truncation warning, "+ Add context" button
- Modified `src/components/ChatInput.tsx` — @mention autocomplete dropdown with keyboard navigation
- Modified `src/components/MessageBubble.tsx` — added Apply button triggering diff overlay
- Modified `src/components/ChatMessages.tsx` — passes onApply through to MessageBubble
- Modified `src/main.ts` — migration ensures contextItems: [] on all sessions
- Modified `styles.css` — styles for picker modal, mention dropdown, removable chips, truncation warning
- Created `memory-bank/tasks/T13.md` — task file for agentic tool calling
- Created `memory-bank/implementation-details/agentic-tool-calling.md` — full design doc
- Updated `memory-bank/tasks/T3.md` — marked completion criteria and progress items done
- Updated `memory-bank/tasks/T5.md` — marked Apply button progress done
- Updated `memory-bank/tasks.md` — added T13 row
- Updated `memory-bank/activeContext.md` — T3 marked feature-complete, T13 added
- Updated `memory-bank/session_cache.md` — updated focus, active tasks, next session focus
- Updated `memory-bank/progress.md` — added T3, T5, T13 sections
- Updated `memory-bank/sessions/2026-05-03-night.md` — appended T3 implementation and T13 design work

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


---

### 2026-05-02

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
- Updated `memory-bank/session_cache.md` — T7 complete, focus shifted to T1
- Updated `memory-bank/sessions/2026-05-02-morning.md` — session 3 update appended


