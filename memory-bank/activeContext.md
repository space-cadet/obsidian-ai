# Active Context

*Last Updated: 2026-05-03 00:45:00 IST*

## Current Focus
**Primary Task:** T3
**Secondary Tasks:** META-1, T5, T2

## Active Tasks
- [T3]: Context & Mentions — active note toggle done; next: @mention autocomplete + ContextEngine
- [T5]: Note targeting fixed (active-leaf-change); NoteEditingBridge refactored; remaining: applyToTargetNote, slash commands, retry
- [T2]: Session-based chat history fully implemented; pending real-world testing
- [META-1]: Keep memory-bank records aligned with implementation state

## Implementation Focus
`src/components/ChatApp.tsx`, `src/components/SessionPickerModal.tsx`, `src/main.ts`

## Task-Specific Context

### Task T5 — IN PROGRESS
`NoteEditingBridge` refactored: methods now receive resolved MarkdownView/TFile from caller — no internal leaf discovery. `ChatApp` tracks last-focused markdown leaf via `workspace.on('active-leaf-change')`. Apply/Append buttons show target note name ("✓ Apply → NoteBasename"). Stale closure on `includeActiveNote` fixed using ref pattern. Remaining: `applyToTargetNote()` (depends on T3), slash commands, retry button.

### Task T2 — IN PROGRESS (implementation complete, pending testing)
Session-based chat history fully implemented. `loadChatData`/`saveChatData` plugin methods with migration from old flat `chatMessages`. `ChatApp` uses `sessions[]` + `activeSessionId` state with `activeSessionIdRef` to avoid stale closures during streaming. Archive-on-New auto-titles from first user message and prunes to `maxSavedConversations`. `SessionPickerModal` lists sessions with title, count, relative time, preview; supports load and delete. Deleting the active session automatically creates a new empty one. Load button enabled via `hasHistory = sessions.some(s => s.messages.length > 0)`.

### Task T3 — IN PROGRESS
Active note toggle chip in `ContextBar`. `ChatApp.includeActiveNote` state + `includeActiveNoteRef` drive context injection in `handleSend`. Reads tracked markdown leaf via `lastMarkdownLeafRef` (same ref as T5 fix). Next: @mention autocomplete popover.

## Current Decisions
- Both effects (`setSelectionInfoEffect` + `setGeneratedResponseEffect`) dispatched in one transaction.
- `appendToNote` writes via `vault.modify` (no diff) — simpler UX.
- Note targeting: `workspace.on('active-leaf-change')` listener in ChatApp updates `lastMarkdownLeafRef` and `targetNoteName` state. NoteEditingBridge methods receive resolved view/file — single source of truth in ChatApp.
- Chat persistence moving from flat `chatMessages` array to session-store model (`StoredChatData` with `sessions[]` + `activeSessionId`) to support history, load, and archive-on-New.
- CI fix: `github.ref_name` sanitized with `tr '/' '-'` before use as artifact name.

## Next Actions By Task
- [T3]: Build `MentionAutocomplete` popover, wire `@` trigger in `ChatInput`, build `ContextEngine`.
- [T5]: Add retry button, `applyToTargetNote` (post-T3), slash commands.
- [T2]: Test in real Obsidian environment — verify migration from old chatMessages, pruning behaviour, delete-active-session edge case.
- [META-1]: Keep records in canonical template format.
