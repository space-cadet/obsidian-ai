# Dry Run Design (Obsidian-AI)

*Created: 2026-08-19*
*Related Tasks: T42e, T42*

## Problem

Users can't preview what a sync would do before triggering it. There's no "what if" mode.

## Solution

Add a `dryRun()` method to `SyncEngine` that computes the full sync plan without executing transfers.

## Implementation

```typescript
class SyncEngine {
    async dryRun(): Promise<DryRunResult> {
        // 1. Populate cache from local storage
        await this.populateCache(await this.getLocalSessions());
        
        // 2. Get remote listing
        const remoteSessions = await this.adapter.listSessions();
        
        // 3. Compute plan (same as normal sync)
        const plan = await this.computeSyncPlan();
        
        // 4. Return without executing
        return {
            uploads: plan.upload.length,
            downloads: plan.download.length,
            conflicts: plan.conflicts.length,
            skipped: plan.skipped,
            details: plan
        };
    }
}
```

## UI Integration

- **Settings panel**: "Dry Run" button next to "Sync Now"
- **Modal**: Show plan summary with per-session breakdown
- **Format**: `↑2 new, ↓1 updated, ⚡0 conflicts, ⊘48 unchanged`

## Example Output

```
Dry Run Results
━━━━━━━━━━━━━━━━━━━━
↑ Upload: 2 sessions
  • "Physics Notes" (updated 2 min ago)
  • "Meeting Summary" (new)

↓ Download: 1 session
  • "Mobile Chat" (updated on phone)

⊘ Unchanged: 48 sessions

⚡ Conflicts: 0
```

## Related

- SyncIt: `src/main.ts` — `performDryRun()`
- `src/sync/SyncEngine.ts`
