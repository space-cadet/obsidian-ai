# Note Editing Design: Chat to Note Diff Review
*Created: 2026-05-02 08:13:57 IST*
*Last Updated: 2026-10-21 17:52:24 IST*

## Current Behavior (T75)

Chat Lab can apply an assistant response to a note through CodeMirror diff
review. The user chooses an Apply action in chat, inspects the proposed
changes in the note, then accepts or discards them from the command palette.
This is the supported note-editing flow.

The former selection/cursor tooltip editor and its custom prompt commands were
removed under T75. Older architecture notes that describe that editor are
historical snapshots.

## Apply a Response to a Note

`ChatApp` resolves the target Markdown view and calls
`NoteEditingBridge.applyToNote`. The bridge reads the current document and
dispatches `setEditContextEffect` and `setGeneratedResponseEffect` together.
`diffExtension` compares the current text with the proposed response and shows
the additions and removals. `Accept AI note edit` applies the response;
`Discard AI note edit` clears the preview without changing the note.

```text
Any chat response → choose an Apply-to-note action → inspect the diff in the
target note → run Accept or Discard from Obsidian's command palette.
```

## Create Note Flow

`NoteEditingBridge.createNote` creates an empty Markdown file, opens it, and
shows the proposed content as a diff. Accept applies the content. Discard
clears the preview and leaves the newly created file empty.

## Append Note Flow

`NoteEditingBridge.appendToNote` reads the current file and writes the appended
content directly, then confirms the action with an Obsidian Notice.

## CodeMirror State and Commands

```text
NoteEditingBridge
  ├── setEditContextEffect + setGeneratedResponseEffect
  └── diffExtension renders and applies the proposed replacement

Obsidian command palette
  ├── Accept AI note edit → acceptAIEditEffect, then clearAIEditEffect
  └── Discard AI note edit → clearAIEditEffect
```

The proposal remains in CodeMirror state until accepted. Discard clears the
proposal without writing the proposed text into the note.
