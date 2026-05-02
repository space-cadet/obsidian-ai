# Note Editing Design: In-Place Edit & Create from Chat
*Created: 2026-05-02 08:13:57 IST*
*Last Updated: 2026-05-02 08:13:57 IST*

## Overview

This is the key differentiator from the Obsidian Copilot plugin. While Copilot keeps AI responses inside the chat panel, InlineAI can push AI-generated content directly into notes as an inline diff — the same accept/discard UX already present in the inline tooltip, but triggered from the sidebar chat.

---

## Three Editing Intents

```
┌─────────────────────────────────────────────────────────┐
│ Intent      │ Trigger               │ Effect             │
├─────────────┼───────────────────────┼────────────────────┤
│ edit-note   │ /edit [[Note]]        │ diff overlay on    │
│             │ "Apply to Note" btn   │ specified range    │
├─────────────┼───────────────────────┼────────────────────┤
│ create-note │ /create [[New Note]]  │ creates file, diff │
│             │                       │ shows full content │
├─────────────┼───────────────────────┼────────────────────┤
│ append-note │ /append [[Note]]      │ appends to end,    │
│             │                       │ no diff (direct)   │
└─────────────┴───────────────────────┴────────────────────┘
```

---

## Edit Note Flow

```
Chat panel: "Rewrite the intro of @[[Project Notes]]"
        │
        ▼
[Apply to Note] button appears on AI response bubble
        │
User clicks [Apply to Note]
        │
        ▼
NoteEditingBridge.applyToTargetNote(
  notePath: "Project Notes.md",
  aiText: "...",
  range: { from: 0, to: 120 }  ← derived from @mention context
)
        │
        ├── Open note if not already open:
        │   app.workspace.openLinkText("Project Notes.md", "", false)
        │
        ├── Get EditorView for that leaf:
        │   (markdownView.editor as any).cm as EditorView
        │
        ├── Set selection state:
        │   dispatch setSelectionInfoEffect({ from, to, text: originalText })
        │
        └── Dispatch diff:
            dispatch setGeneratedResponseEffect({
              airesponse: aiText,
              prompt: userPrompt
            })
            → diffExtension renders inline diff in the note
            → User sees [Accept] [Discard] in editor
```

---

## "Apply to Active Note" — Simplified Flow

```
Any chat response
        │
        ▼
[✓ Apply to Active Note]  button on message bubble
        │
        ▼
NoteEditingBridge.applyToActiveNote(aiText, userPrompt)
  │
  ├── get active MarkdownView
  ├── get current selection (or entire note if no selection)
  ├── dispatch setSelectionInfoEffect (current range)
  └── dispatch setGeneratedResponseEffect (aiText)
      → diffExtension renders diff → Accept / Discard
```

---

## Create Note Flow

```
User: "/create [[Meeting Summary]] summarise our action items"
        │
        ▼
parseCommand() detects /create intent
extracts target: "Meeting Summary"
        │
        ▼
ChatApiManager.streamChat() → AI generates full note markdown
        │
        ▼
NoteEditingBridge.createNote("Meeting Summary", aiContent)
  │
  ├── check if file exists:
  │   app.vault.getAbstractFileByPath("Meeting Summary.md")
  │   if exists: prompt user "Overwrite?" (modal)
  │
  ├── create empty file:
  │   app.vault.create("Meeting Summary.md", "")
  │
  ├── open in new tab:
  │   app.workspace.openLinkText("Meeting Summary.md", "", true)
  │
  ├── set selection to entire note (from:0, to:0):
  │   dispatch setSelectionInfoEffect({ from: 0, to: 0, text: "" })
  │
  └── dispatch diff (entire content as "added"):
      dispatch setGeneratedResponseEffect({
        airesponse: aiContent,
        prompt: "/create Meeting Summary"
      })
      → diffExtension shows all content as green additions
      → [Accept] saves the content
      → [Discard] deletes the file
```

---

## Append Note Flow

```
User: "/append [[Daily Notes/2026-05-02]] add a summary section"
        │
        ▼
NoteEditingBridge.appendToNote("Daily Notes/2026-05-02.md", aiContent)
  │
  ├── read current file content
  ├── append "\n\n" + aiContent
  └── app.vault.modify(file, newContent)
      (no diff — direct write, no accept/discard needed)
      Notifies user via Obsidian Notice: "Appended to Daily Notes/2026-05-02"
```

---

## NoteEditingBridge Module

```
src/
└── noteEditing/                     ← NEW directory
    ├── NoteEditingBridge.ts
    │   ├── applyToActiveNote(aiText, prompt)
    │   ├── applyToTargetNote(notePath, aiText, range, prompt)
    │   ├── createNote(noteName, aiContent)
    │   └── appendToNote(notePath, aiContent)
    │
    └── noteEditingUtils.ts
        ├── getEditorViewForNote(app, notePath)
        ├── resolveNoteRange(content, mentionContext)
        └── openNoteInWorkspace(app, notePath, newTab)
```

---

## UI: Message Bubble with Edit Actions

```
┌──────────────────────────────────────────────────────┐
│ InlineAI                                       10:14 │
│ ──────────────────────────────────────────────────── │
│ Here's a rewritten introduction for Project Notes:   │
│                                                      │
│ # Project Notes                                      │
│ This document captures key architectural decisions   │
│ for the InlineAI plugin...                           │
│                                                      │
│ ┌────────────────────────────────────────────────┐   │
│ │ [✓ Apply to Project Notes]  [✓ Apply to Active]│   │
│ │ [⎘ Copy]  [↺ Retry]                           │   │
│ └────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘

After clicking [✓ Apply to Project Notes]:

Editor (Project Notes.md):
┌──────────────────────────────────────────────────────┐
│ ~~Old introduction text~~  [removed widget]          │
│ [added widget] New introduction text                 │
│                                                      │
│             [✓ Accept]  [✗ Discard]                  │
└──────────────────────────────────────────────────────┘
```

---

## Reuse of Existing Machinery

The diff visualisation and accept/discard flow are **completely unchanged** from the current codebase:

| Existing Component | Reused How |
|---|---|
| `setGeneratedResponseEffect` | Dispatched by NoteEditingBridge |
| `setSelectionInfoEffect` | Dispatched by NoteEditingBridge |
| `diffDecorationState` | Automatically reacts, renders diff |
| `ChangeContentWidget` | Renders added/removed spans |
| `applyDiffPlugin` | Handles acceptTooltipEffect as before |
| `focusGuardPlugin` | Still guards focus during diff review |
| `acceptTooltipEffect` | Triggered by [Accept] in editor |
| `dismissTooltipEffect` | Triggered by [Discard] in editor |

NoteEditingBridge only needs to **open the target note** and **dispatch two effects** — the rest is free.

---

## Edge Cases

| Scenario | Handling |
|---|---|
| Target note not open | Open in background leaf, then dispatch |
| Target note does not exist | Prompt to create (reuses createNote flow) |
| Active note is read-only | Show error Notice |
| Note changes between chat and apply | Re-read and re-diff at apply time |
| Multiple pending diffs on same note | Not supported in v1; second apply closes first |
| /create with existing file name | Modal: Overwrite / Rename / Cancel |
