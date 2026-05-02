# System Patterns: InlineAI Plugin
*Created: 2026-05-02 08:00:01 IST*
*Last Updated: 2026-05-02 08:13:57 IST*

## Core Principles

1. **KIRSS**: Keep It Really Simple, Stupid — prefer simple solutions, avoid over-engineering
2. **Explicit Approval**: No file modifications, feature additions, or code generation without user approval
3. **Incremental Progress**: Small, validated steps; go slow and steady
4. **Non-Destructive**: Nothing changes in a note until the user explicitly accepts a diff
5. **Obsidian-First**: Follow Obsidian plugin conventions and API patterns
6. **Reuse Before Build**: Prefer dispatching existing effects over reimplementing diff logic

---

## Pattern 1: CodeMirror 6 Extension Pipeline

All inline editor integrations use the CM6 extension system:

- **StateField**: per-editor state (e.g. `generatedResponseState`, `currentSelectionState`)
- **StateEffect**: typed events that mutate state (e.g. `commandEffect`, `acceptTooltipEffect`)
- **ViewPlugin**: react to view changes (e.g. `focusGuardPlugin`, `applyDiffPlugin`)
- **Decoration / WidgetType**: visual markers (e.g. diff spans, floating tooltip)

Extensions registered once via `plugin.registerEditorExtension([...])` in `onload()`.

```
commandEffect → FloatingTooltipState → FloatingWidget
                                            │
                                     submitAction()
                                            │
                                   setGeneratedResponseEffect
                                            │
                                    diffDecorationState → ChangeContentWidget
                                            │
                              acceptTooltipEffect / dismissTooltipEffect
                                            │
                                    applyDiffPlugin / clear
```

---

## Pattern 2: Two-Surface Architecture (v2.0)

```
┌─────────────────────────────────────────────────────────┐
│  Surface 1: Inline Tooltip          Surface 2: Chat     │
│  (CodeMirror WidgetType)            (Obsidian ItemView) │
│                                                         │
│  Ctrl+K → FloatingWidget            Ribbon → ChatPanel  │
│  Single-turn transform              Multi-turn chat     │
│  Inline diff in editor              Sidebar conversation│
│                                     + Apply to Note     │
│                ▼                              ▼         │
│           ChatApiManager.callSelection()  .streamChat() │
│                                                         │
│                     ▼       ▼                           │
│             diffExtension  NoteEditingBridge            │
│                    (shared CM6 effects)                 │
└─────────────────────────────────────────────────────────┘
```

Both surfaces share `ChatApiManager` and all CM6 state effects. Neither modifies the other.

---

## Pattern 3: NoteEditingBridge — Effect Dispatch Only

`NoteEditingBridge` is a pure connector. It never reimplements diff logic. Its entire job:

1. Ensure the target note is open in a leaf
2. Get the `EditorView` for that leaf
3. Dispatch `setSelectionInfoEffect` (what range to replace)
4. Dispatch `setGeneratedResponseEffect` (what AI text to show)

Then `diffDecorationState`, `ChangeContentWidget`, `applyDiffPlugin` do the rest — unchanged.

```
NoteEditingBridge
  .applyToTargetNote(notePath, aiText, range)
        │
        ├── openNoteInWorkspace(app, notePath)
        ├── getEditorViewForNote(app, notePath)
        ├── dispatch(setSelectionInfoEffect({ from, to, text }))
        └── dispatch(setGeneratedResponseEffect({ airesponse, prompt }))
                        │
                        ▼
              [existing diffExtension handles everything else]
```

---

## Pattern 4: AI Provider Pattern

`ChatApiManager` is the single point of contact for AI calls:

- **v1 (inline)**: `callSelection()` → `callApi()` → `.invoke()` (blocking)
- **v2 (chat)**: `streamChat()` → `.stream()` (async iterable chunks)

Provider selected at initialisation via settings; same `chatClient` used by both methods.

---

## Pattern 5: Context Assembly

Context always assembled as XML blocks before the user message:

```
<context>
  <note name="{{title}}">{{content}}</note>
  <active-note name="{{title}}">{{content}}</active-note>
  <selection>{{text}}</selection>
</context>

{{userMessage}}
```

LLM sees a single `HumanMessage` with context prepended. System prompt is separate (`SystemMessage`). Prior turns are the full `[HumanMessage, AIMessage, ...]` history array.

---

## Pattern 6: React in Obsidian ItemView

```typescript
class InlineAIChatView extends ItemView {
  private root: ReactDOM.Root | null = null;

  async onOpen() {
    this.root = ReactDOM.createRoot(this.containerEl.children[1]);
    this.root.render(<ChatApp plugin={this.plugin} />);
  }

  async onClose() {
    this.root?.unmount();
    this.root = null;
  }
}
```

React is bundled into `main.js` by esbuild — no separate chunk. State lives in React component state and `ConversationManager`; not in CM6 StateFields.

---

## Pattern 7: Settings Pattern

- All configurable values in `InlineAISettings` interface (`settings.ts`)
- `DEFAULT_SETTINGS` provides fallbacks
- Settings tab (`InlineAISettingsTab`) mutates `plugin.settings` and calls `saveSettings()`
- v2.0 settings additions: `chatPanelPosition`, `includeActiveNote`, `maxContextTokens`, `maxSavedConversations`

---

## Memory Bank Update Protocol

When updating memory bank files:
1. Always update `*Last Updated: YYYY-MM-DD HH:MM:SS IST*` at the top
2. Add an entry to `edit_history.md` (newest first)
3. Update `activeContext.md` to reflect current focus
4. Update `tasks.md` and `progress.md` as tasks change state
5. Update `session_cache.md` at the end of each session
6. Never delete session files — append-only history

---

## Timestamp Format

All timestamps use: `YYYY-MM-DD HH:MM:SS IST`
Example: `2026-05-02 08:13:57 IST`

## Task Status Indicators

- 🔄 In Progress
- ✅ Completed
- ⏸️ Paused
- ❌ Cancelled
- ⬜ Not Started

## File Naming Conventions

- Task files: `tasks/T{N}.md` (e.g. T1.md, T2.md)
- Session files: `sessions/YYYY-MM-DD-{period}.md` (e.g. 2026-05-02-morning.md)
- Edit chunks: `edits/YYYY-MM-DD/{HHMMSS}-{id}.md`
- Implementation docs: `implementation-details/{kebab-name}.md`
