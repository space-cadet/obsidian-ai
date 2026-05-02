# Project Brief

*Last Updated: 2026-05-02 17:08:57 IST*

## Project Overview
Obsidian AI is an Obsidian plugin that brings AI-assisted writing and editing into the editor. The current product combines an established inline transformation flow with an in-progress sidebar chat experience that will eventually support streaming, context injection, and note-editing actions.

## Goals
- Preserve and improve the existing inline editor workflow without regressions.
- Add a persistent chat panel that can share provider settings and eventually apply results back into notes.
- Keep provider setup, diagnostics, and model selection practical for real multi-provider use.

## Core Features
- Inline prompt-driven transformations with diff, accept, and discard controls.
- Sidebar chat panel scaffold built with React and plain CSS.
- Provider-profile based settings that support multiple endpoints and accounts.

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
- Overall Progress: Core chat/settings foundation complete; streaming UI and model discovery remain open.
- Active Tasks: 2
- Current Focus: T4 streaming completion and memory-bank normalization.

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
Keep the existing inline editor path stable while new chat features land incrementally. Prefer one canonical provider abstraction layer, one canonical memory-bank format, and design docs that stay close to the actual implementation state.

## External Dependencies
- `ai` and `@ai-sdk/*`: Unified provider abstraction and streaming support.
- `react` and `react-dom`: Sidebar chat UI rendering.
- `obsidian`: Plugin API and UI surface integration.

## Notes
The current roadmap assumes T4 streaming completion first, followed by T10 model discovery, then the broader conversation/context/diagnostics/onboarding tasks built on top of the T9 provider-profile foundation.
