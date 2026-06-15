# Implementation Progress
*Last Updated: 2026-06-15 00:17 IST*

## Active Tasks

### META-1: Memory Bank Setup and Maintenance
**Status:** 🔄 IN PROGRESS
**Priority:** HIGH

#### Completed Steps
- ✅ Initial memory-bank structure created
- ✅ T1 through T18 planning and implementation state captured
- ✅ Session and edit chunks created through 2026-05-23
- ✅ Implementation docs updated for agentic tool calling, context engine, list_notes, count_notes

#### Current Work
- 🔄 Keep memory bank current as T13/T16/T19 work continues

### T24: SessionStorage — JSONL Chat Persistence
**Status:** ✅ COMPLETED
**Priority:** HIGH
**Started:** 2026-06-14
**Completed:** 2026-06-14

#### Completed Steps
- ✅ SessionStorage core (`src/storage/session-storage.ts`): loadSession, appendMessage, createSession
- ✅ ChatStorage wrapper (`src/storage/ChatStorage.ts`): async API for save/load/list/delete
- ✅ Migration utility (`src/storage/Migration.ts`): old format → JSONL
- ✅ MigrationPromptModal (`src/modals/MigrationPromptModal.ts`): UI for migration prompt
- ✅ Plugin integration (`main.ts`): sessionStorage property, onload init
- ✅ Fix: added missing `contextPickerPathDisplay` to `ObsidianAISettings` interface
- ✅ Build passes (`npm run build`)
- ✅ Committed and pushed: `fdc8b58`

#### Files Changed
- 4 new files in `src/storage/` and `src/modals/`
- 9 modified files (main.ts, ChatApp.tsx, tokenEstimator, useMessageActions, settings, agent loops)

---

### T13: Agentic Tool Calling for Note Editing
**Status:** ✅ COMPLETED (with ongoing refinements)
**Priority:** HIGH
**Started:** 2026-05-06

#### Completed Steps
- ✅ MVP foundation built (types.ts, tools.ts, ToolExecutor.ts, api.ts updates)
- ✅ All 13 tools implemented (read, edit, append, create, patch, edit_section, search, list, metadata, create_folder, move, delete, list_folders)
- ✅ AgentLoop extracted from ChatApp into src/agent/AgentLoop.ts
- ✅ PendingToolCard component created
- ✅ Tool result formatting (markdown tables, bulleted lists, formatted summaries)
- ✅ resolveNote() with three-tier basename resolution + ambiguity detection
- ✅ Auto-approve toggle in ActionBar
- ✅ Session auto-naming v3 (context-aware, toggle reactivity)
- ✅ **2026-05-23: Context overload fix** — folder/tag context returns file listings, not full contents
- ✅ **2026-05-23: list_notes enhanced** — include_subfolders, depth params, subfolders array
- ✅ **2026-05-23: count_notes accuracy** — five-count breakdown (total, markdown, direct, directMarkdown, subfolder)

#### Current Work
- 🔄 Export feature investigation (T16-related)

#### Up Next
- ⬜ Issue #3: Token usage for tool calls (stepTokenEstimates)
- ⬜ Issue #4: Agent dropdown click-outside handler
- ⬜ Issue #2: Tool-call streaming ContentPart cleanup

### T16: Group Chat (Multi-Agent Conversation)
**Status:** 🔄 IN PROGRESS
**Priority:** HIGH
**Started:** 2026-05-16

#### Completed Steps
- ✅ Phases 1–17 implemented (MVP through debate mode, participant persistence, session sync, thinking toggle)
- ✅ Message metadata (model name + response time)
- ✅ Profile dropdown mid-session switching
- ✅ All participant/session bug fixes
- ✅ Thinking display toggle (`showThinking` state in ChatApp)

#### Current Work
- 🔄 Export feature request — needs UI design clarification

#### Up Next
- ⬜ Export feature implementation (pending UI spec)
- ⬜ Mention autocomplete
- ⬜ Parallel dispatch toggle
- ⬜ Manual tool approval in council mode

### T11: Debug Logging & Diagnostics
**Status:** 🔄 IN PROGRESS
**Priority:** MEDIUM
**Started:** 2026-05-08

#### Completed Steps
- ✅ Diagnostics panel in Settings
- ✅ File-based debug logger
- ✅ React ErrorBoundary
- ✅ Defensive render logging
- ✅ Crash debugging support
- ✅ Persistence queue/debounce fix

#### Up Next
- ⬜ Privacy redaction
- ⬜ Structured event pipeline

### T14: Remote Agent Connectivity (OpenResponses)
**Status:** 🔄 IN PROGRESS
**Priority:** HIGH
**Started:** 2026-05-07

#### Completed Steps
- ✅ Architecture diagram and design decisions documented
- ✅ Tailscale mesh 2/3 complete (MacBook + VPS)

#### Up Next
- ⬜ Add "agent" provider type
- ⬜ Create AgentApiManager
- ⬜ Wire agent streaming

### T15: Tabbed Chat Interface with Multi-Profile
**Status:** 🔄 IN PROGRESS (Paused)
**Priority:** HIGH

#### Completed Steps
- ✅ Phase 1 (Settings profile list)
- ✅ Phase 2 (Per-profile engine)

#### Up Next
- ⬜ Phase 3 (TabBar UI) — paused in favor of T16

### T17: Advanced Vault Tools — Backlinks, YAML, Bulk Ops
**Status:** ⏸️ PENDING
**Priority:** HIGH

#### Up Next
- ⬜ Phase 1: Backlinks + YAML (user-prioritized)

## Paused Tasks

### T12: Chat Onboarding, Tips & Empty States
**Status:** ⏸️ PAUSED
**Priority:** MEDIUM

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
