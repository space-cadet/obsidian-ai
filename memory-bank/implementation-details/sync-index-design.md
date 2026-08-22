# Sync Index Design (Obsidian-AI)

*Created: 2026-08-19*
*Related Tasks: T42a, T58d, T42*

## Problem

Obsidian-ai's sync compares all local sessions against all remote sessions on every sync. For 50 sessions with 0 changes, this wastes time and bandwidth.

## Solution

Persisted sync index that tracks chat-session state from the last successful
sync. On subsequent syncs, skip sessions whose local checksum and remote ETag
match the index. Auxiliary plugin files use a separate identity-scoped
shared-state record and are not entries in this session index.

## Architecture

```
SyncEngine.computeSyncPlan()
├── loadIndex() → SessionSyncIndex | null
├── for each session:
│   ├── compute local checksum (SHA-256 of JSON)
│   ├── get remote ETag from listing
│   └── if index matches both → skip
│   └── else → compare normally
└── after successful sync → updateIndex()
```

## Index Schema

```typescript
interface SessionSyncIndex {
    version: 1;
    serverSignature: string;   // hash of url|username|prefix
    lastSyncTime: number;      // timestamp of last successful sync
    sessions: Record<string, {
        localChecksum: string;    // SHA-256 of session JSON
        localModifiedAt: number;  // session.updatedAt
        remoteETag?: string;      // from WebDAV PROPFIND
        remoteModifiedAt?: number;
    }>;
}
```

## Storage

- Primary: IndexedDB (via `LocalCache` infrastructure)
- Fallback: Obsidian localStorage
- Key: `obsidian-ai-sync-index-{serverSignature}`

## Invalidation

Index is invalidated (cleared) when:
- Server config changes (URL, username, prefix)
- User manually clears cache
- Index version mismatch

## Performance

| Scenario | Before | After |
|----------|--------|-------|
| 50 sessions, 0 changes | 50 comparisons + 50 PROPFINDs | 0 comparisons (index skip) |
| 50 sessions, 2 changes | 50 comparisons | 2 comparisons + 48 skips |

## Rebuild and Progress Boundary

Index rebuild must report planning and item progress using the same stable
operation identifiers as normal sync. It should reuse the computed local and
remote plan, use maps/sets for membership checks, and apply bounded concurrency
where transfers are independent. These follow-ups are tracked in T58d.

## Safety

- Index is a cache, not a source of truth
- If index missing/corrupted → full comparison (graceful degradation)
- If remote ETag mismatch → full comparison for that session
- Never skip based on index alone if local checksum differs

## Related

- SyncIt: `src/sync/SyncIndex.ts`
- `src/sync/LocalCache.ts`
