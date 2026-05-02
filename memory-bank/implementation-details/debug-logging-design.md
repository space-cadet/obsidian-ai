# Debug Logging & Diagnostics Design
*Created: 2026-05-02 11:46:39 IST*
*Last Updated: 2026-05-02 11:46:39 IST*

## Overview

Obsidian AI currently logs errors directly to the developer console. Users need an in-app diagnostics surface that captures useful troubleshooting information without exposing secrets or vault contents.

## Goals

- Make provider setup failures visible
- Make model discovery failures explainable
- Capture request/stream lifecycle metadata
- Help users report bugs with copyable diagnostics
- Keep logs privacy-aware and bounded

## Event Shape

```typescript
type DebugLogLevel = "error" | "info" | "debug";

interface DebugLogEvent {
  id: string;
  timestamp: number;
  level: DebugLogLevel;
  source:
    | "settings"
    | "provider"
    | "models"
    | "chat"
    | "context"
    | "streaming"
    | "noteEditing";
  event: string;
  message: string;
  metadata?: Record<string, string | number | boolean | null>;
}
```

## Log Pipeline

```text
Feature code
  |
  v
debugLog.add(event)
  |
  +-- redact(metadata)
  |
  +-- append to ring buffer
  |
  +-- persist bounded log list
  |
  +-- optionally console.info/warn/error
```

## Diagnostic UI

```text
Settings: Diagnostics
+--------------------------------------------------+
| Debug logging                                    |
| Level: [Errors only                     v]       |
| Retain: [200] events                            |
|                                                  |
| Recent events                                    |
|--------------------------------------------------|
| 11:46:01 provider.init.success openai/gpt-4o     |
| 11:46:02 models.refresh.start  profile=work      |
| 11:46:03 models.refresh.error  status=401        |
| 11:46:12 chat.request.start    messages=3        |
| 11:46:13 chat.request.error    rate_limit        |
|--------------------------------------------------|
| [Copy logs] [Clear logs]                         |
+--------------------------------------------------+
```

## Service Structure

```text
src/debug/
  types.ts
  DebugLogService.ts
    add(event)
    list()
    clear()
    exportText()
    redactMetadata()
    prune()

main.ts
  debugLog: DebugLogService

api.ts
  provider init events
  chat request events
  stream events

models/
  model discovery events

context/
  context size/truncation events
```

## Redaction Rules

Never log:

- API keys
- Authorization headers
- Full prompts
- Full note contents
- Full provider responses when they may include prompt content

Safe metadata:

- Provider type
- Model ID
- Profile ID/name
- Status code
- Error name/message
- Token estimate
- Number of messages
- Number of attached context notes
- Content length counts

## Retention

```text
settings.debugLogRetention = 200

On add:
  events.push(newEvent)
  if events.length > retention:
    events = events.slice(-retention)
  saveData()
```

## Event Examples

```text
provider.init.success
  source=provider level=info metadata={provider:"openai", model:"gpt-4o-mini"}

models.refresh.error
  source=models level=error metadata={provider:"custom", status:401}

context.resolve.success
  source=context level=debug metadata={notes:2, estimatedTokens:1840, truncated:false}

streaming.abort
  source=streaming level=info metadata={elapsedMs:1204, chunks:18}
```

## Open Questions

- Whether diagnostics should be a settings section first or a dedicated view later
- Whether to include a "copy system info" block with plugin, Obsidian, and platform versions
