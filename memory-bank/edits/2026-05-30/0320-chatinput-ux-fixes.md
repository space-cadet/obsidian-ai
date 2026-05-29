---
kind: edit_chunk
id: edit-2026-05-30-0320
created_at: 2026-05-30 03:20:36 IST
task_ids: [T19, T22]
source_branch: main
source_commit: 8f6b94acba6ff97fba39e258d6ae9b38025f4aec
---

#### 03:20:36 IST - T19/T22: ChatInput UI/UX fixes and reasoning content bug

**Commit `8f6b94a`**: ChatInput layout refactor + reasoning fix
- Modified `src/agent/AgentLoop.ts` — Removed `{ type: "reasoning" }` from assistant message content parts before they are sent back to the LLM. The Vercel AI SDK OpenAI provider silently strips reasoning parts, causing Kimi API to reject with "reasoning_content is missing". Fix: accumulate reasoning for potential display but exclude from conversation history loop.
- Modified `src/components/ChatInput.tsx` — Removed pin-current button (📌) as redundant with @mention. Removed reference chips above textarea (reverted to inline formatting). Reorganized layout: Row 1 = textarea + send/stop button; Row 2 = attachment chips + attach dropdown + thinking toggle. Added `pressEnterToSend` prop support.
- Modified `src/components/ChatApp.tsx` — Removed `onToggleActiveNote` and `hasActiveNote` props from ChatInput. Passed `pressEnterToSend` setting.
- Modified `src/settings.ts` — Added `pressEnterToSend: boolean` (default `true`) to `ObsidianAISettings` interface and defaults.
- Modified `src/settings-sections/chatDefaults.ts` — Added Settings UI toggle for "Press Enter to send".
- Modified `styles.css` — Added `.chat-input-toolbar` and `.chat-input-toolbar-left` classes. Removed `.chat-input-left` styling. Adjusted gaps for new layout.

**Commit `653d84b`**: Restore attachments/context items on edit
- Modified `src/hooks/useMessageActions.ts` — `handleEditMessage` now restores `msg.attachments` and `msg.contextItems` from the original message. `handleCancelEdit` clears them. `handleSend` finally block clears `messageAttachments`.
- Modified `src/components/ChatInput.tsx` — Added `contextItems` and `onRemoveContextItem` props. Showed reference chips for attachments, context items, and parsed `[[wiki-links]]` from textarea value.
- Modified `src/components/ChatApp.tsx` — Passed `contextItems` and `handleRemoveContextItem` to ChatInput.
- Modified `styles.css` — Added `.chat-reference-chips`, `.chat-reference-chip`, `.chat-context-chip`, `.chat-wikilink-chip` styling.

**Commit `baf7b39`**: Three chat UI/API bugs
- Modified `src/agent/types.ts` — Added `reasoning-delta` to `StreamEvent` type.
- Modified `src/api.ts` — Added `reasoning-delta` handling in `streamChatWithTools`.
- Modified `src/agent/AgentLoop.ts` — Accumulated `stepReasoning` from reasoning-delta events, added reasoning content part to assistant message.
- Modified `src/components/ChatInput.tsx` — Replaced "Resubmit"/"Cancel" text buttons with icon-only compact buttons (▶ / ✕).
- Modified `styles.css` — Increased `.chat-input-row` gap from 6px to 8px, `.chat-input-left/right` gap from 4px to 6px.
