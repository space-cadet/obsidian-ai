# Active Context

*Last Updated: 2026-05-03 00:18:43 IST*

## Current Focus
**Primary Task:** T3
**Secondary Tasks:** META-1, T5, T2

## Active Tasks
- [T3]: Context & Mentions — active note toggle done; next: @mention autocomplete + ContextEngine
- [T5]: Note targeting fixed (active-leaf-change); NoteEditingBridge refactored; remaining: applyToTargetNote, slash commands, retry
- [T2]: Basic persistence done; session-store architecture designed; implementation next
- [META-1]: Keep memory-bank records aligned with implementation state

## Implementation Focus
`src/components/ChatApp.tsx`, `src/components/ContextBar.tsx`, `src/noteEditing/NoteEditingBridge.ts`

## Task-Specific Context

### Task T5 — IN PROGRESS
`NoteEditingBridge` refactored: methods now receive resolved MarkdownView/TFile from caller — no internal leaf discovery. `ChatApp` tracks last-focused markdown leaf via `workspace.on('active-leaf-change')`. Apply/Append buttons show target note name ("✓ Apply → NoteBasename"). Stale closure on `includeActiveNote` fixed using ref pattern. Remaining: `applyToTargetNote()` (depends on T3), slash commands, retry button.

### Task T2 — IN PROGRESS (session store designed)
Basic single-session persistence implemented: `plugin.loadChatMessages()` / `saveChatMessages()` added to plugin + interface. Session-store architecture designed: `StoredChatData` with `sessions: ChatSession[]` + `activeSessionId`; plugin API methods (`loadChatData`, `saveChatData`, `archiveSession`, `deleteSession`, `pruneSessions`); `SessionPickerModal` UI spec with title/date/count/preview list; auto-titling from first user message (truncated to 40 chars); pruning respecting `maxSavedConversations`. Migration path from old flat `chatMessages` array defined. Implementation next.

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
- [T2]: Implement session store in plugin (`loadChatData`, `saveChatData`, migration); update `ChatApp` for archive-on-New; build `SessionPickerModal`; wire Load button in `ActionBar`.
- [META-1]: Keep records in canonical template format.
