# Active Context

*Last Updated: 2026-05-29 02:15 IST*

## Current Focus
**Primary Task:** T22 — ChatApp.tsx Component Decomposition — Phases 0+1+2+3 COMPLETE
**Status:** `ChatApp.tsx` reduced from 1,948 to **636 lines** (-1,312, -67%). Build passes. 52 tests pass.
- **Phase 0**: Extracted 6 utility modules (`agentVisuals`, `contextUtils`, `slashCommand`, `sessionUtils`, `sessionTitle`, `systemPrompt`)
- **Phase 1**: Created `useChatSession` hook (317 lines) — session CRUD, persistence, auto-naming, manual rename
- **Phase 2**: Created `useChatUI` hook (264 lines) + 31 tests — modals, zen/debate/thinking toggles, participant dropdown, typing indicators, editing state, attachments, auto-approve
- **Phase 3**: Created `useMessageActions` hook (1,111 lines) + 21 tests — send, stop, retry, edit, apply, append, tool approval/rejection

**Secondary Tasks:** T23 (Settings.ts decomposition — task created, not started)

## Active Tasks
- **[T22]**: 🔄 **IN PROGRESS** — **Phases 0+1+2+3 COMPLETE**. ChatApp.tsx: 1,948 → **636 lines** (-1,312, -67%). Extracted 6 utility modules + `useChatSession` (317 lines) + `useChatUI` (264 lines, 31 tests) + `useMessageActions` (1,111 lines, 21 tests). Build + tests pass. Remaining: session/settings/export handlers, layout components.
- **[T23]**: 🔄 **IN PROGRESS** — Task file created. Not started.
- [T16]: 🔄 **IN PROGRESS** — Phases 1–17 implemented. Debate mode working. UI refined. Participant persistence fixed. Thinking display toggle added. **May 25: Fixed duplicate profile ID on copy (commit `de84c4a`) and model fetching for all providers (commit `9d3d1a3`).**
- [T14]: 🔄 **IN PROGRESS** — Phase 3 integration test. Tailscale 2/3 complete.
- [T15]: 🔄 **IN PROGRESS** — Phase 1–2 complete. Phase 3 (TabBar UI) paused in favor of T16.
- [T17]: ⏸️ **PENDING** — Advanced vault tools. Backlinks + YAML first.
- [T13]: ✅ **COMPLETED** — All 13 tools, AgentLoop, PendingToolCard.
- [T18]: ✅ **COMPLETED** — Web search tool with 5 providers (DuckDuckGo, Brave, Tavily, Exa, SearXNG).
- [T19]: 🔄 **IN PROGRESS** — Core implementation complete (commit `a071a24`). AttachmentEngine, ChatInput 📎 dropdown, MessageBubble chips, api.ts multimodal support. Group chat broadcasting deferred. Testing pending.
- [T21]: 🔄 **IN PROGRESS** — CLI test harness task created. Scripts for attachment resolution, streaming, tool calling, multimodal testing.

## File Size Analysis (May 28, 2026)
Deepak requested analysis of oversized files. **Refactoring in progress**:

| File | Lines | Size | Verdict |
|------|-------|------|---------|
| `src/components/ChatApp.tsx` | **636** | ~20 KB | 🔄 **In progress** — Phases 0–3 complete. Target: ~300 lines |
| `src/settings.ts` | **1,187** | 34 KB | 🔥 **Critical** — 836 lines of UI in config file |
| `src/agent/ToolExecutor.ts` | 865 | 25 KB | ⚠️ Large — tool defs + execution + formatting |
| `src/components/ProfileCard.tsx` | 698 | 21 KB | ⚠️ Large — UI component |
| `src/api.ts` | 689 | 19 KB | ⚠️ Large — broad API surface |
| `src/components/ChatInput.tsx` | 616 | 16 KB | ⚠️ Large |
| `src/modules/WidgetExtension.ts` | 577 | 15 KB | ⚠️ Large |

**New modules created**:
- `src/lib/agentVisuals.ts` — 28 lines
- `src/lib/contextUtils.ts` — 26 lines
- `src/lib/slashCommand.ts` — 23 lines
- `src/lib/sessionUtils.ts` — 24 lines
- `src/lib/sessionTitle.ts` — 137 lines
- `src/lib/systemPrompt.ts` — 67 lines
- `src/hooks/useChatSession.ts` — 317 lines
- `src/hooks/useChatUI.ts` — 264 lines (+ 31 tests)
- Test infra: `vitest.config.ts`, `package.json` scripts

Total TypeScript source: ~13,500+ lines (new modules offset removal from ChatApp).

## T16 Progress Update (2026-05-25)

### Bug Fix: Duplicate Profile ID on Copy (commit `de84c4a`)
- **Problem**: Copying a profile via "Duplicate" created two profiles with the same ID; both appeared checked in dropdown
- **Root cause**: `handleDuplicate` spread `...source` which included `id`; `createProviderProfile` only generates new ID when `overrides.id` is undefined
- **Fix**: Destructure `id` out before spreading source fields
- **File**: `src/components/ProfileCard.tsx`

### Bug Fix: Model Fetching for All Providers (commit `9d3d1a3`)
- **Problem**: "Model fetching not supported for this provider yet" for OpenRouter, Gemini, DeepSeek, Kimi, Anthropic, Azure, Custom
- **Root cause**: `ProfileCard.tsx` had inline `handleFetchModels` that only handled `openai` and `ollama`. Backend `api.ts:fetchProviderModels` supports all 9 providers.
- **Fix**: Replaced inline fetch with `ChatApiManager.fetchModels()` delegation. Prop drilled `plugin` through ProfileList → ProfileCard → ProfileEditForm.
- **File**: `src/components/ProfileCard.tsx`

### T19: File Attachments for Chat Messages (commit `a071a24`)
- **Attachment interface**: `src/types.ts` — `Attachment` with `id`, `type` (markdown/image/pdf), `path`, `name`
- **AttachmentEngine**: `src/context/AttachmentEngine.ts` — resolves vault files to AI SDK content parts (TextPart, ImagePart, FilePart). Image resizing to 1024px. PDF as FilePart for Gemini, text/skip for others.
- **ChatInput**: `src/components/ChatInput.tsx` — 📎 dropdown with note/image/PDF picker, attachment chips with remove button, passes attachments to `onSend`
- **MessageBubble**: `src/components/MessageBubble.tsx` — renders attachment chips below user messages
- **api.ts**: `SdkMessage` and `MessageContentPart` types. `streamChat()`/`streamChatWithTools()` accept multimodal messages. `MESSAGE_HISTORY_LIMIT` → `maxContextMessages`.
- **ChatApp.tsx**: `handleSend()` resolves attachments via `AttachmentEngine` before API call. `messageAttachments` state. `showThinking` state for thinking display toggle.
- **Orchestrator.ts**: `parseAndRoute()` accepts optional `attachments` param (group chat deferred)

### T21: CLI Test Harness (created 2026-05-25 22:50)
- **Purpose**: Standalone Node.js scripts to test AI features without Obsidian runtime
- **Scripts planned**: `test-attachments.ts`, `test-stream-chat.ts`, `test-tool-calling.ts`, `test-multimodal.ts`, `test-pdf.ts`
- **Mock vault**: `scripts/lib/mockApp.ts` — minimal Obsidian `App` mock for Node.js
- **Settings loader**: `scripts/lib/loadSettings.ts` — loads API keys from `.env` or `~/.obsidian-ai-test-keys.json`

### Phase 1: Identity-Aware Message Model ✅
- `ChatMessage` extended with `agentId`, `agentName`, `agentColor`
- `GroupChatParticipant` interface created
- `ChatSession` extended with `isGroupChat`, `participants`
- `MessageBubble` shows agent identity dot + name

### Phase 2: Orchestration Layer ✅
- `MentionParser.ts`: `parseMentions()`, `hasMentions()` — `@AgentName` regex
- `Orchestrator.ts`: sequential dispatch, full/isolated context, profile resolution
- Mention routing: `@Cloudy` → only Cloudy; no mention → all agents

### Phase 3: Agent Identity UI ✅
- `getAgentColor()` / `getAgentIcon()`: provider-specific colors and icons
- Participant roster: chips with icon + name + typing indicator + remove button
- Typing pulse animation while agent is thinking

### Phase 4: Unified ChatApp — Council Mode ✅
- Same ChatApp panel for both 1:1 and council modes
- Participant bar below ActionBar
- Council toggle: "👥 Council" button (dashed when inactive)
- Toggle ON: all profiles become participants
- Toggle OFF: back to 1:1 with active profile

### Phase 5: Context Sharing ✅ (Core)
- Full transparency: agent sees complete conversation with attribution
- Isolated mode: agent only sees user + own responses
- Both implemented in `buildContext()`

### Bug Fix: Stale Orchestrator (9ecb0ed)
- handleSend deps: [isStreaming, plugin] → [isStreaming, plugin, orchestrator, isGroupChat, participants, typingAgents]
- Fixed: removed agent still responding after participant removal
- User confirmed: "Yes. Excellent."

### Phase 6: Tool Calling in Council Mode ✅ (2026-05-16 10:45)
- Orchestrator now uses `AgentLoop` (same class as single-user path) when `enableTools=true`
- `ToolExecutor` passed to Orchestrator constructor
- Tool descriptions added to system prompt for group chat agents
- `AbortSignal` passed through dispatch for cancellation support
- `toolCalls` returned in `AgentResponse` and surfaced in UI
- **Safety**: Single-user path untouched. `AgentLoop.ts`, `api.ts`, `ToolExecutor.ts` unmodified.
- **Limitation**: Manual approval UI not shown in council mode. Auto-approve only. If autoApprove is OFF, tools rejected with helpful message.

## T15 Status (Paused for T16)
- Phase 1 (Settings profile list) ✅ COMPLETE
- Phase 2 (Per-profile engine) ✅ COMPLETE
- Phase 3 (TabBar UI) ⏸️ PAUSED — user chose T16 first

## T13 Current Status (2026-05-23)
- ✅ **All 13 tools implemented** — AgentLoop, PendingToolCard, tool result formatting
- ✅ **Context overload fix** — Folder/tag context now returns file listings with tool instructions instead of full file contents
- ✅ **`list_notes` enhanced** — `include_subfolders` (default true), `depth` (default 1, max 3), returns `subfolders` array
- ✅ **`count_notes` accuracy** — Five-count breakdown: total, markdown, direct, directMarkdown, subfolder
- ✅ **System prompt updated** — `buildSystemPrompt()` describes enhanced capabilities
- Commits: `6c396bb`, `d19de84`

## T16 Current Status (2026-05-17 + 2026-05-23)
- All phases 1–16 implemented. Debate mode working. User confirmed.
- **May 17 additions:** Message metadata, profile dropdown switching, settingsTick fix, retry profile fix
- **May 23:** Export feature investigated — no existing "note list drop-down" in ActionBar. Needs UI design.
- Known issues: Gemini guardrails, manual approval in council mode deferred, parallel dispatch not wired

## Next Steps
1. **T22 Phase 4**: Extract session/settings/export handlers (`useSessionActions`, `useSettingsActions`, `useExportActions`)
2. **T22 Phase 5**: Extract layout sub-components (ChatLayout, ChatToolbar, ChatMainArea)
3. **T23 Phase 1**: Move `ObsidianAISettingsTab` to dedicated file
4. **Export feature**: Needs exact UI location specification from user
5. **Issue #3**: Token usage for tool calls (`stepTokenEstimates` in AgentLoop.ts)
6. **Issue #4**: Agent dropdown click-outside handler completion
7. **T17 Phase 1**: Backlinks + YAML tools (user-prioritized)
8. Return to T15 Phase 3 (TabBar) when user ready

## Current Decisions
- Unified UI chosen over separate panels (user explicitly requested)
- Individual checkbox dropdown for participants (replaced all-or-nothing toggle)
- Sequential dispatch as default (parallel exists in code but not wired)
- Tool calling in council mode: ENABLED — auto-approve only; manual approval UI deferred
- Debate mode: Round 1 all agents respond to user, Round 2 agents see each other's responses. PASS to skip.
- **Folder context: NEVER inline full file contents** — tool instructions are the correct pattern for large collections
- T15 tab bar deprioritized in favor of T16 group chat
- **T22 + T23 priority**: ChatApp and Settings decomposition is now highest priority per user request (May 28)

## Session Context
- **Session**: 2026-05-28 night
- **File size analysis completed**
- **Task files created**: T22.md, T23.md
- **Implementation doc created**: `chatapp-settings-decomposition.md`
- **Build status**: ✅ tsc + esbuild pass (pre-refactor)
- **Pushed to**: origin/main
