# Active Context

*Last Updated: 2026-05-15 09:57 IST*

## Current Focus
**Primary Task:** T15 — Tabbed Chat Interface with Multi-Profile
**Secondary Tasks:** T14 (Remote Agent — Tailscale integration test), T16 (Group Chat — pending T15)

## Active Tasks
- [T14]: 🔄 **IN PROGRESS** — Phase 3 integration test. Tailscale 2/3 complete. ufw IPv4 fixed. Connection test initiated, Obsidian hanging on response parsing (agent hallucinating note names with Gemini provider — separate issue).
- [T15]: 🔄 **IN PROGRESS** — Design complete. Architecture: per-panel `profileId`, tab bar UI, Settings profile list view. 6 phases defined. Awaiting implementation approval.
- [T16]: ⏸️ **PENDING** — Blocked on T15. Architecture designed: mention-based routing, Orchestrator class, sequential/parallel modes, full/isolated context strategies.
- [T17]: ⏸️ **PENDING** — Advanced vault tools architecture complete. User-prioritized: backlinks + YAML first. 6 phases: Networked Thought, YAML Properties, Tags, Bulk Ops, Templating, Maintenance.
- [T13]: ✅ **COMPLETED** — All 13 tools, AgentLoop, PendingToolCard. **2026-05-15 fixes**: full path rendering in `list_notes`/`search_notes`/`get_note_metadata`; removed broken `search_content` param; `list_folders` depth consistency; `resolveNote` ambiguity detection with `warning` field in `ToolResult`.
- [T11]: ✅ **COMPLETED**

## Implementation Focus
`src/settings.ts`, `src/components/SettingsPanel.tsx` (profile list view), `src/components/ProfileCard.tsx`, `src/components/TabBar.tsx`, `src/components/ChatApp.tsx`, `src/hooks/useChat.ts`, `src/core/ChatEngine.ts`

## Task-Specific Context

### Task T15 — Tabbed Chat Interface
**Goal:** Transform single-profile chat into multi-panel, multi-provider interface.
**Key change:** Settings UI must display ALL enabled profiles with providers and API keys, not just the selected one.
**Architecture:**
- `ChatEngine` accepts optional `profileId` prop
- `useChat` hook accepts optional `profileId`, falls back to global default
- `ChatApp` renders `TabBar` with per-profile tabs
- Settings: `ProfileCard` list with add/edit/delete/test buttons
- Conversation history: namespaced by `profileId` in `localStorage`

**Settings UI changes:**
- New "Profiles" section with list view
- Each card: provider icon + name + model/endpoint + auth status + masked API key
- Add Profile → provider picker → profile form
- Edit → inline form expansion
- Delete → confirmation dialog
- Test Connection → per-profile health check
- Set as Default → star icon

### Task T16 — Group Chat (Multi-Agent)
**Goal:** Single conversation with multiple agents responding.
**Orchestration strategies:**
1. **Mention-based** (MVP): `@Cloudy fetch arxiv` → only Cloudy responds
2. **Round-robin**: Each agent gets a turn
3. **Parallel**: All agents respond simultaneously
4. **All-at-once**: All agents see the same prompt, respond concurrently

**Context sharing:**
- Full Transparency (default): Agents see each other's responses
- Isolated: Each agent only sees user + own messages

**Tool execution:**
- Per-agent attribution: "☁️ Cloudy wants to read `Note.md`"
- File-level locking for concurrent edits
- Tool results returned to requesting agent only

## Current Decisions
- T15 is prerequisite for T16. Tab infrastructure must exist before group orchestration.
- Settings UI overhaul is part of T15 Phase 1, not a separate task.
- Profile list view replaces the current single-profile settings form.
- Lazy engine init: inactive tabs don't maintain SSE connections.

## Next Steps
1. Get user approval on T15 architecture
2. Begin T15 Phase 1: Settings UI profile list view
3. Begin T15 Phase 2: Core data model (`profileId` in ChatEngine/useChat)
4. T14: Continue debugging Obsidian → agent connection (separate from T15/16)
