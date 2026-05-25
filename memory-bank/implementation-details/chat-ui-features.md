# Chat UI Features

General chat UI/UX features that apply to both 1:1 and group chat modes.

---

## Profile Selection

### Default Profile on New Chat

**Problem:** When starting a new chat with an empty `selectedProfileIds` set, the participant dropdown showed no selection and the chat had no active model.

**Root cause:** `handleNewChat()` created `new Set()` for `selectedProfileIds` when `plugin.settings.selectedProfileIds` was empty, instead of falling back to the active provider profile.

**Fix:** When `plugin.settings.selectedProfileIds` is empty, default to the active provider profile ID:
```typescript
const fallbackId = getActiveProviderProfile(plugin.settings).id;
setSelectedProfileIds(new Set([fallbackId]));
```

**File:** `src/components/ChatApp.tsx` (~line 1380)

---

## Thinking Toggle (💭)

**Feature:** Allow user to show/hide model reasoning (`<thinking>...</thinking>` tags) in assistant messages.

**State:**
- `showThinking: boolean` in `ChatApp.tsx` — defaults to `false` (thinking stripped)
- Passed down: `ChatApp` → `ChatMessages` → `MessageBubble`

**UI:**
- 💭 toggle button in `ChatInput.tsx`, placed before the send button
- `title` attribute: "Show thinking" / "Hide thinking"
- Visual feedback: button gets `is-active` class when `showThinking=true`

**Behavior:**
- `showThinking=false` (default): `stripThinkingTags()` removes `<thinking>...</thinking>` blocks from rendered text
- `showThinking=true`: thinking blocks rendered as normal text (or styled separately if desired)

**Files:**
- `src/components/ChatApp.tsx` — `showThinking` state, `handleToggleThinking` callback
- `src/components/ChatInput.tsx` — 💭 button with `onToggleThinking` prop
- `src/components/ChatMessages.tsx` — forwards `showThinking` to `MessageBubble`
- `src/components/MessageBubble.tsx` — `TextSegment` conditionally strips thinking tags

---

---

## File Attachments (📎)

**Feature:** Allow users to attach vault files (markdown notes, images, PDFs) to chat messages for LLM consumption.

**State:**
- `messageAttachments: Attachment[]` in `ChatApp.tsx`
- Passed down: `ChatApp` → `ChatInput` via `attachments` and `onAttachmentsChange` props

**UI:**
- 📎 button in `ChatInput.tsx`, opens dropdown with "Attach Note", "Attach Image", "Attach PDF"
- Attachment chips shown above textarea with file type icon (📄/🖼️/📑) and name
- Remove button (×) on each chip
- Read-only chips rendered below user messages in `MessageBubble`

**Attachment Resolution:**
- `AttachmentEngine.resolveAttachments()` in `src/context/AttachmentEngine.ts`
- Markdown → `TextPart` with file header
- Image → `ImagePart` (base64, resized to 1024px max via canvas)
- PDF → `FilePart` for Gemini; text extract or skip for other providers

**API Integration:**
- `handleSend()` in `ChatApp.tsx` calls `resolveAttachments()` before API call
- Resolved parts combined with text: `[{type:"text", text}, ...resolvedParts]`
- `SdkMessage` type in `api.ts` supports `string | MessageContentPart[]` content

**Files:**
- `src/components/ChatApp.tsx` — `messageAttachments` state, resolution in `handleSend()`
- `src/components/ChatInput.tsx` — 📎 dropdown, attachment chips, `onAttachmentsChange`
- `src/components/MessageBubble.tsx` — read-only attachment chip rendering
- `src/context/AttachmentEngine.ts` — attachment resolution engine
- `src/api.ts` — `SdkMessage`, `MessageContentPart` multimodal types
- `src/types.ts` — `Attachment` interface

---

*Last Updated: 2026-05-25 23:03 IST*
