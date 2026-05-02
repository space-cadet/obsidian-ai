# Project Brief: obsidian-ai (Obsidian AI Plugin)
*Created: 2026-05-02 08:00:01 IST*
*Last Updated: 2026-05-02 08:13:57 IST*

## Overview

Obsidian AI is an Obsidian community plugin that provides AI-powered text assistance directly within the Obsidian editor. It started as a pure inline transformer (v1.2.4) and is being extended into a hybrid AI assistant combining a persistent chat panel with in-place note editing capabilities.

## Repository

- **GitHub**: space-cadet/obsidian-ai
- **Plugin ID**: obsidian-ai
- **Current Version**: 1.2.4
- **License**: GPL-3.0 / MIT
- **Author**: space-cadet

---

## Current Scope (v1.2.4 — Inline Only)

- Floating tooltip triggered by `Ctrl+K` / `Cmd+K` at cursor or selection
- AI text transformation with inline diff (added/removed visualization)
- Accept or discard changes with one click
- Supports OpenAI, Ollama, Gemini, Azure OpenAI, custom endpoints
- Custom slash-command prompts
- Single-turn only; no vault awareness; no chat history sent to LLM

---

## Proposed Scope (v2.0 — Chat + Edit)

### Core Goals

1. **Persistent Chat Panel** — sidebar `ItemView` for multi-turn AI conversation
2. **Vault Context Injection** — `@mention` notes to include their content in the LLM prompt
3. **In-Place Note Editing from Chat** — push AI responses directly into notes as diffs (the key differentiator from Obsidian Copilot)
4. **Note Creation from Chat** — `/create [[Note Name]]` generates and opens a new note with diffed content
5. **Streaming Responses** — progressive display of AI output
6. **Conversation Persistence** — save and reload chat sessions

### What Makes This Different from Copilot

Copilot keeps all AI responses inside the chat panel. Obsidian AI's chat panel can **apply responses directly to notes** — the same inline diff + accept/discard flow already in v1.2.4 — triggered from the sidebar. The chat is a command interface for the editor, not just a conversation tool.

---

## Tech Stack

### Current (v1.2.4)
- TypeScript, CodeMirror 6, LangChain, esbuild, ESLint, Prettier

### Additions for v2.0
- React + ReactDOM (chat panel UI)
- Plain CSS for chat panel styles (no Tailwind)

No new LangChain packages — `.stream()` is already in `@langchain/core`.

---

## Task Roadmap (v2.0)

| Task | Title | Priority | Status |
|---|---|---|---|
| T4 | Streaming | HIGH | ⬜ |
| T1 | Chat Panel (ItemView + React) | HIGH | ⬜ |
| T2 | Conversation Chain & Memory | HIGH | ⬜ |
| T3 | Context & Mentions System | HIGH | ⬜ |
| T5 | In-Place Note Editing from Chat | HIGH | ⬜ |
| T6 | Token & Context Management | MEDIUM | ⬜ |

Dependency order: T4 → T1 → {T2, T3} → T5; T6 depends on T1+T2.

---

## Project Structure (v2.0 target)

```
obsidian-ai/
├── src/
│   ├── main.ts                    # Plugin entry — registers both surfaces
│   ├── api.ts                     # ChatApiManager (callSelection + streamChat)
│   ├── settings.ts                # Extended settings schema
│   ├── default_prompts.ts         # Built-in prompts (unchanged)
│   ├── views/
│   │   └── ObsidianAIChatView.ts     # NEW: ItemView for chat panel
│   ├── components/                # NEW: React components
│   │   ├── ChatApp.tsx
│   │   ├── ActionBar.tsx
│   │   ├── ChatMessages.tsx
│   │   ├── MessageBubble.tsx
│   │   ├── ContextBar.tsx
│   │   ├── ChatInput.tsx
│   │   └── MentionAutocomplete.tsx
│   ├── conversation/              # NEW: conversation state
│   │   ├── ConversationManager.ts
│   │   └── types.ts
│   ├── context/                   # NEW: vault context engine
│   │   ├── ContextEngine.ts
│   │   ├── embedExpander.ts
│   │   ├── wikilinkResolver.ts
│   │   └── tokenEstimator.ts
│   ├── noteEditing/               # NEW: chat→editor bridge
│   │   ├── NoteEditingBridge.ts
│   │   └── noteEditingUtils.ts
│   └── modules/                   # EXISTING (unchanged)
│       ├── AIExtension.ts
│       ├── SelectionState.ts
│       ├── WidgetExtension.ts
│       ├── diffExtension.ts
│       ├── commands/
│       └── messageHistory/
├── memory-bank/
│   ├── integrated-rules-v6.12.md
│   ├── implementation-details/
│   │   ├── current-architecture.md
│   │   ├── proposed-architecture.md
│   │   ├── chat-panel-design.md
│   │   ├── context-system-design.md
│   │   └── note-editing-design.md
│   └── tasks/
│       ├── META-1.md
│       ├── T1.md – T6.md
│       └── sessions/
├── manifest.json
├── package.json
└── esbuild.config.mjs
```

## Development Workflow

- `pnpm run dev` — watch mode build
- `pnpm run build` — production build (type-check + bundle)
- `pnpm run package` — local timestamped release zip
- `pnpm run format` — Prettier formatting
