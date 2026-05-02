# Technical Context: Obsidian AI Plugin
*Created: 2026-05-02 08:00:01 IST*
*Last Updated: 2026-05-02 08:13:57 IST*

## Runtime Environment

- **Host Application**: Obsidian (Electron desktop / mobile WebView)
- **Minimum Obsidian Version**: 0.15.0
- **Platform**: Desktop + Mobile (`isDesktopOnly: false`)
- **JS Environment**: Browser-like (Electron renderer / mobile WebView)

---

## Current Stack (v1.2.4)

### Language & Tooling

| Tool | Version | Purpose |
|---|---|---|
| TypeScript | ^5.6.3 | Primary language |
| esbuild | ^0.25.0 | Bundle + transpile |
| ESLint | ^8.x | Linting |
| Prettier | ^3.6.2 | Formatting |
| Husky | ^9.1.7 | Git hooks |
| lint-staged | ^15.5.2 | Pre-commit formatting |

### Editor Integration (CodeMirror 6)

| Package | Version | Role |
|---|---|---|
| `@codemirror/state` | ^6.5.1 | StateField, StateEffect, transactions |
| `@codemirror/view` | ^6.36.2 | EditorView, WidgetType, Decoration, ViewPlugin |
| `@codemirror/commands` | ^6.8.0 | Keymap bindings |
| `@codemirror/autocomplete` | ^6.18.4 | Slash-command autocomplete |

### AI Provider Abstraction (LangChain)

| Package | Version | Provider |
|---|---|---|
| `@langchain/core` | ^0.3.16 | BaseMessage, `.invoke()`, `.stream()` |
| `@langchain/openai` | ^0.3.11 | OpenAI + Azure OpenAI |
| `@langchain/ollama` | ^0.1.1 | Ollama (local) |
| `@langchain/google-genai` | ^0.2.1 | Google Gemini |

### Utilities

| Package | Version | Role |
|---|---|---|
| `diff-match-patch` | ^1.0.5 | Diff computation for inline visualization |

---

## Proposed Additions (v2.0)

### React UI (Chat Panel)

| Package | Purpose |
|---|---|
| `react` | UI rendering in ItemView |
| `react-dom` | DOM mounting |
| `@types/react` | TypeScript types |
| `@types/react-dom` | TypeScript types |

Plain CSS for chat panel styles — no Tailwind to minimise bundle size.

### No Other New Packages

`.stream()` is already available in `@langchain/core` — no new LangChain packages needed.

No vector store library — vault semantic search is deferred.

---

## Architecture: Current (v1.2.4)

```
Obsidian Plugin Host
        │
        │ registerEditorExtension([...])
        ▼
CodeMirror 6 Editor Instance
        │
        ├── FloatingTooltipExtension  (StateField<DecorationSet>)
        │   └── FloatingWidget (WidgetType)
        │       └── submitAction() → ChatApiManager.callSelection()
        │
        ├── generatedResponseState    (StateField<AIResponse|null>)
        ├── currentSelectionState     (StateField<SelectionInfo|null>)
        ├── buildSelectionHiglightState (StateField<DecorationSet>)
        │
        └── diffExtension             (composite extension)
            ├── diffDecorationState   (StateField<DecorationSet>)
            ├── applyDiffPlugin       (ViewPlugin)
            └── focusGuardPlugin      (ViewPlugin)

ChatApiManager
  └── chatClient: ChatOpenAI | ChatOllama | ChatGoogleGenerativeAI | AzureChatOpenAI
  └── .invoke() → single HumanMessage + SystemMessage (blocking)
  └── MessageQueue (UI-only prompt history, 20 items max)
```

---

## Architecture: Proposed (v2.0)

```
Obsidian Plugin Host
        │
        ├── registerView(CHAT_VIEWTYPE, ObsidianAIChatView)   ← NEW
        │
        ├── registerEditorExtension([...])  ← UNCHANGED
        │
        ├── Surface 1: Inline Tooltip       ← UNCHANGED
        │   (FloatingTooltipExtension + diffExtension)
        │
        └── Surface 2: Chat Panel           ← NEW
            │
            ObsidianAIChatView (ItemView)
              └── React Root
                  ├── <ActionBar>
                  ├── <ChatMessages>        → ConversationManager
                  ├── <ContextBar>          → ContextEngine
                  └── <ChatInput>           → @mention autocomplete

ChatApiManager (extended)
  ├── callSelection()  ← UNCHANGED (inline tooltip)
  ├── streamChat(messages, signal)  ← NEW (chat panel)
  └── chatClient (unchanged)

ConversationManager (NEW)
  ├── active Conversation (ChatMessage[])
  ├── buildLangChainMessages() → BaseMessage[]
  ├── saveData() / loadData()  → plugin.saveData()
  └── token budget check (T6)

ContextEngine (NEW)
  ├── resolveAll(contextNotes, options)
  │   ├── app.vault.read(file)
  │   ├── embedExpander.expandEmbeds()
  │   └── assembleContextBlock() → XML string
  └── tokenEstimator.estimateTokens()

NoteEditingBridge (NEW)
  ├── applyToActiveNote()   → dispatch effects → diffExtension
  ├── applyToTargetNote()   → open note → dispatch effects → diffExtension
  ├── createNote()          → vault.create() → open → dispatch effects
  └── appendToNote()        → vault.read() → vault.modify()
```

---

## Build System

- **Entry**: `src/main.ts`
- **Output**: `main.js` (single bundle, no external runtime deps)
- **Config**: `esbuild.config.mjs`
- **React**: bundled into `main.js` (no separate chunk needed for Obsidian plugins)
- **Type Check**: `tsc -noEmit -skipLibCheck` (build only, not dev)

---

## Obsidian API Usage

### Current
- `Plugin`, `MarkdownView`, `App`, `EditorView`
- `registerEditorExtension()`, `addCommand()`, `addSettingTab()`

### Additional for v2.0
- `ItemView`, `WorkspaceLeaf` — chat panel view
- `app.vault.getMarkdownFiles()` — list notes for @mention
- `app.vault.read(file)` — read note content for context
- `app.vault.create(path, content)` — create new note
- `app.vault.modify(file, content)` — append to note
- `app.workspace.getActiveFile()` — active note for auto-include
- `app.workspace.openLinkText()` — open target note for diff

---

## Settings Schema (v2.0 additions)

```typescript
interface ObsidianAISettings {
  // --- existing ---
  provider: "openai" | "ollama" | "custom" | "gemini" | "azure"
  model: string
  apiKey?: string
  customURL?: string
  azureEndpoint?: string
  azureApiVersion?: string
  selectionPrompt: string
  cursorPrompt: string
  customCommands: SlashCommand[]
  commandPrefix: string
  messageHistory: boolean

  // --- new (v2.0) ---
  chatPanelPosition: "right" | "left" | "tab"  // where to open chat
  includeActiveNote: boolean                     // auto-include active note
  maxContextTokens: number                       // default 8000
  maxSavedConversations: number                  // default 20
}
```
