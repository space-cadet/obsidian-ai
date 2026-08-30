# External Service Authentication and Provider Adapters

*Created: 2026-08-31 02:17:06 IST*
*Last Updated: 2026-08-31 02:17:06 IST*
*Task: [T69](../tasks/T69.md)*

## Purpose

This document defines the planning boundary for connecting Obsidian AI to
external AI services that may use API keys, account-based authentication,
subscription entitlements, local CLIs, or local app-server processes.

The first service subtasks are:

- [T69a: Codex / ChatGPT Subscription Authentication](../tasks/T69a.md)
- [T69b: Claude Code Authentication](../tasks/T69b.md)

This is separate from [T39](../tasks/T39.md), which is the peer-plugin API for
installed Obsidian plugins such as Obsidian Git. T69 is about external model or
coding services and the adapters that connect to them.

## Terms and Boundaries

The following access modes must remain distinct in product behavior and
documentation:

| Access mode | Meaning | Example |
| --- | --- | --- |
| API key | A service API credential used by the plugin's HTTP client | OpenAI API |
| Account login | A user account session or OAuth/device authorization | ChatGPT account |
| Local CLI | A locally installed command-line client with its own login state | Codex CLI |
| Local app-server | A local process exposing a supported integration protocol | Codex `app-server` |
| Remote agent | A separately hosted service accessed through a documented protocol | OpenResponses agent |
| Proxy | A user-installed compatibility service that owns authentication | `openai-oauth`-style proxy |

Subscription access is not automatically equivalent to API access. A service
subtask must verify entitlement, terms, token scope, request limits, and the
supported integration surface before implementation.

## Recovered Ecosystem Research

The August 27, 2026 research session found these Obsidian patterns. This is a
historical research baseline and must be refreshed against current repositories
and official documentation before implementation.

| Plugin | Observed approach | Planning significance |
| --- | --- | --- |
| [Codex Panel](https://github.com/murashit/codex-panel) | Starts the locally installed `codex app-server` and inherits the Codex CLI login | Closest technical reference and preferred initial architecture |
| [Chatting with AI](https://github.com/o1xhack/obsidian-chatting) | Performs ChatGPT/Codex device authorization in the plugin and calls the Codex backend directly | Closest product comparison, but experimental and dependent on private request details |
| [Note Pilot](https://community.obsidian.md/plugins/note-pilot) | Uses a separate local `openai-oauth` proxy as an OpenAI-compatible endpoint | Simpler plugin boundary with an additional local dependency |
| [Smart Composer](https://github.com/glowingjade/obsidian-smart-composer) | Offers subscription OAuth alongside ordinary API providers | Relevant multi-provider precedent; subscription path was treated as experimental |
| [Codexdian](https://github.com/cfsheep/codexdian) | Delegates authentication and execution to the installed Codex CLI | Useful CLI lifecycle, approvals, and note-context precedent |
| [Codex for Obsidian](https://github.com/lufie/codex-for-obsidian) | Runs the local Codex CLI and reuses its existing login | Simple desktop sidebar pattern |
| [Gryphon](https://community.obsidian.md/plugins/gryphon) and [AI Refiner](https://community.obsidian.md/plugins/ai-refiner) | Launch local `codex` processes as CLI providers | Generic local-process integration examples |

The recorded recommendation is to prefer a supported local service boundary,
especially Codex `app-server`, over implementing direct calls to private
account backends. Direct private-backend OAuth remains a research alternative
only and requires an explicit security and maintenance decision.

## Common Adapter Contract

The shared adapter should represent service capabilities without exposing
provider-specific credentials to the model or to generic UI code.

```typescript
interface ExternalServiceAdapter {
  id: string;
  displayName: string;
  accessModes: ExternalAccessMode[];
  platforms: ExternalPlatform[];
  getStatus(): Promise<ExternalServiceStatus>;
  login(options?: LoginOptions): Promise<LoginResult>;
  logout(): Promise<void>;
  reauthenticate(): Promise<LoginResult>;
  startSession(options: SessionOptions): Promise<ExternalSession>;
  send(request: ExternalServiceRequest): AsyncIterable<ExternalServiceEvent>;
  cancel(sessionId: string): Promise<void>;
  dispose(): Promise<void>;
}
```

The exact TypeScript shape is provisional. The contract must cover:

1. Discovery and configuration without leaking credentials.
2. Login, already-authenticated, logout, re-authentication, and failure states.
3. Session creation, continuation, streaming, and cleanup.
4. Tool definitions, approval requests, tool results, and cancellation where
   the service supports them.
5. Process ownership and shutdown for local CLI/app-server integrations.
6. Platform declarations for desktop, mobile, and remote-only operation.
7. Redacted diagnostics that identify the service and failure class without
   returning tokens, callback URLs, prompts, or raw provider payloads.

## Credential and Privacy Rules

- Existing API-key providers remain API-key providers; they are not silently
  converted to account-login providers.
- OAuth access tokens, refresh tokens, device codes, callback parameters,
  cookies, and local credential paths must never enter model context.
- Credentials must not be included in debug logs, audit records, exports, sync
  payloads, crash messages, or session transcripts.
- Provider configuration and credential storage remain owned by the adapter or
  its supported local service. T69 does not copy a CLI credential store into
  ordinary provider-profile fields without a documented reason.
- Login must be user-initiated and visibly scoped to the named service.
- Logout and re-authentication must clear or invalidate the adapter's local
  session state where the supported service permits it.
- Error handling must distinguish authentication failure, entitlement failure,
  rate limiting, unavailable local process, transport failure, and provider
  rejection.
- Subscription usage, API billing, and local service usage must be reported as
  separate categories unless the service documents them as equivalent.

## Codex

See [T69a](../tasks/T69a.md).

The preferred design is a desktop adapter that starts the locally installed
Codex `app-server` and uses the user's existing supported Codex authentication
state. The adapter should translate app-server events into the existing chat
turn, streaming, tool, approval, and persistence boundaries.

The direct approach observed in Chatting with AI performs device authorization,
stores an OAuth credential, and calls a private endpoint such as
`chatgpt.com/backend-api/codex/responses`. That demonstrates feasibility but
depends on undocumented endpoint shapes, headers, model identifiers, and
response formats. It is not the default implementation path.

Codex-specific planning gates:

- Verify the current official app-server authentication and protocol contract.
- Confirm whether the app-server owns login, refresh, and logout state.
- Define process startup, readiness, crash, restart, and shutdown behavior.
- Map streamed text, tool calls, approvals, results, and cancellation.
- Confirm desktop-only scope unless a supported mobile path exists.
- Test that the existing OpenAI API provider remains independently usable.

## Claude Code

See [T69b](../tasks/T69b.md).

Claude Code must be investigated independently. The implementation must not
assume that its account login, subscription entitlement, CLI, API, or OAuth
surface matches Codex. The first deliverable is an authoritative boundary
record stating which of these modes is supported for an external Obsidian
integration.

Claude-specific planning gates:

- Verify official authentication options and external-integration terms.
- Distinguish Claude API credentials from Claude Code account credentials.
- Identify whether a supported CLI, local server, SDK, or OAuth flow exists.
- Define session, streaming, tool, approval, cancellation, and process behavior.
- Record desktop/mobile limits and any required user-installed dependency.
- Decide whether the service is implementable, needs a proxy, or should be
  deferred.

## Relationship to Existing Architecture

| Existing task | T69 relationship |
| --- | --- |
| [T9](../tasks/T9.md) | Reuse provider-profile settings concepts, while adding distinct account/local-service states |
| [T14](../tasks/T14.md) | Reuse remote streaming and continuation lessons where protocol-compatible |
| [T15](../tasks/T15.md) | Reuse multi-profile and provider-switching UI boundaries |
| [T38](../tasks/T38.md) | Reuse host-controlled approval, audit, and redaction policy |
| [T39](../tasks/T39.md) | Keep separate; reuse only generic provider ideas if the contracts remain distinct |
| [T60](../tasks/T60.md) | Reuse canonical tool resolution and validated execution |
| [T60e](../tasks/T60e.md) | Reuse provider-adaptive streaming and tool-progress contracts |

T69 must not make T39 responsible for external account authentication, and T39
must not become a generic shell or credential bridge for T69.

## Delivery Phases

### Phase 1: Common research and contract

- Refresh service-specific official documentation and repository evidence.
- Define status, login, session, event, cancellation, and disposal contracts.
- Decide where account/local-service state is stored and how it is redacted.
- Record platform and entitlement limits.

### Phase 2: Codex proof of concept

- Implement a desktop-only process and protocol probe if the current app-server
  contract supports it.
- Verify login reuse, one request, streaming, one bounded tool call, approval,
  cancellation, and clean shutdown.
- Keep the proof of concept separate from the production provider registry until
  the lifecycle and security review passes.

### Phase 3: Service adapters

- Implement each approved service subtask independently.
- Add provider status and re-authentication UI without exposing secrets.
- Add focused mocks plus real-provider acceptance with user-controlled accounts.
- Preserve separate API-key and subscription/local-service paths.

### Phase 4: Production integration

- Connect approved adapters to the provider-profile and chat-turn boundaries.
- Add provider-aware diagnostics, usage categories, and failure recovery.
- Verify tool approval, streaming, cancellation, persistence, export, sync, and
  updater interactions.

## Verification Checklist

- [ ] Official authentication boundary is cited for each service.
- [ ] Login and logout are user-visible and reversible where supported.
- [ ] No credential or callback data appears in prompts, logs, exports, or sync.
- [ ] API-key profiles still work unchanged.
- [ ] Provider switching cannot reuse the wrong account or session.
- [ ] Local processes are bounded, cancellable, and cleaned up on unload.
- [ ] Streaming and tool events are translated without executing incomplete
  arguments.
- [ ] Approval policy remains host-controlled.
- [ ] Desktop/mobile behavior is explicitly tested or documented as unsupported.
- [ ] Real-provider acceptance is separate from mocked tests and from release
  approval.
