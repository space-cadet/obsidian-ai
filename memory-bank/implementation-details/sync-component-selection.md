# Sync Component Selection — Implementation Details

*Related Tasks: T55, T43c, T49*
*Created: 2026-08-21*

## Current Status

The component choices are implemented. They control which data is copied, and
T57a now gives selected files one encrypted, checksummed, and atomic transfer
path. T57b now covers remembered conflicts, recovery, and deletions; T57c still
covers durable retries and complete sync identity handling. T57 also defines the
boundary with SyncIt whole-vault sync.

## Overview

This document describes the component-level sync selection system that allows users to control which categories of plugin data participate in remote sync and export/import operations.

## Data Component Registry

The system recognizes 7 distinct data components:

| # | Component | Settings Key | Storage Location | Sync Behavior | Default |
|---|-----------|--------------|-------------------|---------------|---------|
| 1 | Chat sessions | `chatSessions` | `sessions/` (JSONL) or `data.json` | Bidirectional | ✅ true |
| 2 | Plugin settings | `pluginSettings` | `plugin-data.json` | Bidirectional | ✅ true |
| 3 | API keys | `apiKeys` | Embedded in plugin-data.json | Bidirectional (opt-in) | ❌ false |
| 4 | AI Memory | `aiMemory` | `memory.json` | Bidirectional | ✅ true |
| 5 | Memory audit log | `memoryAuditLog` | `memory-audit.jsonl` | Bidirectional | ❌ false |
| 6 | AI Persona | `aiPersona` | `persona.md` | Bidirectional | ✅ true |
| 7 | Usage stats | `usageStats` | Computed on-demand | Upload-only | ❌ false |

## Settings Schema

```typescript
// src/settings.ts
export interface SyncComponentConfig {
    chatSessions: boolean;
    pluginSettings: boolean;
    apiKeys: boolean;
    aiMemory: boolean;
    memoryAuditLog: boolean;
    aiPersona: boolean;
    usageStats: boolean;
}

export interface ObsidianAISettings {
    // ... existing fields ...
    syncComponents: SyncComponentConfig;
}

export const DEFAULT_SETTINGS: ObsidianAISettings = {
    // ... existing defaults ...
    syncComponents: {
        chatSessions: true,
        pluginSettings: true,
        apiKeys: false,
        aiMemory: true,
        memoryAuditLog: false,
        aiPersona: true,
        usageStats: false,
    },
};
```

## UI Implementation

### File: `src/settings-sections/syncComponents.ts`

Renders a settings section with 7 checkboxes. Grouped visually:

```
┌─ Core ──────────────────────────────┐
│ ☑ Chat sessions                     │
│ ☑ Plugin settings                   │
│ ☐ API keys (includes credentials)   │
├─ Identity ──────────────────────────┤
│ ☑ AI Memory                         │
│ ☑ AI Persona                        │
├─ Advanced ──────────────────────────┤
│ ☐ Memory audit log (large, local)   │
│ ☐ Usage stats (upload-only)         │
└─────────────────────────────────────┘
```

### Navigation Order

In `SettingsTab.ts`, the section is placed between:
1. Multi-User Sync (currently named — see Planned Changes)
2. **Sync Components** ← new
3. Remote Storage

## Export/Import Filtering

### Export (`src/settings-sections/exportImport.ts`)

`serializeSettings(settings, components)` filters the settings object before serialization:

```typescript
function serializeSettings(
    settings: ObsidianAISettings,
    components: SyncComponentConfig
): ExportSchema {
    const result: any = { ...settings };
    
    // Conditionally include data
    if (!components.pluginSettings) {
        delete result.providerProfiles;
        delete result.prompts;
        delete result.preferences;
    }
    if (!components.apiKeys) {
        redactKeys(result);  // existing redaction
    }
    // ... etc for each component
    
    return result;
}
```

### Import

When importing, `mergeSettings()` only overwrites components that are enabled locally:

```typescript
if (!localSettings.syncComponents.aiMemory) {
    // Skip merging AI Memory even if present in import file
}
```

## Remote Sync Implementation

The examples below describe the data-selection rules, not a claim that every selected file is encrypted. Chat sessions use the encrypted session path. Auxiliary files currently use the separate text-file path.

### Plugin Data Serialization (`src/main.ts`)

```typescript
private _serializePluginData(): string {
    const components = this.settings.syncComponents;
    const data: any = {};
    
    if (components.pluginSettings) {
        data.settings = {
            providerProfiles: this._redactIfNeeded(
                this.settings.providerProfiles,
                components.apiKeys
            ),
            prompts: this.settings.prompts,
            preferences: this.settings.preferences,
        };
    }
    
    if (components.aiMemory) {
        data.memory = this.memoryStore?.export() ?? {};
    }
    
    if (components.aiPersona) {
        data.persona = this.personaContent;
    }
    
    // Usage stats: computed, not stored
    if (components.usageStats) {
        data.usageStats = this._computeUsageStats();
    }
    
    return JSON.stringify(data);
}
```

### Plugin Data Deserialization

```typescript
private _deserializePluginData(remoteJson: string): void {
    const remote = JSON.parse(remoteJson);
    const components = this.settings.syncComponents;
    
    if (components.pluginSettings && remote.settings) {
        // Merge settings, but NEVER overwrite credentials
        this.settings.providerProfiles = mergeProfiles(
            this.settings.providerProfiles,
            remote.settings.providerProfiles
        );
        // Prompts and preferences can be overwritten
        this.settings.prompts = remote.settings.prompts ?? this.settings.prompts;
    }
    
    if (components.aiMemory && remote.memory) {
        this.memoryStore?.import(remote.memory);
    }
    
    // ... etc
}
```

### Individual File Sync (`PluginFileSyncManager`)

For files that exist independently (not inside the plugin-data blob):

```typescript
private async syncPluginFile(
    filename: string,
    localContent: string | null,
    remotePath: string
): Promise<void> {
    // Upload if local content exists and component enabled
    // Download if remote exists and component enabled
    // Delete if component disabled but remote exists
}
```

Used for:
- `memory.json` → `obsidian-ai-sync/memory.json`
- `persona.md` → `obsidian-ai-sync/persona.md`
- `memory-audit.jsonl` → `obsidian-ai-sync/memory-audit.jsonl`

Current limits:

- Differing local and remote files are reported as conflicts without replacing
  either side; a full comparison screen and remembered choice are still open.
- Deletions are not recorded as tombstones, so absence does not mean deletion.
- Older raw remote files do not have the new envelope and are rejected safely
  during download-only sync.

### Usage Stats: Upload-Only

```typescript
private _computeUsageStats(): UsageStats {
    const sessions = this.chatData.sessions;
    return {
        totalSessions: sessions.length,
        totalMessages: sessions.reduce((n, s) => n + s.messages.length, 0),
        totalTokens: sessions.reduce((n, s) => n + (s.tokenCount ?? 0), 0),
        topModels: this._computeTopModels(sessions),
        period: { from: this._oldestSessionDate(), to: Date.now() },
    };
}
```

Computed fresh during upload. Skipped during download (server has no `usageStats` file to download).

## Security Considerations

### API Key Handling

Even with `apiKeys: true`:
1. Keys are included in the plaintext JSON
2. Chat-session payloads are encrypted via `EncryptionLayer` before transmission
3. The current plugin-data text-file path still needs to be moved through the same encryption layer
4. Keys are decrypted only on the target device after the encryption work is complete

### Credential Immutability

`apiKey`, `passphrase`, `password`, `secretAccessKey`, `accessKeyId` fields are NEVER overwritten during import or sync merge. Target device credentials always win.

## Performance Notes

- Audit logs (`memory-audit.jsonl`) can grow large; disabled by default
- Usage stats computation is O(n) over sessions; acceptable for typical usage
- Individual file sync adds 3 extra round-trips per sync (memory, persona, audit)

## Planned Refactoring

See task file T55 for planned architectural changes:
1. Rename "Multi-User Sync" → "Multi-User Chat Relay"
2. Unified data management layer (transparent to export/import and remote sync)
3. Global reorganization of sync/storage/export-import code
