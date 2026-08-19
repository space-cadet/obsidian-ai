# Settings Export/Import Schema Design
*Created: 2026-08-19 13:31:15 IST*
*Last Updated: 2026-08-19 13:31:15 IST*

## Overview

JSON schema for exporting and importing plugin settings. API keys are redacted
by default. Schema is versioned for forward/backward compatibility.

---

## Export Format

```typescript
interface ExportedSettings {
    /** Schema version for migration handling */
    schemaVersion: 1;

    /** When the export was created */
    exportedAt: string; // ISO 8601

    /** Plugin version at export time */
    version: string;

    /** The actual settings payload */
    settings: SanitizedObsidianAISettings;
}
```

---

## Redaction Rules

**Always redacted (replaced with `"REDACTED"`):**

| Field | Reason |
|---|---|
| `apiKey` | Provider API keys |
| `authToken` | Agent/auth tokens |
| `passphrase` | Encryption passphrases |
| `customURL` | Custom endpoints (may contain auth) |
| `sessionKey` | Session identifiers |

**Never redacted:**

| Field | Reason |
|---|---|
| `model` | Public model names |
| `provider` | Provider type |
| `maxContextTokens` | User preference |
| `enableAgentTools` | Feature toggle |
| `theme` | UI preference |

**Optional full export:**
- User can choose "Export with credentials" (dangerous)
- Requires explicit confirmation: "This will include your API keys. Only share with trusted systems."
- Adds `includeCredentials: true` to the export

---

## Schema Versioning

### Version 1 (Current)

Matches the post-T23 settings structure:

```typescript
interface SanitizedObsidianAISettings {
    // Provider profiles (API keys redacted)
    providerProfiles: Array<{
        id: string;
        name: string;
        provider: string;
        model: string;
        apiKey: "REDACTED";  // always redacted
        customURL?: string;   // always redacted
        // ... other fields
    }>;

    // Remote storage (passphrase redacted)
    remoteStorage?: {
        enabled: boolean;
        backend: "webdav" | "s3";
        webdav?: {
            url: string;
            username: string;
            password: "REDACTED"; // always redacted
        };
    };

    // Feature toggles (never redacted)
    enableAgentTools: boolean;
    autoApply: boolean;
    maxContextTokens: number;
    maxContextMessages: number;

    // Telemetry (never redacted)
    telemetryEnabled?: boolean;
}
```

### Future Versions

Migration path: when importing a v1 file into a v2 plugin:

```typescript
function migrateSettings(imported: any, fromVersion: number): ObsidianAISettings {
    let settings = { ...imported };

    if (fromVersion < 2) {
        // v2 renamed "autoApply" to "approvalPolicy"
        settings.approvalPolicy = settings.autoApply ? "yolo" : "ask";
        delete settings.autoApply;
    }

    if (fromVersion < 3) {
        // v3 added "compactionThreshold" with default
        settings.compactionThreshold = settings.compactionThreshold ?? 10;
    }

    return settings;
}
```

---

## Import Flow

```
1. User clicks "Import Settings"
2. File picker → select .json
3. Parse JSON
4. Validate schema:
   - Must have "schemaVersion" (number)
   - Must have "settings" (object)
   - Must have "version" (string)
5. Run migration if schemaVersion < currentVersion
6. Show diff preview:
   - What settings will change
   - What will be added/removed
   - Highlight redacted fields (warn: "You'll need to re-enter API keys")
7. User confirms → merge into current settings
8. User cancels → no changes
```

---

## UI Placement

Add to the bottom of the Settings tab:

```
[Export Settings...]  [Import Settings...]

Export options:
  ○ Sanitized (no API keys) — default
  ○ Full export (includes credentials) — requires confirmation
```

---

## File Naming Convention

```
obsidian-ai-settings-YYYYMMDD-HHMMSS.json
```

Example: `obsidian-ai-settings-20260819-133115.json`

---

## References

- Task: [T49 — Settings Export and Import](../tasks/T49.md)
- Related: T23 (Settings Decomposition — defines current settings structure)
