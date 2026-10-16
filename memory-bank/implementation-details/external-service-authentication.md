# External Service Authentication and Provider Adapters

*Created: 2026-08-31 02:17:06 IST*
*Last Updated: 2026-10-16 20:31:46 IST*
*Task: [T69](../tasks/T69.md)*

## Purpose

This document describes how Obsidian AI can connect to external AI services
that may use API keys, account-based authentication, subscription entitlements,
local CLIs, or local app-server processes.

The first service subtasks are:

- [T69a: Codex / ChatGPT Subscription Authentication](../tasks/T69a.md)
- [T69b: Claude Code Authentication](../tasks/T69b.md)

This is separate from [T39](../tasks/T39.md), which is the peer-plugin API for
installed Obsidian plugins such as Obsidian Git. T69 is about external model or
coding services and the adapters that connect to them.

## Access Modes

The following access modes must remain distinct in product behavior and
documentation:

| Access mode | Meaning | Example |
| --- | --- | --- |
| API key | A service API credential used by the plugin's HTTP client | OpenAI API |
| Account login | A user account session or OAuth/device authorization | ChatGPT account |
| Local CLI | A locally installed command-line client with its own login state | Codex CLI |
| Local app-server | A local process exposing a supported integration protocol | Codex `app-server` |
| Remote agent | A separately hosted service accessed through a documented protocol | OpenResponses agent |
| Paired chat frontend | A client paired with a remote chat runtime that owns tool execution | OpenClaw Gateway |
| Proxy | A user-installed compatibility service that owns authentication | `openai-oauth`-style proxy |

Subscription access is not automatically equivalent to API access. Each service
still needs a short, current check of entitlement, token scope, request limits,
and the integration surface we intend to use.

## Recovered Ecosystem Research

The August 27, 2026 research session found these Obsidian patterns. The current
follow-up below adds public mobile implementations found on 2026-08-31.

| Plugin | Observed approach | Planning significance |
| --- | --- | --- |
| [Codex Panel](https://github.com/murashit/codex-panel) | Starts the locally installed `codex app-server` and inherits the Codex CLI login | Closest technical reference and preferred initial architecture |
| [Chatting with AI](https://github.com/o1xhack/obsidian-chatting) | Performs ChatGPT/Codex device authorization in the plugin and calls the Codex backend directly | Closest product comparison, but experimental and dependent on private request details |
| [Note Pilot](https://community.obsidian.md/plugins/note-pilot) | Uses a separate local `openai-oauth` proxy as an OpenAI-compatible endpoint | Simpler plugin boundary with an additional local dependency |
| [Smart Composer](https://github.com/glowingjade/obsidian-smart-composer) | Offers subscription OAuth alongside ordinary API providers | Relevant multi-provider precedent; subscription path was treated as experimental |
| [Codexdian](https://github.com/cfsheep/codexdian) | Delegates authentication and execution to the installed Codex CLI | Useful CLI lifecycle, approvals, and note-context precedent |
| [Codex for Obsidian](https://github.com/lufie/codex-for-obsidian) | Runs the local Codex CLI and reuses its existing login | Simple desktop sidebar pattern |
| [Gryphon](https://community.obsidian.md/plugins/gryphon) and [AI Refiner](https://community.obsidian.md/plugins/ai-refiner) | Launch local `codex` processes as CLI providers | Generic local-process integration examples |

### Current mobile precedents

| Project | Observed approach | What we can reuse |
| --- | --- | --- |
| [Chatting with AI](https://github.com/o1xhack/obsidian-chatting) | Device authorization in the plugin, Obsidian `requestUrl()`, `SecretStorage`, token refresh, and direct HTTP calls to the Codex backend | Shows that ChatGPT/Codex subscription login can work on Obsidian mobile without a local process |
| [Vault Companion for Claude](https://github.com/estrenuo/vault-companion-for-claude) | Direct Anthropic API key on every device; Claude subscription through a token-protected Mac relay | Good model for offering API access directly and subscription access through a companion host |
| [Agentic Chat](https://github.com/tardigrde/obsidian-agentic-chat) | Mobile-safe hosted providers and remote MCP over HTTPS; secrets in `SecretStorage` | Useful HTTP, OAuth, storage, retry, and mobile testing patterns |
| [GitHub Copilot Chat for Obsidian](https://github.com/hauridev/obsidian-github-copilot-plugin) | GitHub device flow and subscription API, but the plugin declares itself desktop-only | Confirms that device flow helps with login but does not by itself make the whole provider mobile-ready |
| [OneDrive Sync](https://github.com/jeffsteinbok/obsidian-onedrive) | Direct mobile device-code login with refresh tokens in `SecretStorage` | Conventional cross-platform device-flow and secret-storage example |

The updated recommendation is to develop two Codex options at a small scale:
use the supported local `app-server` for the maintainable desktop integration
without requiring the Codex desktop GUI, and test the direct device-flow HTTP
approach for mobile. The second option is
technically feasible but depends on request details that are not described by
the public app-server documentation, so it needs a clear compatibility note
and focused maintenance plan before release.

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

### Sign in with ChatGPT for open-source clients — 2026-10-16

OpenAI now documents a public-client flow for open-source/local tools to request
eligible ChatGPT plan use through the public Responses API. It uses dynamic
client registration, a stable host ID, PKCE, account/workspace consent, token
refresh, and the OAuth-issued client ID. The documented inference request uses
`https://api.openai.com/v1/responses`, `store: false`, and `stream: true`.

The callback requirement is a hard platform constraint: start a local HTTP
listener and use an exact callback URI on `http://127.0.0.1:<port>/auth/callback`.
OpenAI explicitly says not to replace `127.0.0.1` with `localhost`. Obsidian
mobile exposes outbound `requestUrl()` but no plugin-owned inbound listener or
Node/Electron runtime, so this flow cannot complete inside a standalone mobile
plugin. Consider it for desktop/local use; do not claim it solves mobile login.

References:
- [Sign in with ChatGPT for open-source clients](https://developers.openai.com/siwc/token-sharing-open-source)
- [Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- [Codex device-code login implementation](https://github.com/openai/codex/blob/main/codex-rs/login/src/device_code_auth.rs)

### Official app-server contract check — 2026-09-26

The current [Codex app-server documentation](https://developers.openai.com/codex/app-server)
explicitly identifies app-server as the integration surface for authentication,
conversation history, approvals, and streamed agent events. Its default local
transport is newline-delimited JSON over stdio; clients initialize once, then
create/resume a thread and start turns while consuming notifications.

The documented account methods include `account/read`,
`account/login/start`, `account/login/cancel`, and `account/logout`. For
subscription login, the supported managed modes are `chatgpt` (browser callback)
and `chatgptDeviceCode`; app-server stores and refreshes managed ChatGPT tokens.
`account/updated` reports the auth mode and plan type when available. The
separate `chatgptAuthTokens` mode is explicitly experimental and expects the
host application to own token refresh. OpenAI describes Codex sign-in as using
the user's ChatGPT plan usage and billing, distinct from API-key billing
([ChatGPT Work and Codex](https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex)).

**Product requirement:** Codex subscription sign-in must work directly on
Obsidian mobile with no connected desktop or Codex process. The desktop local
app-server cannot satisfy that requirement by itself: its default transport is
local stdio/Unix socket, and its remote WebSocket transport is documented as
experimental and unsupported for production. Desktop must retain local Codex
auth without requiring the Codex desktop application; whether the plugin uses
an installed CLI or manages the app-server runtime is still open.

**Feasibility finding:** an independent Obsidian plugin publicly documents
mobile iOS/Android use of ChatGPT-account auth and implements the device-code
flow with Obsidian `requestUrl()`, including polling, token exchange, and
refresh. Its request adapter calls
`chatgpt.com/backend-api/codex/responses`, an undocumented backend endpoint,
with Codex-specific request headers and body. This establishes technical
feasibility without a desktop host, but not a stable or OpenAI-supported plugin
integration. The endpoint, client ID, and request contract can change without
notice; the external project itself describes this provider as experimental.

The earlier manual-probe-only plan was superseded by the provider
implementation below. Device-code sign-in uses the standard Codex account
authorization flow; the mobile model and response backend calls remain
compatibility-sensitive because their endpoint contract is not documented as
a public API.

For desktop, evaluate the official open-source OAuth flow for a direct,
supported Responses API client and the documented app-server for full Codex
agent behavior. Neither desktop path requires the Codex desktop GUI, but the
runtime and feature scope still need a decision.

### Local app-server constraint

The development host resolves a `codex` command, but invoking it fails with
`ENOENT` because the packaged native executable is missing. Therefore the
official protocol has been reviewed, but a real app-server authentication or
request probe has not been run in this environment. Re-run the bounded probe
after installing a working supported Codex CLI; do not infer login reuse or
turn behavior from the documentation alone.

For desktop, evaluate the official open-source OAuth flow for a direct
Responses client and the Codex `app-server` for full agent behavior. The
app-server path must use supported Codex authentication without requiring the
Codex desktop GUI. It may use an installed CLI or a plugin-managed runtime;
choose that dependency before implementation. Translate app-server events into
the existing chat turn, streaming, tool, approval, and persistence contracts.

### Implemented Codex provider — 2026-10-16

The plugin now exposes **Codex** as a provider profile, separate from the
OpenAI API-key provider. Profile settings offer sign-in, reconnect, and sign
out. A successful sign-in triggers model discovery. The default model is
`gpt-6-luna`; the fetched model list comes from the Codex models endpoint and
includes entries whose visibility is `list`.

#### Sign-in and credentials

Sign-in uses the Codex device-code authorization flow. The plugin requests a
one-time code from `auth.openai.com/api/accounts/deviceauth/usercode`, shows
the code and verification page (`/codex/device`), and polls
`/api/accounts/deviceauth/token` at the returned interval (5 seconds if none
is supplied), until approval, cancellation, or the 15-minute timeout. The
browser is used to enter the code; the user does not paste a callback URL into
Obsidian. The authorization response's code and verifier are exchanged at
`/oauth/token` with the fixed device-flow redirect URI
`https://auth.openai.com/deviceauth/callback`; this is an OAuth exchange
parameter, not a browser callback into the plugin. Access and refresh tokens,
expiry, and an optional ChatGPT account ID are stored per provider profile in
Obsidian `SecretStorage` under a `chat-lab-codex-<profile>` key. This requires
Obsidian 1.11.4 or newer. Sign out or changing the profile away from Codex
clears the value by storing an empty string, because `SecretStorage` has no
delete method. Closing the login dialog after sign-in does not revoke the
account grant.

Expired credentials are refreshed with the OAuth token endpoint when within 30
seconds of expiry. Concurrent refreshes for a profile share one request. A
401 from model discovery or a chat request triggers refresh and one retry.
Before saving a refresh result, the provider verifies that the stored
credential still matches the credential that initiated the refresh. If sign-out,
profile deletion, a provider change, or reconnecting another account cleared or
replaced it while the request was in flight, the stale result is discarded.
The OpenAI API-key provider keeps its own credentials and endpoint.

#### Model and response requests

Model discovery calls
`https://chatgpt.com/backend-api/codex/models?client_version=<plugin version>`.
Chat requests use the OpenAI SDK's Responses interface with the Codex base URL
`https://chatgpt.com/backend-api/codex`, which resolves to the Codex
`/responses` route. Requests include the bearer access token, `originator`,
plugin user-agent, and account ID when available; Responses requests set
`store: false`.

The SDK fetch adapter sends requests through Obsidian's native `requestUrl()`
bridge to avoid renderer CORS failures on mobile. It wraps the native response
in a web `Response` for the SDK's SSE parser. Since `requestUrl()` buffers the
response, generated text appears after the response completes rather than
token by token. The native bridge cannot cancel an in-flight request; abort
stops the plugin from waiting for it, while the underlying native request may
continue.

Codex tool names must match `^[a-zA-Z0-9_-]+$`. Before sending a chat request,
invalid integration tool names are mapped to unique API-safe aliases across
tool definitions and conversation history; tool-call names are restored before
plugin execution. Stream errors are drained through SDK settlement before
being surfaced to avoid a secondary unhandled no-output rejection.

#### Verification and support limits

Focused provider, credential, tool-name, and stream-error tests passed, as did
the production build. The full suite reported 589 passing tests and one
unrelated existing `useMessageActions` AbortSignal assertion failure. On
2026-10-16 the user confirmed the updated Android mobile flow works. iOS
acceptance and desktop app-server integration remain open. Desktop runtime
provisioning (installed CLI or managed app-server runtime) is undecided.

The device-code sign-in flow is distinct from the mobile API compatibility
limit: the Codex models and Responses backend endpoints used here are not
documented as a stable public provider API and may change. Keep that
compatibility risk visible in maintenance decisions. The existing OpenAI
API-key path remains available independently.

Codex implementation checklist:

- [x] Verify the current official app-server authentication and protocol contract.
- [x] Confirm that app-server owns managed ChatGPT login, token persistence,
  refresh, and logout state.
- Define process startup, readiness, crash, restart, and shutdown behavior.
- Map streamed text, tool calls, approvals, results, and cancellation.
- [x] Implement the Codex profile provider with device-code sign-in, secure
  credential storage/refresh, model discovery, and Responses requests.
- [ ] Complete real-device acceptance on iOS; Android mobile flow was confirmed
  working by the user on 2026-10-16.
- Separately evaluate the official desktop app-server adapter; a working local
  Codex CLI is required for its bounded login and one-turn probe.
- Keep the existing OpenAI API provider independently usable.
- [x] Confirm the required mobile sign-in flow is technically feasible without
  a desktop host; its current reference implementation uses undocumented
  endpoints, so compatibility and support risks remain open.

## OpenClaw Gateway Chat Frontend

The user wants Obsidian to work as a chat frontend for a running OpenClaw
instance, like Telegram. This is a paired Gateway client mode, distinct from
Codex account authentication and the existing OpenAI API-key provider. It must
work from desktop and mobile without relying on the Codex desktop app or a
connected desktop host. OpenClaw owns model and tool execution; the plugin
connects to the Gateway and renders the conversation rather than executing
Gateway tool calls against the local vault.

Pair each device directly with the Gateway. Keep device identity and pairing
credentials in local secure storage; do not sync private keys or device tokens.
Define pairing approval and revocation, reconnect/session handling, event
mapping, and approval display before implementation. See [T14](../tasks/T14.md)
for remote connectivity and its separate OpenResponses transport.

## Claude Code

See [T69b](../tasks/T69b.md).

Claude Code must be investigated independently. The implementation must not
assume that its account login, subscription entitlement, CLI, API, or OAuth
surface matches Codex. The first deliverable is a short, authoritative record
stating which of these modes is supported for an external Obsidian integration.

Claude-specific implementation checklist:

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

- Evaluate the documented open-source OAuth flow and app-server separately
  for desktop; neither requires the Codex desktop GUI.
- The Codex provider is implemented for mobile and Android use was confirmed
  on 2026-10-16. Verify iOS separately and continue to track the backend
  endpoint's compatibility risk.

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

## Implementation Checklist

- [ ] Official authentication approach is cited for each service.
- [ ] Login and logout are user-visible and reversible where supported.
- [ ] No credential or callback data appears in prompts, logs, exports, or sync.
- [ ] API-key profiles still work unchanged.
- [ ] Provider switching cannot reuse the wrong account or session.
- [ ] Local processes are bounded, cancellable, and cleaned up on unload.
- [ ] Streaming and tool events are translated without executing incomplete
  arguments.
- [ ] Approval policy remains host-controlled.
- [ ] Desktop/mobile behavior is tested and described accurately.
- [ ] Real-provider acceptance is separate from mocked tests and from release
  approval.
