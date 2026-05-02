# Active Context

*Last Updated: 2026-05-02 23:21:14 IST*

## Current Focus
**Primary Task:** T3
**Secondary Tasks:** META-1, T5

## Active Tasks
- [T3]: Context & Mentions — active note toggle done; next: @mention autocomplete + ContextEngine
- [T5]: Note detection fixed; hover-only buttons; remaining: target-note, slash commands, retry
- [META-1]: Keep memory-bank records aligned with implementation state

## Implementation Focus
`src/components/ChatApp.tsx`, `src/components/ContextBar.tsx`, `src/noteEditing/NoteEditingBridge.ts`

## Task-Specific Context

### Task T4 — COMPLETE
`streamChat()` wired into chat panel. `StreamingBubble` component uses `MarkdownRenderer.render()` for progressive rendering. Abort saves partial with `[stopped]`, errors shown as error bubbles.

### Task T5
`NoteEditingBridge` note detection fixed: uses `getLeavesOfType('markdown')` so apply/append work when chat sidebar is focused (not `getActiveViewOfType`). Action buttons hidden by default, shown on hover. Remaining: `applyToTargetNote()` (depends on T3), slash commands, retry button.

### Task T3 — IN PROGRESS
Active note toggle chip in `ContextBar`. `ChatApp.includeActiveNote` state drives context injection in `handleSend`. When toggled, reads first markdown leaf via `getLeavesOfType`, wraps content in `<active-note>` XML block, prepends to user message. Next: @mention autocomplete popover.

## Current Decisions
- Both effects (`setSelectionInfoEffect` + `setGeneratedResponseEffect`) dispatched in one transaction.
- `appendToActiveNote` writes via `vault.modify` (no diff) — simpler UX.
- Note detection: `getLeavesOfType('markdown')[0]` used consistently across NoteEditingBridge and ChatApp context injection.
- CI fix: `github.ref_name` sanitized with `tr '/' '-'` before use as artifact name.

## Next Actions By Task
- [T3]: Build `MentionAutocomplete` popover, wire `@` trigger in `ChatInput`, build `ContextEngine`.
- [T5]: Add retry button, `applyToTargetNote` (post-T3), slash commands.
- [META-1]: Keep records in canonical template format.
