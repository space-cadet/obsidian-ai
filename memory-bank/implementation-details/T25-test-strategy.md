# T25: Test Strategy — Streaming & Token Estimation

*Created: 2026-07-14*
*Related Task: [T25](../tasks/T25.md)*

## Problem

The 2026-07-14 session fixed three streaming bugs that share a common root cause: **async state accumulation across event boundaries** that TypeScript cannot catch and manual QA easily misses.

| Bug | File | Root Cause | Fix |
|-----|------|-----------|-----|
| Tool cards not rendering during streaming | `OpenResponsesLoop.ts` | `accumulatedText` reset per step | `totalAccumulatedText` persists across steps |
| Token count frozen during streaming | `AgentLoop.ts` | Only counted at step boundaries | Incremental counting during `text-delta` |
| Missing text + memory leaks | `ChatMessages.tsx` | `lastIndexOf` returned -1; `createRoot` uncleaned | Fallback to full content; collect roots for cleanup |

## Test Strategy

### Layer 1: Pure Functions (Highest Value, Lowest Effort)

Extract and test logic that has no side effects:

```typescript
// src/lib/streamingUtils.ts
export function accumulateContentParts(
  text: string,
  textCheckpoint: string,
  contentParts: ContentPart[]
): { textCheckpoint: string; contentParts: ContentPart[] } {
  // Detects tool-call JSON boundaries in accumulated text
  // Returns updated checkpoint + parts array
}

export function getRemainingText(
  content: string,
  lastTextPart: { content: string }
): string {
  const idx = content.lastIndexOf(lastTextPart.content);
  return idx >= 0
    ? content.slice(idx + lastTextPart.content.length)
    : content; // fallback when text spans step boundary
}
```

**Test cases for `accumulateContentParts`:**
1. Plain text — no tool calls, checkpoint advances to end
2. Single tool call — detects `{"tool": "..."}` boundary, adds `tool_call` part
3. Multiple tool calls — sequential detection, checkpoint resets after each
4. Incomplete tool call JSON — waits for more text, doesn't false-positive
5. Text after tool call — resumes text accumulation after tool part

**Test cases for `getRemainingText`:**
1. Normal case — `content = "hello world"`, `lastTextPart = "hello"` → returns `" world"`
2. Exact match — `content = "hello"`, `lastTextPart = "hello"` → returns `""`
3. `-1` fallback — `content = "step1 step2"`, `lastTextPart = "step1"` (from step 1, not in current content) → returns `"step1 step2"`
4. Empty content — returns `""`

### Layer 2: Token Estimator (Already Pure, Just Needs Tests)

`src/context/tokenEstimator.ts` contains only pure functions. Add comprehensive tests:

```typescript
// src/context/__tests__/tokenEstimator.test.ts
describe("estimateTokens", () => {
  it("rounds up character count / 4", () => {
    expect(estimateTokens("hello")).toBe(2); // 5 / 4 = 1.25 → 2
  });
  it("handles empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });
  it("handles unicode", () => {
    expect(estimateTokens("你好")).toBe(1); // 2 chars / 4 = 0.5 → 1
  });
});

describe("estimateAttachmentTokens", () => {
  it("returns 255 for images", () => {
    expect(estimateAttachmentTokens({ type: "image", name: "test.png" })).toBe(255);
  });
  it("estimates PDF from base64 size", () => {
    const data = "a".repeat(1000); // ~750 bytes after base64 decode
    expect(estimateAttachmentTokens({ type: "pdf", data, name: "test.pdf" })).toBe(188);
  });
  it("falls back to name-based estimate for vault files", () => {
    expect(estimateAttachmentTokens({ type: "text", name: "note.md" })).toBeGreaterThan(0);
  });
});
```

### Layer 3: Mock-Based Streaming Tests

Test `AgentLoop` and `OpenResponsesLoop` with mocked dependencies:

**`AgentLoop` test outline:**
```typescript
describe("AgentLoop token counting", () => {
  it("increments token count on each text-delta", async () => {
    const mockApi = createMockChatApi([
      { type: "text-delta", text: "Hello " },
      { type: "text-delta", text: "world" },
      { type: "finish" },
    ]);
    const onTokenUpdate = vi.fn();
    const loop = new AgentLoop({ chatApi: mockApi, onTokenUpdate });
    
    await loop.run({ messages: [], signal: new AbortController().signal });
    
    expect(onTokenUpdate).toHaveBeenCalledTimes(2);
    expect(onTokenUpdate.mock.calls[0][0]).toBeLessThan(onTokenUpdate.mock.calls[1][0]);
  });
});
```

**`OpenResponsesLoop` test outline:**
```typescript
describe("OpenResponsesLoop text accumulation", () => {
  it("accumulates text across tool-call steps", async () => {
    const mockParser = createMockParser([
      // Step 1: text + tool call
      { type: "text-delta", delta: "I'll search for " },
      { type: "function_call", name: "search_notes", arguments: '{"query": "test"}' },
      { type: "function_call_done" },
      // Step 2: text after tool result
      { type: "text-delta", delta: "Here are the results..." },
      { type: "finish" },
    ]);
    const onTextDelta = vi.fn();
    const loop = new OpenResponsesLoop({ parser: mockParser, onTextDelta });
    
    await loop.streamAgentResponse({ messages: [] });
    
    // Verify cumulative text was passed, not step-local
    const lastCall = onTextDelta.mock.calls.at(-1)[0];
    expect(lastCall).toContain("I'll search for");
    expect(lastCall).toContain("Here are the results");
  });
});
```

### Layer 4: E2E Regression Tests (Future)

Add to `e2e/streaming.e2e.test.ts`:
```typescript
it("renders tool call cards during streaming (regression: T25)", async () => {
  // Use calculator tool, verify ToolCallNotification appears mid-stream
});
```

## Implementation Order

1. **Extract pure functions** from `useMessageActions.ts` and `ChatMessages.tsx` into `src/lib/streamingUtils.ts`
2. **Write tests** for extracted functions + token estimator
3. **Mock-based tests** for AgentLoop/OpenResponsesLoop (requires more setup)
4. **E2E regression tests** after unit tests stabilize

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Refactoring introduces new bugs | Only extract pure functions; don't change behavior. Run existing E2E tests after. |
| Mock setup is brittle | Use the existing `__mocks__/obsidian.ts` from T21. Keep mocks minimal. |
| Tests become stale | Tests are co-located with source (`__tests__/`) and use relative imports. |

## Current Status

⏸️ **Pending** — Task created but deferred until after next release cycle. Fixes are verified by build + manual QA.

## T60e Provider-Adaptive Streaming Coverage — 2026-08-25

The planned T60e follow-up adds tests for event timing and provider variance:

- AI SDK tool-input start/delta/end translation and callback order
- OpenResponses function-argument delta/done parsing
- Provisional display without execution before complete valid arguments
- Buffered/no-event providers and generic waiting-state transitions
- Reasoning-only output, cancellation, malformed arguments, and rejection
- Multiple tool rounds with correct call/result pairing and persistence

These tests belong on the separate T60e branch and should cover both
`AgentLoop` and `OpenResponsesLoop` before changing the production UI contract.
