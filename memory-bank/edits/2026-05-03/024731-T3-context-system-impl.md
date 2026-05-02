# T3 Context System Implementation + T5 Apply Button + T13 Design

*Created: 2026-05-03 02:47:31 IST*
*Task: T3, T5, T13*

## Summary

Implemented the full vault context injection system: users can attach multiple notes, folders, and tags as context to any chat message. Added `@mention` autocomplete in ChatInput. Added Apply button to MessageBubble for diff overlay. Created T13 design doc for agentic tool calling.

## Changes

### New Files
- `src/context/ContextEngine.ts` — resolves notes, folders, tags to XML with token budget
- `src/components/ContextPickerModal.tsx` — modal for selecting context items
- `memory-bank/tasks/T13.md` — task file for agentic tool calling
- `memory-bank/implementation-details/agentic-tool-calling.md` — design doc

### Modified Files
- `src/types.ts` — added ContextItem union and contextItems to ChatSession
- `src/components/ChatApp.tsx` — contextItems state, ContextEngine in handleSend, dynamic system prompt
- `src/components/ContextBar.tsx` — multi-chip display with remove buttons
- `src/components/ChatInput.tsx` — @mention autocomplete dropdown
- `src/components/MessageBubble.tsx` — Apply button for diff overlay
- `src/components/ChatMessages.tsx` — passes onApply through
- `src/main.ts` — migration for contextItems field
- `styles.css` — picker modal, mention dropdown, chip styles

### Memory Bank Updates
- `memory-bank/tasks/T3.md` — progress updated
- `memory-bank/tasks/T5.md` — progress updated
- `memory-bank/tasks.md` — T13 added
- `memory-bank/activeContext.md` — T3 complete, T13 added
- `memory-bank/session_cache.md` — focus updated
- `memory-bank/progress.md` — T3, T5, T13 sections added
- `memory-bank/edit_history.md` — entry added
- `memory-bank/sessions/2026-05-03-night.md` — session extended
