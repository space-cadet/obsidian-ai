# Edit Chunk: 2026-05-25 18:55:31 IST

## Task: T16

### Work Done

Fixed default profile selection and added thinking toggle to obsidian-ai plugin

### Files Modified

- Modified `src/components/ChatApp.tsx` — Fixed handleNewChat() to fall back to active provider profile when selectedProfileIds is empty; added showThinking state
- Modified `src/components/ChatInput.tsx` — Added showThinking/onToggleThinking props and 💭 toggle button before send button
- Modified `src/components/ChatMessages.tsx` — Forwarded showThinking prop to MessageBubble
- Modified `src/components/MessageBubble.tsx` — Added showThinking prop; conditionally strips <thinking> tags only when showThinking=false

