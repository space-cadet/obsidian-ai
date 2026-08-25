# OpenResponses Loop Protocol Bugs
*Created: 2026-08-25 16:56:00 IST*
*Task: [T60b](../tasks/T60b.md)*

## Summary

Three protocol bugs in the OpenResponses loop cause unbounded token growth
during multi-step tool chains. The 500k-token incident on 2026-08-25 was caused
by a 17-step `search_notes` chain where the original input was resubmitted on
every round and continuations were sent as stateless requests.

## Bug 1: Original Input Resent on Every Loop Iteration

**File:** `src/agent/OpenResponsesLoop.ts`  
**Lines:** 92–108

```typescript
while (step < this.maxSteps) {
    // ...
    for await (const event of this.agentApi.streamAgentResponse(
        { input, tools, stream: true },  // ← FULL message history every iteration
        signal,
    )) {
```

The `input` array contains the complete original conversation: system prompt +
history + user message. It is passed to `streamAgentResponse` on **every**
loop iteration. After tool execution, the loop goes back to the top and
resubmits the entire conversation from scratch.

### Token impact

| Step | Action | Tokens sent |
|------|--------|-------------|
| 1 | `streamAgentResponse({ input, tools })` | Original conversation + tools |
| 1 | Execute tool A | — |
| 1 | `continueWithToolResult(lastResponseId, resultA)` | Result A only |
| 2 | `streamAgentResponse({ input, tools })` | **Original conversation AGAIN** |
| 2 | Execute tool B | — |
| 2 | `continueWithToolResult(lastResponseId, resultB)` | Result B only |
| … | … | … |
| 17 | `streamAgentResponse({ input, tools })` | **Original conversation × 17** |

The conversation history is duplicated on every step.

## Bug 2: Continuation ID Is Discarded

**File:** `src/api/AgentApiManager.ts`  
**Lines:** 214–230

```typescript
public async *continueWithToolResult(
    previousResponseId: string,  // ← accepted but NEVER USED
    functionCallOutputs: Array<{ call_id: string; output: string }>,
    signal?: AbortSignal,
): AsyncIterable<OpenResponsesEvent> {
    const input: OpenResponsesInputItem[] = functionCallOutputs.map(...);

    for await (const event of this.streamAgentResponse(
        { input },  // ← NO previous_response_id!
        signal,
    )) {
        yield event;
    }
}
```

`previousResponseId` is accepted as a parameter but never serialized into the
request body. The `AgentApiOptions` interface lacks the field entirely:

```typescript
// src/api/AgentApiManager.ts:32-38
export interface AgentApiOptions {
    input: string | Array<OpenResponsesInputItem>;
    model?: string;
    instructions?: string;
    tools?: Array<OpenResponsesTool>;
    stream?: boolean;
    maxOutputTokens?: number;
    // missing: previousResponseId
}
```

So even though `OpenResponsesLoop` captures `lastResponseId` from `finish`
events, it is useless — the continuation is sent as a brand new request with
no state linkage.

**Note:** The code comment says `// previous_response_id is accepted but
currently ignored by OpenClaw`, but the installed OpenClaw gateway **does**
support this field. The bug is on the plugin side.

## Bug 3: Continuation Handler Doesn't Handle Function Calls

**File:** `src/agent/OpenResponsesLoop.ts`  
**Lines:** 264–282

After `continueWithToolResult`, the event handler only processes:
- `text-delta` — updates UI text
- `finish` — captures response ID
- `error` — throws

It does **NOT** handle:
- `function_call` — new tool calls on continuation rounds
- `function_call_done` — same

This means if the model wants to make a second tool call after seeing the
first result, the loop won't catch it. The `pendingFunctionCalls` Map is
cleared at the top of each while iteration, but the continuation stream can't
repopulate it. This forces multi-round tool chains to fall back into the
broken outer-loop path (Bug 1).

## Minimal Fix

### 1. AgentApiManager.ts

```typescript
// Add to AgentApiOptions
export interface AgentApiOptions {
    input: string | Array<OpenResponsesInputItem>;
    model?: string;
    instructions?: string;
    tools?: Array<OpenResponsesTool>;
    stream?: boolean;
    maxOutputTokens?: number;
    previousResponseId?: string;  // ← NEW
}

// In streamAgentResponse(), serialize it:
if (options.previousResponseId) {
    body.previous_response_id = options.previousResponseId;
}

// In continueWithToolResult(), pass it:
for await (const event of this.streamAgentResponse(
    {
        input,
        previousResponseId,  // ← NEW
        tools,               // ← NEW: preserve tool definitions
    },
    signal,
)) {
    yield event;
}
```

### 2. OpenResponsesLoop.ts

Restructure `run()` so the initial request is outside the loop:

```typescript
public async run(messages, tools, signal): Promise<string> {
    // ... setup ...
    
    // === INITIAL REQUEST (once, outside the loop) ===
    const initialStream = this.agentApi.streamAgentResponse(
        { input, tools, stream: true },
        signal,
    );
    
    let hasMore = await this._processStream(initialStream);
    lastResponseId = /* from finish event */;
    
    // === TOOL ROUNDS (continuations only) ===
    while (step < this.maxSteps && hasMore) {
        step++;
        // Execute pending calls...
        
        const continuationStream = this.agentApi.continueWithToolResult(
            lastResponseId,
            functionCallOutputs,
            signal,
        );
        
        hasMore = await this._processStream(continuationStream);
        lastResponseId = /* from finish event */;
    }
}
```

The `_processStream` helper handles all event types for both initial and
continuation streams.

## Impact on the 500k-Token Incident

The user's Chinese vocabulary check made **17 sequential `search_notes` calls**.
With the current bugs:

- Original input (~200 tokens) sent 17 times = **3,400 tokens**
- Each tool result (~3,000 tokens of file metadata) accumulated in context = **~51,000 tokens**
- Total per step grew linearly: step 1 ≈ 3k, step 17 ≈ **~460k**

With the fix:
- Original input sent **once** = 200 tokens
- Each continuation is **stateful** via `previous_response_id` = only tool results sent back
- Total for 17 steps: ~200 + (17 × ~200 result summary) = **~3,600 tokens**

**Reduction: ~140× for multi-step tool chains.**

## Test Requirements

1. **One initial request only:** Spy on `streamAgentResponse`, assert called
   exactly once.
2. **Continuation has `previous_response_id`:** Mock `streamAgentResponse`,
   verify body contains it.
3. **No original history in continuations:** Verify continuation body has only
   `function_call_output` items, no user messages.
4. **Two sequential tool rounds:** Simulate model calling tool A → result →
   model calls tool B → result. Assert both rounds use
   `continueWithToolResult`, never a second `streamAgentResponse`.
5. **Tools preserved on continuation:** Verify `tools` array is passed in
   continuation request body.
6. **Continuation function calls captured:** Assert that a continuation stream
   yielding `function_call` events correctly populates `pendingFunctionCalls`.

## Files to Modify

| File | Change |
|------|--------|
| `src/agent/OpenResponsesLoop.ts` | Move initial request outside loop; add shared stream handler; pass tools on continuations |
| `src/api/AgentApiManager.ts` | Add `previousResponseId` to options; serialize to body; pass through `continueWithToolResult` |
| `src/agent/__tests__/openResponsesLoop.test.ts` | Add tests for initial/continuation request count, body contents, multi-round chains |

## Related
- [T60b: Cross-Loop Tool Transport Parity](../tasks/T60b.md)
- [T14: Remote Agent Connectivity](../tasks/T14.md)
- [T48: Conversation Compaction Mechanism](../tasks/T48.md)
