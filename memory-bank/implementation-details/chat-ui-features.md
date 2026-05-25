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

*Last Updated: 2026-05-25 19:09 IST*
