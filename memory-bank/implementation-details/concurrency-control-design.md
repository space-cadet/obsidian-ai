# Concurrency Control Design (Obsidian-AI)

*Created: 2026-08-19*
*Related Tasks: T42c, T58d, T42*

## Problem

Obsidian-ai syncs sessions sequentially. With 20+ sessions, this is slow on high-latency connections.

## Solution

Process up to N sessions in parallel using `runWithConcurrency()`.

## Implementation

```typescript
async function runWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T) => Promise<R>
): Promise<R[]> {
    const results = new Array<R>(items.length);
    const executing: Promise<void>[] = [];
    
    for (let i = 0; i < items.length; i++) {
        const p = (async (index: number) => {
            results[index] = await fn(items[index]);
        })(i);
        
        executing.push(p);
        
        if (executing.length >= concurrency) {
            await Promise.race(executing);
        }
    }
    
    await Promise.all(executing);
    return results;
}
```

## Integration

```typescript
// In SyncEngine
async uploadSessions(sessions: CachedSession[]): Promise<void> {
    const limit = this.config.concurrencyLimit || 3;
    
    await runWithConcurrency(
        sessions,
        limit,
        async (session) => {
            if (this.cancelled) return;
            await this.uploadSingle(session);
        }
    );
}
```

Index rebuild must use the same bounded transfer helper for independent
remote-trust downloads and local-trust uploads. It should not re-list or
recompute local and remote collections unnecessarily; the plan used for the
rebuild should be passed through to the index-save step.

## Settings

- `concurrencyLimit: number` — default 3, range 1–10
- Exposed in Remote Storage settings UI

## Safety

- Cancel flag checked between sessions (not mid-upload)
- Cache updates serialized (don't parallel-write IndexedDB)
- Error in one session doesn't abort others (collect errors)

## Performance

| Sessions | Sequential (1x) | Parallel (3x) | Parallel (5x) |
|----------|-----------------|---------------|---------------|
| 10 | 10s | 4s | 3s |
| 50 | 50s | 18s | 12s |

*(Assuming 1s per session upload)*

## Related

- SyncIt: `src/sync/SyncPlan.ts` — `runWithConcurrency()`
- `src/sync/SyncEngine.ts`
