# Server Signature Design (Obsidian-AI)

*Created: 2026-08-19*
*Related Tasks: T42d, T42*

## Problem

If a user changes WebDAV servers (new URL, new account), the local cache may be stale. Obsidian-ai doesn't detect this and may skip sessions that should be re-synced.

## Solution

Hash the server config into a `serverSignature`. Store it with the cache. On sync, compare signatures — if different, clear cache and rebuild.

## Implementation

```typescript
function makeServerSignature(config: WebDAVConfig): string {
    const raw = [
        config.url.trim().replace(/\/$/, ''),
        config.username.trim(),
        (config.prefix || '').trim().replace(/\/$/, '')
    ].join('|');
    
    // Simple string hash (djb2)
    let hash = 5381;
    for (let i = 0; i < raw.length; i++) {
        hash = ((hash << 5) + hash) + raw.charCodeAt(i);
    }
    return hash.toString(16);
}
```

## Cache Integration

```typescript
class LocalCache {
    private async checkSignature(): Promise<boolean> {
        const stored = await this.getMetadata('serverSignature');
        const current = makeServerSignature(this.config);
        
        if (stored !== current) {
            await this.clear();
            await this.setMetadata('serverSignature', current);
            return false; // Cache was cleared
        }
        
        return true; // Cache valid
    }
}
```

## Invalidation Triggers

- WebDAV URL changed
- Username changed
- Prefix/path changed
- Manual "Clear Cache" button

## Related

- SyncIt: `src/sync/SyncIndex.ts` — `makeServerSignature()`
- `src/sync/LocalCache.ts`
