# Telemetry and Privacy Design
*Created: 2026-08-19 13:31:15 IST*
*Last Updated: 2026-08-19 13:31:15 IST*

## Overview

Opt-in, anonymized telemetry system for the obsidian-ai plugin. Collects usage
statistics to help prioritize features and identify issues — without collecting
any personal data, message content, or credentials.

**Core principle:** The user must explicitly opt in. No data is collected without
consent. No dark patterns.

---

## Data Collection Boundary

### What IS Collected (Anonymized)

| Data | Why | Example |
|---|---|---|
| `provider` | Know which APIs to optimize | `"deepseek"`, `"openai"` |
| `feature` | Know what users actually use | `"group_chat"`, `"agent_tools"` |
| `event` | Track feature adoption | `"chat_started"`, `"tool_used"` |
| `value` | Numeric metric (ranges, not exact) | `5` (turns), `1000` (token bucket) |
| `errorType` | Identify integration issues | `"rate_limit"`, `"timeout"` |
| `version` | Correlate with releases | `"1.4.2"` |

### What is NOT Collected (Strictly Forbidden)

| Data | Why Not |
|---|---|
| Message content | Privacy — conversations are private |
| Prompts / responses | Privacy — intellectual property |
| API keys / tokens | Security — credential leak risk |
| File names / paths | Privacy — vault structure is sensitive |
| Vault metadata | Privacy — note count, sizes, etc. |
| User identity | Privacy — no names, emails, accounts |
| IP address | Privacy — location tracking |
| Obsidian installation ID | Privacy — cross-session tracking |

---

## Anonymization

### Installation ID

```typescript
function getAnonymizedId(): string {
    // Random UUID, generated once per installation
    // NOT derived from any user data
    // NOT linked to any account
    let id = localStorage.getItem("obsidian-ai-telemetry-id");
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem("obsidian-ai-telemetry-id", id);
    }
    return id;
}
```

### Token Bucketing

Instead of exact token counts, use buckets:

```typescript
function bucketTokens(count: number): string {
    if (count < 1000) return "<1K";
    if (count < 10000) return "1K-10K";
    if (count < 100000) return "10K-100K";
    if (count < 1000000) return "100K-1M";
    return ">1M";
}
```

This prevents identifying users by exact usage patterns.

---

## Event Types

```typescript
type TelemetryEvent =
    | { event: "plugin_enabled"; provider: string }
    | { event: "chat_started"; provider: string; feature?: string }
    | { event: "chat_completed"; provider: string; turns: number; tokens: string }
    | { event: "tool_used"; toolName: string; success: boolean }
    | { event: "error"; errorType: string; provider?: string }
    | { event: "settings_changed"; setting: string; value: string }
    | { event: "compaction_triggered"; turnsBefore: number; turnsAfter: number }
    | { event: "telemetry_toggled"; enabled: boolean };
```

---

## Backend Options

### Option 1: Self-Hosted (Recommended)

Run a simple endpoint on the user's existing VPS:

```python
# Flask endpoint
@app.route("/telemetry", methods=["POST"])
def telemetry():
    data = request.json
    # Validate
    # Store in SQLite
    return {"ok": True}
```

Pros: Full control, no third-party trust needed
Cons: User must maintain it

### Option 2: Third-Party Service

- **PostHog**: Open-source, self-hostable, privacy-focused
- **Plausible**: Lightweight, GDPR-compliant, no cookies
- **Segment**: Enterprise-grade, but proprietary

Pros: Managed, dashboards, analytics
Cons: Third-party dependency, potential cost

### Option 3: Simple Cloud Function

Cloudflare Workers / Vercel Edge function:
- Accept POST
- Validate payload
- Write to D1/PostgreSQL

Pros: Cheap, managed, global
Cons: Vendor lock-in

---

## Opt-In Flow

### First-Run Dialog

```
┌─────────────────────────────────────────────────────────┐
│  Help Improve Obsidian AI?                              │
│                                                         │
│  You can optionally share anonymous usage statistics    │
│  to help us prioritize features and fix issues.         │
│                                                         │
│  We collect:                                            │
│  • Which AI providers you use                           │
│  • Which features you find helpful                      │
│  • How long conversations typically are                 │
│  • Error types (not error messages)                     │
│                                                         │
│  We NEVER collect:                                      │
│  • Your messages or notes                               │
│  • Your API keys                                        │
│  • Your file names or vault structure                   │
│                                                         │
│  [Privacy Policy]                                       │
│                                                         │
│  [  Enable Telemetry  ]    [  Not Now  ]                │
└─────────────────────────────────────────────────────────┘
```

### Settings Toggle

```
Share anonymous usage statistics
☐ Enabled

Help us improve by sharing which features you use.
No personal data is collected. [Privacy Policy]
```

### Data Deletion

Users can request deletion of their anonymized data:

```
Telemetry ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890

[Delete My Data]

This will remove all telemetry records associated with
this installation ID. This action cannot be undone.
```

---

## Privacy Policy (Minimal)

```markdown
# Obsidian AI — Telemetry Privacy Policy

## What We Collect
Anonymous usage statistics including:
- AI provider type (e.g., "deepseek", "openai")
- Feature usage (e.g., "group_chat", "tool_calling")
- Conversation length in turns (bucketed ranges)
- Error types (e.g., "rate_limit", not error messages)

## What We Don't Collect
- Message content, prompts, or responses
- API keys, tokens, or credentials
- File names, paths, or vault structure
- Personal identity or IP addresses

## How We Use It
- Prioritize feature development
- Identify provider integration issues
- Understand usage patterns

## Data Retention
- Telemetry events are retained for 90 days
- Aggregated statistics are retained indefinitely
- You can delete your data at any time via settings

## Contact
For privacy questions, contact: [email]
```

---

## Implementation Notes

### Batching

Don't send events immediately — batch and send every 60 seconds or on plugin unload:

```typescript
const queue: TelemetryEvent[] = [];

function logEvent(event: TelemetryEvent) {
    if (!settings.telemetryEnabled) return;
    queue.push(event);
    if (queue.length >= 10) flushQueue();
}

function flushQueue() {
    if (queue.length === 0) return;
    fetch(TELEMETRY_ENDPOINT, {
        method: "POST",
        body: JSON.stringify({ id: getAnonymizedId(), events: queue }),
    }).catch(() => {}); // silent fail
    queue.length = 0;
}
```

### Silent Fail

Telemetry must never break the plugin:
- Network errors → drop events, no retry
- Validation errors → drop events, log to console only
- Backend down → queue drops, no user notification

---

## References

- Task: [T51 — Opt-in Telemetry and Usage Data Collection](../tasks/T51.md)
- Related: T38 (Tool Approval / Audit Log — has JSONL logging patterns)
