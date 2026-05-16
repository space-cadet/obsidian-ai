# Edit History
*Created: 2026-05-02 08:00:01 IST*
*Last Updated: 2026-05-16 09:45:00 IST*

---

## Edit Chunk: 2026-05-16 09:30:00 IST — T16: Fix handleSend Dependency Array
**Session**: `sessions/2026-05-16.md`
**Source Branch**: main
**Source Commit**: `9ecb0ed`
**Task**: T16

### Files Modified
- `src/components/ChatApp.tsx` — handleSend dependency array: [isStreaming, plugin] → [isStreaming, plugin, orchestrator, isGroupChat, participants, typingAgents]
- `src/components/ChatApp.tsx` — handleRetry dependency array: added orchestrator, isGroupChat, participants

### Context
handleSend had `[isStreaming, plugin]` as React useCallback deps, which captured a stale orchestrator closure. After removing a participant from the roster, handleSend still dispatched to the removed agent because it held the old Orchestrator instance. Fixed by including orchestrator, isGroupChat, participants, typingAgents in the dependency array.

---

## Edit Chunk: 2026-05-16 09:15:00 IST — T16: Unified ChatApp with Participant Roster
**Session**: `sessions/2026-05-16.md`
**Source Branch**: main
**Source Commit**: `70d1e19`
**Task**: T16

### Files Modified
- `src/components/ChatApp.tsx` — merged group chat into same panel: imports, participant state, orchestrator useMemo, handleSend branches, handleAddParticipant, handleRemoveParticipant, handleToggleGroupChat, participant bar UI
- `src/components/ChatApp.tsx` — helper functions: getAgentColor(provider), getAgentIcon(provider)
- `styles.css` — .chat-participant-bar, .chat-participant-chip, .chat-participant-chip-name, .chat-participant-typing (chat-typing-pulse), .chat-participant-remove, .chat-council-toggle, .chat-council-toggle-label

### Context
User explicitly requested same ChatApp panel for both 1:1 and group chat. Council toggle switches between modes. Participant bar shows chips with icon, name, typing indicator, and remove button.

---

## Edit Chunk: 2026-05-16 09:20:00 IST — T16: Fix main.ts CHAT_VIEWTYPE Registration
**Session**: `sessions/2026-05-16.md`
**Source Branch**: main
**Source Commit**: `863064f`
**Task**: T16

### Files Modified
- `src/main.ts` — restored CHAT_VIEWTYPE registration alongside GROUP_CHAT_VIEWTYPE

### Context
Group chat view registration accidentally replaced the regular chat view registration, breaking both panels. Both are now registered separately.

---

## Edit Chunk: 2026-05-16 09:00:00 IST — T16: Group Chat MVP
**Session**: `sessions/2026-05-16.md`
**Source Branch**: main
**Source Commit**: `36db2ff`
**Task**: T16

### Files Created
- `src/agent/MentionParser.ts` — parseMentions(), hasMentions() with @AgentName regex
- `src/agent/Orchestrator.ts` — Orchestrator class: sequential dispatch, full/isolated context strategies, profile resolution
- `src/views/GroupChatView.ts` — GROUP_CHAT_VIEWTYPE ItemView with React root
- `src/components/GroupChatApp.tsx` — participant roster, typing indicators, council rendering

### Files Modified
- `src/types.ts` — ChatMessage: +agentId, +agentName, +agentColor; +GroupChatParticipant; ChatSession: +isGroupChat, +participants
- `src/components/MessageBubble.tsx` — agent identity dot (colored) + agentName display
- `src/main.ts` — registerView(GROUP_CHAT_VIEWTYPE), addRibbonIcon("users"), addCommand("open-ai-council")
- `styles.css` — .group-chat-roster, .group-chat-participant, .group-chat-typing (pulse animation), .chat-bubble-agent-dot

---

## Edit Chunk: 2026-05-16 07:56:00 IST — T15 Phase 1 & 2, UI Overhaul, LLM Naming
**Session**: `sessions/2026-05-16.md`
**Source Branch**: main
**Source Commit**: `6fa3da9` → `0c9ebd8` (8 commits)
**Task**: T15

### Files Created
- `src/components/ProfileCard.tsx` — React profile list component
- `src/components/ObsidianIcon.tsx` — Lucide icon wrapper for React
- `src/components/ProfileIndicator.tsx` — Profile chip for action bar

### Files Modified
- `src/settings.ts` — Export helpers, React mount
- `src/types.ts` — ChatSession.profileId
- `src/api.ts` — Optional profile parameter on API methods
- `src/agent/AgentLoop.ts` — Profile in options
- `src/components/ChatApp.tsx` — profileId prop, resolvedProfile, generateSessionTitleLLM()
- `src/components/ActionBar.tsx` — Icon-only compact layout, left/center/right
- `src/views/ObsidianAIChatView.ts` — Options constructor param
- `src/main.ts` — Pass {} options
- `styles.css` — Teal theme, profile list, participant bar, council toggle

---

## Edit Chunk: 2026-05-15 12:55:00 IST — Auto-naming v3: Toggle Reactivity + Context-Aware Naming
**Session**: `sessions/2026-05-15.md`
**Source Branch**: main
**Source Commit**: `23e38e9` → `e23063a`
**Task**: T13

### Files Modified
- `src/components/ChatApp.tsx` — Local React state for toggles, context-aware naming (2 user + 2 assistant messages)
- `src/components/ActionBar.tsx` — Distinct toggle styling (dashed when OFF)
- `styles.css` — Toggle button dashed/solid states

---

## Edit Chunk: 2026-05-15 12:45:00 IST — Auto-naming v2: Smart Titles + Icon ActionBar
**Session**: `sessions/2026-05-15.md`
**Source Branch**: main
**Source Commit**: `d1d64ad`
**Task**: T13

### Files Modified
- `src/components/ChatApp.tsx` — generateSessionTitle() with sentence extraction, stop word removal, word-boundary truncation
- `src/components/ActionBar.tsx` — Compact icon-only buttons with title tooltips
- `styles.css` — Compact action bar styles

---

## Edit Chunk: 2026-05-15 12:10:00 IST — Auto-naming Fixes: g Flag, Threshold, UI Controls
**Session**: `sessions/2026-05-15.md`
**Source Branch**: main
**Source Commit**: `4538159`
**Task**: T13

### Files Modified
- `src/components/ChatApp.tsx` — `g` flag on replace(), threshold lowered to >= 1, date-fallback guard removed
- `src/components/ActionBar.tsx` — Auto-name toggle, manual rename button

---

## Edit Chunk: 2026-05-15 10:30:00 IST — T17: Advanced Vault Tools Task Created
**Session**: `sessions/2026-05-15.md`
**Source Branch**: main
**Source Commit**: N/A (task creation)
**Task**: T17

### Files Created
- `memory-bank/tasks/T17.md` — Advanced Vault Tools (6 phases)
- Updated `tasks.md`, `activeContext.md`, `session_cache.md`

---

## Edit Chunk: 2026-05-15 10:15:00 IST — T13: Tool Result Rendering and Schema Fixes
**Session**: `sessions/2026-05-15.md`
**Source Branch**: main
**Source Commit**: `731e1dc`
**Task**: T13

### Files Modified
- `src/agent/AgentLoop.ts` — Full path rendering in tool results
- `src/agent/ToolExecutor.ts` — Removed broken search_content param
- `src/agent/tools.ts` — Removed search_content from Zod schema
- `src/agent/types.ts` — Type updates

---

## Edit Chunk: 2026-05-15 09:57:00 IST — T15/T16: Task Creation and Architecture Design
**Session**: `sessions/2026-05-15.md`
**Source Branch**: main
**Source Commit**: N/A (task creation)
**Task**: T15, T16

### Files Created
- `memory-bank/tasks/T15.md` — Tabbed Chat Interface with Multi-Profile Support
- `memory-bank/tasks/T16.md` — Group Chat (Multi-Agent Conversation)
- `memory-bank/edits/2026-05-15/20250515-095700-t15-t16-task-creation.md`

### Files Modified
- `memory-bank/tasks.md` — Added T15 and T16 to registry
- `memory-bank/activeContext.md` — Updated focus to T15
- `memory-bank/session_cache.md` — Updated task registry

---

## Edit Chunk: 2026-05-15 06:45:00 IST — T14: Tailscale Progress Update
**Session**: `sessions/2026-05-15.md`
**Source Branch**: main
**Source Commit**: N/A
**Task**: T14

### Files Modified
- `memory-bank/activeContext.md` — T14a status updated to IN PROGRESS (2/3 complete)
- `memory-bank/tasks/T14.md` — Phase 3 status updated to in progress

### Context
Cloudy migration to DO VPS completed. Tailscale installed on MacBook and VPS. ufw blocking IPv4 Tailscale traffic identified as blocker.

---

## Edit Chunk: 2026-05-14 09:19:00 IST — T13: Complete (All 13 Tools + AgentLoop + PendingToolCard)
**Session**: `sessions/2026-05-14.md`
**Source Branch**: main
**Source Commit**: `731e1dc`
**Task**: T13

### Files Created
- `src/agent/AgentLoop.ts` — Extracted from ChatApp
- `src/components/PendingToolCard.tsx` — Compact expandable inline tool cards

### Files Modified
- `src/agent/tools.ts` — 13 tools implemented
- `src/components/ChatApp.tsx` — Integrated AgentLoop, PendingToolCard
- `src/agent/types.ts` — Tool types

---

*Full edit history available in `edits/` directory. Regenerated 2026-05-16 09:45:00 IST.*
