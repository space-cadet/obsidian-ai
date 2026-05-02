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
