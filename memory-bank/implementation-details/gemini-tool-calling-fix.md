# Fix: Gemini Tool Calling thought_signature Error (T27)

**Status:** ✅ COMPLETED  
**Date:** 2026-07-28  
**Related Tasks:** T27  

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
