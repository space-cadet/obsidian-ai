# Project Brief

*Last Updated: 2026-10-21 17:52:24 IST*

## Project Overview
Chat Lab AI is an Obsidian plugin centered on persistent, multi-agent chat and vault tools. Users can provide note context, ask agents to edit vault content, and review note changes in the editor. The main agent prompt is configurable in Settings → Chat Defaults.

## Goals
- Keep multi-agent chat, provider selection, and vault tools reliable.
- Make note edits from chat reviewable before they are applied.
- Keep the shared agent prompt visible, editable, and resettable from Settings and available through guarded agent tools.

## Core Features
- Persistent chat panel and collaborative multi-agent conversations.
- Vault tools for reading, searching, creating, and editing notes.
- Chat-to-note diff review with explicit accept and discard commands.
- Provider-profile settings and a configurable shared agent prompt.

## Project Structure
```text
obsidian-ai/
├── src/
│   ├── main.ts
│   ├── api.ts
│   ├── settings.ts
│   ├── components/
│   ├── modules/
│   └── views/
├── memory-bank/
│   ├── implementation-details/
│   ├── sessions/
│   ├── tasks/
│   └── templates/
├── manifest.json
├── package.json
└── styles.css
```

## Key Components
- **`src/main.ts`**: Plugin lifecycle, command registration, and view activation.
- **`src/api.ts`**: Unified AI provider layer, text generation, streaming, and provider-specific helpers.
- **`src/settings.ts`**: Settings schema, provider profiles, model defaults, and settings-tab UI.

## Current Status
- Current work and acceptance status are tracked in `tasks.md`.
- Recent completed work: T75 added prompt management and removed the legacy editor feature.

## Task Tracking
Tasks are tracked in `tasks.md` with the following priority structure:
- **High Priority**: Core product behavior or enabling infrastructure for the v2.0 chat workflow.
- **Medium Priority**: Supporting UX, diagnostics, and context-management improvements.
- **Low Priority**: Follow-up polish after the main workflow is stable.

## Memory Bank Organization
- `/memory-bank/`: Core project memory-bank documents.
- `/memory-bank/templates/`: Reference templates used to keep memory files consistent.
- `/memory-bank/archive/`: Reserved for archived task or session material.

## Implementation Guidelines
Build on the existing chat and note-editing paths. Reuse native Obsidian UI patterns, keep note changes reviewable, and keep design documents aligned with the current implementation.

## External Dependencies
- `ai` and `@ai-sdk/*`: Unified provider abstraction and streaming support.
- `react` and `react-dom`: Sidebar chat UI rendering.
- `obsidian`: Plugin API and UI surface integration.

## Notes
Historical task and product decisions remain in their dated task and session records. Use `tasks.md` for current work and status.
