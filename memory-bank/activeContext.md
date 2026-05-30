# Active Context

*Last Updated: 2026-05-30 10:17 IST*

## Current Focus
**T19 — File Attachments: COMPLETED (May 30, 2026)**
- Edit mode now restores `msg.attachments` and `msg.contextItems`
- ChatInput layout refactored: buttons moved below textarea, pin button removed
- `pressEnterToSend` setting added (default: true)
- Reasoning content bug with Kimi-k2.6 partially fixed (still happening in some cases — deferred to next session)
- User testing at 10:17 IST: approved "much better than before" — ChatInput layout confirmed good
- Commits: `baf7b39`, `653d84b`, `8f6b94a` pushed to origin/main

## Active Tasks
- **[T22]**: 🔄 **IN PROGRESS** — Phases 0–3 complete. ChatApp.tsx: 1,948 → 636 lines. Remaining: Phase 4 (handlers), Phase 5 (layout components).
- **[T16]**: 🔄 **IN PROGRESS** — Phases 1–17 implemented. Debate mode working. UI refined. Participant persistence fixed. Thinking display toggle added.
- **[T14]**: 🔄 **IN PROGRESS** — Phase 3 integration test. Tailscale 2/3 complete.
- **[T15]**: 🔄 **IN PROGRESS** — Phase 1–2 complete. Phase 3 (TabBar UI) paused in favor of T16.
- **[T17]**: ⏸️ **PENDING** — Advanced vault tools. Backlinks + YAML first.
- **[T13]**: ✅ **COMPLETED** — All 13 tools, AgentLoop, PendingToolCard.
- **[T18]**: ✅ **COMPLETED** — Web search tool with 5 providers.
- **[T19]**: ✅ **COMPLETED** — Core implementation complete. Edit mode attachment restoration fixed. ChatInput layout refactored.
- **[T21]**: ✅ **COMPLETED** — E2E test suite with 26 tests.
- **[T23]**: ✅ **COMPLETED** — Settings.ts decomposed.

## File Size Analysis (May 30, 2026)
| File | Lines | Size | Verdict |
|------|-------|------|---------|
| `src/settings.ts` | **341** | ~11 KB | ✅ Decomposed — pure config only |
| `src/components/ChatApp.tsx` | **636** | ~20 KB | 🔄 In progress — Phases 0–3 complete |
| `src/hooks/useMessageActions.ts` | **1,111** | ~33 KB | ⚠️ Large — just extracted in T22 |
| `src/agent/ToolExecutor.ts` | 865 | 25 KB | ⚠️ Large |
| `src/components/ProfileCard.tsx` | 698 | 21 KB | ⚠️ Large |
| `src/api.ts` | 689 | 19 KB | ⚠️ Large |
| `src/components/ChatInput.tsx` | ~400 | ~13 KB | ✅ Refactored — layout improved, buttons moved below |
| `src/modules/WidgetExtension.ts` | 577 | 15 KB | ⚠️ Large |

## Next Steps
1. **Thinking error follow-up**: Kimi-k2.6 still throws `reasoning_content is missing` in some cases. Needs deeper investigation into how Vercel AI SDK handles reasoning with tool calls.
2. **T22 Phase 4**: Extract session/settings/export handlers
3. **T22 Phase 5**: Extract layout sub-components
4. **T17 Phase 1**: Backlinks + YAML tools (user-prioritized)
5. **Export feature**: Needs exact UI location specification from user

## Current Decisions
- **Pin current button removed**: Redundant since @mention works for any note
- **Reference chips reverted**: User prefers inline formatting over chip-based layout
- **pressEnterToSend**: Default true. Enter sends, Shift+Enter for newline. Toggle in Settings → Chat Defaults.
- **Reasoning fix**: SDK's OpenAI provider strips `type: "reasoning"` parts. Current fix excludes reasoning from message history loop. May need SDK-level workaround.
- **Attachment restoration**: Edit mode now preserves both `attachments` and `contextItems` from original message.

## Session Context
- **Session**: 2026-05-30 (ended 10:17 IST)
- **Duration**: ~8 hours (with break)
- **Commits**: `baf7b39`, `653d84b`, `8f6b94a`
- **Build status**: ✅ tsc + esbuild pass
- **Pushed to**: origin/main
