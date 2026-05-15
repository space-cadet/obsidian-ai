# Active Context

*Last Updated: 2026-05-15 06:45 IST*

## Current Focus
**Primary Task:** T14 — Remote Agent Connectivity
**Secondary Tasks:** T14a (Tailscale network setup — assigned to human, 2/3 complete)

## Active Tasks
- [T14]: 🔄 **IN PROGRESS** — Phase 1 & 2 complete, Phase 3 in progress
  - ✅ Phase 1: Core API Layer (AgentApiManager, OpenResponsesParser, OpenResponsesLoop, toOpenResponses)
  - ✅ Phase 2: Settings & Wiring (settings schema, ChatApp branch, SettingsPanel UI with agent profile form)
  - 🔄 Phase 3: Integration Test — Obsidian settings configured, connection test initiated
- [T14a]: 🔄 **IN PROGRESS** — Tailscale installed on MacBook + VPS (2/3). Android pending.
  - ✅ MacBook Air (Sage): `100.92.54.38` — installed via Homebrew, authenticated
  - ✅ VPS (Cloudy): `100.89.228.41` — installed via install.sh, authenticated as `quantumofgravity`
  - ⏳ Android (Ember): Not yet set up
  - ⏳ **Blocker identified:** ufw on VPS blocking inbound IPv4 Tailscale traffic. Only IPv6 rules present. Need `ufw allow in on tailscale0` (IPv4). Ping works VPS→MacBook but not MacBook→VPS.
- [T13]: ✅ **COMPLETED** — All 13 tools, AgentLoop, PendingToolCard, tool result formatting
- [T11]: ✅ **COMPLETED** — Debug logging, persistence noise fixed, active-note flicker fixed

## Implementation Focus
`src/api/AgentApiManager.ts`, `src/api/OpenResponsesParser.ts`, `src/agent/OpenResponsesLoop.ts`, `src/agent/tools/toOpenResponses.ts`, `src/settings.ts`, `src/components/ChatApp.tsx`, `src/main.ts`

## Task-Specific Context

### Task T14 — Remote Agent Connectivity (OpenResponses API)
**Architecture:** Plugin becomes bidirectional client for remote OpenClaw agents.
- **AgentApiManager**: HTTP client for `POST /v1/responses` with SSE streaming. Supports text deltas, function_call detection, connection test, and tool result follow-up (`continueWithToolResult`).
- **OpenResponsesParser**: SSE event parser handling `output_text.delta`, `function_call`, `function_call_done`, `completed`, `failed` events.
- **OpenResponsesLoop**: Turn-based loop (send → stream → execute tool → send result → continue). Mirrors T13 AgentLoop but for remote agent protocol.
- **toOpenResponses**: T13 tool schema serializer (wraps in `type: "function"` envelope).
- **Settings Panel UI**: Full agent profile form with endpoint URL, agent ID, auth token, auto-approve toggle, max steps slider, and connection test button.
- **ChatApp wiring**: Auto-detects `provider === "agent"`, routes to `OpenResponsesLoop` with `contentParts` tracking.

**Build status:** ✅ tsc + esbuild pass cleanly
**Blocker:** T14a (Tailscale) — needs all 3 devices on same mesh network before testing

### Task T14a — Tailscale Network Setup (Human Task)
**Goal:** Install Tailscale on MacBook (Sage), VPS (Cloudy), Android (Ember). Join same tailnet. Verify virtual IPs are stable and SSE streaming works over virtual network.
**Verification:** `curl -N http://ember:18789/v1/responses -H 'x-openclaw-agent-id: main' -d '{"model":"openclaw","stream":true,"input":"hi"}'`
**Security:** Keep OpenResponses endpoint on private network only. Do NOT expose to public internet.

## Current Decisions
- Agent provider stores endpoint in `profile.endpointUrl` (separate from `customURL` used by other providers).
- Auth token reuses `profile.apiKey` field (consistent with other providers, no new field needed).
- Session key will be auto-generated on first agent connection and persisted in `profile.sessionKey`.
- `previous_response_id` included in follow-up requests for future OpenClaw compatibility (currently ignored).
- Dynamic import of `AgentApiManager` in settings panel avoids circular dependency issues.
- Agent provider forces `useTools = true` — remote agents always have tool access when connected.

## Next Steps (Post-T14a)
1. Test connection to local OpenClaw gateway
2. Test against Cloudy VPS via Tailscale
3. Test against Ember phone via Tailscale
4. Debug any streaming/tool execution issues
5. Add session key auto-generation
6. Update T14 task status to COMPLETE
