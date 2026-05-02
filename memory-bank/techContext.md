# Technical Context: InlineAI Plugin
*Created: 2026-05-02 00:00:00 UTC*
*Last Updated: 2026-05-02 00:00:00 UTC*

## Runtime Environment

- **Host Application**: Obsidian (Electron-based desktop app / mobile app)
- **Minimum Obsidian Version**: 0.15.0
- **Platform**: Desktop + Mobile (`isDesktopOnly: false`)
- **JavaScript Environment**: Browser-like (Electron renderer / mobile WebView)

## Language & Tooling

| Tool | Version | Purpose |
|------|---------|---------|
| TypeScript | ^5.6.3 | Primary language |
| esbuild | ^0.25.0 | Bundle + transpile |
| ESLint | ^8.x | Linting |
| Prettier | ^3.6.2 | Formatting |
| Husky | ^9.1.7 | Git hooks |
| lint-staged | ^15.5.2 | Pre-commit formatting |

## Core Dependencies

### Editor Integration (CodeMirror 6)
| Package | Version | Role |
|---------|---------|------|
| `@codemirror/state` | ^6.5.1 | Editor state management |
| `@codemirror/view` | ^6.36.2 | DOM rendering, widgets, decorations |
| `@codemirror/commands` | ^6.8.0 | Editor commands |
| `@codemirror/autocomplete` | ^6.18.4 | Autocomplete infrastructure |

### AI Provider Abstraction (LangChain)
| Package | Version | Provider |
|---------|---------|---------|
| `@langchain/core` | ^0.3.16 | Base abstractions |
| `@langchain/openai` | ^0.3.11 | OpenAI + Azure OpenAI |
| `@langchain/ollama` | ^0.1.1 | Ollama (local models) |
| `@langchain/google-genai` | ^0.2.1 | Google Gemini |

### Utilities
| Package | Version | Role |
|---------|---------|------|
| `diff-match-patch` | ^1.0.5 | Diff computation for inline visualization |

## Architecture Overview

### CodeMirror Extension Pipeline

The plugin registers multiple CodeMirror 6 extensions with Obsidian:

```
FloatingTooltipExtension  →  Renders the trigger widget + prompt input
generatedResponseState    →  Stores AI-generated response in editor state
currentSelectionState     →  Tracks user text selection
buildSelectionHiglightState → Highlights selected region
diffExtension             →  Renders inline diff decorations
```

### AI Provider Pattern

`ChatApiManager` (in `api.ts`) wraps LangChain chat models and exposes a unified streaming interface. Provider is selected based on `InlineAISettings.provider`.

### State Flow

1. User triggers `commandEffect` → `FloatingTooltipExtension` opens tooltip widget
2. User submits prompt → `ChatApiManager` streams response
3. Response stored in `generatedResponseState`
4. `diffExtension` computes and renders inline diff decorations
5. `acceptTooltipEffect` or `dismissTooltipEffect` resolves the interaction

## Build System

- **Entry**: `src/main.ts`
- **Output**: `main.js` (single bundle, no external deps at runtime)
- **Config**: `esbuild.config.mjs`
- **Type Check**: `tsc -noEmit -skipLibCheck` (build only, not dev)

## Obsidian API Usage

- `Plugin` — base class with lifecycle hooks
- `MarkdownView` — access active editor view
- `App` — workspace, vault access
- `registerEditorExtension()` — register CodeMirror extensions
- `addCommand()` — register Obsidian commands
- `addSettingTab()` — register settings UI

## Settings Schema

Defined in `src/settings.ts` as `InlineAISettings`. Persisted via Obsidian's `loadData()` / `saveData()`. Includes API keys, model selection, provider choice, and custom prompts.

## Development Setup

```bash
npm install
npm run dev     # watch mode
npm run build   # production bundle
```

Copy `main.js`, `styles.css`, `manifest.json` to vault `.obsidian/plugins/inlineai/` for testing.
