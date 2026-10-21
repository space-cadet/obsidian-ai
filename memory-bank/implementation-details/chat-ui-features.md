# Chat UI Features

> This file contains selected implementation notes and historical feature
> addenda. The complete, current, code-agnostic specification is the
> [Chat Component Capability Map](chat-component-capability-map.md).

General chat UI/UX features that apply to both 1:1 and group chat modes.

## Main Chat Toolbar (2026-09-30)

The responsive toolbar uses a compact main row with evenly distributed,
touch-friendly controls. New chat, history, search, model selection, Agents,
and overflow are in the main row; model selection uses the compact CPU/count
button before Agents rather than putting the model name on the button. Sync,
Zen mode, and Settings are direct toolbar actions. The provider/model identity
display remains a separate passive status bar. Overflow contains bulk session
export and less-frequent actions; per-chat copy/export remain in Chat History.
On mobile, controls retain a 44px touch height and larger icons. The user
visually approved desktop and mobile layouts.

Implementation: `ChatToolbar.tsx`, `presentational/ActionBar.tsx`,
`presentational/ModelSwitcher.tsx`, `styles/_chat.css`, and
`styles/_model-switcher.css` (with generated `styles.css`). Merged in PR #9 at
`62b2db5`.

The overflow menu also includes **Check for Updates**, which invokes the
existing `check-for-updates` command and updater flow. Assistant message cards
fill the available chat width; user message cards retain their narrower,
right-aligned layout.

### Chat UI follow-ups (2026-10-21)

- PDF message attachments show an icon and filename without the former large
  Save and Open buttons.
- Long MathJax expressions scroll horizontally within the equation container;
  surrounding text stays in place, and vertical overflow is hidden.
- Every tab whose session is generating shows a spinner and exposes its
  generating state accessibly.
- The transcript follows late content layout changes while follow mode is
  active; a manual scroll away from the latest reply is preserved.
- The More menu uses separators between action groups without section titles.
  Its collaboration separator is conditional on collaboration actions being
  available.

The implementation and verification record is in
`sessions/2026-10-21-chat-attachments-equations-tabs-scroll.md`.

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

### Provider-Scoped Model Choices (2026-10-19)

The model picker keeps fetched caches and recent-model entries scoped to the
active provider/profile. Codex profiles ignore legacy model caches without a
Codex provider tag and use a Codex fallback list when no provider-scoped cache
is available. Implemented in `152f2d0`; user acceptance was not reported.

---

## Thinking Mode Selector (2026-10-18)

The brain control below the composer opens a menu of thinking modes supported by
the current provider/model profile. The selected mode is stored per chat
session and sent as a request option where the provider adapter supports it.
Provider handling and actual reasoning behavior are not confirmed by the UI.

The button shows vertical level bars for an enabled mode. Auto uses an `A`
marker and Off uses the plain brain icon; neither shows bars. This selector
controls the request mode, not a universal guarantee that a provider exposes
or follows a particular internal reasoning level.

Implementation: `src/api/thinkingModes.ts` defines provider/model options;
`src/components/ChatApp.tsx` resolves and stores the session choice;
`src/components/ChatInputAttachments.tsx` renders the button and menu; and
`src/api/providers.ts` / `src/api/streaming.ts` map selections to request
options where supported. Commits: `ab97b7c`, `ddb94d3`, `dddc18a`.

## Wide Markdown Tables (2026-09-28)

Markdown tables in chat are wrapped in a horizontally scrollable container so
wide columns remain reachable on narrow or mobile chat panes. The renderer is
`src/components/scrollableMarkdownTables.ts`; it is integrated in
`src/components/MessageBubble.tsx` and `src/components/ChatMessages.tsx`, with
the layout styles in `styles/_chat.css` and generated `styles.css`. The user
confirmed the horizontal overflow fix works.

## Provider-Adaptive Progress — T60e/T15

The native `AgentLoop` displays a complete tool call as soon as its stream event
arrives, before the step finishes; approval and execution still wait for that
step to end (`2004e30`). Providers can buffer this complete event, so the UI
still does not expose partial arguments or a distinct waiting state while the
provider is preparing a call. The remaining planned follow-up adds generic
Thinking, Preparing tool, Waiting for provider, Executing tool, and Finishing
states plus provisional tool-call cards. Raw hidden reasoning remains
undisplayed. User acceptance of the timing change was not reported.

Transport and execution lifecycle belong to T60e; visual rendering belongs to
T15. Implementation must occur on the separate branch
`feat/t60e-provider-adaptive-streaming-ui`.

---

## Past-Session Links and Shared Tabs (2026-07-29)

Past-session result links open inside an internal tab strip in the existing chat panel. The toolbar and composer are shared across sessions; closing a tab does not delete its conversation. The active target message scrolls into view and is highlighted. Tabs use compact labels with horizontal scrolling; additional visual title polish is deferred.

When Enter is configured for a new line, Shift+Enter and Cmd/Ctrl+Enter still send the message. The detailed search, link, and tab design is documented in [Past-Session Search and Shared Tabs](past-session-search-and-tabs.md).

---

---

## Inline Context Reference Pills (2026-10-06)

Selected note, folder, tag, and active-note references use the teal inline pill
style in the composer, edit/resubmit mode, and rendered user messages. The
composer decoration preserves the reference text width and caret alignment,
while the pill border and fill repeat around each wrapped line. The composer
omits the folder icon for this reason; displayed folder references retain it.
Paperclip attachments (notes, images, and PDFs) remain separate removable
attachment chips rather than inline context pills. The composer rewrite also
separates attachment and decoration behavior into dedicated modules.

Implementation: `ChatInputDecorations.tsx` handles composer reference
decorations; `ChatInputAttachments.tsx` handles attachment interactions;
`ChatInput.tsx` composes these behaviors. `MessageBubble.tsx` styles references
in user messages;
`styles/_chat-extensions.css` contains the shared visual treatment and generated
`styles.css`. The composer rewrite and wrapped-pill fix shipped in `085afe0`
and `e47da0a`.

The latest cursor-position change applies reference-overlay styling only when
the composer text contains a matching reference (`2154721`). The user reported
that cursor placement still needed work; live acceptance of this change remains
pending.

## File Attachments (📎)

**Feature:** Allow users to attach vault files (markdown notes, images, PDFs) to chat messages for LLM consumption.

**State:**
- `messageAttachments: Attachment[]` in `ChatApp.tsx`, backed by the active
  session's `draftAttachments` so switching tabs restores that chat's unsent
  files instead of carrying them to another chat
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

The composer token estimate accounts for externally attached images with an
image-aware estimate rather than counting the encoded image payload as ordinary
text. It remains an estimate; provider-reported usage is retained separately
when available. This correction shipped in `ab97b7c`.

Unsent composer text and attachments belong to their session and are saved
locally before the first message is sent. JSONL storage keeps attachment draft
payloads in a separate per-session file so inline image data does not inflate
the session index. Clearing a draft removes the empty draft-only session on the
next autosave.

### Group-chat full replay (T19a, 2026-08-14)

Group messages now use the same persisted `resolvedParts` representation as single-chat messages. The group send path resolves attachments before dispatch, stores the parts on the user `ChatMessage`, and passes them through the participant router and orchestrator. Historical group messages replay their multimodal parts rather than collapsing to text. Relay messages carry both `attachments` and `resolvedParts` so remote messages remain available to local agents.

The current group implementation resolves once using the active profile. Images and text are provider-neutral; PDF behavior follows the provider selected during resolution. A future per-agent resolution pass may be needed if a group mixes providers with materially different file-part support.

**Files:** `useMessageActions.ts`, `ParticipantRouter.ts`, `Orchestrator.ts`, `WebSocketSyncAdapter.ts`, `types.ts`.

---

*Last Updated: 2026-08-14 16:42:00 IST*
