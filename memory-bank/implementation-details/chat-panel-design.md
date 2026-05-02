# Chat Panel Design: InlineAIChatView
*Created: 2026-05-02 08:13:57 IST*
*Last Updated: 2026-05-02 08:13:57 IST*

## Overview

The chat panel is a persistent Obsidian `ItemView` rendered in the right sidebar. It replaces the transient tooltip as the primary conversational surface while leaving the inline tooltip intact for quick transforms.

---

## Obsidian Integration

```typescript
// Registration in main.ts
const CHAT_VIEWTYPE = "inlineai-chat-view";

this.registerView(CHAT_VIEWTYPE, (leaf) => new InlineAIChatView(leaf, this));

// Open via ribbon + command
this.addRibbonIcon("message-square", "Open InlineAI Chat", () => {
  this.activateChatView();
});

async activateChatView() {
  const { workspace } = this.app;
  let leaf = workspace.getLeavesOfType(CHAT_VIEWTYPE)[0];
  if (!leaf) {
    leaf = workspace.getRightLeaf(false);
    await leaf.setViewState({ type: CHAT_VIEWTYPE, active: true });
  }
  workspace.revealLeaf(leaf);
}
```

---

## ItemView Class

```
InlineAIChatView extends ItemView
│
├── getViewType()  → CHAT_VIEWTYPE
├── getDisplayText() → "InlineAI Chat"
├── getIcon()        → "message-square"
│
├── onOpen()
│   ├── mount React root to this.containerEl
│   └── render <ChatApp plugin={this.plugin} />
│
└── onClose()
    └── unmount React root
```

---

## React Component Tree

```
<ChatApp>
│
├── <ActionBar>
│   ├── [New Chat]    ← clears conversation
│   ├── [Load Chat ▾] ← dropdown of saved conversations
│   └── [Settings ⚙]  ← opens plugin settings
│
├── <ChatMessages>  (scrollable, flex-col-reverse)
│   ├── <MessageBubble role="user">
│   │   ├── markdown rendered text
│   │   └── timestamp
│   ├── <MessageBubble role="assistant">
│   │   ├── markdown rendered text (streaming-aware)
│   │   ├── [Copy] button
│   │   ├── [Apply to Active Note] button   ← NoteEditingBridge
│   │   └── [Apply to: [[Note Name]]] button ← when note mentioned
│   └── <TypingIndicator>  ← shown during stream
│
├── <ContextBar>  (shows attached context, collapsible)
│   ├── <ContextChip note="Note A" onRemove={...} />
│   ├── <ContextChip type="selection" onRemove={...} />
│   └── [+ Add note]
│
└── <ChatInput>
    ├── <Textarea>  (auto-resize, multiline)
    │   └── @ triggers mention autocomplete popover
    ├── <MentionPopover>  (vault note search results)
    ├── [⏹ Stop]   ← shown during streaming (AbortController)
    └── [↑ Send]   ← or Enter key
```

---

## UI Layout (ASCII)

```
┌─────────────────────────────────┐
│ InlineAI Chat          [≡] [⚙] │  ← ActionBar
│ [+ New]  [↺ Load ▾]            │
├─────────────────────────────────┤
│                                 │
│  ┌───────────────────────────┐  │
│  │ You                 10:13 │  │  ← user bubble (right-aligned)
│  │ Rewrite the intro of      │  │
│  │ @[[Project Notes]]        │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │ InlineAI            10:13 │  │  ← assistant bubble (left-aligned)
│  │ Here's a rewritten intro: │  │
│  │                           │  │
│  │ # Project Notes           │  │
│  │ This project aims to...   │  │
│  │                           │  │
│  │ [✓ Apply to Note] [⎘ Copy]│  │
│  └───────────────────────────┘  │
│                                 │
│  ▌ (typing indicator)           │
│                                 │
├─────────────────────────────────┤
│ Context: [@Project Notes] [×]   │  ← ContextBar
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │ Ask anything... @note       │ │  ← ChatInput textarea
│ │                             │ │
│ └─────────────────────────────┘ │
│                        [↑ Send] │
└─────────────────────────────────┘
```

---

## Message Data Model

```typescript
interface ChatMessage {
  id: string;               // uuid
  role: "user" | "assistant" | "system";
  content: string;          // markdown text
  timestamp: number;        // Date.now()
  isStreaming?: boolean;     // true while chunks arriving
  isError?: boolean;
  contextRefs?: string[];   // note paths attached to this message
}

interface Conversation {
  id: string;
  title: string;            // auto-generated from first user message
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}
```

---

## Streaming Implementation

```typescript
// ChatApiManager (modified)
async *streamChat(
  messages: BaseMessage[],
  signal: AbortSignal
): AsyncIterable<string> {
  const stream = await this.chatClient.stream(messages, { signal });
  for await (const chunk of stream) {
    yield chunk.content.toString();
  }
}

// Chat component usage
const controller = new AbortController();
let fullText = "";

for await (const chunk of chatApi.streamChat(messages, controller.signal)) {
  fullText += chunk;
  setCurrentAiMessage(fullText);  // React state → re-render
}

setMessages(prev => [...prev, { role: "assistant", content: fullText }]);
setCurrentAiMessage("");
```

---

## Conversation Persistence

```typescript
// Stored via plugin.saveData() under key "conversations"
interface StoredData {
  conversations: Conversation[];
  activeConversationId: string | null;
}

// Max stored conversations: 20 (oldest pruned)
// Max messages per conversation: stored in full (compaction deferred to T6)
```

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Send message |
| `Shift+Enter` | New line in input |
| `@` | Open mention autocomplete |
| `Escape` | Close mention popover / cancel stream |
| `Ctrl+K` / `Cmd+K` | Still opens inline tooltip in editor (unchanged) |
