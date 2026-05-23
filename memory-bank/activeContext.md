# Active Context

*Last Updated: 2026-05-23 23:54 IST*

## Current Focus
**Primary Task:** T13 — Agentic Tool Calling — Context Overload Fix ✅ COMPLETE
**Secondary Tasks:** T16 (Group Chat — export feature pending), T15 (Tabbed Chat — paused), T14 (Remote Agent), T17 (Backlinks + YAML — pending)

## Active Tasks
- [T16]: 🔄 **IN PROGRESS** — Phases 1–16 implemented. Debate mode working. UI refined. Participant persistence fixed. **May 17: Message metadata, profile dropdown switching, retry profile fixes.**
- [T14]: 🔄 **IN PROGRESS** — Phase 3 integration test. Tailscale 2/3 complete.
- [T15]: 🔄 **IN PROGRESS** — Phase 1–2 complete. Phase 3 (TabBar UI) paused in favor of T16.
- [T17]: ⏸️ **PENDING** — Advanced vault tools. Backlinks + YAML first.
- [T13]: ✅ **COMPLETED** — All 13 tools, AgentLoop, PendingToolCard.
- [T18]: ✅ **COMPLETED** — Web search tool with 5 providers (DuckDuckGo, Brave, Tavily, Exa, SearXNG).

## T16 Progress Update (2026-05-16)

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
1. **Export feature**: Needs exact UI location specification from user
2. **Issue #3**: Token usage for tool calls (`stepTokenEstimates` in AgentLoop.ts)
3. **Issue #4**: Agent dropdown click-outside handler completion
4. **Issue #2**: Tool-call streaming ContentPart import cleanup
5. **T17 Phase 1**: Backlinks + YAML tools (user-prioritized)
6. Return to T15 Phase 3 (TabBar) when user ready
7. **README**: New demo GIF needed (current shows old inline editing)

## Current Decisions
- Unified UI chosen over separate panels (user explicitly requested)
- Individual checkbox dropdown for participants (replaced all-or-nothing toggle)
- Sequential dispatch as default (parallel exists in code but not wired)
- Tool calling in council mode: ENABLED — auto-approve only; manual approval UI deferred
- Debate mode: Round 1 all agents respond to user, Round 2 agents see each other's responses. PASS to skip.
- **Folder context: NEVER inline full file contents** — tool instructions are the correct pattern for large collections
- T15 tab bar deprioritized in favor of T16 group chat

## Session Context
- **Session**: 2026-05-23 night
- **Commits**: `6c396bb`, `d19de84`
  - `6c396bb`: T13 `list_notes` subfolders + `count_notes` breakdown
  - `d19de84`: T13 context overload fix (folder/tag context returns listings, not full contents)
- **Build status**: ✅ tsc + esbuild pass
- **Pushed to**: origin/main
