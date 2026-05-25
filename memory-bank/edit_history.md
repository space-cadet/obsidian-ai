# Edit History
*Created: 2026-05-02 08:00:01 IST*
*Last Updated: 2026-05-25 23:03 IST*

### 2026-05-25

#### 23:03:00 IST - META-1: Memory bank update for T19 implementation + T21 creation
- Modified `memory-bank/tasks/T19.md` - Marked core implementation complete, updated Last Active to 2026-05-25 23:03, added commit a071a24
- Modified `memory-bank/tasks/T16.md` - Added Phase 17 thinking display toggle, updated Last Active
- Modified `memory-bank/tasks.md` - Added T21 to registry (Active: 6), updated T19 description
- Modified `memory-bank/activeContext.md` - Updated current focus to T19, added T21 and T19 implementation sections
- Modified `memory-bank/progress.md` - Added T19 and T21 progress sections, updated Last Updated
- Modified `memory-bank/session_cache.md` - Updated for T19 completion and T21 creation
- Modified `memory-bank/sessions/2026-05-25.md` - Appended night session for T19 implementation work
- Modified `memory-bank/techContext.md` - Added Attachment System architecture and multimodal message types
- Created `memory-bank/edits/2026-05-25/2244-T19-implementation.md` - Edit chunk for T19 implementation

#### 22:51:00 IST - T18: Web search implementation doc relocated
- Created `memory-bank/implementation-details/web-search.md` - Moved from stale `memory-bank/implementation/` location
- Deleted `memory-bank/implementation/T18-web-search.md` - Content now in implementation-details

#### 22:50:00 IST - T21: CLI test harness task and implementation doc created
- Created `memory-bank/tasks/T21.md` - Task file with completion criteria, architecture, and test script plans
- Created `memory-bank/implementation-details/cli-test-harness.md` - Implementation doc with mock vault, settings loader, provider support matrix

#### 22:44:00 IST - T19: File attachments core implementation complete
- Created `src/context/AttachmentEngine.ts` - Resolve vault files to AI SDK content parts (markdown→TextPart, image→ImagePart, PDF→FilePart)
- Modified `src/types.ts` - Added `Attachment` interface
- Modified `src/components/ChatInput.tsx` - Added 📎 dropdown with note/image/PDF picker, attachment chips, showThinking prop
- Modified `src/components/MessageBubble.tsx` - Render attachment chips below user messages, conditional stripThinkingTags
- Modified `src/api.ts` - Added `SdkMessage` and `MessageContentPart` types; multimodal support in streamChat/streamChatWithTools
- Modified `src/components/ChatApp.tsx` - handleSend resolves attachments; messageAttachments state; showThinking state
- Modified `src/components/ChatMessages.tsx` - showThinking prop pass-through
- Modified `src/agent/Orchestrator.ts` - parseAndRoute accepts optional attachments param

### 2026-05-25

#### 20:45:00 IST - META-1: Format normalize task files + add T19 to registry
- Modified `memory-bank/tasks.md` - Added T19 to registry (Active: 5), updated META-1 description to T1–T19, added T19 active task section
- Modified `memory-bank/tasks/T1.md` - Fixed frontmatter format, restructured headers to use ## sections, added Started/Last Active/Dependencies/Related Files fields
- Modified `memory-bank/tasks/T10.md` - Same format normalization
- Modified `memory-bank/tasks/T11.md` - Same format normalization
- Modified `memory-bank/tasks/T12.md` - Same format normalization
- Deleted `memory-bank/tasks/T14-impl.md` - Removed stale duplicate implementation file
- Modified `memory-bank/tasks/T14a.md` - Added frontmatter, restructured headers, added Completion Criteria/Related Files/Progress/Context sections
- Modified `memory-bank/tasks/T18.md` - Fixed frontmatter placement, restructured headers, consolidated duplicate Dependencies section, added Related Files
- Modified `memory-bank/tasks/T7.md` - Same format normalization
- Modified `memory-bank/tasks/T8.md` - Same format normalization
- Modified `memory-bank/tasks/T9.md` - Same format normalization

#### 13:01:00 IST - T16: Fix model fetching for all providers in ProfileCard
- Modified `src/components/ProfileCard.tsx` - Replaced inline handleFetchModels with ChatApiManager.fetchModels() delegation
- Modified `src/components/ProfileCard.tsx` - Added plugin prop to ProfileEditForm, ProfileCard, ProfileCardProps interface
- Modified `src/components/ProfileCard.tsx` - ProfileList passes plugin to each ProfileCard
- Modified `src/components/ProfileCard.tsx` - handleFetchModels now uses: new ChatApiManager(plugin.settings, plugin.app).fetchModels(draft)

#### 12:55:00 IST - T16: Fix duplicate profile ID on copy
- Modified `src/components/ProfileCard.tsx` - handleDuplicate now destructures id before spreading source fields: const { id: _unused, ...sourceWithoutId } = source
- Modified `src/components/ProfileCard.tsx` - createProviderProfile receives sourceWithoutId instead of full source, ensuring new unique ID generation

### 2026-05-24

#### 17:05:00 IST - T16: Profile dropdown single-select + auto-scroll fixes
- Modified `src/components/ChatApp.tsx` - Added check for `selectedProfileIds.size === 1` in non-group-chat path to use selected profile instead of Settings default
- Modified `src/components/ChatMessages.tsx` - Added `currentAiMessage` to auto-scroll `useEffect` dependency array so chat scrolls on every streaming chunk
- Modified `memory-bank/tasks/T16.md` - Updated known issues (resolved #10 and #11), added commits to progress log, updated source_commit to 8055cd5

### 2026-05-23

#### 23:54:00 IST - T13: Context overload fix + list_notes enhancement + count_notes accuracy
- Modified `src/context/ContextEngine.ts` - Folder/tag context returns file listings + tool instructions instead of full file contents
- Modified `src/agent/tools.ts` - `list_notes` gains `include_subfolders` (default true) and `depth` (default 1, max 3) parameters
- Modified `src/agent/ToolExecutor.ts` - `listNotes()` returns `subfolders` array alongside files; `countNotes()` reports 5-count breakdown (total, markdown, direct, directMarkdown, subfolder)
- Modified `src/components/ChatApp.tsx` - `buildSystemPrompt()` describes enhanced `list_notes` and `count_notes` capabilities

### 2026-05-17

#### 12:16:00 IST - T16: Profile switching + message metadata + settingsTick fix
- Modified `src/components/ChatApp.tsx` - `resolvedProfile` added to `handleSend` dependency array; `settingsTick` increments on profile switch
- Modified `src/components/MessageBubble.tsx` - Model name + response time shown in assistant message bubbles
- Modified `src/components/ActionBar.tsx` - Profile dropdown with radio buttons (1:1) and checkboxes (council)

### 2026-05-16

#### 15:53:00 IST - T16: Participant persistence + session sync + race condition fix
- Modified `src/components/ChatApp.tsx` - `setParticipants()` before `setActiveSessionId()` to prevent sync effect overwrite
- Modified `src/types.ts` - `ChatSession` gains `selectedProfileIds`, `isGroupChat`, `participants` fields
- Modified `src/settings.ts` - `pluginSettings` gains `selectedProfileIds` array

#### 15:40:00 IST - T16: Persist participants across reloads
- Modified `src/components/ChatApp.tsx` - Restore `selectedProfileIds` from active session on load; sync to session on change

#### 15:31:00 IST - T16: Debate mode (agents talk to each other)
- Created `src/agent/Orchestrator.ts` - `debate()` method for multi-round agent discussion
- Modified `src/components/ChatApp.tsx` - Debate mode toggle in ActionBar; `handleSend` uses `debate()` when enabled

#### 15:26:00 IST - T16: Hide separate GroupChatView
- Modified `src/main.ts` - Commented out `GroupChatView` registration (ribbon icon, command, view)

#### 15:12:00 IST - T16: Participant button in ActionBar
- Modified `src/components/ActionBar.tsx` - Participant dropdown trigger integrated; horizontal scroll on mobile
- Modified `src/components/ChatApp.tsx` - Removed separate participant bar row
- Modified `styles.css` - ActionBar horizontal scroll, dropdown positioning

#### 12:59:00 IST - T16: Individual participant dropdown (checkboxes)
- Modified `src/components/ChatApp.tsx` - Checkbox list for individual profile selection
- Modified `styles.css` - Badge styling, dropdown item hover/active states

#### 12:48:00 IST - T16: Mobile-responsive UI + Zen mode
- Modified `src/components/ChatApp.tsx` - Zen mode toggle, auto-expand textarea, compact participant bar
- Modified `styles.css` - Zen mode styles, mobile media queries, touch device handling

#### 10:45:00 IST - T16: Tool calling in council mode
- Modified `src/agent/Orchestrator.ts` - Uses `AgentLoop` with `noteTools` when `enableAgentTools=true`

#### 09:45:00 IST - T16: Stale orchestrator fix
- Modified `src/components/ChatApp.tsx` - `handleSend` dependency array includes `orchestrator`, `participants`

#### 09:30:00 IST - T16: Unified ChatApp merged
- Modified `src/components/ChatApp.tsx` - Council mode toggle, participant bar, handleSend branching

#### 09:15:00 IST - T16: Main.ts CHAT_VIEWTYPE registration restored
- Modified `src/main.ts` - Restored `CHAT_VIEWTYPE` view registration

#### 08:30:00 IST - T16: Phase 1-5 MVP
- Created `src/agent/MentionParser.ts` - Parses `@AgentName` mentions
- Created `src/agent/Orchestrator.ts` - Sequential dispatch, full/isolated context
- Created `src/components/GroupChatApp.tsx` - Separate group chat panel (later hidden)
- Modified `src/types.ts` - `ChatMessage` gains `agentId`, `agentName`, `agentColor`
- Modified `src/components/MessageBubble.tsx` - Agent identity badge display

### 2026-05-15

#### 09:57:00 IST - T15/T16: Tasks created
- Created `memory-bank/tasks/T15.md` - Tabbed Chat Interface task definition
- Created `memory-bank/tasks/T16.md` - Group Chat task definition
- Created `memory-bank/implementation-details/group-chat-architecture.md` - Architecture design doc

### 2026-05-14

#### 17:30:00 IST - T13: Agentic Tool Calling COMPLETE
- Created `src/agent/AgentLoop.ts` - Extracted inline tool loop from ChatApp
- Created `src/components/PendingToolCard.tsx` - Pending approval UI with summary + sticky actions
- Modified `src/agent/tools.ts` - 13 tools implemented (read, edit, append, create, patch, edit_section, search, list, get_metadata, create_folder, move, delete, list_folders)
- Modified `src/components/ChatApp.tsx` - `AgentLoop` integration, `PendingToolCard` usage

### 2026-05-12

#### 22:15:00 IST - T11: Debug-log spam diagnosis
- Modified `src/utils/logger.ts` - Fixed log level filtering to prevent debug spam in production
- Modified `src/utils/persistence.ts` - Added load guard for malformed data.json

### 2026-05-09

#### 18:45:00 IST - T13: Crash debugging + patch_note + edit_section
- Created `src/agent/tools.ts` - `patch_note` and `edit_section` tools
- Modified `src/components/ChatApp.tsx` - Tool result formatting (markdown tables, bulleted lists)

#### 16:30:00 IST - T11: File logger + ErrorBoundary
- Created `src/utils/logger.ts` - File-based debug logger
- Created `src/components/ErrorBoundary.tsx` - React error boundary for chat panel
- Modified `src/settings.ts` - Diagnostics settings (log level, log file path)

### 2026-05-08

#### 14:20:00 IST - T13: Basename resolution fix + diagnostics panel
- Modified `src/agent/tools.ts` - `resolveNote()` three-tier resolution (exact path → append .md → metadataCache)
- Created `src/components/DiagnosticsPanel.tsx` - Settings panel for debug logging
- Modified `src/settings.ts` - Diagnostics tab in settings UI

### 2026-05-07

#### 11:00:00 IST - T14: Remote Agent Connectivity task created
- Created `memory-bank/tasks/T14.md` - OpenResponses API integration task
- Created `memory-bank/implementation-details/openresponses-integration.md` - Integration design doc

### 2026-05-06

#### 15:30:00 IST - T13: Agentic Tool Calling task created
- Created `memory-bank/tasks/T13.md` - Tool calling task definition
- Created `memory-bank/implementation-details/agentic-tool-calling.md` - Tool calling architecture doc

### 2026-05-04

#### 20:00:00 IST - T10: Model Discovery & Picker UX COMPLETE
- Modified `src/settings.ts` - Provider profile management (add/edit/delete/reorder)
- Modified `src/components/SettingsPanel.tsx` - Profile list with model picker

#### 18:30:00 IST - T5: In-Place Note Editing COMPLETE
- Created `src/noteEditing/NoteEditingBridge.ts` - Bridge between chat and note editor
- Modified `src/components/ChatApp.tsx` - Slash commands (`/edit`, `/create`, `/append`)

#### 16:00:00 IST - T3: Context & Mentions System COMPLETE
- Created `src/context/ContextEngine.ts` - Context resolution and token estimation
- Modified `src/components/ChatApp.tsx` - Context bar with note/folder/tag mentions

#### 14:00:00 IST - T2: Conversation Chain & Memory COMPLETE
- Created `src/utils/persistence.ts` - Chat data save/load to data.json
- Modified `src/components/ChatApp.tsx` - Session management (new/load/delete)

### 2026-05-02

#### 20:00:00 IST - T9: Settings & Provider Profiles COMPLETE
- Created `src/settings.ts` - Plugin settings with provider profiles
- Created `src/components/SettingsPanel.tsx` - Settings UI

#### 18:00:00 IST - T7: Release System & CI/CD COMPLETE
- Created `.github/workflows/release.yml` - GitHub Actions release workflow
- Modified `manifest.json` - Version bump to 1.2.0

#### 16:00:00 IST - T4: Streaming COMPLETE
- Modified `src/api/ChatApiManager.ts` - SSE streaming with AbortController
- Modified `src/components/ChatApp.tsx` - Streaming UI with stop button

#### 14:00:00 IST - T1: Chat Panel COMPLETE
- Created `src/views/ObsidianAIChatView.ts` - ItemView for chat panel
- Created `src/components/ChatApp.tsx` - Main React chat component
- Modified `src/main.ts` - View registration, ribbon icon, command
