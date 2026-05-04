# Active Context

*Last Updated: 2026-05-04 22:46:16 IST*

## Current Focus
**Primary Task:** T8
**Secondary Tasks:** META-1, T6, T10, T13

## Active Tasks
- [T6]: Token & Context Management — `tokenEstimator.ts` extracted, `maxContextMessages` setting (default 10) limits conversation history, ContextBar shows `~X / Y tokens` with green/amber/red colour coding.
- [T3]: Context & Mentions — COMPLETED
- [T5]: Note Editing — COMPLETED Slash commands now auto-execute without returning content in chat (`/create` creates file directly, `/edit` auto-applies diff, `/append` auto-appends). Retry button added. Targeted actions via message metadata. Remaining: overwrite modal, real-world testing
- [T2]: Session-based chat history fully implemented. Message editing & resubmit, session rename, auto-title after 2 messages. Pending real-world testing
- [T10]: Model Discovery — fetchers implemented, model cache fix complete. Cached models reused on subsequent clicks; refresh button in picker modal.
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
- [T8]: Complete open-source branding and release readiness pass.
- [T6]: Test `maxContextMessages` and token usage indicator in real Obsidian environment.
- [T13]: Schedule implementation when T6/T8 are stable. Full tool calling with Vercel AI SDK `streamText({ tools, maxSteps })`.
- [T10-T12]: Resume paused tasks after T6/T8 are complete.
- [META-1]: Keep records in canonical template format.
