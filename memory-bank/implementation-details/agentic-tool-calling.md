# Agentic Tool Calling Design: LLM-Driven Note Editing
*Created: 2026-05-03 02:40:00 IST*
*Last Updated: 2026-05-03 02:40:00 IST*

## Overview

Enable the LLM to act as an agent that can read, edit, create, and append to Obsidian notes via native function calling. The Vercel AI SDK (already in the project) provides the tool calling primitives. This document describes how to wire those primitives into the Obsidian plugin's chat panel with user-controlled approval.

## Design Philosophy

- **No new SDK**: Vercel AI SDK already supports `streamText` with `tools` and `maxSteps`.
- **User in control**: `autoApply` setting defaults to `false`; every tool call renders an approval card.
- **Progressive enhancement**: If the provider/model doesn't support tool calling, degrade gracefully to text-only responses.
- **Reuse existing machinery**: `NoteEditingBridge` and `vault.*` APIs handle the actual file operations; the agent layer only decides *when* to call them.

---

## Tool Registry

### Tool Definitions (`src/agent/tools.ts`)

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import { App, TFile, Notice } from 'obsidian';

export function createNoteTools(app: App) {
  return {
    read_note: tool({
      description:
        'Read the full content of an Obsidian note by its path. ' +
        'Use this before editing to understand the current content.',
      parameters: z.object({
        path: z.string().describe('Vault-relative path, e.g. "Project Notes.md"'),
      }),
      execute: async ({ path }) => {
        const file = app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return { error: `Note not found: ${path}` };
        const content = await app.vault.read(file);
        return { content, path };
      },
    }),

    edit_note: tool({
      description:
        'Overwrite the entire content of an existing note. ' +
        'Only use when the user explicitly asks to rewrite, edit, or replace a note. ' +
        'Return the complete new content — do not use diff syntax.',
      parameters: z.object({
        path: z.string().describe('Vault-relative path of the note to edit'),
        content: z.string().describe('The complete new note content'),
      }),
      execute: async ({ path, content }) => {
        const file = app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return { error: `Note not found: ${path}` };
        await app.vault.modify(file, content);
        new Notice(`✓ Edited ${file.basename}`);
        return { success: true, path };
      },
    }),

    append_to_note: tool({
      description:
        'Append content to the end of an existing note. ' +
        'Use for adding summaries, logs, or follow-ups without changing existing content.',
      parameters: z.object({
        path: z.string().describe('Vault-relative path'),
        content: z.string().describe('Content to append'),
      }),
      execute: async ({ path, content }) => {
        const file = app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return { error: `Note not found: ${path}` };
        const existing = await app.vault.read(file);
        await app.vault.modify(file, existing + '\n\n' + content);
        new Notice(`✓ Appended to ${file.basename}`);
        return { success: true, path };
      },
    }),

    create_note: tool({
      description:
        'Create a new note in the vault with the given content. ' +
        'Use when the user asks to create a new document, summary, or draft.',
      parameters: z.object({
        path: z.string().describe('Vault-relative path, e.g. "Meeting Summaries/2026-05-03.md"'),
        content: z.string().describe('Initial note content'),
      }),
      execute: async ({ path, content }) => {
        const existing = app.vault.getAbstractFileByPath(path);
        if (existing) return { error: `Note already exists: ${path}` };
        await app.vault.create(path, content);
        new Notice(`✓ Created ${path}`);
        return { success: true, path };
      },
    }),
  };
}
```

**Note on `zod`**: This is the standard schema library paired with Vercel AI SDK. It is small, tree-shakeable, and well-supported.

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
streamText({ model, messages, tools, maxSteps })
  → steps[] array of LLM rounds
  → Each step has: text, toolCalls, toolResults
  → ChatApp renders text chunks + pending tool cards
  → On approval: tool executes, result added to history
  → Next step begins automatically
```

### StreamEvent Union

`ChatApiManager.streamChat` should yield a discriminated union:

```typescript
type StreamEvent =
  | { type: 'text'; chunk: string }
  | { type: 'tool-call'; step: number; call: { id: string; name: string; args: object } }
  | { type: 'tool-result'; step: number; callId: string; result: object }
  | { type: 'step-start'; step: number }
  | { type: 'step-end'; step: number }
  | { type: 'error'; message: string };
```

### Implementation in `api.ts`

```typescript
public async *streamChatWithTools(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  tools: Record<string, Tool>,
  maxSteps: number,
  signal?: AbortSignal,
): AsyncIterable<StreamEvent> {
  const model = createLanguageModel(getActiveProviderProfile(this.settings));
  if (!model) throw new Error('Chat client is not initialized.');

  const result = streamText({
    model,
    messages,
    tools,
    maxSteps,
    abortSignal: signal,
  });

  // Vercel AI SDK v4+ exposes steps via result.steps
  for await (const chunk of result.fullStream) {
    switch (chunk.type) {
      case 'text-delta':
        yield { type: 'text', chunk: chunk.textDelta };
        break;
      case 'tool-call':
        yield { type: 'tool-call', step: chunk.step, call: chunk.toolCall };
        break;
      case 'tool-result':
        yield { type: 'tool-result', step: chunk.step, callId: chunk.toolCallId, result: chunk.result };
        break;
      case 'error':
        yield { type: 'error', message: chunk.error.message };
        break;
    }
  }
}
```

**Caveat**: The exact event types depend on the Vercel AI SDK version. The project currently uses `ai` package — we need to verify the exact streaming API for the installed version.

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
  toolCall: { id: string; name: string; args: object };
  onApprove: (callId: string) => void;
  onReject: (callId: string) => void;
}
```

### State Machine in ChatApp

```typescript
type ToolState =
  | { status: 'pending'; call: ToolCall }     // waiting for user
  | { status: 'executing'; call: ToolCall }   // running handler
  | { status: 'done'; call: ToolCall; result: object }
  | { status: 'rejected'; call: ToolCall };
```

When `autoApply` is true, pending tools skip the card and go straight to `executing`.

---

## Approval Flow

### autoApply = false (default)

```
LLM emits toolCall
  → ChatApp pauses the stream (does not proceed to next step)
  → Renders PendingToolCard
  → User clicks [Approve]
      → Execute tool handler
      → Store result in conversation history
      → Resume stream (SDK continues to next step)
  → User clicks [Reject]
      → Skip execution
      → Feed rejection message back to LLM
      → Resume stream
```

### autoApply = true

```
LLM emits toolCall
  → Execute tool handler immediately
  → Show brief Notice ("✓ Edited Vocabulary Log")
  → Continue stream automatically
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

  autoApply: boolean;                    // default: false
  maxAgentSteps: number;                 // default: 5
  enableAgentTools: boolean;             // default: true
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
| `src/agent/tools.ts` | **Create** | Zod tool definitions for read/edit/append/create |
| `src/agent/ToolExecutor.ts` | **Create** | Wrapper that executes tool handlers with error handling |
| `src/agent/types.ts` | **Create** | `StreamEvent` union, `ToolState` types |
| `src/api.ts` | **Modify** | Add `streamChatWithTools` method; keep `streamChat` for fallback |
| `src/components/ChatApp.tsx` | **Modify** | Handle `StreamEvent` union; render pending tool cards; manage approval state |
| `src/components/PendingToolCard.tsx` | **Create** | UI for approve/reject with content preview |
| `src/settings.ts` | **Modify** | Add `autoApply`, `maxAgentSteps`, `enableAgentTools` |
| `src/settings.ts` (tab) | **Modify** | UI toggles for new settings |

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| LLM hallucinates tool arguments | Zod validation rejects invalid args; error fed back to model |
| Infinite tool loops | `maxSteps` hard cap (default 5) |
| File overwrites without warning | `edit_note` only modifies existing files; `create_note` checks for existence |
| Vault path traversal | Validate paths are within vault root before any `vault.*` call |
| Streaming abort mid-tool | Tool handlers are async; abort signal checked before each vault operation |
| Model doesn't support tools | Graceful fallback to text-only mode |
| Large note content in tool args | No inherent size limit, but token budget still applies to messages |

---

## Simpler Alternative (XML Parser)

If the full tool calling architecture is too heavy for v1, an intermediate step is:

1. System prompt: *"Wrap complete edited note content in `<edit-note path=\"...\">...</edit-note>`"*
2. After streaming completes, regex-parse the response for XML tags
3. Show single "Apply this edit?" confirmation
4. Execute `vault.modify`

**Trade-off**: Less robust (LLM may not follow XML format reliably), but ~4–6 hours vs ~12–16 hours for full tool calling.
