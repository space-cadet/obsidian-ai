# Active Context

*Last Updated: 2026-06-13 06:25 IST*

## Current Focus
**T11 — Debug Logging & Diagnostics: UPDATED (June 13, 2026)**
- Log file size limit enforced (`debugLogMaxSizeMB`, default 5MB)
- Startup crash from huge log file fixed (async truncation + timeout guard)
- CI/CD source code archive fixed (force-update `latest-dev` tag)

**T3 — Context & Mentions: UPDATED (June 13, 2026)**
- `@-mention` dropdown now shows parent folder paths for duplicate basenames
- `contextPickerPathDisplay` setting (always/never/duplicates) applies to both Attach File modal and @-mention dropdown
- Search in both UIs matches full path as well as basename

## Active Tasks
- **[T11]**: 🔄 **IN PROGRESS** — Log size limit, startup crash fix, CI/CD archive fix. See details above.
- **[T22]**: 🔄 **IN PROGRESS** — Phases 0–3 complete. ChatApp.tsx: 1,948 → 636 lines. Remaining: Phase 4 (handlers), Phase 5 (layout components).
- **[T16]**: 🔄 **IN PROGRESS** — Phases 1–17 implemented. Debate mode working. UI refined. Participant persistence fixed. Thinking display toggle added.
- **[T14]**: 🔄 **IN PROGRESS** — Phase 3 integration test. Tailscale 2/3 complete.
- **[T15]**: 🔄 **IN PROGRESS** — Phase 1–2 complete. Phase 3 (TabBar UI) paused in favor of T16.
- **[T17]**: ⏸️ **PENDING** — Advanced vault tools. Backlinks + YAML first.
- **[T8]**: 🔄 **IN PROGRESS** — Open source release prep. CI/CD fix done.
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
1. **T22 Phase 4**: Extract session/settings/export handlers
2. **T22 Phase 5**: Extract layout sub-components
3. **T17 Phase 1**: Backlinks + YAML tools (user-prioritized)
4. **Export feature**: Needs exact UI location specification from user
5. **T11 follow-up**: Privacy redaction for debug logs (v2 refinement)
6. **Dot folder access**: Return to `.memory` folder investigation when user is ready

## Current Decisions
- **Pin current button removed**: Redundant since @mention works for any note
- **Reference chips reverted**: User prefers inline formatting over chip-based layout
- **pressEnterToSend**: Default true. Enter sends, Shift+Enter for newline. Toggle in Settings → Chat Defaults.
- **Reasoning fix**: SDK's OpenAI provider strips `type: "reasoning"` parts. Current fix excludes reasoning from message history loop. May need SDK-level workaround.
- **Attachment restoration**: Edit mode now preserves both `attachments` and `contextItems` from original message.
- **Context picker path display**: `contextPickerPathDisplay` setting (always/never/duplicates, default duplicates). Applied to both Attach File modal and @-mention dropdown. Parent folder shown inline in muted style.
- **Debug log size limit**: `debugLogMaxSizeMB` (default 5MB, range 1–50). Truncation is async and deferred to prevent UI blocking.
- **CI/CD pre-release**: `latest-dev` tag force-updated on each push so GitHub source archives stay current.

## Session Context
- **Session**: 2026-06-13 (ended 06:25 IST)
- **Duration**: ~1.5 hours (focused fixes)
- **Commits**: `fc4ae97`, `1a1fe75`, `5b1d448`, `8d82a61`, `93f4d79` pushed to origin/main
- **Build status**: ✅ tsc + esbuild pass
- **Pushed to**: origin/main
- **User testing**: ✅ @-mention path display confirmed working on mobile
- **User context**: User is on mobile device, copying files manually. User's father is unwell; user is at hospital.
