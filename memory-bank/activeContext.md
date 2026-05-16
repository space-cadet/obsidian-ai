# Active Context

*Last Updated: 2026-05-16 23:30 IST*

## Current Focus
**Primary Task:** T18 — Web Search Tool — ✅ COMPLETE
**Secondary Tasks:** T16 (Group Chat — testing), T15 (Tabbed Chat — paused), T14 (Remote Agent)

## Active Tasks
- [T16]: 🔄 **IN PROGRESS** — Phases 1–16 implemented. Debate mode working. UI refined. Participant persistence fixed.
- [T14]: 🔄 **IN PROGRESS** — Phase 3 integration test. Tailscale 2/3 complete.
- [T15]: 🔄 **IN PROGRESS** — Phase 1–2 complete. Phase 3 (TabBar UI) paused in favor of T16.
- [T17]: ⏸️ **PENDING** — Advanced vault tools. Backlinks + YAML first.
- [T13]: ✅ **COMPLETED** — All 13 tools, AgentLoop, PendingToolCard.
- [T18]: ✅ **COMPLETED** — Web search tool with 3 providers (DuckDuckGo, Brave, SearXNG).

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

## T16 Current Status (2026-05-16 16:20)
- All phases 1–16 implemented. Debate mode working. UI refined.
- User confirmed: "It's fantastic. The debate is working."
- Known: Gemini occasionally gives guardrail responses; OpenRouter/Gemma works better.
- Bug: Participant badge sometimes doesn't update on session switch (fixed in 971c63c).

## Next Steps
1. **Continue T16 testing**: Participant session switching, debate mode with different models
2. **T16 future**: Mention autocomplete, parallel dispatch toggle, manual tool approval in council mode
3. Return to T15 Phase 3 (TabBar) when user is ready
4. T17 Phase 1: Backlinks + YAML tools

## Current Decisions
- Unified UI chosen over separate panels (user explicitly requested)
- All-or-nothing toggle REPLACED by individual checkbox dropdown (Phase 11)
- Sequential dispatch as default (parallel exists in code but not wired)
- **Tool calling in council mode: ENABLED** — uses AgentLoop with auto-approve only. Manual approval UI deferred.
- **Debate mode**: Round 1 all agents respond to user, Round 2 agents see each other's responses. PASS to skip.
- T15 tab bar deprioritized in favor of T16 group chat

## Session Context
- **Session**: 2026-05-16 afternoon/evening
- **Commits**: 49fd6aa → 971c63c (10 commits post-10:45)
- **Build status**: ✅ tsc + esbuild pass all commits
- **Pushed to**: origin/main
