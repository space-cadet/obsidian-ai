# Telemetry Implementation — ARCHIVED

*Created: 2026-08-19*
*Archived: 2026-08-21*
*Reason: Obsidian developer policies prohibit client-side telemetry for official plugins*

## Archive Notice

This implementation was completed and functional, but **has been removed from the plugin** after discovering that Obsidian's developer policies explicitly prohibit client-side telemetry collection for plugins distributed through the official Community Plugins directory.

### The Policy
- Obsidian's developer policies **prohibit capturing client-side telemetry data**
- A precedent exists: the "Kindle Highlights" plugin was **delisted** for sending telemetry to Sentry
- Even opt-in, anonymized telemetry violates this policy
- Source: [Obsidian Developer Policies](https://docs.obsidian.md/Developer+policies), Reddit discussion, Obsidian forum

### What Was Implemented
- Opt-in telemetry (disabled by default)
- Anonymous usage statistics collection
- First-run dialog with full disclosure
- Event batching and silent-fail sending
- Settings UI for toggling and data breakdown

### What Data Was Collected (When Enabled)
- AI provider type (e.g., DeepSeek, OpenAI)
- Feature usage counts (e.g., group chat, tool calling)
- Conversation length in turns (bucketed ranges)
- Error types (e.g., rate_limit, not error messages)
- Plugin version

### What Was Never Collected
- Message content, prompts, or responses
- API keys or credentials
- File names, paths, or vault structure
- Personal identity or IP address
- Obsidian installation ID

## Code Archive

The following files were part of the telemetry implementation and have been removed from the codebase:

### `src/lib/telemetry.ts`
Core telemetry module with `TelemetryManager` class, event queue, batching, and silent-fail sending.

```typescript
// Key exports:
// - TelemetryManager (singleton)
// - telemetry (singleton instance)
// - getOrCreateTelemetryId()
// - bucketTokens(count: number): string
// - showTelemetryOptInDialog(plugin): Promise<boolean>
// - TelemetryEvent interface
```

### `src/settings-sections/telemetry.ts`
Settings UI component for telemetry toggle and data disclosure.

### Integration Points (Removed)
- `src/main.ts`: First-run dialog, telemetry init, flush on unload
- `src/settings.ts`: `telemetryEnabled`, `telemetryId`, `telemetryAsked` fields
- `src/components/ChatApp.tsx`: `chat_started` event logging
- `src/agent/AgentLoop.ts`: `tool_used` event logging

## Endpoints

```
POST https://quantumofgravity.com/telemetry
Content-Type: application/json

{
  "id": "uuid-from-localStorage",
  "version": "1.3.5",
  "events": [
    { "event": "chat_started", "provider": "deepseek", "feature": "group_chat" },
    { "event": "tool_used", "feature": "read_pdf", "value": 1 }
  ]
}
```

## Future Options

If telemetry is needed in the future, consider:
1. **Local-only diagnostics** — Write to a local file users can optionally share
2. **GitHub releases only** — Distribute outside the official directory (fewer users)
3. **Obsidian's official analytics** — If/when they provide a compliant solution

## Related
- Task: [T51](../tasks/T51.md)
- Original commit: `05c53c8`
