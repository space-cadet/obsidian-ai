# Proposed Architecture: Obsidian AI with Chat + Note Editing
*Created: 2026-05-02 08:13:57 IST*
*Last Updated: 2026-05-02 11:46:39 IST*

## Vision

Extend Obsidian AI into a hybrid AI assistant that combines:
- A **persistent sidebar chat panel** (Copilot-style) for multi-turn conversation, context injection, and vault-aware discussion
- **In-place note editing and creation** triggered from the chat (the key differentiator from Copilot)
- The existing **inline tooltip** retained for quick single-shot transforms

---

## Dual-Surface Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Obsidian Workspace                       │
│                                                                 │
│  ┌──────────────────────────┐  ┌────────────────────────────┐  │
│  │     Markdown Editor      │  │    Obsidian AI Chat Panel     │  │
│  │   (CodeMirror 6)         │  │    (ItemView sidebar)      │  │
│  │                          │  │                            │  │
│  │  ┌────────────────────┐  │  │  ┌──────────────────────┐  │  │
│  │  │ [existing inline   │  │  │  │  Message History     │  │  │
│  │  │  tooltip widget]   │  │  │  │  (scrollable thread) │  │  │
│  │  │  Quick transforms  │  │  │  │                      │  │  │
│  │  └────────────────────┘  │  │  │  User: ...           │  │  │
│  │                          │  │  │  AI: ...             │  │  │
│  │  ◄── diff decorations ◄──┼──┼──┤  [Apply to Note]     │  │  │
│  │     (accept/discard)     │  │  │                      │  │  │
│  │                          │  │  └──────────────────────┘  │  │
│  └──────────────────────────┘  │  ┌──────────────────────┐  │  │
│                                │  │  Context Bar         │  │  │
│                                │  │  [@note] [selection] │  │  │
│                                │  └──────────────────────┘  │  │
│                                │  ┌──────────────────────┐  │  │
│                                │  │  Chat Input          │  │  │
│                                │  │  @ mention support   │  │  │
│                                │  └──────────────────────┘  │  │
│                                └────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Architecture

```
Obsidian AIChatPlugin (main.ts)
│
├── ChatApiManager (api.ts) ← shared by both surfaces
│   ├── initializeChatClient()
│   ├── resolveActiveProviderProfile() ← NEW: profile-based provider config
│   ├── streamChat()          ← NEW: replaces callApi() for chat panel
│   ├── callSelection()       ← KEPT: used by inline tooltip
│   └── ConversationHistory   ← NEW: full message array
│
├── ProviderProfileService          ← NEW: multiple API keys/endpoints
│   ├── migrateLegacySettings()
│   ├── getActiveProfile()
│   └── validateProfile()
│
├── ModelDiscoveryService           ← NEW: provider model list + cache
│   ├── refreshModels(profile)
│   └── searchable ModelPicker
│
├── DebugLogService                 ← NEW: redacted diagnostics
│   ├── provider/model/chat/context events
│   └── copy/clear logs UI
│
├── Surface 1: Inline Tooltip (existing, unchanged)
│   └── FloatingTooltipExtension → WidgetExtension → diffExtension
│
├── Surface 2: Chat Panel (new)
│   ├── ObsidianAIChatView (ItemView)   ← NEW
│   │   └── React root
│   │       ├── ChatMessages          ← message thread display
│   │       ├── ChatInput             ← composer with @ mentions
│   │       ├── ContextBar            ← attached notes/selection display
│   │       ├── ChatEmptyState        ← tips/examples/setup warnings
│   │       └── ActionBar             ← New Chat / Load / Settings
│   │
│   ├── ConversationManager           ← NEW: state + persistence
│   └── ContextEngine                 ← NEW: vault note resolution
│
└── NoteEditingBridge (new)           ← connects chat panel → editor diff
    ├── applyToActiveNote()
    ├── applyToTargetNote()
    └── createNote()
```

---

## Shared vs New Components

| Component | Status | Notes |
|---|---|---|
| `ChatApiManager` | Modified | Add provider-profile resolution and `streamChat()` |
| `ObsidianAISettings` | Extended | Provider profiles, model cache, chat/context/debug settings |
| `FloatingTooltipExtension` | Unchanged | Inline tooltip kept as-is |
| `diffExtension` | Unchanged | Reused by chat panel via NoteEditingBridge |
| `SlashCommand` system | Reused | Extended with chat-specific commands |
| `ObsidianAIChatView` | New | Obsidian ItemView + React root |
| `ConversationManager` | New | Message state + persistence |
| `ContextEngine` | New | Vault note resolver + context assembly |
| `NoteEditingBridge` | New | Chat → editor diff dispatch |
| `ProviderProfileService` | New | Multiple provider profiles and legacy settings migration |
| `ModelDiscoveryService` | New | Fetch/cache/search provider models |
| `DebugLogService` | New | Redacted diagnostics and copyable logs |
| `ChatEmptyState` | New | Onboarding tips, examples, setup warnings |

---

## Request/Response Flow: Chat Panel

```
User types in ChatInput
  @[[Note A]] rewrite the intro
        │
        ▼
ContextEngine.resolveContext()
  reads @mention → app.vault.read("Note A.md")
  reads active note (if toggled)
  reads selectedText (if captured)
  assembles context blocks:
    <note name="Note A">...</note>
        │
        ▼
ConversationManager.buildMessages()
  [SystemMessage]
  [HumanMessage(turn 1)] ... [AIMessage(turn 1)]  ← full history
  [HumanMessage(turn N): context + userPrompt]
        │
        ▼
ChatApiManager.streamChat(messages)
  LangChain .stream() → async chunks
        │
        ▼
ChatMessages component
  progressive render of currentAiMessage
        │
        ▼
AI response complete → ConversationManager.append(aiMessage)
  persists to plugin.saveData()
        │
        ▼
[Apply to Note] button (if response is note content)
        │
        ▼
NoteEditingBridge.applyToTargetNote("Note A", aiText, selectionRange)
  dispatches setGeneratedResponseEffect into Note A's EditorView
  → diffExtension renders inline diff in Note A
  → User: Accept (replaces text) or Discard (removes diff)
```

---

## Request/Response Flow: Create Note from Chat

```
User: "/create [[Meeting Summary]] with action items from our discussion"
        │
        ▼
parseCommand() detects /create intent
        │
        ▼
ChatApiManager.streamChat() → AI generates full note content
        │
        ▼
NoteEditingBridge.createNote("Meeting Summary", content)
  app.vault.create("Meeting Summary.md", "")
  app.workspace.openLinkText("Meeting Summary.md")
  dispatches setGeneratedResponseEffect into new note's EditorView
        │
        ▼
diffExtension shows entire content as "added"
User accepts → note saved
User discards → app.vault.delete(file)
```

---

## Proposed Dependency Graph

```
T4 (Streaming)
  └──► T1 (Chat Panel — ItemView + React)
            ├──► T2 (Conversation Chain & Memory)
            │         └──► T6 (Token/Context Management)
            └──► T3 (Context & Mentions)
                      └──► T5 (In-Place Note Editing) ◄── reuses diffExtension
```

---

## New Dependencies Required

| Package | Purpose |
|---|---|
| `react` + `react-dom` | Chat panel UI rendering |
| `@types/react` | TypeScript types |
| `tailwindcss` | Utility CSS for chat UI (optional, could use plain CSS) |

No new LangChain packages needed — `.stream()` is already available in `@langchain/core`.

No vector store / indexing required for v1 — vault search is deferred.

---

## What Is NOT in Scope (Deferred)

- Vault-wide semantic search / vector indexing (Copilot's heaviest feature)
- PDF / image / YouTube / web page context
- Dataview query integration
- Context compaction / summarisation of long histories (T6 is basic truncation only)
- Mobile-specific UI optimisations
