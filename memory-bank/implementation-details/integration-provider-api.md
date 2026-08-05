# Integration Provider API

*Created: 2026-08-05 17:28:52 IST*
*Last Updated: 2026-08-05 17:28:52 IST*
*Task: [T39](../tasks/T39.md)*

## Purpose

This document specifies a future Integration Provider API for Obsidian AI. A
provider is an ordinary installed peer Obsidian plugin that offers narrowly
scoped domain capabilities to the AI tool workflow. It is not arbitrary code
loaded inside Obsidian AI, and it is not a model-accessible command shell.

The initial provider is Obsidian Git. The same contract should support future
Tasks, Dataview, Templater, and other integrations without hard-coding those
plugins into the chat subsystem.

## Ownership Boundary

| Concern | Provider plugin | Obsidian AI host |
| --- | --- | --- |
| Domain implementation and manual UI | Owns | Does not duplicate |
| Settings, credentials, and tokens | Owns | Never reads or prompts into model context |
| Capability descriptor and executor | Supplies | Discovers and validates |
| Tool schemas exposed to the model | Describes | Namespaces and registers |
| Approval, cancellation, and policy | Supplies progress only | Final authority |
| Result rendering and audit log | Returns structured result | Redacts, renders, and records |

The host must remain able to use its built-in note tools without the provider
API. A provider is optional: absence, disablement, unload, and version
incompatibility are normal availability states rather than chat failures.

## Provider Contract

The public contract is versioned from the first release. Capability descriptors
are serializable; runtime handlers remain local functions in the installed
provider process.

```ts
interface IntegrationProviderV1 {
  id: string;                 // e.g. "obsidian-git"
  displayName: string;
  apiVersion: 1;
  capabilities: ProviderCapabilityV1[];
  execute(request: ProviderExecutionRequestV1): Promise<ProviderResultV1>;
}

interface ProviderCapabilityV1 {
  id: string;                 // namespaced: "git.status"
  title: string;
  description: string;
  inputSchema: JsonSchema;
  risk: "read" | "write" | "remote-write" | "destructive";
  availability?: "available" | "disabled" | "misconfigured";
}
```

The precise TypeScript names may change during implementation, but these rules
are contractual:

1. Capability IDs are namespaced and unique.
2. Inputs are structured and schema-validated before execution.
3. No `run_command`, arbitrary shell string, arbitrary remote URL, or
   credentials-bearing capability is permitted.
4. Providers return concise typed data and progress events, not HTML or raw
   secret-bearing exceptions.
5. The host rejects incompatible versions and duplicate registrations clearly.

## Lifecycle and Discovery

1. After Obsidian has initialized plugins, Obsidian AI discovers known or
   registered providers.
2. The host validates ID, version, capability namespaces, schemas, and risk
   classification before exposing any tool.
3. The chat tool registry reflects current availability. An unavailable tool
   is omitted from new model calls; a pending call returns a clear unavailable
   result if its provider disappears.
4. Provider unload/disable unregisters its capabilities and cancels or safely
   resolves active work according to the host cancellation contract.
5. Settings show installed, enabled, incompatible, and misconfigured states
   without leaking private provider configuration.

Load order must not be assumed. The first implementation should use a
documented public peer-plugin API plus a refreshable registry, not untyped
access to private implementation fields.

## Tool Safety, Privacy, and Audit

The host is the final policy authority. Provider risk labels guide the UI but
cannot make a remote write auto-approved. T38 supplies the shared approval,
plan, and audit mechanism for provider mutations.

| Risk | Initial behavior |
| --- | --- |
| `read` | Eligible for the configured read-only policy |
| `write` | Show a typed preview and require applicable approval |
| `remote-write` | Always prominent confirmation in the first release |
| `destructive` | Out of scope until a separate destructive contract exists |

Audit events record provider ID, capability ID, host policy decision, duration,
redacted targets, and applied/skipped/failed counts. They do not record raw
note content, full diffs, prompts, API keys, access tokens, or provider
configuration by default.

## Obsidian Git Provider Boundary

Obsidian Git is the reference provider because it has a real Git operation core
and mobile-safe isomorphic-git transport. The AI must call its bounded public
API rather than shelling out or importing private source from a sibling
checkout.

| Capability | Risk | First-release rule |
| --- | --- | --- |
| `git.status`, `git.changed_files`, `git.log` | read | Compact structured results |
| `git.stage_files`, `git.commit` | write | Explicit file/message preview |
| `git.pull`, `git.push` | remote-write | Separate explicit confirmation and progress |
| force push, remote edits, credentials, clone/init, sync-all | destructive or configuration | Not exposed |

The existing combined Git sync action must be decomposed at the AI boundary.
The model can inspect, propose named files, propose a commit message, and then
request each approved step. The Git plugin retains its conventional manual
sidebar and configuration experience.

## Delivery Plan

1. **T39a — Host contract:** Define types, registry, discovery, availability,
   validation, and provider settings. Keep all tools read-only in the first
   executable increment.
2. **T38 dependency:** Deliver shared approval policy and privacy-aware audit
   infrastructure before provider writes.
3. **T39b — Git provider:** Publish the compatible Git API; add read tools,
   then explicit-stage/commit plans, then individually confirmed pull/push.
4. **Additional providers:** Migrate T26's planned Tasks, Dataview, and
   Templater bridges onto the proven provider contract rather than adding
   direct private-plugin calls.
5. **Consolidation decision:** Reassess a one-codebase Git/AI distribution only
   after real usage measures the cost of two installs and coordinated releases.

## Validation Strategy

- Unit test contract validation, version mismatch, duplicate tools, provider
  availability changes, and cancellation.
- Test host-side policy enforcement independently of provider-declared risk.
- Use a fake provider for deterministic approval/audit/result tests.
- Run Git-provider integration tests against real temporary repositories;
  keep mobile-safe transport checks in the Git plugin's own suite.
- Manually validate desktop and mobile provider availability, progress,
  rejection, cancellation, and credential-redaction behavior before release.
