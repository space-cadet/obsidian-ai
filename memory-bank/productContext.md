# Product Context: InlineAI Plugin
*Created: 2026-05-02 00:00:00 UTC*
*Last Updated: 2026-05-02 00:00:00 UTC*

## Problem Statement

Obsidian users who want AI-assisted writing must leave their editor to use external AI tools, breaking their workflow. InlineAI solves this by embedding AI text transformation directly into the Obsidian editor with a native feel.

## Target Users

- **Knowledge workers** using Obsidian for notes, writing, and research
- **Writers** who want AI suggestions without context-switching
- **Developers** using Obsidian for documentation who want local model privacy
- **Power users** who want customizable AI prompts integrated into their PKM workflow

## User Experience Goals

1. **Minimal friction**: Trigger AI with a single keyboard shortcut
2. **Transparency**: Show exactly what the AI changed via inline diffs
3. **Control**: Accept or discard AI suggestions before they are applied
4. **Flexibility**: Bring your own API key and model provider
5. **Privacy**: Support local models via Ollama for offline/private use

## Core User Flows

### Flow 1: Transform Selected Text
1. User selects text in Obsidian editor
2. User presses `Ctrl+K` / `Cmd+K`
3. Floating tooltip appears with prompt input
4. User types transformation instruction
5. AI response shown as inline diff (additions/deletions)
6. User accepts or dismisses the change

### Flow 2: Cursor-Position AI Assistance
1. User places cursor (no selection)
2. User presses `Ctrl+K` / `Cmd+K`
3. Tooltip appears for text generation at cursor position
4. AI generates content shown inline
5. User accepts or dismisses

### Flow 3: Custom Command Usage
1. User defines custom prompts in plugin settings
2. Custom prompt appears as an Obsidian command
3. User triggers via command palette or hotkey
4. Same diff + accept/dismiss flow as above

## Competitive Context

- **Cursor**: IDE-level AI for code; InlineAI brings a similar paradigm to Obsidian notes
- **Obsidian Copilot**: Tab-completion focused; InlineAI focuses on transformation/editing
- **ChatGPT/Claude web**: External tools that break the in-editor workflow

## Current Capabilities (v1.2.4)

- OpenAI, Ollama, Gemini, Azure OpenAI provider support
- Inline diff visualization with accept/discard
- Custom system and transformation prompts
- Message history queue
- Focus guard to prevent editor re-renders during widget interactions
- Desktop and mobile support (`isDesktopOnly: false`)

## Known Limitations

- Requires manual API key configuration per provider
- No built-in model discovery (user must know model names)
- Single active suggestion at a time
