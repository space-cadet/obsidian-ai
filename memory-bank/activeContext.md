# Active Context

*Last Updated: 2026-05-09 11:51:05 IST*

## Current Focus
**Primary Task:** T13
**Secondary Tasks:** T11, T14, T8

## Active Tasks
- [T13]: Agentic Tool Calling — `resolveNote()`, `patch_note`, `edit_section` implemented; blank-screen crash debugging in progress
- [T11]: Debug Logging & Diagnostics — file logger, ErrorBoundary, diagnostics panel all implemented; privacy redaction queued for v2
- [T14]: Remote Agent Connectivity — design complete; T13 fixes unblock implementation
- [T8]: Open Source Release — README and metadata branded; final release readiness pass pending

## Implementation Focus
`src/agent/ToolExecutor.ts`, `src/agent/tools.ts`, `src/components/ChatApp.tsx`, `src/components/MessageBubble.tsx`, `src/components/ChatMessages.tsx`, `src/logger.ts`, `src/components/ErrorBoundary.tsx`, `src/settings.ts`

## Task-Specific Context

### Task T13 — IN PROGRESS (basename fix + new tools + crash debugging)
`resolveNote()` helper resolves basenames via three-tier lookup (exact → append `.md` → `metadataCache.getFirstLinkpathDest()`). `patch_note` (search/replace) and `edit_section` (heading rewrite) added to tool registry. Raw status tags removed from visible chat. Blank-screen crash investigation: macOS crash reports confirm native Chromium `SIGTRAP` in renderer process. `MarkdownRenderer.render` resolves successfully; crash occurs on `StreamingBubble` unmount + `MessageBubble` mount transition. Safety fixes applied: `scrollIntoView({ behavior: "auto" })`, unmount cleanup flags.

### Task T11 — IN PROGRESS (moved from paused)
File logger (`src/logger.ts`) writes to `.obsidian/plugins/obsidian-ai/debug.log`, intercepts errors, logs memory every 10s. `ChatErrorBoundary` wraps chat panel. Diagnostics panel in Settings shows 6 metrics with Refresh, DevTools, and Clear History. Remaining: privacy redaction, structured event pipeline (v2 refinement).

### Task T5 — COMPLETED
`NoteEditingBridge` complete with all methods. Slash commands auto-execute without returning AI content in chat. Retry button added. Targeted action buttons render contextually.

### Task T2 — COMPLETED
Session-based chat history fully implemented. Message editing & resubmit, session rename, auto-title after 2 messages.

## Current Decisions
- `resolveNote()` uses `metadataCache.getFirstLinkpathDest()` as final fallback to match Obsidian wiki-link resolution.
- `patch_note` uses literal string matching (not regex) for predictability; `replace_all` via `split().join()`.
- `edit_section` splits on `\n` and matches heading lines starting with `# `.
- ErrorBoundary logs to disk immediately via `flushNow()` so crash data survives renderer restart.
- `scrollIntoView` behavior changed to `"auto"` to remove animation from the unmount/mount transition path.
- Both effects (`setSelectionInfoEffect` + `setGeneratedResponseEffect`) dispatched in one transaction.
- Chat persistence uses session-store model (`StoredChatData` with `sessions[]` + `activeSessionId`).

## Next Actions By Task
- [T13]: Deploy and test crash fix with `scrollIntoView({ behavior: "auto" })`; test `patch_note` and `edit_section` end-to-end
- [T13]: Extract inline AgentLoop from ChatApp into `src/agent/AgentLoop.ts`. Create `PendingToolCard.tsx`.
- [T11]: Add privacy redaction to file logger (strip API keys, note contents)
- [T14]: Begin implementation (agent provider type, AgentApiManager, OpenResponses serializer)
- [T8]: Complete open-source branding and release readiness pass.
- [META-1]: Keep memory-bank records aligned with implementation state.
