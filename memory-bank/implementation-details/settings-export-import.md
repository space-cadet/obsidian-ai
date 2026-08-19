# Settings Export/Import Implementation

*Created: 2026-08-19*
*Last Updated: 2026-08-19*

## Overview

Vault-native settings backup/restore that works on both desktop and mobile.

## Architecture

### Export
- Uses `vault.adapter.write()` to save JSON to vault root
- Filename: `chat-lab-settings-YYYY-MM-DDTHH-MM-SS.json`
- Two modes:
  - **Standard:** API keys replaced with `***`
  - **With secrets:** Full data, warning button (for personal backups only)

### Import
- Uses `FuzzySuggestModal` to pick from vault JSON files
- Validates `schemaVersion` field
- Merges profiles by ID (updates existing, adds new)
- Shows summary: "X new profiles, Y updated"

## Redaction

Sensitive keys replaced with `***`:
- `apiKey`, `authToken`, `passphrase`, `password`
- `secretAccessKey`, `accessKeyId`
- `tavilyApiKey`, `exaApiKey`, `braveApiKey`

## Schema

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-08-19T10:30:15.123Z",
  "version": "1.3.5",
  "settings": { /* full ObsidianAISettings */ }
}
```

## Files
- `src/settings-sections/exportImport.ts`
- `src/settings.ts` (schema version)
