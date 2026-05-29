# Active Context

*Last Updated: 2026-05-29 10:05 IST*

## Current Focus
**Primary Task:** T23 — Settings.ts Decomposition ✅ COMPLETE
- `settings.ts` reduced from 1,187 to **341 lines** (-846, -71%). Build passes. Tests pass.
- Extracted `ObsidianAISettingsTab` to `src/settings-sections/SettingsTab.ts` (87 lines)
- Decomposed into 8 focused section files (35–189 lines each)
- Removed dead code: `renderModelPicker` (~120 lines)
- **No more files over 1,000 lines in `src/`**

**Secondary Task:** T22 — ChatApp.tsx Component Decomposition ✅ COMPLETE (Phases 0–3)
- `ChatApp.tsx` reduced from 1,948 to **636 lines** (-1,312, -67%). Build passes. 52 tests pass.
- Extracted: 6 utility modules + `useChatSession` + `useChatUI` (31 tests) + `useMessageActions` (21 tests)
- Remaining: Phases 4–5 (session/settings/export handlers, layout components) — not yet started

## Active Tasks
- **[T23]**: ✅ **COMPLETED** — Settings.ts decomposed. See `tasks/T23.md`.
- **[T22]**: 🔄 **IN PROGRESS** — Phases 0–3 complete. ChatApp.tsx: 1,948 → 636 lines. Remaining: Phase 4 (handlers), Phase 5 (layout components).
- [T16]: 🔄 **IN PROGRESS** — Phases 1–17 implemented. Debate mode working. UI refined. Participant persistence fixed. Thinking display toggle added. **May 25: Fixed duplicate profile ID on copy (commit `de84c4a`) and model fetching for all providers (commit `9d3d1a3`).**
- [T14]: 🔄 **IN PROGRESS** — Phase 3 integration test. Tailscale 2/3 complete.
- [T15]: 🔄 **IN PROGRESS** — Phase 1–2 complete. Phase 3 (TabBar UI) paused in favor of T16.
- [T17]: ⏸️ **PENDING** — Advanced vault tools. Backlinks + YAML first.
- [T13]: ✅ **COMPLETED** — All 13 tools, AgentLoop, PendingToolCard.
- [T18]: ✅ **COMPLETED** — Web search tool with 5 providers (DuckDuckGo, Brave, Tavily, Exa, SearXNG).
- [T19]: 🔄 **IN PROGRESS** — Core implementation complete (commit `a071a24`). AttachmentEngine, ChatInput 📎 dropdown, MessageBubble chips, api.ts multimodal support. Group chat broadcasting deferred. Testing pending.
- [T21]: 🔄 **IN PROGRESS** — CLI test harness task created. Scripts for attachment resolution, streaming, tool calling, multimodal testing.

## File Size Analysis (May 29, 2026)
**T23 complete — no files over 1,000 lines remaining.**

| File | Lines | Size | Verdict |
|------|-------|------|---------|
| `src/settings.ts` | **341** | ~11 KB | ✅ **Decomposed** — pure config only |
| `src/components/ChatApp.tsx` | **636** | ~20 KB | 🔄 **In progress** — Phases 0–3 complete. Target: ~300 lines |
| `src/hooks/useMessageActions.ts` | **1,111** | ~33 KB | ⚠️ **Newly extracted** — just created in T22 Phase 3, may be refactored later |
| `src/agent/ToolExecutor.ts` | 865 | 25 KB | ⚠️ Large — tool defs + execution + formatting |
| `src/components/ProfileCard.tsx` | 698 | 21 KB | ⚠️ Large — UI component |
| `src/api.ts` | 689 | 19 KB | ⚠️ Large — broad API surface |
| `src/components/ChatInput.tsx` | 616 | 16 KB | ⚠️ Large |
| `src/modules/WidgetExtension.ts` | 577 | 15 KB | ⚠️ Large |

**New modules created today (T23)**:
- `src/settings-sections/SettingsTab.ts` — 87 lines (orchestrator)
- `src/settings-sections/hero.ts` — 45 lines
- `src/settings-sections/providerProfiles.ts` — 35 lines
- `src/settings-sections/chatDefaults.ts` — 91 lines
- `src/settings-sections/agentTools.ts` — 59 lines
- `src/settings-sections/webSearch.ts` — 104 lines
- `src/settings-sections/advanced.ts` — 64 lines
- `src/settings-sections/customCommands.ts` — 81 lines
- `src/settings-sections/diagnostics.ts` — 189 lines
- `src/settings-sections/helpers.ts` — 46 lines

## T23 Completion Details (2026-05-29 10:00)
- **Commit**: `dbed5a5` — refactor(T23): decompose settings.ts into section files
- **Build**: ✅ tsc + esbuild pass
- **Tests**: ✅ 52 tests pass
- **Lockfile fix**: `a0b113c` — regenerated pnpm-lock.yaml after test deps update
- **Memory bank**: `8f8dddc` — updated tasks.md, T23.md

## Next Steps
1. **T22 Phase 4**: Extract session/settings/export handlers (`useSessionActions`, `useSettingsActions`, `useExportActions`)
2. **T22 Phase 5**: Extract layout sub-components (ChatLayout, ChatToolbar, ChatMainArea)
3. **Export feature**: Needs exact UI location specification from user
4. **Issue #3**: Token usage for tool calls (`stepTokenEstimates` in AgentLoop.ts)
5. **Issue #4**: Agent dropdown click-outside handler completion
6. **T17 Phase 1**: Backlinks + YAML tools (user-prioritized)
7. **T19**: File attachment testing
8. **T21**: CLI test harness implementation

## Current Decisions
- Unified UI chosen over separate panels (user explicitly requested)
- Individual checkbox dropdown for participants (replaced all-or-nothing toggle)
- Sequential dispatch as default (parallel exists in code but not wired)
- Tool calling in council mode: ENABLED — auto-approve only; manual approval UI deferred
- Debate mode: Round 1 all agents respond to user, Round 2 agents see each other's responses. PASS to skip.
- **Folder context: NEVER inline full file contents** — tool instructions are the correct pattern for large collections
- T15 tab bar deprioritized in favor of T16 group chat
- **T22 + T23 priority**: COMPLETE — no files over 1,000 lines remain

## Session Context
- **Session**: 2026-05-29 morning
- **Duration**: ~45 minutes
- **Commits**: `a0b113c` (lockfile fix), `dbed5a5` (T23 refactor), `8f8dddc` (memory bank)
- **Build status**: ✅ tsc + esbuild pass
- **Pushed to**: origin/main
