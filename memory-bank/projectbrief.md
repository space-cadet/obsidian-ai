# Project Brief: obsidian-ai (InlineAI Plugin)
*Created: 2026-05-02 08:00:01 IST*
*Last Updated: 2026-05-02 08:00:01 IST*

## Overview

InlineAI is an Obsidian community plugin that provides AI-powered inline text suggestions, contextual edits, and advanced text transformations directly within the Obsidian markdown editor. It is designed to function like Cursor or GitHub Copilot but within the Obsidian environment.

## Repository

- **GitHub**: space-cadet/obsidian-ai
- **Plugin ID**: inlineai
- **Current Version**: 1.2.4
- **License**: GPL-3.0 / MIT
- **Author**: FBarrca

## Core Goals

1. Provide seamless AI-assisted writing within the Obsidian editor
2. Support multiple AI providers (OpenAI, Ollama, Gemini, Azure OpenAI)
3. Offer inline diff visualization for AI-suggested changes
4. Allow user-defined custom prompts and commands
5. Support local model usage for privacy-first workflows

## Key Features

- **Context-Aware AI Assistance**: Transform, summarize, or rewrite selected text
- **Inline Diff Visualization**: Visual markers for added/removed text with accept/discard actions
- **Multi-Provider Support**: OpenAI, Ollama, Gemini, Azure OpenAI via LangChain
- **Custom Prompts**: User-defined system and transformation prompts
- **Hotkey Activation**: Trigger via `Ctrl+K` / `Cmd+K`

## Tech Stack

- **Language**: TypeScript
- **Editor Integration**: CodeMirror 6 (state, view, commands, autocomplete)
- **AI Abstraction**: LangChain (`@langchain/core`, `@langchain/openai`, `@langchain/ollama`, `@langchain/google-genai`)
- **Diff Engine**: `diff-match-patch`
- **Build Tool**: esbuild
- **Linting/Formatting**: ESLint, Prettier
- **Git Hooks**: Husky + lint-staged

## Project Structure

```
obsidian-ai/
├── src/
│   ├── main.ts              # Plugin entry point
│   ├── api.ts               # ChatApiManager (multi-provider)
│   ├── settings.ts          # Settings schema and UI
│   ├── default_prompts.ts   # Built-in prompt templates
│   └── modules/
│       ├── AIExtension.ts         # Core AI CodeMirror extension
│       ├── SelectionState.ts      # Selection tracking state
│       ├── WidgetExtension.ts     # Floating tooltip UI widget
│       ├── diffExtension.ts       # Inline diff visualization
│       ├── commands/
│       │   ├── parser.ts          # Command parsing
│       │   └── source.ts          # Command sources
│       └── messageHistory/
│           └── queue.ts           # Message history management
├── memory-bank/             # Project memory bank
├── manifest.json            # Obsidian plugin manifest
├── package.json
├── tsconfig.json
└── esbuild.config.mjs
```

## Development Workflow

- `npm run dev` — watch mode build
- `npm run build` — production build (type-check + bundle)
- `npm run format` — Prettier formatting
