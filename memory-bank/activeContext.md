# Active Context

*Last Updated: 2026-05-14 07:52:41 IST*

## Current Focus
**Primary Task:** T11
**Secondary Tasks:** T2, T9, T13

## Active Tasks
- [T11]: Debug Logging & Diagnostics — settings panel rewritten; debug-log spam traced to overlapping chat persistence writes; queued persistence and hydration guard implemented
- [T2]: Conversation Chain & Memory — completed persistence layer hardened with debounced autosave, queued snapshot flush, and startup overwrite guard
- [T9]: Settings & Provider Profiles — settings panel rebuilt into a clean sectioned layout with guarded refresh flow and restored model picker behavior
- [T13]: Agentic Tool Calling — `resolveNote()`, `patch_note`, `edit_section` implemented; blank-screen crash verification still pending
- [T14]: Remote Agent Connectivity — design complete; T13 fixes unblock implementation
- [T8]: Open Source Release — README and metadata branded; final release readiness pass pending

## Implementation Focus
`src/components/ChatApp.tsx`, `src/main.ts`, `src/settings.ts`, `styles.css`, `src/logger.ts`, `src/components/ErrorBoundary.tsx`

## Task-Specific Context

### Task T11 — IN PROGRESS (settings rewrite + persistence noise diagnosis)
The Settings panel was rebuilt into a clean sectioned layout with a proper header, restored model fetch/search behavior, and guarded refresh logic to avoid re-entrant `display()` loops. Debug-log spam was traced to repeated `saveChatData()` attempts from bursty `ChatApp` session updates plus a non-queued save guard.

### Task T2 — COMPLETED (hardened on 2026-05-12)
Session persistence now coalesces bursty autosaves in `ChatApp`, serializes writes in `main.ts`, and preserves the latest queued snapshot instead of dropping overlapping saves. A startup overwrite regression was then fixed by skipping the first autosave after hydrating real stored sessions and by preventing no-op `contextItems` rewrites of the active session.

### Task T13 — IN PROGRESS (auto-approve toggle added; basename fix + new tools + crash debugging)
`resolveNote()` helper resolves basenames via three-tier lookup (exact → append `.md` → `metadataCache.getFirstLinkpathDest()`). `patch_note` (search/replace) and `edit_section` (heading rewrite) added to tool registry. Auto-approve toggle button added to chat ActionBar for one-click switching between Auto (🤖) and Manual (🔒) tool approval modes. Blank-screen crash verification is still pending after the earlier safety fixes (`scrollIntoView({ behavior: "auto" })`, unmount cleanup flags).

### Task T5 — COMPLETED
`NoteEditingBridge` complete with all methods. Slash commands auto-execute without returning AI content in chat. Retry button added. Targeted action buttons render contextually.

## Current Decisions
- `resolveNote()` uses `metadataCache.getFirstLinkpathDest()` as final fallback to match Obsidian wiki-link resolution.
- `patch_note` uses literal string matching (not regex) for predictability; `replace_all` via `split().join()`.
- `edit_section` splits on `\n` and matches heading lines starting with `# `.
- ErrorBoundary logs to disk immediately via `flushNow()` so crash data survives renderer restart.
- Chat persistence should never save directly on every intermediate React state change; writes are now debounced in `ChatApp` and serialized in `main.ts`.
- Overlapping chat saves should flush the latest queued snapshot rather than logging repeated save-noise entries.
- Hydrated chat state should not be written back during the first mount/effect cascade after plugin load.

## Next Actions By Task
- [T11]: Verify in Obsidian that `debug.log` no longer floods on normal chat activity or startup
- [T2]: Verify persisted sessions survive plugin/app reload without `data.json` churn
- [T13]: Deploy and test crash fix with `scrollIntoView({ behavior: "auto" })`; test `patch_note` and `edit_section` end-to-end; verify auto-approve toggle in Obsidian
- [T13]: Extract inline AgentLoop from ChatApp into `src/agent/AgentLoop.ts`. Create `PendingToolCard.tsx`.
- [T11]: Add privacy redaction to file logger (strip API keys, note contents)
- [T14]: Begin implementation (agent provider type, AgentApiManager, OpenResponses serializer)
- [T8]: Complete open-source branding and release readiness pass.
- [META-1]: Keep memory-bank records aligned with implementation state.
