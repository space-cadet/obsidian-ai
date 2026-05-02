# Active Context

*Last Updated: 2026-05-02 22:32:52 IST*

## Current Focus
**Primary Task:** T5
**Secondary Tasks:** META-1, T3

## Active Tasks
- [T5]: Complete remaining note-editing paths (target-note, slash commands, retry button)
- [META-1]: Keep memory-bank records aligned with T4/T5 implementation state
- [T3]: Context & Mentions — next major feature enabling full T5 target-note flow

## Implementation Focus
`src/noteEditing/NoteEditingBridge.ts`, `src/components/MessageBubble.tsx`, `src/components/ChatApp.tsx`, `src/components/ChatMessages.tsx`

## Task-Specific Context

### Task T4 — COMPLETE
`streamChat()` is wired into the React chat panel. Progressive rendering via `currentAiMessage` state, abort saves partial with `[stopped]`, errors shown as error bubbles. Stop button was already present in ChatInput.

### Task T5
`NoteEditingBridge` created with `applyToActiveNote()` (dispatches full-doc selection + response effects to active MarkdownView) and `appendToActiveNote()` (vault.modify append). "Apply to Note" and "Append to Note" buttons live on all assistant message bubbles. Remaining work: `applyToTargetNote()` (depends on T3 for @mention resolution), slash commands `/create`/`/append`, retry button.

### Task T3
All context/mentions work is 0% started. Needed to unlock "Apply to [[Note Name]]" in T5.

## Current Decisions
- Both effects (`setSelectionInfoEffect` + `setGeneratedResponseEffect`) dispatched in a single CodeMirror transaction so `diffDecorationState` sees the full-doc selection in `tr.state`.
- `appendToActiveNote` writes directly via `vault.modify` (no diff) — simpler UX for appending.
- T3 is the correct next session focus after T5 remaining items.

## Next Actions By Task
- [T5]: Add retry button, applyToTargetNote (post-T3), slash command parser entries.
- [T3]: Build MentionAutocomplete, ContextEngine, @ trigger wiring.
- [META-1]: Keep records in canonical template format.
