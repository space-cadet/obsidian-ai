# Active Context

*Last Updated: 2026-05-04 17:20:56 IST*

## Current Focus
**Primary Task:** T3
**Secondary Tasks:** META-1, T5, T2, T13

## Active Tasks
- [T3]: Context & Mentions — `@mention` autocomplete (keeps name in textarea), ContextEngine multi-note support, embedExpander, active note toggle, per-message context tracking, token estimation all implemented. Context chips above input removed; context is cleared after each send (per-message only).
- [T5]: Note Editing — `applyToNote`, `applyToTargetNote`, `createNote`, `appendToNote` all complete. Slash commands now auto-execute without returning content in chat (`/create` creates file directly, `/edit` auto-applies diff, `/append` auto-appends). Retry button added. Targeted actions via message metadata. Remaining: overwrite modal, real-world testing
- [T2]: Session-based chat history fully implemented. Message editing & resubmit, session rename, auto-title after 2 messages. Pending real-world testing
- [T13]: Agentic Tool Calling — design complete, task and implementation doc created, awaiting scheduling
- [META-1]: Keep memory-bank records aligned with implementation state

## Implementation Focus
`src/components/ChatApp.tsx`, `src/components/ChatInput.tsx`, `src/context/ContextEngine.ts`

## Task-Specific Context

### Task T5 — IN PROGRESS (major items complete)
`NoteEditingBridge` complete with all methods. Slash commands auto-execute without returning AI content in chat: `/create` creates file directly via `vault.create()`, `/edit` auto-applies diff via `applyToTargetNote()`, `/append` auto-appends via `appendToNote()`. Each shows a brief status message (e.g. "✓ Created note: X"). Retry button added. Targeted action buttons render contextually based on `command` metadata. Remaining: overwrite/confirm modal for existing files, end-to-end testing.

### Task T2 — IN PROGRESS (implementation complete, pending testing)
Session-based chat history fully implemented with migration from old flat `chatMessages`. `ChatApp` uses `sessions[]` + `activeSessionId`. Archive-on-New prunes to `maxSavedConversations`. `SessionPickerModal` supports load, delete, and rename (double-click or pencil button). Auto-title setting added (`autoNameSessions`, default false). When enabled, auto-title triggers after 2 user messages. Message editing: pencil icon on user message truncates session and populates input for resubmit. Cancel edit restores original messages.

### Task T3 — IN PROGRESS
Active note toggle chip in `ContextBar`. `@mention` autocomplete keeps candidate name in textarea. `ContextEngine.resolveContextItems()` resolves all context types with token budget enforcement. Context items stored per-message on `ChatMessage.contextItems` and rendered as a footer under user bubbles. Context is cleared after each send (per-message only). ContextBar no longer shows individual @mention/folder/tag chips — only active note toggle and truncation warning. Token estimation (`chars/4`) computed per message and displayed in UI.

## Current Decisions
- Both effects (`setSelectionInfoEffect` + `setGeneratedResponseEffect`) dispatched in one transaction.
- `appendToNote` writes via `vault.modify` (no diff) — simpler UX.
- Note targeting: `workspace.on('active-leaf-change')` listener in ChatApp updates `lastMarkdownLeafRef` and `targetNoteName` state. NoteEditingBridge methods receive resolved view/file — single source of truth in ChatApp.
- Chat persistence moving from flat `chatMessages` array to session-store model (`StoredChatData` with `sessions[]` + `activeSessionId`) to support history, load, and archive-on-New.
- CI fix: `github.ref_name` sanitized with `tr '/' '-'` before use as artifact name.

## Next Actions By Task
- [T3]: Verify inline mentions and per-message context in real Obsidian environment.
- [T5]: Test slash command auto-execution (`/create`, `/edit`, `/append`); implement overwrite modal for existing files.
- [T2]: Test message editing, session rename, auto-title setting in real Obsidian environment.
- [T6]: Add `maxContextMessages` setting for lightweight token/context management before T13.
- [T13]: Schedule implementation when T3/T5/T6 are stable. Full tool calling with Vercel AI SDK `streamText({ tools, maxSteps })`.
- [META-1]: Keep records in canonical template format.
