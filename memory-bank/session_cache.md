# Session Cache
*Created: 2026-05-02 08:00:01 IST*
*Last Updated: 2026-05-23 23:54 IST*

**Started**: 2026-05-23 23:54 IST
**Focus Task**: T13 — Agentic Tool Calling (ContextEngine fixes, list_notes enhancement, count_notes accuracy)
**Session File**: `sessions/2026-05-23.md`
**Status**: T13 context overload fixes complete. Commits pushed.

## Overview

- Active: 4 | Paused: 2 | Completed: 11 | Cancelled: 0
- Last Session: 2026-05-17 (T18 Tavily+Exa; T16 profile switching fixes)
- Current Period: night

## Session History (Last 10)

1. `sessions/2026-05-23.md` — T13: Fixed folder context overload, enhanced `list_notes` (subfolders + depth), fixed `count_notes` accuracy. Commits: `6c396bb`, `d19de84`
2. `sessions/2026-05-17.md` — T18: Tavily + Exa providers; T16: Message metadata, profile dropdown switching, settingsTick fix, retry profile fix (5 commits)
3. `sessions/2026-05-16.md` — T16: Post-MVP refinement — Mobile UI, zen mode, participant dropdown, debate mode, participant persistence, session switching fixes (10 commits)
4. `sessions/2026-05-16.md` — T16: Group Chat MVP — MentionParser, Orchestrator, unified ChatApp, participant roster, council toggle, identity badges, handleSend fix
5. `sessions/2026-05-16.md` — T15: Phase 1 ✅ (Settings profile list), Phase 2 ✅ (Per-profile engine), UI overhaul, LLM naming
6. `sessions/2026-05-15.md` — T15/T16: CREATED — Tabbed chat & group chat tasks, architecture docs
7. `sessions/2026-05-14.md` — T13: COMPLETE — 4 new tools, AgentLoop extracted, PendingToolCard created
8. `sessions/2026-05-12.md` — T11: debug-log spam diagnosis; T2: queued persistence + load guard; T9: settings rewrite
9. `sessions/2026-05-09.md` — T13: crash debugging, patch_note, edit_section; T11: file logger, ErrorBoundary
10. `sessions/2026-05-08.md` — T13: basename resolution fix, diagnostics panel; T11: diagnostics UI

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
- T18: Web Search Tool for Chat — ✅

## Current Session Details

**Commits**: `6c396bb`, `d19de84`
**Files touched**: `src/context/ContextEngine.ts`, `src/agent/tools.ts`, `src/agent/ToolExecutor.ts`, `src/components/ChatApp.tsx`
**Build status**: ✅ tsc + esbuild pass
**Pushed to**: `origin/main`

### T13 — Context Engine Fixes
- `src/context/ContextEngine.ts` — Folder/tag context returns file listings + tool instructions instead of full file contents
- `src/agent/tools.ts` — `list_notes` gains `include_subfolders` and `depth` parameters
- `src/agent/ToolExecutor.ts` — `listNotes()` returns `subfolders` array; `countNotes()` reports 5-count breakdown
- `src/components/ChatApp.tsx` — `buildSystemPrompt()` describes enhanced capabilities

## User Feedback
- "Your context is overloaded. You've done enough work as is." — Session ended due to context compaction.
- Export feature request needs UI clarification.

## Next Steps
- Export feature: Needs exact UI location specification
- Issue #3: Token usage for tool calls (`stepTokenEstimates`)
- Issue #4: Agent dropdown click-outside handler
- Issue #2: Tool-call streaming ContentPart cleanup
- T17 Phase 1: Backlinks + YAML tools (user-prioritized)
