# Session Cache
*Created: 2026-05-02 08:00:01 IST*
*Last Updated: 2026-05-17 12:45 IST*

**Started**: 2026-05-17 11:00 IST
**Focus Task**: T16 Group Chat — Profile switching fixes, message metadata; T18 Web Search — Tavily + Exa
**Session File**: `sessions/2026-05-17.md`
**Status**: T18 complete (5 providers). T16 profile switching working. Build passes. Pushed.

## Overview

- Active: 4 | Paused: 2 | Completed: 10 | Cancelled: 0
- Last Session: 2026-05-16 morning (T15 Phases 1–2, UI overhaul, LLM naming)
- Current Period: afternoon

## Session History (Last 10)

1. `sessions/2026-05-17.md` — T18: Tavily + Exa providers; T16: Message metadata, profile dropdown switching, settingsTick fix, retry profile fix (5 commits)
2. `sessions/2026-05-16.md` — T16: Post-MVP refinement — Mobile UI, zen mode, participant dropdown, debate mode, participant persistence, session switching fixes (10 commits)
2. `sessions/2026-05-16.md` — T16: Group Chat MVP — MentionParser, Orchestrator, unified ChatApp, participant roster, council toggle, identity badges, handleSend fix
3. `sessions/2026-05-16.md` — T15: Phase 1 ✅ (Settings profile list), Phase 2 ✅ (Per-profile engine), UI overhaul, LLM naming
3. `sessions/2026-05-15.md` — T15/T16: CREATED — Tabbed chat & group chat tasks, architecture docs
4. `sessions/2026-05-14.md` — T13: COMPLETE — 4 new tools, AgentLoop extracted, PendingToolCard created
5. `sessions/2026-05-12.md` — T11: debug-log spam diagnosis; T2: queued persistence + load guard; T9: settings rewrite
6. `sessions/2026-05-09.md` — T13: crash debugging, patch_note, edit_section; T11: file logger, ErrorBoundary
7. `sessions/2026-05-08.md` — T13: basename resolution fix, diagnostics panel; T11: diagnostics UI
8. `sessions/2026-05-07-morning.md` — T14: remote agent connectivity design; memory bank update
9. `sessions/2026-05-06.md` — T13: agentic tool calling MVP foundation; settings panel wiring
10. `sessions/2026-05-04-night.md` — T10: model cache fix; T6: token estimator, maxContextMessages

## Task Registry

- META-1: Memory Bank Setup and Maintenance — 🔄
- T1: Chat Panel (ItemView + React UI) — ✅
- T2: Conversation Chain & Memory — ✅
- T3: Context & Mentions System — ✅
- T4: Streaming — ✅
- T5: In-Place Note Editing from Chat — ✅
- T6: Token & Context Management — ✅
- T7: Release System & CI/CD — ✅
- T8: Open Source Release with Branding — 🔄
- T9: Settings & Provider Profiles — ✅
- T10: Model Discovery & Picker UX — ✅
- T11: Debug Logging & Diagnostics — 🔄
- T12: Chat Onboarding, Tips & Empty States — ⏸️
- T13: Agentic Tool Calling for Note Editing — ✅
- T14: Remote Agent Connectivity (OpenResponses) — 🔄
- T15: Tabbed Chat Interface with Multi-Profile — 🔄 (Phases 1–2 complete, Phase 3 paused)
- T16: Group Chat (Multi-Agent Conversation) — 🔄 (Phases 1–16 complete, debate mode working)
- T17: Advanced Vault Tools — Backlinks, YAML, Bulk Ops — ⏸️

## Current Session Details

**Commits**: 189b655 → 64276ca (6 commits post-May 16 23:30)
**Files touched**: 7 files
**Build status**: ✅ tsc + esbuild pass all commits
**Pushed to**: `origin/main`

### T18 Web Search — Tavily + Exa Providers (d3c8d8b)
- `src/agent/ToolExecutor.ts` — `searchTavily()`, `searchExa()` implementations
- `src/settings.ts` — Tavily/Exa API keys, dropdown options
- Total providers: 5 (DuckDuckGo, Brave, Tavily, Exa, SearXNG)

### T16 Group Chat — Message Metadata (fa060c1)
- `src/types.ts` — `modelName`, `responseTimeMs` fields on `ChatMessage`
- `src/components/ChatApp.tsx` — stream timing tracking
- `src/components/MessageBubble.tsx` — metadata row rendering
- `styles.css` — `.chat-message-metadata` styling

### T16 Group Chat — Profile Dropdown Switching (7ddeeca)
- `src/components/ChatApp.tsx` — radio buttons in 1:1 mode, profile switch logic
- `src/components/ActionBar.tsx` — badge always shows ≥1

### T16 Group Chat — settingsTick Fix (f0e5471)
- `src/components/ChatApp.tsx` — increment settingsTick on profile switch

### T16 Group Chat — Retry Profile Fix (64276ca)
- `src/components/ChatApp.tsx` — add `resolvedProfile` to handleSend deps

### Participant Persistence (35f76e8, 7e485a7, 971c63c)
- Sessions store `participants` and `isGroupChat` flag
- Participants survive plugin reloads
- Sync on session switch with race condition fix (setParticipants before setActiveSessionId)

### UI Overhaul (49fd6aa, d93f9c1, f0cd52f)
- Zen mode: hides all chrome, floating exit button
- Mobile-responsive: tighter padding, wider bubbles, always-visible message actions
- Participant dropdown: checkbox list of all profiles with colored dots
- ActionBar: horizontally scrollable on mobile, participant badge integrated

## User Feedback
- "It's fantastic. The debate is working."
- Gemini occasionally gives guardrail responses; OpenRouter/Gemma works better.
- Participant switch bug discovered and fixed (race condition).
- User requested memory bank update to record all work.

## Next Steps
- Continue T16 testing with different model combinations
- T16 future: Mention autocomplete, parallel dispatch toggle, manual tool approval in council mode
- Return to T15 Phase 3 (TabBar) when user ready
- T17 Phase 1: Backlinks + YAML tools
