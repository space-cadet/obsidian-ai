# Tool Approval, Batch Plan, and Operation Audit Design
*Created: 2026-08-05 13:23:15 IST*
*Status: Deferred design for T38*

## Scope

This document defines a future tool-execution safety layer. It does not change
the current tool implementation or grant authority to execute any plan.

## Approval Policy

The Tool Safety & Approval settings section replaces the binary `autoApply`
setting with one persisted policy:

| Policy | Automatically approved operations |
| --- | --- |
| Ask every time | None |
| Read-only | Read, search, list, folder listing, metadata |
| Safe creation | Read-only plus create folder and idempotent note creation |
| Reversible edits | Safe creation plus append, patch, section edit, and move after preflight |
| YOLO | All supported operations, including deletion |

YOLO requires a deliberate confirmation and a visible active-state indicator.
Every policy retains schema validation, vault path protections, operation size
limits, collision checks, and audit logging. A policy changes approval only;
it does not override execution safeguards.

## Batch Plan Contract

Future multi-file mutations use typed, operation-specific plans rather than an
unbounded array of arbitrary tool calls.

1. The agent creates a plan with target paths and operations but performs no
   write.
2. The UI renders the plan: counts, paths, operation-specific previews,
   collision findings, diffs where meaningful, and destructive warnings.
3. The user approves once unless the active policy covers the entire plan.
4. Applying validates the plan again immediately before each change. Existing
   content changes use expected-content fingerprints to prevent stale edits.
5. The result records applied, skipped, and failed entries. No success result
   may conceal a partial application.

Initial candidates are batch moves and structured frontmatter/patch changes.
Bulk delete is deferred until the general plan contract is demonstrated; it
needs a separate destructive confirmation even within a plan preview.

## Operation Audit Log

The existing `FileLogger` remains a console/debug diagnostic facility. T38
adds a separate JSONL audit log in the plugin directory. Events cover plan
creation, approval/rejection, application start, and final result.

Required fields: timestamp, session ID, profile/model identifier, tool-call or
plan ID, approval policy, operation name, target paths, duration, counts for
applied/skipped/failed, and a redacted error or diff summary.

Raw note content, prompts, API keys, and tokens are excluded by default.
Content previews are an explicit opt-in and must be redacted. Settings expose
audit logging enablement, per-file rotation size, retained file count, total
size cap, export, and clear actions. Default implementation target: 1 MB per
file, 10 retained files, and 10 MB total.

## Delivery Sequence

1. Migrate the approval setting and add the policy UI, preserving the existing
   `autoApply` value as a compatible migration input.
2. Add the audit logger and tests for privacy, rotation, and outcome capture.
3. Add previewed batch moves and their preflight/result tests.
4. Add structured patch/frontmatter plans with optimistic concurrency checks.
5. Consider batch deletion only after the previous stages receive manual UI
   validation.
