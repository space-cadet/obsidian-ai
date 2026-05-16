# Active Context

*Last Updated: 2026-05-16 07:56:00 IST*

## Current Focus
**Primary Task:** T15 — Tabbed Chat Interface with Multi-Profile
**Secondary Tasks:** T14 (Remote Agent), T16 (Group Chat — pending T15)

## Active Tasks
- [T14]: 🔄 **IN PROGRESS** — Phase 3 integration test. Tailscale 2/3 complete. ufw IPv4 fixed.
- [T15]: 🔄 **IN PROGRESS** — Phase 1 (Settings profile list) ✅ COMPLETE. Phase 2 (Per-profile engine) ✅ COMPLETE. Awaiting Phase 3 (TabBar UI) implementation approval.
- [T16]: ⏸️ **PENDING** — Blocked on T15.
- [T17]: ⏸️ **PENDING** — Advanced vault tools. Backlinks + YAML first.
- [T13]: ✅ **COMPLETED** — All 13 tools, AgentLoop, PendingToolCard. v3 auto-naming: toggle reactivity, context-aware naming, wand icon. **2026-05-16**: LLM-powered naming replaces heuristic.

## T15 Progress Update (2026-05-16)

### Phase 1: Settings UI — Profile List View ✅ COMPLETE
- `ProfileCard.tsx` component created with React-based profile list
- Each row: provider icon, name, model, endpoint, masked key, status dot, actions
- Actions: Edit (inline form with model picker), Duplicate, Test, Set Default (star), Delete
- Responsive: progressive disclosure via media queries (model @ 500px, endpoint @ 650px)
- CSS: flex-shrink, ellipsis truncation, overflow-x: auto, mobile stacking under 420px

### Phase 2: Core Data Model — Per-Panel Profile ✅ COMPLETE
- `ChatSession` type: added `profileId?: string`
- `ChatApiManager.callApi/streamChat/streamChatWithTools`: optional `profile` parameter
- `AgentLoop`: accepts `profile` in options, passes to API
- `ChatApp`: accepts `profileId` prop, `resolvedProfile` useMemo (explicit → session → active)
- `ObsidianAIChatView`: accepts `options: { profileId?: string }` via constructor
- All session creation points set `profileId`

### UI Overhaul (2026-05-16)
- **Teal theme**: `#0d9488` replaces purple across chat UI, settings, profile components
- **Lucide icons**: `ObsidianIcon` wrapper for Obsidian's `setIcon()` — real icons in React
- **ProfileIndicator**: chip showing provider color dot + icon + name + model in action bar right
- **Session title**: displayed in action bar center with ellipsis truncation
- **ActionBar**: left/center/right layout with icon buttons

### LLM-Powered Naming (2026-05-16)
- `generateSessionTitleLLM()`: calls active LLM with 3–6 word title prompt
- Sends first 6 messages (200 char cap each), strips artifacts
- Manual rename (wand): shows "🪄 Asking model…", LLM first, heuristic fallback
- Auto-name: LLM naming with `Set` dedup (`llmNamedRef`) to avoid re-calling
- Token cost: ~200–400 per naming call

## Next Steps
1. Phase 3: TabBar UI component (user approved to continue)
2. Phase 4: Per-tab localStorage isolation
3. Phase 5–6: Integration test with multiple providers

## Current Decisions
- T15 Phase 1 & 2 complete without approval bottlenecks (user was actively testing)
- LLM naming approved as replacement for heuristic naming
- Teal theme approved over purple
- TabBar architecture: internal tabs within ChatApp, not separate Obsidian panes
