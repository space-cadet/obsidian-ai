# Active Context

*Last Updated: 2026-05-04 14:59:36 IST*

## Current Focus
**Primary Task:** T3
**Secondary Tasks:** META-1, T5, T2, T13

## Active Tasks
- [T3]: Context & Mentions — `@mention` autocomplete, ContextEngine multi-note support, embedExpander, active note toggle all implemented
- [T5]: Note Editing — `applyToNote`, `applyToTargetNote`, `createNote`, `appendToNote` all complete. Slash commands (`/edit`, `/create`, `/append`) implemented. Retry button added. Targeted actions via message metadata. Remaining: overwrite modal, real-world testing
- [T2]: Session-based chat history fully implemented; pending real-world testing
- [T13]: Agentic Tool Calling — design complete, task and implementation doc created, awaiting scheduling
- [META-1]: Keep memory-bank records aligned with implementation state

## Implementation Focus
`src/components/ChatApp.tsx`, `src/components/ChatInput.tsx`, `src/context/ContextEngine.ts`

## Task-Specific Context

### Task T5 — IN PROGRESS (major items complete)
`NoteEditingBridge` complete with all methods: `applyToNote()`, `applyToTargetNote()`, `createNote()`, `appendToNote()`. Slash commands (`/edit [[Note]]`, `/create [[Note]]`, `/append [[Note]]`) implemented with parser supporting `[[Note]]` and bare names. Retry button added to MessageBubble. Targeted action buttons (Apply→Note, Create Note, Append→Note) render contextually based on `command` metadata stored on assistant messages. Remaining: overwrite/confirm modal for existing files, end-to-end testing.

### Task T2 — IN PROGRESS (implementation complete, pending testing)
Session-based chat history fully implemented. `loadChatData`/`saveChatData` plugin methods with migration from old flat `chatMessages`. `ChatApp` uses `sessions[]` + `activeSessionId` state with `activeSessionIdRef` to avoid stale closures during streaming. Archive-on-New auto-titles from first user message and prunes to `maxSavedConversations`. `SessionPickerModal` lists sessions with title, count, relative time, preview; supports load and delete. Deleting the active session automatically creates a new empty one. Load button enabled via `hasHistory = sessions.some(s => s.messages.length > 0)`.

### Task T3 — IN PROGRESS
Active note toggle chip in `ContextBar`. `contextItems` state drives context injection in `handleSend`. `@mention` autocomplete in `ChatInput` adds notes/folders/tags to context chips. `ContextEngine.resolveContextItems()` resolves all context types into XML blocks with token budget enforcement. Context items persist per-session.

## Current Decisions
- Both effects (`setSelectionInfoEffect` + `setGeneratedResponseEffect`) dispatched in one transaction.
- `appendToNote` writes via `vault.modify` (no diff) — simpler UX.
- Note targeting: `workspace.on('active-leaf-change')` listener in ChatApp updates `lastMarkdownLeafRef` and `targetNoteName` state. NoteEditingBridge methods receive resolved view/file — single source of truth in ChatApp.
- Chat persistence moving from flat `chatMessages` array to session-store model (`StoredChatData` with `sessions[]` + `activeSessionId`) to support history, load, and archive-on-New.
- CI fix: `github.ref_name` sanitized with `tr '/' '-'` before use as artifact name.

## Next Actions By Task
- [T3]: Context system implementation complete — verify in real Obsidian environment.
- [T5]: Add retry button, `applyToTargetNote` (post-T3), slash commands.
- [T2]: Test in real Obsidian environment — verify migration from old chatMessages, pruning behaviour, delete-active-session edge case.
- [T13]: Schedule implementation when T3/T5 are stable. Full tool calling with Vercel AI SDK `streamText({ tools, maxSteps })`.
- [META-1]: Keep records in canonical template format.
