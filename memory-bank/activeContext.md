# Active Context

*Last Updated: 2026-06-13 09:53 IST*

## Current Focus
**Ad-hoc session fixes (June 13, 2026)**
- @-mention dropdown: removed 10-item limit, flat list ordered by match quality, full folder paths shown
- Mention pills: styled highlights in message bubbles + real-time overlay while typing
- Token total: moved inline next to attachment/thinking toggles (no extra line)
- Mobile background execution documented in README

## Active Tasks
- **[T11]**: 🔄 **IN PROGRESS** — Log size limit, startup crash fix, CI/CD archive fix. User to verify startup fix.
- **[T22]**: 🔄 **IN PROGRESS** — Phases 0–3 complete. ChatApp.tsx: 1,948 → 636 lines.
- **[T16]**: 🔄 **IN PROGRESS** — Phases 1–17 implemented. Debate mode working.
- **[T14]**: 🔄 **IN PROGRESS** — Phase 3 integration test.
- **[T15]**: 🔄 **IN PROGRESS** — Phase 1–2 complete. Phase 3 (TabBar UI) paused.
- **[T17]**: ⏸️ **PENDING** — Advanced vault tools. Backlinks + YAML first.
- **[T8]**: 🔄 **IN PROGRESS** — Open source release prep.
- **[T13]**: ✅ **COMPLETED**
- **[T18]**: ✅ **COMPLETED**
- **[T19]**: ✅ **COMPLETED**
- **[T21]**: ✅ **COMPLETED**
- **[T23]**: ✅ **COMPLETED**

## New Decisions (This Session)
- **@-mention dropdown**: No 10-item limit; flat list ordered by match quality score; full folder paths shown
- **Mention pills**: DOM-highlighted context item names in message bubbles + real-time textarea overlay
- **Token total**: Inline display next to 📎/💤 toggles via ChatInput `tokenTotal` prop
- **Mobile background**: Documented OS limitation — webview suspends when app backgrounded

## Commits (This Session)
- `3e7fc9a` — fix: show full folder path in @-mention dropdown
- `af5b3cd` — feat: flat mention dropdown, mention pills, inline token total
- `9349456` — feat: mention pills in textarea while typing

## Next Steps
1. **T22 Phase 4**: Extract session/settings/export handlers
2. **T22 Phase 5**: Extract layout sub-components
3. **T17 Phase 1**: Backlinks + YAML tools (user-prioritized)
4. **T11 follow-up**: User verification of startup fix
5. **Dot folder access**: Return to `.memory` folder investigation when user is ready

## Session Context
- **Session**: 2026-06-13 (ended 09:53 IST)
- **Duration**: ~2.75 hours
- **Build status**: ✅ tsc + esbuild pass (all three commits)
- **User context**: User at hospital, father unwell. Working on mobile.
