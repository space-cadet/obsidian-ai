# Orchestration Decomposition Design
*Created: 2026-08-17 06:07 IST*
*Last Updated: 2026-08-27 13:21 IST*
*Applies to: obsidian-ai plugin codebase — T46*

## Overview

This document describes the planned decomposition of the primary orchestration
modules in the obsidian-ai codebase: `ToolExecutor.ts`,
`useMessageActions.ts`, `api.ts`, and `main.ts`. These files grew during
agentic tool calling work (T43/T44) and are now the primary maintainability
risks. T60/T60a own capability semantics; T46/T46a own the physical module
arrangement and turn-lifecycle extraction.

## Guiding Principles

1. **Orchestration vs Implementation**: The orchestrator decides *when* to do
   something; the handler decides *how*. Never mix the two.
2. **Category-based grouping**: Group by domain (note content, discovery, vault
   management), not by chronology.
3. **Factory over switch**: Provider creation is a factory pattern.
4. **Lifecycle over logic**: `main.ts` coordinates lifecycle; it does not
   contain business logic.

---

## Phase 1: ToolExecutor.ts (2,159 → ~400 lines)

T60 changes this from a handler-only extraction into a registry-and-pipeline
decomposition. The target modules must include the canonical capability
registry, validation/authorization/execution pipeline, AI SDK/OpenResponses
serializers, result formatters, domain handlers, and path resolver. A smaller
switch statement is not an acceptable end state because it leaves schema,
prompt, preview, risk, availability, and formatting metadata duplicated.

### Current State
`ToolExecutor` is a god class that:
- Dispatches tool calls to the right handler
- Validates parameters
- Handles errors and retries
- Formats results as markdown
- Implements per-tool business logic (13+ tools)

### Target Structure

```
src/agent/
├── ToolExecutor.ts              # Thin dispatcher (~400 lines)
├── tools/
│   ├── registry.ts              # Canonical capability definitions
│   ├── pipeline.ts              # Shared validated execution state machine
│   ├── serializers.ts           # AI SDK/OpenResponses projections
│   ├── formatters.ts            # Model/UI result projections
│   ├── handlers/
│   │   ├── note-handlers.ts     # read, edit, append, create, patch, edit_section
│   │   ├── discovery-handlers.ts # search, list, metadata, count
│   │   ├── vault-handlers.ts    # create_folder, move, delete, list_folders
│   │   ├── bulk-handlers.ts     # create_notes
│   │   └── session-handlers.ts  # search_past_sessions
│   └── ToolResolver.ts          # resolveNote(), path utilities
```

### ToolExecutor.ts (remaining)

```typescript
export class ToolExecutor {
  constructor(private app: App) {}

  async execute(call: ToolCall): Promise<ToolResult> {
    const handler = this.getHandler(call.name);
    if (!handler) return { error: `Unknown tool: ${call.name}` };
    try {
      return await handler.execute(this.app, call.args);
    } catch (err) {
      return { error: err.message };
    }
  }

  private getHandler(name: string): ToolHandler | undefined {
    return handlerRegistry[name];
  }
}
```

### Handler Pattern

```typescript
// src/agent/tools/handlers/note-handlers.ts
export const noteHandlers: Record<string, ToolHandler> = {
  read_note: {
    execute: async (app, args) => {
      const file = resolveNote(app, args.path);
      if (!file) return { error: `Note not found: ${args.path}` };
      const content = await app.vault.read(file);
      return { content, path: file.path };
    },
  },
  // ... edit_note, append_to_note, create_note, patch_note, edit_section
};
```

### Result Formatting

Move `formatToolResult()` from `AgentLoop.ts` to a dedicated formatter or keep
it in `AgentLoop.ts` (which is already a separate orchestrator). The key rule:
formatting is an orchestration concern, not a handler concern.

## Phase 1a: Chat Turn Coordinator (T46a)

`useMessageActions.ts` is approximately 1,533 lines. It coordinates UI state
with request assembly, context and history policy, protocol selection, stream
events, persistence, tool execution, and approval. T46a owns the follow-up
extraction of a testable turn coordinator.

The coordinator must consume the resolved T60 capability set and the shared
T48b/T48c/T62a model-history policy. It must not reimplement availability,
elision, truncation, compaction, or approval rules. The hook remains the UI
state and command adapter.

---

## Phase 2: api.ts (765 → ~300 lines)

### Current State
`ChatAPIManager` does:
- Provider profile validation
- `createLanguageModel()` — all provider factories
- Message history queue management
- `streamChatWithTools()` — streaming + event translation
- Connection testing
- Editor integration (applying changes to active editor)

### Target Structure

```
src/api/
├── api.ts                       # ChatAPIManager orchestrator (~300 lines)
├── providers.ts                 # createLanguageModel() + factories
├── history.ts                   # MessageQueue class
└── streaming.ts                 # streamChatWithTools() + event translation
```

### api.ts (remaining)

```typescript
export class ChatAPIManager {
  private providerFactory: ProviderFactory;
  private historyManager: HistoryManager;

  constructor(settings: ObsidianAISettings, app: App) {
    this.providerFactory = new ProviderFactory(settings);
    this.historyManager = new HistoryManager();
  }

  async testConnection(): Promise<boolean> {
    // delegates to providerFactory
  }

  async *streamChat(
    messages: ChatMessage[],
    tools: ToolSet,
    signal?: AbortSignal
  ): AsyncIterable<StreamEvent> {
    // delegates to streaming layer
  }
}
```

### providers.ts

```typescript
export class ProviderFactory {
  constructor(private settings: ObsidianAISettings) {}

  createModel(profile: ProviderProfile): LanguageModel {
    switch (profile.provider) {
      case 'openai': return createOpenAIModel(profile);
      case 'ollama': return createOllamaModel(profile);
      case 'gemini': return createGeminiModel(profile);
      case 'azure': return createAzureModel(profile);
      case 'custom': return createCustomModel(profile);
      case 'openrouter': return createOpenRouterModel(profile);
      case 'kimi': return createKimiModel(profile);
      default: throw new Error(`Unknown provider: ${profile.provider}`);
    }
  }
}
```

---

## Phase 3: main.ts (1,785 → ~300–400 lines)

### Current State
`ObsidianAIPlugin` does:
- Settings loading/saving
- Storage initialization
- View registration (chat view, inline widget)
- Command registration
- Event handlers (layout ready, file open, workspace change)
- ChatApiManager and ToolExecutor instantiation

### Target Structure

```
src/
├── main.ts                      # Plugin lifecycle coordinator (~300 lines)
├── ui/
│   ├── registration.ts          # View + command registration
│   └── events.ts                # Workspace/event handlers
└── lifecycle/
    └── storage.ts               # Storage init + migration
```

### main.ts (remaining)

```typescript
export default class ObsidianAIPlugin extends Plugin {
  settings: ObsidianAISettings;
  chatApi: ChatAPIManager;
  storage: ChatStorage;

  async onload() {
    await this.loadSettings();
    this.storage = await initializeStorage(this.app, this.settings);
    this.chatApi = new ChatAPIManager(this.settings, this.app);
    registerUI(this);
    registerEvents(this);
  }

  onunload() {
    cleanupEvents(this);
  }
}
```

---

## Dependencies and Order

1. **T60a completion and Phase 1 (ToolExecutor)** establish capability
   ownership and the shared execution pipeline.
2. **T48b/T48c/T62a plus T64b** establish the model-history policy and its
   retention evidence.
3. **Phase 1a (T46a)** extracts the chat-turn coordinator using those owners.
4. **Phase 2 (api.ts)** can follow as an independent provider/history/streaming
   decomposition.
5. **Phase 3 (main.ts)** should come last because it coordinates the final
   storage, API, and UI module shapes.

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Tool regression | Each handler file gets its own focused test file |
| Provider regression | Provider factory gets integration tests with mock profiles |
| Plugin lifecycle regression | main.ts extraction is pure code movement; no logic changes |
| Import churn | Re-export from old locations for backward compatibility during transition |

## Size Targets

| File | Current | Target | Hard Limit |
|------|---------|--------|------------|
| ToolExecutor.ts | 2,159 | ~400 | 500 |
| useMessageActions.ts | 1,533 | thin UI adapter; see T46a | — |
| api.ts | 765 | ~300 | 400 |
| main.ts | 1,785 | ~300–400 | 400 |
