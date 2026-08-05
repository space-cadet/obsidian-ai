# Fix: Gemini Tool Calling thought_signature Error (T27)

**Status:** ✅ COMPLETED  
**Date:** 2026-07-28; corrected follow-up 2026-08-05
**Related Tasks:** T27, T35

## Problem

When using Gemini as the model, tool calls failed with:
```
AI_APICallError: Function call is missing a thought_signature in functionCall parts.
```

## Root Cause

Gemini's API (via Vercel AI SDK Google provider) requires "thought signatures" in function call responses when using structured outputs. The current implementation didn't handle this.

## Solution

Disable structured outputs for Gemini in tool-calling mode by adding provider options.

## Code Changes

### `src/api.ts`

In `streamChatWithTools()`, added Gemini-specific provider options:

```typescript
const providerOptions = {
    ...getThinkingProviderOptions(activeProfile, thinkingEnabled),
    // Gemini requires special handling for tool calls
    ...(activeProfile.provider === "gemini" ? {
        google: { structuredOutputs: false },
    } : {}),
};

const result = streamText({
    model,
    messages: messages as any,
    tools,
    stopWhen: stepCountIs(1),
    abortSignal: signal,
    providerOptions,
});
```

## Alternative Approaches Considered

1. **Use native Google SDK** — Would require significant refactoring of API layer
2. **Switch to non-streaming** — Would lose real-time UX
3. **Custom tool calling** — Would bypass Vercel SDK entirely

The chosen approach is minimal and preserves existing architecture.

## Testing Notes

- Test tool calls with Gemini model
- Verify other providers (OpenAI, Anthropic) unaffected
- Test with read_note, edit_note, search tools

## Files Modified

- `src/api.ts`

## 2026-08-05 Corrective Follow-Up

The reported failure recurred because the agent loop rebuilt the assistant
function-call history itself after executing a tool. The rebuilt part kept the
tool ID, name, and arguments but discarded the AI SDK's `providerMetadata`.
For Gemini, that metadata contains the opaque `google.thoughtSignature` that
must be returned on the exact original function-call part.

`ChatApiManager.streamChatWithTools()` now carries `part.providerMetadata` into
the plugin's `ToolCall`. `AgentLoop` copies that value into the reconstructed
assistant `tool-call` content part before sending the tool response to the next
step. No signature is generated, inspected, merged, or persisted by the plugin;
the provider-owned metadata is passed through unchanged.

Regression test: `src/agent/__tests__/AgentLoop.test.ts` asserts that an opaque
Gemini signature received in step one is present on the matching tool call sent
to step two.
