# Session 2026-09-09 - Per-step Request Telemetry

## Focus Task

T48d: Context-Aware Usage Display and Provider Reconciliation

## Objective

Expose enough bounded Debug Mode telemetry to compare each native tool-loop
request with provider-reported usage and explain why aggregate provider totals
can exceed a single visible message estimate.

## Work Completed

- Added the `debugTelemetry.includeRequestBreakdown` setting with a Debug Mode
  toggle and safe agent read/write support.
- Added optional `AgentStepTelemetry` records to assistant messages, captured
  for the native tool-enabled AgentLoop only.
- Recorded per-step request estimates split into tool schemas, selected history,
  continuation messages, and newly prepared tool results.
- Recorded per-step provider usage, including cached-input usage when returned by
  the provider, while retaining the aggregate provider total.
- Exported the records as `telemetry.agentSteps` without duplicating full tool
  result content. Existing estimate and provider-usage filters remain active.
- Reworked the Debug Mode settings layout with a compact primary control row,
  an `Export details` group, right-aligned switches, and tighter responsive
  spacing scoped only to this section.

## Verification

- Full suite: 53 test files / 461 tests passed.
- TypeScript and production build passed.
- Prettier checks on changed code and `git diff --check` passed.
- Debug settings stylesheet was regenerated successfully.

## Remaining Work

OpenResponses per-step telemetry parity remains open. The local request
breakdown is an estimate; provider-reported usage remains authoritative.
