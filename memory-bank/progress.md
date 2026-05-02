# Implementation Progress

*Last Updated: 2026-05-03 02:47:31 IST*

## Active Tasks

### META-1: Memory Bank Setup and Maintenance
**Status:** 🔄 IN PROGRESS
**Priority:** HIGH

#### Completed Steps
- ✅ Initial memory-bank structure created
- ✅ T1 through T12 planning and implementation state captured

#### Current Work
- 🔄 Normalize task, session, registry, and edit-history files back to one canonical structure

#### Up Next
- ⬜ Keep the normalized structure current as T4 and T10 move forward
- ⬜ Add new edit chunks only in the canonical chunk format

### T2: Conversation Chain & Memory
**Status:** 🔄 IN PROGRESS
**Priority:** HIGH

#### Completed Steps
- ✅ Basic single-session persistence (loadChatMessages/saveChatMessages)
- ✅ Session-store architecture design
- ✅ Plugin methods loadChatData/saveChatData with migration
- ✅ ChatApp refactored to session state (archive-on-New, activeSessionId)
- ✅ SessionPickerModal with load/delete
- ✅ Auto-titling and pruning

#### Current Work
- 🔄 Real-world testing in Obsidian

#### Up Next
- ⬜ Verify migration from old flat chatMessages format
- ⬜ Verify pruning and edge cases

### T4: Streaming with Vercel AI SDK
**Status:** ✅ COMPLETED
**Priority:** HIGH
**Completed:** 2026-05-02

#### Completed Steps
- ✅ LangChain removed and Vercel AI SDK provider layer installed
- ✅ `streamChat()` added to `ChatApiManager`
- ✅ Streaming wired into React chat panel with abort handling and error states

### T3: Context & Mentions System
**Status:** 🔄 IN PROGRESS
**Priority:** HIGH

#### Completed Steps
- ✅ Active note toggle chip in ContextBar
- ✅ `ContextEngine.resolveContextItems()` — resolves notes, folders, tags to XML
- ✅ `@mention` autocomplete in ChatInput with keyboard navigation
- ✅ ContextBar multi-chip UI with remove buttons and truncation warning
- ✅ Token budget enforcement (chars/4, proportional truncation)
- ✅ Context items persist per-session in `ChatSession.contextItems`

#### Current Work
- 🔄 Real-world testing in Obsidian

#### Up Next
- ⬜ `embedExpander` for `![[]]` inline embeds
- ⬜ Selection capture bridge from inline tooltip

### T5: In-Place Note Editing from Chat
**Status:** 🔄 IN PROGRESS
**Priority:** HIGH

#### Completed Steps
- ✅ NoteEditingBridge refactored — caller provides resolved view/file
- ✅ Apply/Append/Copy buttons on MessageBubble
- ✅ Apply button triggers diff overlay via `NoteEditingBridge.applyToNote()`
- ✅ Active-leaf-change tracking for correct note targeting

#### Current Work
- 🔄 Testing apply flow in real Obsidian environment

#### Up Next
- ⬜ `applyToTargetNote()` — open note by path if not active
- ⬜ `/create` and `/append` slash commands
- ⬜ Retry button on message bubble

### T13: Agentic Tool Calling for Note Editing
**Status:** ⬜ NOT STARTED
**Priority:** HIGH

#### Design Complete
- Task file and implementation doc created
- Architecture: Vercel AI SDK `streamText` with `tools` + `maxSteps`
- Tools: `read_note`, `edit_note`, `append_to_note`, `create_note`
- Approval UI: PendingToolCard with approve/reject
- Settings: `autoApply`, `maxAgentSteps`

#### Up Next
- ⬜ Implement tool schemas and ToolExecutor
- ⬜ Restructure streaming loop for StreamEvent union
- ⬜ Build PendingToolCard UI component

## Paused Tasks

### T10: Model Discovery & Picker UX
**Status:** ⏸️ PAUSED
**Priority:** HIGH
**Paused On:** 2026-05-02 16:55:00 IST
**Reason:** Provider-profile groundwork is done, but the full discovery service is queued behind T4 streaming UI completion.

#### Completed Steps
- ✅ Task and design records created
- ✅ Settings UI now exposes a fetch-models entry point and searchable picker shell

#### Next When Resumed
- ⬜ Implement provider-specific fetchers and cache metadata
- ⬜ Add refresh, empty, and error states with manual fallback

## Completed Tasks

### T1: Chat Panel - ItemView + React UI
**Completed:** 2026-05-02
**Summary:** Added the React-based Obsidian sidebar chat scaffold, commands, view registration, and styles.

### T7: Release System & CI/CD
**Completed:** 2026-05-02
**Summary:** Added the pre-release workflow and corrected the release metadata flow.

### T8: Open Source Release with Branding
**Completed:** 2026-05-02
**Summary:** Standardized public branding, community files, package workflow, and release-readiness documentation.

### T9: Settings & Provider Profiles
**Completed:** 2026-05-02
**Summary:** Replaced flat provider settings with provider profiles, migration helpers, active-profile resolution, and settings UI controls.
