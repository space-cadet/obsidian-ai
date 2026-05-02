# Current Architecture: Obsidian AI Plugin (v1.2.4)
*Created: 2026-05-02 08:13:57 IST*
*Last Updated: 2026-05-02 12:09:43 IST*

## Overview

Obsidian AI v1.2.4 is a pure inline-editing plugin. The entire interaction surface is a transient CodeMirror widget anchored to the cursor/selection inside the active markdown editor. There is no persistent view, no chat panel, and no vault awareness.

---

## Extension Pipeline

Five CodeMirror extensions are registered in `main.ts:onload()`:

```
plugin.registerEditorExtension([
  FloatingTooltipExtension,   // widget rendering
  generatedResponseState,     // stores AI response
  currentSelectionState,      // stores selection {from, to, text}
  buildSelectionHiglightState,// highlights selection while widget is open
  diffExtension,              // renders inline diff + focus guard
])
```

---

## State Machine

```
User presses Ctrl+K
        │
        ▼
main.ts dispatches commandEffect
        │
        ▼
FloatingTooltipState.update()
  detects commandEffect
        │
        ▼
renderFloatingWidget()
  reads currentSelectionState {from, to, text}
  creates FloatingWidget decoration above cursor
        │
        ▼
FloatingWidget.toDOM()
  renders: [pencil icon] [CodeMirror input] [Submit btn] [Loader]
  focuses input field
        │
        ▼
User types prompt → presses Enter
        │
        ▼
FloatingWidget.submitAction()
  reads textFieldView doc → userPrompt
  reads selectionInfo.text → selectedText
  shows loader
        │
        ▼
ChatApiManager.callSelection(userPrompt, selectedText)
  parseCommand() → expands slash commands
  selects systemPrompt (cursor vs selection mode)
  builds finalUserPrompt with **Task** / **Input** / **Output** template
  enqueues to MessageQueue (UI history only)
        │
        ▼
ChatApiManager.callApi(systemPrompt, finalUserPrompt)
  sends [SystemMessage, HumanMessage] to LLM
  NO prior turns included
  uses .invoke() (blocking, no streaming)
        │
        ▼
ChatApiManager.handleEditorUpdate(response)
  dispatches setGeneratedResponseEffect → generatedResponseState
        │
        ▼
diffDecorationState.update()
  detects setGeneratedResponseEffect
  calls generateDiffView(state)
    reads generatedResponseState.airesponse
    reads currentSelectionState.text
    runs diff_match_patch + semantic cleanup
    builds RangeSetBuilder<Decoration>
      DIFF_INSERT → ChangeContentWidget("added")
      DIFF_DELETE → ChangeContentWidget("removed") replacing original
    returns DecorationSet
        │
        ▼
FloatingWidget.showActionButtons()
  hides Submit → shows [Accept] [Discard]
        │
   ┌────┴────┐
   ▼         ▼
Accept     Discard
   │         │
   ▼         ▼
acceptTooltipEffect   dismissTooltipEffect
   │         │
   ▼         ▼
applyDiffPlugin    FloatingTooltipState → Decoration.none
  dispatchAIChanges()  diffDecorationState → Decoration.none
  replaces [from,to]   generatedResponseState → null
  with aiText
```

---

## Module Map

```
src/
├── main.ts
│   └── Obsidian AIChatPlugin
│       ├── onload()
│       │   ├── loadSettings()
│       │   ├── new ChatApiManager(settings, app)
│       │   ├── registerEditorExtension([...])
│       │   ├── addCommand("show-cursor-tooltip")   ← Ctrl+K
│       │   └── addSettingTab(ObsidianAISettingsTab)
│       └── loadSettings() / saveSettings()
│
├── api.ts
│   └── ChatApiManager
│       ├── initializeChatClient()  ← provider switch: openai/ollama/gemini/azure/custom
│       ├── callApi()               ← [SystemMessage, HumanMessage] → .invoke()
│       ├── callSelection()         ← parseCommand + prompt assembly → handleEditorUpdate
│       ├── handleEditorUpdate()    ← dispatches setGeneratedResponseEffect
│       ├── updateSettings()        ← reinitialises chatClient on settings change
│       └── getMessageHistory()     ← returns MessageQueue items (UI use only)
│
├── settings.ts
│   ├── ObsidianAISettings (interface)
│   ├── DEFAULT_SETTINGS
│   └── ObsidianAISettingsTab (PluginSettingTab)
│
├── default_prompts.ts
│   ├── selectionPrompt  ← system prompt when text is selected
│   └── cursorPrompt     ← system prompt when no selection (cursor mode)
│
└── modules/
    ├── AIExtension.ts
    │   ├── AIResponse (interface: airesponse, prompt)
    │   ├── setGeneratedResponseEffect
    │   └── generatedResponseState (StateField<AIResponse|null>)
    │
    ├── SelectionState.ts
    │   ├── SelectionInfo (interface: from, to, text)
    │   ├── setSelectionInfoEffect
    │   ├── currentSelectionState (StateField<SelectionInfo|null>)
    │   └── buildSelectionHiglightState (StateField<DecorationSet>)
    │
    ├── WidgetExtension.ts
    │   ├── commandEffect
    │   ├── dismissTooltipEffect
    │   ├── acceptTooltipEffect
    │   ├── FloatingWidget (WidgetType)
    │   │   ├── toDOM()           ← builds widget DOM
    │   │   ├── submitAction()    ← calls chatApiManager.callSelection()
    │   │   ├── showActionButtons()
    │   │   ├── acceptAction()    ← dispatches acceptTooltipEffect
    │   │   └── discardAction()   ← dispatches dismissTooltipEffect
    │   ├── FloatingTooltipState() ← StateField<DecorationSet>
    │   └── FloatingTooltipExtension()
    │
    ├── diffExtension.ts
    │   ├── ChangeContentWidget   ← "added"/"removed" inline spans
    │   ├── generateDiffView()    ← diff_match_patch → DecorationSet
    │   ├── dispatchAIChanges()   ← applies accepted text to editor
    │   ├── diffDecorationState   ← StateField<DecorationSet>
    │   ├── applyDiffPlugin       ← ViewPlugin: handles acceptTooltipEffect
    │   ├── focusGuardPlugin      ← ViewPlugin: prevents Obsidian re-renders
    │   └── diffExtension[]       ← exported composite extension
    │
    ├── commands/
    │   ├── source.ts
    │   │   ├── SlashCommand (interface: keyword, prompt)
    │   │   ├── slashCommandAutocompletion()  ← CM6 autocomplete extension
    │   │   └── createSlashCommandHighlighter() ← ViewPlugin decoration
    │   └── parser.ts
    │       └── parseCommand()    ← replaces /keyword with prompt text
    │
    └── messageHistory/
        └── queue.ts
            └── MessageQueue<T>   ← fixed-length FIFO, dedup, arrow-key nav only
```

---

## Data Flow: What the LLM Sees

```
SystemMessage: <selectionPrompt or cursorPrompt from settings>

HumanMessage:
  **Task:** <userPrompt after slash-command expansion>
  **Input:**
  <selectedText>         ← only the highlighted text, nothing else
  **Output:**
```

No vault content. No other notes. No conversation history. No file paths. No metadata.

---

## Key Constraints of Current Design

| Constraint | Root Cause |
|---|---|
| No chat panel | UI is a CodeMirror WidgetType, not an ItemView |
| No multi-turn | `callApi()` sends exactly 2 messages; MessageQueue never sent to LLM |
| No vault context | Only `selectedText` passed; no `app.vault` calls anywhere |
| No streaming | Uses `.invoke()` (blocking); no chunk callbacks |
| No persistence | Nothing written to disk beyond plugin settings |
| No model discovery | Model is a manual text field; no provider model fetching/cache |
| No diagnostics UI | Errors go to console/Notice only; no structured log history |
| No chat guidance | Chat scaffold has minimal empty-state/user-tip support |
| Editor-bound | Widget anchored to CodeMirror editor; dies on dismiss |
| Single suggestion | One `generatedResponseState` per editor instance |
| All-or-nothing accept | `dispatchAIChanges()` replaces entire selection range |

---

## Settings Schema

```typescript
interface ProviderProfile {
  id: string
  name: string
  provider: "openai" | "ollama" | "custom" | "gemini" | "azure"
  model: string
  apiKey?: string             // per-profile API key
  customURL?: string
  azureEndpoint?: string
  azureApiVersion?: string
}

interface ObsidianAISettings {
  providerProfiles: ProviderProfile[]
  activeProviderProfileId: string
  selectionPrompt: string     // system prompt (text selected)
  cursorPrompt: string        // system prompt (cursor only)
  customCommands: SlashCommand[]
  commandPrefix: string       // default "/"
  messageHistory: boolean     // toggles MessageQueue (UI nav only)
}
```

---

## AI Provider Support

| Provider | LangChain Class | Notes |
|---|---|---|
| openai | `ChatOpenAI` | Requires `apiKey` |
| ollama | `ChatOllama` | Local; no key needed |
| gemini | `ChatGoogleGenerativeAI` | Requires `apiKey` |
| azure | `AzureChatOpenAI` | Requires `apiKey` + `azureEndpoint` |
| custom | `ChatOpenAI` with `baseURL` | Any OpenAI-compatible endpoint |
