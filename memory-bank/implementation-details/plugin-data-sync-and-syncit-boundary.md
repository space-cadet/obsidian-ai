# Plugin Data Sync and SyncIt Boundary

*Created: 2026-08-22*
*Related Tasks: T42, T57, T57a, T57b, T57c, T57d*

## Purpose

Define how Chat Lab syncs its own data across devices and how it may later cooperate with SyncIt.

The goal is seamless two-way use on different devices without two sync engines fighting over the same files.

## Ownership

SyncIt owns whole-vault sync. Chat Lab owns the meaning and safety rules for its own data.

| Area | Owner |
|---|---|
| Ordinary vault files | SyncIt |
| Chat sessions | Chat Lab |
| Chat Lab settings | Chat Lab |
| Chat Lab memory and persona | Chat Lab |
| Chat Lab conflict rules | Chat Lab, with a future SyncIt transport option |
| Whole-vault deletion and trash | SyncIt |
| Chat Lab plugin-data deletion | Chat Lab, using shared deletion records |

Chat Lab must not add whole-vault sync. SyncIt must continue excluding `.obsidian/` from its normal vault scan. A future explicit plugin-data registration may allow SyncIt to carry selected Chat Lab data without scanning all plugin files.

## Current State

Chat Lab currently has its own WebDAV sync engine. Chat sessions use a stronger encrypted session path. Settings, memory, persona, audit, usage, and sync metadata use a separate path and are the focus of T57a–T57c.

SyncIt's current integration API is for AI tools and provider capabilities. It is not a data-sync API. T57d defines the future sibling contract.

## Data Rules

| Data | Default | Direction | Rule |
|---|---:|---|---|
| Chat sessions | On | Two-way | Sync with session-aware conflict handling. |
| Plugin settings | On | Two-way | Never silently replace meaningful local settings. |
| AI memory | On | Two-way | Back up before replacement; show conflicts. |
| Persona | On | Two-way | Back up before replacement; show conflicts. |
| Memory audit log | Off | Two-way when enabled | Treat as history; do not silently discard local entries. |
| Usage data | Off | Upload-only | Compute locally; do not treat remote data as a local source. |
| API keys and passwords | Off | Never by default | Keep credentials on the device. |

## Safe Two-Way Rules

For every selected item, keep the last state seen by both sides:

- Only local changed: upload.
- Only remote changed: download.
- Both changed: stop and ask the user.
- Neither changed: skip.
- One side is missing: do not assume deletion.
- A deletion is propagated only when it is recorded against a known shared previous state.

Conflict choices are:

- Use local
- Use remote
- Keep both
- Cancel

Before replacing local settings, memory, persona, or audit data, save a recovery copy.

## Common Transfer Rules

Every selected remote item should use the same transfer protections:

- Encrypt when encryption is enabled.
- Include a checksum and format version.
- Write to a temporary remote path.
- Replace the final path only after the temporary write succeeds.
- Record the remote version or ETag.
- Report success or failure for each data category.

## Sync Identity

The local cache and sync index must belong to the complete sync identity:

- Vault
- Backend
- Server
- Account
- Remote path
- Encryption identity

If any part changes, old state must not be reused without rebuilding it.

## Future `dataSyncProvider` Contract

The existing `integrationProvider` contract remains for AI tools. A future sync contract should be separate and versioned:

```typescript
interface DataSyncProviderV1 {
    id: string;
    displayName: string;
    apiVersion: 1;
    listScopes(): Promise<DataSyncScope[]>;
    exportScope(scopeId: string): Promise<SyncExport>;
    applyScope(scopeId: string, value: SyncImport): Promise<SyncApplyResult>;
    cancel(): void;
}
```

The exact names may change. The contract must describe safe scopes, local-only fields, format versions, conflicts, and lifecycle. It must not expose credentials or become an unapproved arbitrary file-write channel.

## Ownership During Integration

When SyncIt carries Chat Lab data:

- SyncIt owns the remote transport, retry, progress, and remote trash.
- Chat Lab owns serialization, component selection, credential rules, and applying a chosen value.
- Only one engine may write a given remote path.
- If SyncIt is unavailable, Chat Lab may use its own plugin-only sync if the user has enabled it.
- If both systems would write the same path, one must be disabled and the user must be told why.

## Acceptance Tests

The combined setup must test:

- SyncIt enabled with its default `.obsidian/` exclusion.
- SyncIt enabled with a user attempting to remove that exclusion.
- Chat Lab sync enabled alone.
- Both plugins installed and pointed at the same server.
- Two devices editing the same Chat Lab item.
- A deletion on one device after a known shared state.
- A missing file caused by a stale device or failed scan.
- Network failure during upload and download.
- One data category failing while another succeeds.
- Plugin disable, re-enable, and migration between transport owners.

## Explicit Non-Goals

- Whole-vault sync inside Chat Lab.
- Silent credential synchronization.
- Automatic deletion based only on absence.
- A second copy of SyncIt's whole-vault engine inside Chat Lab.
