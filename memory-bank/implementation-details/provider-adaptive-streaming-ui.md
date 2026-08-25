# Provider-Adaptive Streaming and Tool-Call Progress UI

*Created: 2026-08-25 23:55:03 IST*
*Status: Planned — no source implementation yet*
*Task: T60e; UI coordination: T15*

## Purpose

The plugin currently streams visible text but delays tool-call presentation
until a response step ends. Reasoning deltas are hidden, and partial tool
arguments are not exposed. Providers therefore appear inconsistent: some emit a
completed call quickly, while others buffer reasoning or arguments and leave the
chat apparently idle.

## Scope Boundary

T60e owns the event/lifecycle contract across the native AI SDK and
OpenResponses paths. T15 owns the visual presentation. T60c owns the shared
validation and execution hardening. This work must be developed on the separate
branch `feat/t60e-provider-adaptive-streaming-ui`.

## Event Contract

The adapter should expose provider-neutral events for:

1. tool-call start: stable call ID and tool name when available;
2. argument delta: opaque partial text for display only;
3. tool-call completion: parsed arguments ready for validation;
4. approval, execution, result, rejection, cancellation, and error.

The AI SDK adapter should forward its tool-input start/delta/end events. The
OpenResponses parser should handle function-call argument delta/done events in
addition to output-item events. Providers that do not emit incremental events
remain valid and use the fallback progress state.

## Display vs Execution

The UI may render a provisional tool card and partial argument preview, but
partial data must never reach `ToolExecutor`. Execution begins only after the
completed arguments pass local validation and approval policy. Transient
provisional state is runtime-only; persisted messages contain completed calls
and results.

## Progress States

Use generic, provider-neutral states:

- **Thinking** — request active but no visible text/tool event yet;
- **Preparing tool** — tool identity/arguments are arriving;
- **Waiting for provider** — request active beyond a useful event threshold;
- **Executing tool** — local execution is in progress;
- **Finishing** — continuation/final response is active.

Do not expose raw hidden reasoning or claim that a provider is frozen merely
because it has not emitted an event.

## Verification Plan

Test direct and remote loops independently for event ordering, buffering,
reasoning-only output, malformed arguments, cancellation, rejection, multiple
calls, continuation rounds, and persistence. Add UI tests for provisional cards,
generic progress states, result replacement, and cleanup on abort/error.

## Related Records

- `tasks/T60e.md`
- `tasks/T60b.md`
- `tasks/T15.md`
- `tasks/T14.md`
- `implementation-details/agentic-tool-calling.md`
- `implementation-details/openresponses-implementation.md`
