# Active Context

*Last Updated: 2026-07-29 13:47 IST*

## Current Focus
**T15 follow-up complete** — Past-session search, inline result links, and shared internal tabs are implemented. Tab-heading visual polish is deferred.

### Bug Fixes (2026-07-28)
**Status:** 🔄 IN PROGRESS (3/4 completed)

**T27: Gemini thought_signature Error** ✅ COMPLETED
- **File:** `src/api.ts`
- **Fix:** Added `google: { structuredOutputs: false }` provider option for Gemini in `streamChatWithTools()`
- **Root cause:** Gemini requires thought signatures in structured tool outputs; disabling structured outputs avoids the error

**T28: Obsidian Note Link Click Crash** ✅ COMPLETED
- **File:** `src/components/MessageBubble.tsx`
- **Fix:** Added `setupLinkInterception()` to intercept all `<a>` clicks in rendered messages
- **Root cause:** `MarkdownRenderer.render()` produces links that crash when clicked outside a MarkdownView
- **Solution:** Route internal links through `app.workspace.openLinkText()`, external links through `window.open()`

**T29: Android Background Processing** ⏸️ DEFERRED
- **File:** `src/components/ChatApp.tsx`
- **Status:** Investigation complete (2026-07-28). AI Tagger Universe has no special background handling — it simply doesn't stream (single request/response). Obsidian API provides no mobile lifecycle hooks. Decision: accept mobile limitation, don't implement complicated solutions.
- **Pending:** None — deferred indefinitely

**T30: System Information Context** ✅ COMPLETED
- **File:** `src/lib/systemPrompt.ts`
- **Fix:** Injected `[System Context]` block into every system prompt
- **Provides:** Current date, time, timezone, platform, locale

### Repo Migration (2026-07-28)
**Status:** ✅ COMPLETED

- Archived `space-cadet/obsidian-ai` → `space-cadet/obsidian-ai-archive`
- Created fresh `space-cadet/obsidian-ai` (not a fork)
- Pushed all 324 commits (197 Deepak + 127 FBarrca base)
- Updated local remotes, removed upstream
- Verified: `isFork: false`

#**T31: Chat Input Draft Auto-Save** ✅ COMPLETED (2026-07-29)
- **Files:** `src/types.ts`, `src/components/ChatInput.tsx`, `src/components/ChatApp.tsx`
- **Feature:** Persist unsent composer text across app restarts and tab switches
- **Implementation:** `draft?: string` on `ChatSession`; debounced save (500ms) via existing `setSessions` pipeline; cleared on send
- **Out of scope:** Attachments (remain ephemeral)

## Streaming Fixes (2026-07-14)
**Status:** ✅ FIXED (Pending commit)
- **File:** `src/agent/OpenResponsesLoop.ts`
- **Bug:** `accumulatedText` reset per step → `contentParts` accumulation broke → tool calls rendered as plain text
- **Fix:** `totalAccumulatedText` persists across steps; both `streamAgentResponse` and `continueWithToolResult` use it

### Fix 2: Token count frozen during AgentLoop streaming ✅
- **File:** `src/agent/AgentLoop.ts`
- **Bug:** Token counting only happened at step boundaries; during text streaming, count was frozen
- **Fix:** Incremental `runningTotal += estimateTokens(event.text)` inside `text-delta` handler; removed redundant end-of-step recounts to prevent double-counting

### Fix 3: StreamingBubble remaining-text + memory leaks ✅
- **File:** `src/components/ChatMessages.tsx`
- **Bug 1:** `content.lastIndexOf(lastTextPart.content)` returned `-1` when text spanned step boundaries → missing remaining text
- **Bug 2:** `createRoot` inside loop had no cleanup → orphaned React roots
- **Fix:** Fallback to full `content` when `lastIndexOf` returns `-1`; collect roots in `toolRoots[]` and unmount in cleanup

## Active Tasks
- **[T11]**: 🔄 **IN PROGRESS** — Log size limit, startup crash fix, CI/CD archive fix. User to verify startup fix.
- **[T22]**: 🔄 **IN PROGRESS** — Phases 0–3 complete. ChatApp.tsx: 1,948 → 636 lines.
- **[T16]**: 🔄 **IN PROGRESS** — Phases 1–17 implemented. Debate mode working.
- **[T14]**: 🔄 **IN PROGRESS** — Phase 3 integration test.
- **[T15]**: 🔄 **IN PROGRESS** — Past-session search and shared internal tabs are complete. Further tab-heading visual polish is deferred by user request. All 2026-07-29 session work was performed by GPT 5.6 Terra Low.
- **[T17]**: ⏸️ **PENDING** — Advanced vault tools. Backlinks + YAML first.
- **[T26]**: 🔄 **IN PROGRESS** — AI Intelligence Layer. Phase 1 (PersonaLoader + system prompt injection) active. See [T26 details](tasks/T26.md).
- **[T8]**: 🔄 **IN PROGRESS** — Open source release prep.
- **[T25]**: ⏸️ **PENDING** — Unit test infrastructure for streaming & token estimation. Deferred until after release cycle.
- **[T13]**: ✅ **COMPLETED**
- **[T18]**: ✅ **COMPLETED**
- **[T19]**: ✅ **COMPLETED**
- **[T21]**: ✅ **COMPLETED**
- **[T24]**: ✅ **COMPLETED**
- **[T23]**: ✅ **COMPLETED**

## New Decisions (This Session)
- **Image token estimation**: Flat 255 tokens is a known limitation. Provider-specific dimension-aware estimation deferred as future work (requires image header parsing + provider profile awareness).
- **Unit tests**: Project currently has zero project-level unit tests. New task T25 created with phased approach: pure functions → mock-based streaming → E2E regression.
- **Build verification**: All fixes compile cleanly (`tsc -noEmit` + `esbuild` pass).

## Commits (Pending)
- `src/agent/OpenResponsesLoop.ts` — fix: accumulate text across steps for tool call rendering
- `src/agent/AgentLoop.ts` — fix: incremental token counting during streaming
- `src/components/ChatMessages.tsx` — fix: StreamingBubble remaining-text fallback + root cleanup

## Related Tasks for This Session's Work
| Task | Relevance |
|------|-----------|
| **T4** (Streaming) | Original streaming implementation; fixes address gaps in T4's coverage |
| **T6** (Token Management) | Token estimator exists but untested; T25 will add coverage |
| **T13** (Agentic Tool Calling) | Tool call rendering pipeline; fixes affect tool-call streaming path |
| **T14** (OpenResponses) | OpenResponsesLoop.ts is the core of T14; Fix 1 is critical for T14 usability |
| **T21** (E2E Tests) | Existing E2E harness; T25 will extend with regression tests |
| **T22** (ChatApp Decomposition) | ChatMessages.tsx was refactored in T22 Phase 3; Fix 3 builds on that work |

## Next Steps
1. **Commit the three fixes** (user approval needed)
2. **T22 Phase 4**: Extract session/settings/export handlers
3. **T22 Phase 5**: Extract layout sub-components
4. **T17 Phase 1**: Backlinks + YAML tools (user-prioritized)
5. **T11 follow-up**: User verification of startup fix
6. **T14 Phase 3**: OpenResponses integration test
7. **T25**: Unit test infrastructure (deferred)

## Session Context
- **Session**: 2026-07-28 (15:05–15:27 IST)
- **Duration**: ~22 minutes
- **Work**: Repository migration — broke fork relationship, established clean repo
- **Previous Session**: 2026-07-14 (streaming fixes)
