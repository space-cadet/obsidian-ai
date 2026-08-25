# Tool Capability Registry and Execution Pipeline
*Created: 2026-08-25 12:52:36 IST*
*Last Updated: 2026-08-25 13:47:27 IST*
*Task: T60*

## Current Boundary

The plugin has 24 built-in tools plus opt-in read-only peer-provider
capabilities. Definitions, dispatch, prompt descriptions, previews, result
formatting, availability, and risk are spread across separate modules. Native
AI SDK chat, OpenResponses, and council mode do not yet share one transport
contract.

The audit found these primary gaps:

- Native `AgentLoop` retains only the last tool call emitted in a step.
- OpenResponses serializes built-ins rather than the resolved provider-aware registry.
- Its serializer expects a legacy shape and lacks a registry conversion test.
- Local execution does not enforce one schema-validation boundary for every transport.
- The binary auto-apply setting spans read, write, remote, memory, and destructive work.
- Static prompt and preview metadata drift from the implemented registry.
- Disabled runtime capabilities remain model-visible.
- Existing-content mutations have no approval-time content fingerprint.

## Implemented Versus Target — 2026-08-25

Commit `68dc915` implements a bounded registry adapter, provider
normalization, availability filtering, and projection tests. It does not yet
make the registry the execution source of truth. `ToolExecutor` still owns
the main dispatch path, and provider resolution can still reduce complete
definitions to raw AI SDK tools.

The next implementation gate is test-first registry integration:
`registry.byId.get('read_note').execute(call)` must have a defined result
contract and match the existing `ToolExecutor` result before transport parity
or the full validation pipeline begins.

## Canonical Definition

Each capability should declare a stable ID/version, title, model description,
input and output schemas, host-owned risk class, availability predicate,
handler, approval preview/preflight, result formatter, audit-redaction policy,
and concurrency/idempotency metadata.

Risk classes are `read`, `local-create`, `local-write`, `remote-read`,
`remote-write`, and `destructive`. Provider declarations inform classification
but never override host policy.

## Execution Pipeline

Every transport uses the same state machine:

1. Resolve the current capability from the availability-filtered registry.
2. Validate and normalize input locally.
3. Apply host authorization and approval policy.
4. Preflight targets, collisions, limits, and expected fingerprints.
5. Request approval when policy requires it.
6. Execute with cancellation and target-aware concurrency.
7. Validate and normalize the result.
8. Record a privacy-preserving audit event when T38 enables auditing.
9. Render a bounded model result while preserving the complete persisted result.

Reads may run concurrently within a bounded pool. Mutations affecting the same
target serialize. Destructive actions use a dedicated confirmation boundary.

## Target Derived Surfaces

The resolved registry generates AI SDK tools, OpenResponses JSON Schema tools,
dynamic prompt summaries, approval/result descriptors, executor dispatch, and
audit metadata. Unavailable tools are omitted rather than advertised and then
rejected after consuming a model turn.

## Ownership

- T60a: registry and dynamic exposure.
- T60b: native/OpenResponses/council transport parity and parallel calls.
- T60c: validation, errors, cancellation, and concurrency.
- T38: approval modes, plans, fingerprints, and audit logging.
- T39a: peer-provider lifecycle and provider capability contract.
- T46: physical decomposition into registry, pipeline, serializers, and handlers.
- T17: new Obsidian knowledge-management capabilities.
- T48b/T48c: replay pairing and exact historical message/tool-result retrieval.

## Validation Matrix

Tests must cover schema rejection, unavailable capabilities, collisions,
multiple calls per step, rejection, cancellation, stale fingerprints,
provider loss, OpenResponses conversion, result bounds, persistence, and
tool-call/result pairing across compaction.

## Out of Scope

Arbitrary shell execution, unrestricted HTTP requests, unrestricted Obsidian
command execution, and provider self-authorization are not part of this plan.
