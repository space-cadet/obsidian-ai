# Active Context

*Last Updated: 2026-06-13 07:35 IST*

## Current Focus
**Ad-hoc session fixes (June 13, 2026)**
- @-mention folder visibility fixed (balanced candidate mix when no query)
- Token usage totals added (session picker + running total below input)
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
- **@-mention dropdown**: When no query typed, shows balanced mix (7 notes + 5 folders + 5 tags) instead of just first 10 notes
- **Token usage totals**: `getSessionTotalTokens()` helper; displayed in SessionPickerModal and below ChatInput in both ChatApp and GroupChatApp
- **Mobile background**: Documented OS limitation — webview suspends when app backgrounded, streams and tool calls cannot continue

## Next Steps
1. **T22 Phase 4**: Extract session/settings/export handlers
2. **T22 Phase 5**: Extract layout sub-components
3. **T17 Phase 1**: Backlinks + YAML tools (user-prioritized)
4. **T11 follow-up**: User verification of startup fix
5. **Dot folder access**: Return to `.memory` folder investigation when user is ready

## Session Context
- **Session**: 2026-06-13 (ended 07:35 IST)
- **Duration**: ~25 minutes
- **Commits**: `44c1dc9` pushed to origin/main
- **Build status**: ✅ tsc + esbuild pass
- **User context**: User at hospital, father unwell. Working on mobile.
