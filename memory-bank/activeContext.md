# Active Context

*Last Updated: 2026-05-14 14:30 IST*

## Current Focus
**Primary Task:** T11
**Secondary Tasks:** T2, T9, T13

## Active Tasks
- [T11]: Debug Logging & Diagnostics — settings panel rewritten; debug-log spam traced to overlapping chat persistence writes; queued persistence and hydration guard implemented; **active-note flicker bug fixed** — added `sameContextItems` guard to prevent Effect 1 from unconditionally overwriting `contextItems` on every `sessions` change
- [T2]: Conversation Chain & Memory — completed persistence layer hardened with debounced autosave, queued snapshot flush, and startup overwrite guard
- [T9]: Settings & Provider Profiles — settings panel rebuilt into a clean sectioned layout with guarded refresh flow and restored model picker behavior
- [T13]: ✅ **COMPLETED** — All 13 tools implemented; AgentLoop extracted; PendingToolCard created; tool result formatting implemented; `onToolResult` callback wired; MessageActions and ToolCallNotification components created
- [T14]: Remote Agent Connectivity — design complete; T13 fixes unblock implementation
- [T8]: Open Source Release — README and metadata branded; final release readiness pass pending

## Implementation Focus
`src/components/ChatApp.tsx`, `src/main.ts`, `src/settings.ts`, `styles.css`, `src/logger.ts`, `src/components/ErrorBoundary.tsx`, `src/agent/AgentLoop.ts`, `src/components/MessageActions.tsx`, `src/components/ToolCallNotification.tsx`, `src/components/MessageBubble.tsx`

## Task-Specific Context

### Task T11 — IN PROGRESS (settings rewrite + persistence noise diagnosis + active-note flicker fix)
The Settings panel was rebuilt into a clean sectioned layout with a proper header, restored model fetch/search behavior, and guarded refresh logic to avoid re-entrant `display()` loops. Debug-log spam was traced to repeated `saveChatData()` attempts from bursty `ChatApp` session updates plus a non-queued save guard. **Active-note toggle flicker** — traced to Effect 1 calling `setContextItems` unconditionally on every `sessions` change, creating a feedback loop with Effect 2's persistence. Fixed by adding `sameContextItems` guard to only update when session contextItems actually differ from current React state.

### Task T2 — COMPLETED (hardened on 2026-05-12)
Session persistence now coalesces bursty autosaves in `ChatApp`, serializes writes in `main.ts`, and preserves the latest queued snapshot instead of dropping overlapping saves. A startup overwrite regression was then fixed by skipping the first autosave after hydrating real stored sessions and by preventing no-op `contextItems` rewrites of the active session.

### Task T13 — COMPLETED (vault management tools + AgentLoop + PendingToolCard + tool result formatting + onToolResult wiring + MessageActions/ToolCallNotification components)
All 13 tools implemented: `read_note`, `edit_note`, `append_to_note`, `create_note`, `patch_note`, `edit_section`, `search_notes` (with sort/limit/folder/content), `list_notes`, `get_note_metadata`, `create_folder`, `move_note`, `delete_note`, `list_folders`. `resolveNote()` helper with three-tier basename resolution. Auto-approve toggle button in ActionBar. Pending tool UI with summary cards. **AgentLoop extracted** from ChatApp into `src/agent/AgentLoop.ts`. **PendingToolCard.tsx** created as dedicated component. **Tool result formatting** — search/list results as markdown tables with `[[wiki-links]]`, folders as bulleted list, metadata as formatted summary. **`onToolResult` callback** added to AgentLoop options so ChatApp can update tool call log with execution results. **MessageActions.tsx** — extracted action buttons (copy, retry, edit, apply, insert, append, target actions) into reusable component with dropdown menu. **ToolCallNotification.tsx** — inline tool call status display with expandable detail view for search results, note content, metadata, etc. System prompt updated to explicitly list all 13 tools by name with usage guidance. Build passes cleanly.

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
- `onToolResult` callback propagates tool execution results from AgentLoop to ChatApp for UI update.
- `MessageActions` component centralizes all message action buttons (primary + dropdown menu).
- `ToolCallNotification` component renders inline tool call status with expandable details.
- Active-note toggle flicker: Effect 1 was calling `setContextItems` unconditionally on every `sessions` change, causing feedback loop with Effect 2. **Fixed** by removing `sessions` from Effect 1's dependency array — now only depends on `activeSessionId`. Uses `sessionsRef.current` for reading session data without subscribing to mutations. `prevActiveSessionIdRef` guard skips sync when active session hasn't actually changed. Debug logging added to `handleToggleActiveNote`, Effect 1, and Effect 2 for runtime tracing in Obsidian console.

## Next Actions By Task
- [T11]: Add privacy redaction to file logger (strip API keys, note contents); verify `debug.log` no longer floods on normal chat activity or startup; verify active-note toggle is stable; remove debug logging once confirmed stable
- [T2]: Verify persisted sessions survive plugin/app reload without `data.json` churn
- [T14]: Begin implementation (agent provider type, AgentApiManager, OpenResponses serializer)
- [T8]: Complete open-source branding and release readiness pass.
- [META-1]: Keep memory-bank records aligned with implementation state.
