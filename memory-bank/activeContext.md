# Active Context

*Last Updated: 2026-05-16 09:45:00 IST*

## Current Focus
**Primary Task:** T16 — Group Chat (Multi-Agent Conversation) — MVP COMPLETE
**Secondary Tasks:** T15 (Tabbed Chat — Phases 1–2 done, Phase 3 paused), T14 (Remote Agent)

## Active Tasks
- [T16]: 🔄 **IN PROGRESS** — MVP implemented: MentionParser, Orchestrator, unified ChatApp with council mode, participant roster, identity badges, handleSend fix. User confirmed working.
- [T14]: 🔄 **IN PROGRESS** — Phase 3 integration test. Tailscale 2/3 complete.
- [T15]: 🔄 **IN PROGRESS** — Phase 1–2 complete. Phase 3 (TabBar UI) paused in favor of T16.
- [T17]: ⏸️ **PENDING** — Advanced vault tools. Backlinks + YAML first.
- [T13]: ✅ **COMPLETED** — All 13 tools, AgentLoop, PendingToolCard.

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

## T15 Status (Paused for T16)
- Phase 1 (Settings profile list) ✅ COMPLETE
- Phase 2 (Per-profile engine) ✅ COMPLETE
- Phase 3 (TabBar UI) ⏸️ PAUSED — user chose T16 first

## Next Steps
1. T16 Phase 10: Individual add/remove participants (not all-or-nothing)
2. T16 Phase 11: Mention autocomplete (@ dropdown)
3. T16 Phase 6: Parallel dispatch mode toggle
4. T16 Phase 9: Session persistence for council chats
5. Return to T15 Phase 3 when user is ready

## Current Decisions
- Unified UI chosen over separate panels (user explicitly requested)
- All-or-nothing toggle as MVP (individual add/remove is future)
- Sequential dispatch as default (parallel exists in code but not wired)
- No tool calling in council mode yet (requires attribution + locking)
- T15 tab bar deprioritized in favor of T16 group chat

## Session Context
- **Session**: 2026-05-16 afternoon
- **Commits**: 36db2ff → 9ecb0ed (4 commits)
- **Build status**: ✅ tsc + esbuild pass all commits
- **Pushed to**: origin/main
