# Agentic Tool Calling Design: LLM-Driven Note Editing
*Created: 2026-05-03 02:40:00 IST*
*Last Updated: 2026-05-06 08:03:05 IST*

## Overview

Enable the LLM to act as an agent that can read, edit, create, and append to Obsidian notes via native function calling. The Vercel AI SDK (already in the project) provides the tool calling primitives. This document describes how to wire those primitives into the Obsidian plugin's chat panel with user-controlled approval.

## Design Philosophy

- **Own the loop**: Vercel AI SDK v6 removed `maxSteps` from `streamText` and introduced `ToolLoopAgent` as an experimental class. We avoid the experimental abstraction and manage the loop ourselves for long-term stability.
- **User in control**: `autoApply` setting defaults to `false`; every tool call renders an approval card.
- **Progressive enhancement**: If the provider/model doesn't support tool calling, degrade gracefully to text-only responses.
- **Reuse existing machinery**: `NoteEditingBridge` and `vault.*` APIs handle the actual file operations; the agent layer only decides *when* to call them.
- **SDK-agnostic events**: `api.ts` translates SDK-specific stream events into our own `StreamEvent` union. If the SDK changes event shapes in v7, only the adapter changes.

---

## SDK Version Context

**Installed**: `ai` v6.0.174

**Critical v6 changes from v4/v5**:
- `maxSteps` / `maxToolRoundtrips` removed from `streamText`
- `streamText({ tools })` defaults to **one step only** (`stopWhen: stepCountIs(1)`)
- `ToolLoopAgent` introduced as experimental agent abstraction
- `fullStream` yields `TextStreamPart<TOOLS>` union with events: `text-delta`, `tool-call`, `tool-result`, `tool-error`, `tool-input-start/end/delta`
- Tools WITH `execute` functions auto-run during streaming
- Tools WITHOUT `execute` functions yield `tool-call` and the stream stops

**Our approach**: Define tools WITHOUT `execute`, consume `tool-call` events, pause for approval, execute manually via `ToolExecutor`, append results to messages, and call `streamText` again.

---

## Tool Registry

### Tool Definitions (`src/agent/tools.ts`)

Tools are pure Zod schemas **without `execute` functions**. The LLM sees them; execution happens in `ToolExecutor` after user approval.

```typescript
import { z } from 'zod';

export const noteTools = {
  read_note: {
    description:
      'Read the full content of an Obsidian note by its path. ' +
      'Use this before editing to understand the current content.',
    parameters: z.object({
      path: z.string().describe('Vault-relative path, e.g. "Project Notes.md"'),
    }),
  },

  edit_note: {
    description:
      'Overwrite the entire content of an existing note. ' +
      'Only use when the user explicitly asks to rewrite, edit, or replace a note. ' +
      'Return the complete new content — do not use diff syntax.',
    parameters: z.object({
      path: z.string().describe('Vault-relative path of the note to edit'),
      content: z.string().describe('The complete new note content'),
    }),
  },

  append_to_note: {
    description:
      'Append content to the end of an existing note. ' +
      'Use for adding summaries, logs, or follow-ups without changing existing content.',
    parameters: z.object({
      path: z.string().describe('Vault-relative path'),
      content: z.string().describe('Content to append'),
    }),
  },

  create_note: {
    description:
      'Create a new note in the vault with the given content. ' +
      'Use when the user asks to create a new document, summary, or draft.',
    parameters: z.object({
      path: z.string().describe('Vault-relative path, e.g. "Meeting Summaries/2026-05-03.md"'),
      content: z.string().describe('Initial note content'),
    }),
  },
};
```

**Note**: `zod` is already installed. No new dependencies.

---

## Agent Core

### `AgentLoop` (`src/agent/AgentLoop.ts`)

Owns the conversation lifecycle with tools. Created fresh for each user message.

```typescript
class AgentLoop {
  constructor(
    private api: ChatApiManager,
    private tools: ToolSet,
    private maxSteps: number,
    private autoApply: boolean,
    private onEvent: (event: StreamEvent) => void,
    private onToolCall: (call: ToolCall) => Promise<ToolResult | null>,
  )

  async run(messages: Message[]): Promise<void> {
    for (let step = 0; step < this.maxSteps; step++) {
      const events = this.api.streamChatWithTools(messages, this.tools);
      let pendingToolCall: ToolCall | null = null;

      for await (const event of events) {
        this.onEvent(event);
        if (event.type === 'tool-call') {
          pendingToolCall = event.call;
        }
      }

      if (!pendingToolCall) break; // Done — no tools requested

      const result = await this.onToolCall(pendingToolCall);
      if (result) {
        messages.push(toolResultToMessage(result));
      } else {
        // Rejected — tell the model
        messages.push(toolRejectionMessage(pendingToolCall));
      }
    }
  }
}
```

### `ToolExecutor` (`src/agent/ToolExecutor.ts`)

Executes approved tool calls against the Obsidian vault.

```typescript
class ToolExecutor {
  constructor(private app: App) {}

  async execute(call: ToolCall): Promise<ToolResult> {
    switch (call.name) {
      case 'read_note': return this.readNote(call.args);
      case 'edit_note': return this.editNote(call.args);
      case 'append_to_note': return this.appendToNote(call.args);
      case 'create_note': return this.createNote(call.args);
      default: return { error: `Unknown tool: ${call.name}` };
    }
  }

  private async readNote(args: { path: string }): Promise<ToolResult> {
    const file = this.app.vault.getAbstractFileByPath(args.path);
    if (!(file instanceof TFile)) return { error: `Note not found: ${args.path}` };
    const content = await this.app.vault.read(file);
    return { content, path: args.path };
  }

  private async editNote(args: { path: string; content: string }): Promise<ToolResult> {
    const file = this.app.vault.getAbstractFileByPath(args.path);
    if (!(file instanceof TFile)) return { error: `Note not found: ${args.path}` };
    await this.app.vault.modify(file, args.content);
    new Notice(`✓ Edited ${file.basename}`);
    return { success: true, path: args.path };
  }

  private async appendToNote(args: { path: string; content: string }): Promise<ToolResult> {
    const file = this.app.vault.getAbstractFileByPath(args.path);
    if (!(file instanceof TFile)) return { error: `Note not found: ${args.path}` };
    const existing = await this.app.vault.read(file);
    await this.app.vault.modify(file, existing + '\n\n' + args.content);
    new Notice(`✓ Appended to ${file.basename}`);
    return { success: true, path: args.path };
  }

  private async createNote(args: { path: string; content: string }): Promise<ToolResult> {
    const existing = this.app.vault.getAbstractFileByPath(args.path);
    if (existing) return { error: `Note already exists: ${args.path}` };
    await this.app.vault.create(args.path, args.content);
    new Notice(`✓ Created ${args.path}`);
    return { success: true, path: args.path };
  }
}
```

---

## Streaming Architecture

### Current vs New

**Current (text-only):**
```
streamText({ model, messages })
  → textStream yields string chunks
  → ChatApp appends to currentAiMessage
```

**New (tools + approval):**
```
streamText({ model, messages, tools, stopWhen: stepCountIs(1) })
  → fullStream yields TextStreamPart events
  → AgentLoop translates to StreamEvent
  → ChatApp renders text chunks + pending tool cards
  → On approval: ToolExecutor runs, result added to messages
  → AgentLoop calls streamText again (next step)
```

### StreamEvent Union (`src/agent/types.ts`)

```typescript
type StreamEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; call: ToolCall }
  | { type: 'tool-result'; callId: string; result: ToolResult }
  | { type: 'tool-error'; callId: string; error: string }
  | { type: 'step-finish'; step: number }
  | { type: 'finish'; reason: string }
  | { type: 'error'; message: string };

interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

interface ToolResult {
  success?: boolean;
  content?: string;
  error?: string;
  path?: string;
}
```

### Implementation in `api.ts`

```typescript
public async *streamChatWithTools(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  tools: Record<string, { description: string; parameters: z.ZodTypeAny }>,
  signal?: AbortSignal,
): AsyncIterable<StreamEvent> {
  const model = createLanguageModel(getActiveProviderProfile(this.settings));
  if (!model) throw new Error('Chat client is not initialized.');

  const result = streamText({
    model,
    messages,
    tools,
    stopWhen: stepCountIs(1),
    abortSignal: signal,
  });

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta':
        yield { type: 'text-delta', text: part.text };
        break;
      case 'tool-call':
        yield { type: 'tool-call', call: { id: part.toolCallId, name: part.toolName, args: part.args } };
        break;
      case 'tool-result':
        yield { type: 'tool-result', callId: part.toolCallId, result: part.result as ToolResult };
        break;
      case 'tool-error':
        yield { type: 'tool-error', callId: part.toolCallId, error: part.error };
        break;
      case 'text-end':
        yield { type: 'step-finish', step: 0 };
        break;
    }
  }

  yield { type: 'finish', reason: 'done' };
}
```

**Note**: Exact property names on `part` (e.g. `toolCallId`, `toolName`, `args`) depend on the SDK's `TypedToolCall` type. We verify these at compile time against the installed version.

---

## Chat UI: Pending Tool Cards

### Component: `PendingToolCard.tsx`

Renders inline in the chat stream when a tool call is emitted:

```
┌─────────────────────────────────────────────────────────┐
│ 🤖 Agent wants to edit a note                           │
│                                                         │
│  ✏️  Edit: Vocabulary Log.md                            │
│     (preview first 120 chars of new content...)         │
│                                                         │
│              [Approve]  [Reject]                        │
└─────────────────────────────────────────────────────────┘
```

**Props:**
```typescript
interface PendingToolCardProps {
  toolCall: ToolCall;
  onApprove: () => void;
  onReject: () => void;
}
```

### State Machine in ChatApp

```typescript
type ToolState =
  | { status: 'idle' }
  | { status: 'pending'; call: ToolCall }     // waiting for user
  | { status: 'executing'; call: ToolCall }   // running handler
  | { status: 'done'; call: ToolCall; result: ToolResult }
  | { status: 'rejected'; call: ToolCall };
```

When `autoApply` is true, pending tools skip the card and go straight to `executing`.

---

## Approval Flow

### autoApply = false (default)

```
LLM emits tool-call event
  → ChatApp pauses AgentLoop (stops consuming further events)
  → Renders PendingToolCard
  → User clicks [Approve]
      → ToolExecutor.execute(call)
      → Store result in conversation history
      → AgentLoop calls streamText again (next step)
  → User clicks [Reject]
      → Skip execution
      → Feed rejection message back to LLM
      → AgentLoop calls streamText again
```

### autoApply = true

```
LLM emits tool-call event
  → ToolExecutor.execute(call) immediately
  → Show brief Notice ("✓ Edited Vocabulary Log")
  → Result appended to messages
  → AgentLoop continues automatically
```

---

## System Prompt Design

The system prompt is built dynamically based on context and tool availability:

```typescript
function buildSystemPrompt(contextItems: ContextItem[], toolsEnabled: boolean): string {
  let prompt = 'You are a helpful assistant integrated into an Obsidian note-taking app.';

  if (toolsEnabled) {
    prompt += `

You have access to tools that can read, edit, create, and append to Obsidian notes.
When the user asks you to edit or rewrite a note, use the edit_note tool.
When the user asks you to create a new note, use the create_note tool.
When the user asks you to add to an existing note without changing current content, use append_to_note.
Before editing a note you are unfamiliar with, use read_note to see its current content.

Important: When using edit_note, provide the COMPLETE new note content. Do not use diff syntax or markdown code blocks.`;
  }

  const activeNote = contextItems.find(i => i.type === 'active-note');
  if (activeNote) {
    prompt += '\n\nThe active note is included in your context.';
  }

  const mentionedNotes = contextItems.filter(i => i.type === 'note');
  if (mentionedNotes.length > 0) {
    prompt += `\n\nThe user has attached these notes: ${mentionedNotes.map(n => n.name).join(', ')}.`;
  }

  return prompt;
}
```

---

## Provider Compatibility

| Provider | Tool Calling | Notes |
|---|---|---|
| OpenAI | ✅ GPT-4, GPT-4o, GPT-3.5 | Full support |
| Anthropic | ✅ Claude 3.5 Sonnet, Claude 3 Opus | Full support |
| Google Gemini | ✅ Gemini 1.5 Pro, Gemini 2.0 Flash | Full support |
| DeepSeek | ✅ DeepSeek V3, DeepSeek R1 | Full support |
| OpenRouter | ✅ | Pass-through to underlying model |
| Ollama | ⚠️ Model-dependent | Llama 3.1+, Qwen 2.5+, Mistral Nemo work; older models may fail |
| Custom | ⚠️ Depends on endpoint | Check if endpoint supports OpenAI-compatible function calling |

**Fallback**: If the active provider does not support tool calling, `streamChat` falls back to the current text-only mode with the standard system prompt.

---

## Settings Schema

Add to `ObsidianAISettings`:

```typescript
interface ObsidianAISettings {
  // ... existing settings ...

  enableAgentTools: boolean;    // default: true
  autoApply: boolean;           // default: false
  maxAgentSteps: number;        // default: 5
}
```

**UI copy:**
- **Enable agent tools**: "Allow the AI to read, edit, create, and append to notes directly."
- **Auto-apply edits**: "Apply note edits automatically without asking for confirmation. (Not recommended for important notes.)"
- **Max agent steps**: "Maximum number of tool call rounds per message. Higher values allow more complex multi-step reasoning."

---

## Files to Create / Modify

| File | Action | Description |
|---|---|---|
| `src/agent/types.ts` | **Create** | `StreamEvent` union, `ToolCall`, `ToolResult` types |
| `src/agent/tools.ts` | **Create** | Zod tool definitions (schemas only, no execute) |
| `src/agent/ToolExecutor.ts` | **Create** | Executes tool handlers against vault |
| `src/agent/AgentLoop.ts` | **Create** | Orchestrates multi-step streamText calls |
| `src/api.ts` | **Modify** | Add `streamChatWithTools` method; keep `streamChat` for fallback |
| `src/components/ChatApp.tsx` | **Modify** | Creates AgentLoop, handles StreamEvent union, renders pending tool cards |
| `src/components/PendingToolCard.tsx` | **Create** | UI for approve/reject with content preview |
| `src/settings.ts` | **Modify** | Add `enableAgentTools`, `autoApply`, `maxAgentSteps` |
| `src/settings.ts` (tab) | **Modify** | UI toggles for new settings |

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| LLM hallucinates tool arguments | Zod validation on incoming args; error fed back to model |
| Infinite tool loops | `maxAgentSteps` hard cap (default 5) in AgentLoop |
| File overwrites without warning | `edit_note` only modifies existing files; `create_note` checks for existence |
| Vault path traversal | ToolExecutor validates paths are within vault root before any `vault.*` call |
| Streaming abort mid-tool | AbortController passed to streamText; ToolExecutor checks signal before vault ops |
| Model doesn't support tools | Graceful fallback to text-only `streamChat` mode |
| Large note content in tool args | No inherent size limit, but token budget still applies to messages |
| SDK v7 changes `fullStream` API | Only `api.ts` changes — `StreamEvent` union insulates the rest of the app |

---

## Simpler Alternative (XML Parser) — Rejected

If the full tool calling architecture is too heavy for v1, an intermediate step is:

1. System prompt: *"Wrap complete edited note content in `<edit-note path="...">...</edit-note>`"*
2. After streaming completes, regex-parse the response for XML tags
3. Show single "Apply this edit?" confirmation
4. Execute `vault.modify`

**Trade-off**: Less robust (LLM may not follow XML format reliably). Rejected in favour of native tool calling for long-term reliability.
