#### 02:50 IST - T4: Streaming Bug Fixes (OpenResponses path)
**Action**: Modified
**Files**:
- `src/agent/OpenResponsesLoop.ts` — Added `totalAccumulatedText` to persist text across tool-call steps. Both `streamAgentResponse` and `continueWithToolResult` now append to it and pass cumulative text to `onTextDelta`.
- `src/agent/AgentLoop.ts` — Added incremental token counting during `text-delta` streaming (`runningTotal += estimateTokens(event.text)`). Removed redundant end-of-step text recounts to prevent double-counting.
- `src/components/ChatMessages.tsx` — Fixed `StreamingBubble` remaining-text logic (fallback when `lastIndexOf` returns -1) and React root cleanup (collect `toolRoots[]`, unmount in cleanup).
**Rationale**: Three bugs where async streaming state accumulation broke tool call rendering, token counting, and text display. Text-based workflow used for all memory-bank updates.
