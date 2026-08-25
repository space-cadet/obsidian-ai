# T14: Remote Agent Connectivity — Implementation Doc
*Created: 2026-05-14 21:20 IST*
*Last Updated: 2026-05-14 21:20 IST*

---

## Overview

Implement bidirectional remote agent connectivity in the Obsidian AI plugin using the OpenResponses API. The plugin becomes a client that connects to remote OpenClaw agents (Ember on phone, Cloudy on VPS) via HTTP POST + SSE streaming, executes tool calls against the local vault, and sends results back.

## Streaming Observability Boundary — T60e (2026-08-25)

The current parser handles output-text deltas and function-call output-item
events, but does not surface function-argument delta events. The loop collects
function calls during `consumeStream()` and notifies the UI after that response
ends. T60e will add provider-neutral provisional tool progress while preserving
the execution boundary: incomplete arguments remain display-only and are never
sent to `ToolExecutor`.

This follow-up must be implemented on the separate branch
`feat/t60e-provider-adaptive-streaming-ui`. T14 remains the owner of remote
connectivity and SSE protocol correctness.

**Prerequisite:** T14a (Tailscale network setup) must be completed for end-to-end testing.

---

## Architecture

```
┌─────────────────────┐          ┌─────────────────────────────┐
│   Obsidian Plugin   │          │      OpenClaw Gateway       │
│   (Sage/MacBook)    │          │   (Cloudy VPS / Ember Phone)│
├─────────────────────┤          ├─────────────────────────────┤
│                     │  POST    │                             │
│  ChatApp.handleSend │ ───────► │  POST /v1/responses         │
│                     │  SSE     │  { input, tools, stream,    │
│  AgentApiManager    │ ◄──────  │    model, user }            │
│                     │          │                             │
│  SSE Parser         │          │  SSE events:                │
│  ├─ output_text     │          │  ├─ output_text.delta       │
│  └─ function_call   │          │  └─ output_item.added       │
│                     │          │     (function_call)         │
│  ToolExecutor       │          │                             │
│  ├─ read_note       │          │  Agent processes → decides  │
│  ├─ edit_note       │          │  → tool call → waits        │
│  └─ create_note     │          │                             │
│                     │  POST    │                             │
│  ┌────────────────┐ │ ───────► │                             │
│  │ function_call_ │ │          │  POST /v1/responses         │
│  │ output item    │ │          │  { input: [fnc_output],     │
│  └────────────────┘ │          │    previous_response_id }   │
│                     │  SSE     │                             │
│                     │ ◄──────  │  Agent continues with      │
│                     │          │  tool result knowledge...    │
└─────────────────────┘          └─────────────────────────────┘
```

---

## Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `src/api/AgentApiManager.ts` | OpenResponses client: streaming, connection test, tool serialization |
| `src/api/OpenResponsesParser.ts` | SSE event parser for OpenResponses format |
| `src/agent/OpenResponsesLoop.ts` | Turn-based loop: send → receive → execute → reply |
| `src/agent/tools/toOpenResponses.ts` | Serialize T13 tool defs to OpenResponses function schema |
| `src/settings/AgentProviderProfile.ts` | Type definition for agent provider settings |

### Modified Files

| File | Changes |
|------|---------|
| `src/settings.ts` | Add `agent` to ProviderType, AgentProviderProfile interface |
| `src/api.ts` | Export AgentApiManager alongside ChatApiManager |
| `src/components/ChatApp.tsx` | Wire AgentApiManager when active provider is "agent" |
| `src/components/SettingsPanel.tsx` | Add agent provider configuration UI |
| `src/types.ts` | Extend ChatMessage if needed for response_id tracking |

---

## Data Flow

### 1. Initial Request (User sends message)

```typescript
const response = await agentApi.streamAgentResponse({
  model: "openclaw",
  input: [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ],
  tools: openResponsesTools,     // serialized T13 tools
  stream: true,
  user: sessionKey,              // stable session identifier
});
```

### 2. Streaming Response (SSE Events)

```
event: response.created
data: {"id": "resp_123", ...}

event: response.output_text.delta
data: {"delta": "I'll search your notes..."}

event: response.output_item.added
data: {"item": {"type": "function_call", "call_id": "call_456", "name": "search_notes", "arguments": "{\"query\": \"quantum\"}"}}

event: response.completed
data: {"usage": {...}}

data: [DONE]
```

### 3. Tool Execution (Local)

```typescript
// Parse function_call from SSE
const toolCall = {
  toolCallId: item.call_id,
  toolName: item.name,
  args: JSON.parse(item.arguments),
};

// Execute via existing ToolExecutor
const result = await toolExecutor.execute(toolCall);

// Format result as function_call_output item
const followUp = {
  input: [
    {
      type: "function_call_output",
      call_id: toolCall.toolCallId,
      output: JSON.stringify(result),
    },
  ],
  previous_response_id: lastResponseId,
};
```

### 4. Follow-up Request (Send result back)

```typescript
const continuation = await agentApi.streamAgentResponse(followUp);
// Agent continues streaming with tool result knowledge
```

---

## OpenResponses ↔ T13 Tool Mapping

### T13 Tool Definition (current)
```typescript
{
  toolName: "read_note",
  description: "Read the contents of an Obsidian note",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Note path" },
    },
    required: ["path"],
  },
}
```

### OpenResponses Tool Definition
```typescript
{
  type: "function",
  function: {
    name: "read_note",
    description: "Read the contents of an Obsidian note",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Note path" },
      },
      required: ["path"],
    },
  },
}
```

**Mapping is trivial:** wrap T13 definition in `type: "function"` envelope, rename `toolName` → `name`.

---

## Settings Schema

```typescript
interface AgentProviderProfile {
  type: "agent";
  name: string;              // display name: "Ember", "Cloudy"
  endpointUrl: string;       // http://ember:18789/v1/responses
  authToken?: string;        // Bearer token for gateway auth
  agentId: string;           // x-openclaw-agent-id header value: "main"
  sessionKey?: string;       // persisted for continuity (derived from user field)
  autoApprove: boolean;      // execute tools without confirmation
  maxSteps: number;          // max tool call rounds (default: 10)
}
```

---

## Connection Test Flow

```typescript
async testConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    const resp = await fetch(this.endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.authToken}`,
        "x-openclaw-agent-id": this.agentId,
      },
      body: JSON.stringify({
        model: "openclaw",
        input: "ping",
        max_output_tokens: 10,
      }),
    });
    
    if (!resp.ok) {
      const err = await resp.json();
      return { ok: false, error: err.error?.message || `HTTP ${resp.status}` };
    }
    
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Agent unreachable | Show error in chat, offer retry or switch provider |
| Auth failure (401) | Show notice: "Invalid token or agent ID" |
| Tool execution error | Send error as function_call_output, agent sees it |
| Max steps exceeded | Stop loop, show "Agent reached max tool iterations" |
| SSE disconnect mid-stream | Attempt reconnect with previous_response_id |

---

## Security Considerations

1. **Never expose endpoint to public internet.** Use Tailscale virtual IPs only.
2. **Auth token stored in plugin settings.** Obsidian encrypts plugin settings at rest.
3. **Tool scope limited to vault.** Existing path validation in ToolExecutor prevents escape.
4. **Session key is stable.** Generated once, stored in plugin data. Same user → same agent session.
5. **Manual approval default.** Auto-approve is opt-in per provider.

---

## Implementation Order

1. **Phase 1: Core API Layer**
   - Create `AgentApiManager.ts` (basic POST + SSE parsing)
   - Create `OpenResponsesParser.ts` (SSE event types)
   - Add `agent` provider type to settings
   - Add connection test UI

2. **Phase 2: Tool Serialization**
   - Create `toOpenResponses.ts` (T13 → OpenResponses tool mapping)
   - Verify all 13 tools serialize correctly

3. **Phase 3: Turn-Based Loop**
   - Create `OpenResponsesLoop.ts` (send → receive → execute → reply)
   - Handle function_call detection in SSE stream
   - Wire into ChatApp (branch on provider type)

4. **Phase 4: UI & Polish**
   - Settings panel: agent profile form
   - Connection status indicator
   - Error handling and recovery
   - Session key persistence

5. **Phase 5: Integration Test**
   - Requires T14a (Tailscale) complete
   - Test against local OpenClaw gateway first
   - Then test against Cloudy VPS
   - Finally test against Ember phone

---

## Notes

- **No new dependencies.** Uses native `fetch` + SSE parsing. No OpenAI SDK needed.
- **previous_response_id:** OpenResponses docs say currently ignored by OpenClaw, but we should include it for future compatibility.
- **Model name:** Use `"openclaw"` or `"openclaw:main"` — the agent ID is in the `x-openclaw-agent-id` header.
- **Session continuity:** The `user` field in OpenResponses derives a stable session key. We'll generate one UUID on first connection and persist it.

---

## Related

- T14a: Network Infrastructure (prerequisite)
- T13: Agentic Tool Calling (tool definitions reused)
- T9: Settings & Provider Profiles (settings schema extended)

---

## Provider Compatibility Matrix (Added 2026-08-19 — T50)

The OpenResponses API format is supported by multiple providers, but stateful
session support (`previous_response_id`) varies:

| Provider | Stateful | `previous_response_id` | Notes |
|---|---|---|---|
| **OpenAI** | ✅ Yes | ✅ Supported | Full stateful Responses API |
| **DeepSeek** | ❌ No | ❌ Not supported | Format-compatible, but stateless |
| **Anthropic** | ❌ No | ❌ Not supported | Uses Messages API, not Responses |
| **Gemini** | ⚠️ Partial | ⚠️ Sessions API | Different API shape entirely |

### DeepSeek Specifics

DeepSeek's [official compatibility docs](https://api-docs.deepseek.com/guides/responses_api)
confirm:

> `previous_response_id`: Not supported (stateless API)
> `conversation`: Not supported (stateless API)
> `store`: Not supported. The response always carries `store: false`

This means even though DeepSeek accepts the OpenResponses request format, every
request must still include the full conversation history. There is no server-side
state persistence.

### Implications for Plugin Architecture

The plugin must continue using the **Chat Completions** path for DeepSeek, as
switching to Responses API format provides no benefit (and may add complexity).

For OpenAI users, a future T50 implementation could add a **stateful mode** that:
1. Stores `response.id` from each turn
2. Sends only the new message with `previous_response_id`
3. Skips local history management for that session

### References

- Task: [T50 — OpenAI Responses API / Threads Support](../tasks/T50.md)
- DeepSeek Docs: [Responses API Compatibility](https://api-docs.deepseek.com/guides/responses_api)
