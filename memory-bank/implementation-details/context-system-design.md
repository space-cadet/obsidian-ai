# Context System Design: @ Mentions & Vault Integration
*Created: 2026-05-02 08:13:57 IST*
*Last Updated: 2026-05-02 23:21:14 IST*

## Overview

The context system lets users attach vault notes, text selections, and the active note to any chat message. Attached content is read from the vault, assembled into structured XML blocks, and prepended to the user's message before sending to the LLM.

---

## Mention Trigger Flow

```
User types "@" in ChatInput
        │
        ▼
MentionAutocomplete detects "@" trigger
  queries app.vault.getMarkdownFiles()
  filters by typed search term
        │
        ▼
┌─────────────────────────────────┐
│  Mention Popover                │
│  ──────────────────────────── │
│  📄 Project Notes               │  ← vault note results
│  📄 Meeting 2026-04-30          │
│  📄 Architecture Decisions      │
│  ...                            │
└─────────────────────────────────┘
        │
User selects a note
        │
        ▼
ContextEngine.addNote(file: TFile)
  adds to contextNotes[] (deduplicated by path)
  shows as chip in ContextBar
```

---

## Context Resolution Pipeline

```
ChatInput.onSubmit()
        │
        ▼
ContextEngine.resolveAll(contextNotes, options)
  │
  ├── for each contextNote:
  │   ├── app.vault.read(file)         → raw markdown
  │   ├── expandEmbeds(content)        → resolve ![[...]] recursively (depth ≤ 2)
  │   ├── resolveWikilinks(content)    → inline link text substitution
  │   └── wrap: <note name="{{title}}">{{content}}</note>
  │
  ├── if options.includeActiveNote:
  │   ├── app.workspace.getActiveFile()
  │   ├── app.vault.read(activeFile)
  │   └── wrap: <active-note name="{{title}}">{{content}}</active-note>
  │
  └── if options.selectedText:
      └── wrap: <selection>{{selectedText}}</selection>
        │
        ▼
assembleContextBlock(resolved[])
  → single string prepended to user message
```

---

## Context Block Format (sent to LLM)

```xml
<context>
  <note name="Project Notes">
    # Project Notes
    This project aims to...
    ...full note content...
  </note>
  <active-note name="Current Draft">
    # Current Draft
    ...
  </active-note>
  <selection>
    ...highlighted text from editor...
  </selection>
</context>

User message: Rewrite the intro of Project Notes to be more concise.
```

---

## Embed Expansion

```
Input:  "See ![[Architecture Decisions#Patterns]]"

Step 1: detect ![[...]] pattern
Step 2: resolve file: Architecture Decisions.md
Step 3: if heading specified (#Patterns):
          extract content under that heading only
        else:
          use full file content
Step 4: inline replace the ![[...]] with extracted content
Step 5: recurse (depth limit = 2 to prevent loops)

Output: "See [Architecture Decisions — Patterns]
         ## Patterns
         We use CodeMirror 6 extensions for..."
```

---

## Selection Bridge

The inline tooltip already captures `SelectionInfo {from, to, text}` in `currentSelectionState`. The chat panel taps into this:

```
User highlights text in editor
  → currentSelectionState updates (existing mechanism)

User opens ChatInput (or presses "Send to Chat" from inline tooltip)
  → ContextEngine.captureSelection()
      reads currentSelectionState from active EditorView
      adds to selectedTextContexts[]
      shows as chip: [Selected text (42 chars) ×]
```

---

## Active Note Toggle

```
ContextBar
  [✓ Include active note]  ← checkbox toggle (persisted in settings)

When toggled on:
  every message automatically includes the currently open note
  re-reads on each send (so note changes are reflected)
```

---

## Token Budget

### Request budget hierarchy (2026-08-23 — T48)

Every request should fit the following bounded budget before serialization:

```text
system prompt + tool definitions + current input + attachments
+ bounded history/summary + response/tool reserve <= model context budget
```

`characters / 4` remains a fallback estimate only. Provider usage should be
recorded when available. Full note, PDF, and attachment content must be capped
before it is combined with history; a fixed message count alone is insufficient.

```
ContextEngine.resolveAll() returns:
  { contextString: string, estimatedTokens: number }

Estimation:
  tokens ≈ characters / 4  (rough approximation)

If estimatedTokens > (modelContextWindow * 0.4):
  truncate each note to first N characters
  append: "[...truncated for context window]"
  warn user in ContextBar: "Context too large, notes truncated"
```

---

## Module Structure

```
src/
└── context/                          ← NEW directory
    ├── ContextEngine.ts
    │   ├── resolveAll()
    │   ├── addNote()
    │   ├── removeNote()
    │   ├── captureSelection()
    │   └── assembleContextBlock()
    ├── embedExpander.ts
    │   └── expandEmbeds()            ← recursive ![[]] resolution
    ├── wikilinkResolver.ts
    │   └── resolveWikilinks()
    └── tokenEstimator.ts
        └── estimateTokens()
```

---

## Component: MentionAutocomplete

```
<MentionAutocomplete
  query={searchTerm}
  files={app.vault.getMarkdownFiles()}
  onSelect={(file) => contextEngine.addNote(file)}
  onClose={() => setMentionOpen(false)}
/>

Renders as absolute-positioned popover above ChatInput.
Keyboard: ArrowUp/Down to navigate, Enter to select, Escape to close.
Max results: 10 (filtered by fuzzy match on file name).
```

---

## Data Flow Diagram

```
Vault (*.md files)
        │
        │  app.vault.read()
        ▼
ContextEngine ──────────────────────────────┐
        │                                   │
  resolves @mentions                  resolves ![[embeds]]
  resolves active note                       │
  captures selection                         │
        │                                   │
        └───────────┬───────────────────────┘
                    │
                    ▼
           assembleContextBlock()
                    │
                    ▼
        <context>...</context> string
                    │
                    ▼
        prepended to HumanMessage
                    │
                    ▼
           ChatApiManager.streamChat()
                    │
                    ▼
                  LLM
```

---

## Implementation Status (2026-05-02 23:21:14 IST)

### Done
- **Active note toggle** — `ContextBar` renders a toggle chip; `ChatApp.includeActiveNote` state drives injection
- **Note detection** — `getLeavesOfType('markdown')[0]` used in both `NoteEditingBridge` and `ChatApp`; works when chat sidebar is focused
- **Context injection** — `ChatApp.handleSend` reads active note via `vault.read()` and prepends:
  ```
  <context>
  <active-note name="...">...content...</active-note>
  </context>

  {{userMessage}}
  ```

### Not Yet Done
- `MentionAutocomplete` popover (`src/components/MentionAutocomplete.tsx`)
- `@` trigger detection in `ChatInput` textarea
- `ContextEngine.ts` for multi-note resolution
- `embedExpander.ts` for `![[]]` inline embeds
- Token estimation and truncation

---

## Token Counting Behavior (Added 2026-08-19 — T6a)

### Current Behavior

The `estimateTokens()` function in `tokenEstimator.ts` uses a simple heuristic:

```typescript
export const TOKEN_ESTIMATE_RATIO = 4;

export function estimateTokens(text: string): number {
    return Math.ceil(text.length / TOKEN_ESTIMATE_RATIO);
}
```

This is applied to:
- The user's current message text
- Attached context items (notes, folders, active note)
- Attachments (images, PDFs)

### What's Missing from the Count

The actual API request payload includes **much more** than what the plugin counts:

| Component | Counted? | Typical Size |
|---|---|---|
| User message text | ✅ Yes | 100–2,000 tokens |
| Attached context items | ✅ Yes | 500–50,000 tokens |
| System prompt (`buildSystemPrompt`) | ❌ No | 2,000–5,000 tokens |
| Conversation history (up to 10 turns) | ❌ No | 10,000–100,000+ tokens |
| Previous tool calls + results | ❌ No | 5,000–50,000 tokens |
| Message structure overhead | ❌ No | ~100–500 tokens |

### The Discrepancy

In a typical long conversation with DeepSeek V4:
- Plugin shows: **~8,000 tokens** (user message only)
- DeepSeek bills: **~850,000 tokens** (842K cache hit + 8K new)

The plugin undercounts by **100× or more** because it ignores:
1. The system prompt (persona, tool descriptions, system context)
2. All previous conversation turns
3. Tool call arguments and results

### Why Cache Hits Are Still Counted

DeepSeek's KV cache "hit" means they don't recompute attention for those tokens,
but they **still bill for them** as input tokens. The discount is significant
($0.007/M for cache hits vs $0.22/M for cache misses on V4-Flash off-peak),
but the tokens are still part of the bill.

### The Fix (T6a)

The token counter should optionally show the **full request payload** estimate:

```typescript
const chatMessages = [
    { role: "system", content: systemPrompt },
    ...history,  // up to maxContextMessages
    { role: "user", content: userMessage },
];

const fullPayloadTokens = estimateTokens(JSON.stringify(chatMessages));
```

A settings toggle (`showFullRequestTokens`, default `true`) controls whether
the UI shows the honest count or the legacy message-only count.

### References

- Task: [T6a — Token Counter Accuracy Fix](../tasks/T6a.md)
- Source: `src/context/tokenEstimator.ts`, `src/hooks/useMessageActions.ts`
