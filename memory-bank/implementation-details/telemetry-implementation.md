# Telemetry Implementation

*Created: 2026-08-19*
*Last Updated: 2026-08-19*

## Overview

Opt-in anonymized usage collection. Strictly disabled by default.

## Architecture

### Module: `src/lib/telemetry.ts`
- Singleton `TelemetryManager` class
- Event queue with 60-second flush interval
- Silent-fail on network errors (never nags user)
- Flush on plugin unload

### Events
```typescript
interface TelemetryEvent {
  timestamp?: number;
  event: string;       // "chat_started", "tool_used"
  provider?: string;   // "deepseek", "openai", etc.
  feature?: string;    // "group_chat", "read_pdf", etc.
  value?: number;      // 0/1 for success/failure
}
```

### First-Run Flow
1. Plugin loads → check `telemetryAsked`
2. If false → show modal after 2s delay (Obsidian UI ready)
3. User chooses Enable/Not Now
4. Sets `telemetryEnabled` + `telemetryAsked` + saves settings
5. `telemetry.setEnabled()` starts/stops flush timer

### Settings
- `telemetryEnabled: boolean` (default false)
- `telemetryId: string` (random UUID, localStorage)
- `telemetryAsked: boolean` (prevents repeated prompts)

## Data Collection

### Collected (anonymized)
- AI provider type
- Feature usage counts
- Conversation length (bucketed: <1K, 1K-10K, 10K-100K, etc.)
- Error types (rate_limit, timeout, etc.)
- Plugin version

### Never Collected
- Message content, prompts, responses
- API keys, credentials
- File names, paths, vault structure
- Identity, IP address

## Endpoint

```
POST https://quantumofgravity.com/telemetry
Content-Type: application/json

{
  "id": "uuid-from-localStorage",
  "version": "1.3.5",
  "events": [...]
}
```

## Files
- `src/lib/telemetry.ts` — core module
- `src/settings-sections/telemetry.ts` — settings UI
- `src/main.ts` — first-run dialog, lifecycle
- `src/components/ChatApp.tsx` — `chat_started` event
- `src/agent/AgentLoop.ts` — `tool_used` event
