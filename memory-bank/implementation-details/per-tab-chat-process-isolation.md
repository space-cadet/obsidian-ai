# Per-Tab Chat Process Isolation
*Created: 2026-08-05 10:55:22 IST*
*Last Updated: 2026-08-05 11:27:43 IST*

## Purpose

Make internal chat tabs behave like separate conversations while retaining one shared toolbar and composer. A response started in one tab must never render, accept tool approval, consume stop commands, or leak token state in another tab.

## Diagnosis

The tab strip separates saved sessions, but it does not separate live process state.

`ChatApp` currently owns one panel-level runtime:

- `isStreaming`
- `currentAiMessage`
- `currentContentParts`
- `pendingToolCall`
- `controllerRef`
- `resolveToolRef`
- `runningTokenTotal`
- `messagesRef`

`messages` is derived from `activeSessionId`, but the streaming runtime is not. When a user sends from tab A, switches to tab B, and the stream continues, tab B receives its own saved messages plus tab A's global streaming bubble.

The final assistant message is usually appended to the correct session because `useMessageActions` captures `currentActiveId` when sending. The bug is primarily in live rendering and process control. Tool-using paths add a second hazard: `ToolExecutor` receives `() => activeSessionIdRef.current`, so active-session exclusion and tool context can drift after a tab switch.

## Required Contract

1. A chat tab is a `ChatSession` plus a live runtime entry keyed by the same `sessionId`.
2. The tab strip, toolbar, and composer may remain visually shared.
3. `ChatMessages` only renders the runtime entry for the active session.
4. A background tab may continue generating, but its streaming bubble is visible only when that tab is active.
5. Stop, pending tool approval, resolver callbacks, and running token totals target the active session's runtime entry.
6. Tool executors use the originating session ID captured at send time, not whichever tab is active later.

## Proposed Runtime Shape

```ts
interface ChatRuntimeState {
  isStreaming: boolean;
  currentAiMessage: string;
  currentContentParts: ContentPart[];
  pendingToolCall: ToolCall | null;
  controller: AbortController | null;
  resolveTool: ((result: ToolResult | null) => void) | null;
  runningTokenTotal: number;
  typingAgents?: Set<string>;
}

type ChatRuntimeMap = Record<string, ChatRuntimeState>;
```

The implementation can keep this in `ChatApp` or move it into a focused hook, for example `useChatRuntimeState`. A hook is preferable if it provides small helpers:

- `getRuntime(sessionId)`
- `getVisibleRuntime(activeSessionId)`
- `patchRuntime(sessionId, patch)`
- `clearRuntime(sessionId)`
- `abortRuntime(sessionId)`
- `setRuntimeToolResolver(sessionId, resolver)`

## Implementation Plan

### Phase 1: Add Session-Keyed Runtime Helpers

Create a runtime map keyed by `sessionId`. Provide a default empty runtime for sessions that have no active generation. Keep updates immutable so React re-renders when the active session's runtime changes.

The active tab should derive:

- `activeRuntime.isStreaming`
- `activeRuntime.currentAiMessage`
- `activeRuntime.currentContentParts`
- `activeRuntime.pendingToolCall`
- `activeRuntime.runningTokenTotal`

### Phase 2: Route Single-Chat Streaming by Origin Session

In `handleSend`, capture:

```ts
const originSessionId = activeSessionIdRef.current;
```

Every streaming update must use `originSessionId`:

- clear live text at start
- set the origin controller
- append live deltas to the origin runtime
- append content parts and tool cards to the origin runtime
- clear only the origin runtime in `finally`

The final message update should continue mapping by the captured session ID.

### Phase 3: Fix Tool Identity and Approval

Construct `ToolExecutor` with:

```ts
() => originSessionId
```

for all send paths. Pending tool calls should be stored in the origin runtime. Approve/reject handlers should read the active session's runtime and resolve that runtime's resolver. If a tool card belongs to a background tab, it should become visible when that tab is selected.

### Phase 4: Define Concurrent Send Behavior

Preferred behavior: allow tab B to send while tab A is streaming, because the per-session controllers make this technically possible.

Minimum acceptable behavior: block a second send globally but keep the block explicit and do not show tab A's response in tab B. If this fallback is chosen, the composer should not pretend tab B itself is generating.

The preferred path is more consistent with the task title and user expectation: each tab has its own process.

### Phase 5: Cover Group Chat and OpenResponses Paths

The group-chat path uses `orchestrator`, typing agents, and shared `controllerRef`. It needs the same origin-session routing. OpenResponses and tool-calling paths need the same runtime-keyed text, content parts, pending calls, and token totals.

### Phase 6: Cleanup on Tab Close and Session Delete

When a tab is closed:

- if its runtime is idle, remove the runtime entry;
- if it is streaming, decide whether close aborts the process or leaves it attached to the saved session.

Safer initial behavior: closing a streaming tab aborts that session's controller and clears its runtime. Deleting a session should always abort and clear its runtime.

## Regression Tests

Add focused tests that simulate two sessions:

1. Start a stream in session A, switch `activeSessionIdRef` to B, emit a text delta, and assert B's visible runtime remains empty while A's runtime updates.
2. Start a tool-using response in A, switch to B, approve the tool after returning to A, and assert the tool executor receives A as the current session.
3. Start streams in A and B, abort B, and assert A's controller is not aborted.
4. Verify final assistant messages still append to the originating sessions.

The likely test files are `src/hooks/__tests__/useMessageActions.test.ts` and a new hook test if runtime helpers are extracted.

## Implementation Completed

T34 was implemented on 2026-08-05:

- `src/hooks/useChatRuntimeState.ts` owns session-keyed runtime entries for streaming text, content parts, pending tools, abort controllers, resolvers, and token totals.
- `ChatApp` derives the visible runtime from `activeSessionId` and passes only that runtime to `ChatMessages`, `PendingToolCard`, and `ChatInput`.
- `useMessageActions` captures the origin session at send time and routes stream deltas, tool calls, approvals, token totals, final messages, retries, edits, and stop behavior through that session.
- Tool executors now receive the origin session ID for active-session exclusion and context.
- Closing tabs, closing other tabs, closing tabs to the right, and deleting sessions abort and clear the affected session runtime.

Verification:

- `pnpm test src/hooks/__tests__/useMessageActions.test.ts src/hooks/__tests__/useSessionActions.test.ts`
- `pnpm test`
- `pnpm run build`
- `git diff --check`

Manual validation:

- The user confirmed the repaired tabbed-chat workflow behaves correctly: a reply in one tab no longer appears in another tab.

## Related Work

- T34: Per-Tab Chat Process Isolation
- T15: Tabbed Chat Interface with Multi-Profile
- T4: Streaming
- T13: Agentic Tool Calling for Note Editing
