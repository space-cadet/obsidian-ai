# Dry Run Design (Obsidian-AI)

*Created: 2026-08-19*
*Related Tasks: T42e, T58d, T42*

## Problem

Users can't preview what a sync would do before triggering it. There's no "what if" mode.

## Solution

Add a plan-only flow that computes the full chat-session and selected
plugin-data plan without executing transfers or mutating either state model.
Plugin data is represented by its separate identity-scoped shared state; it is
not added to the chat-session SyncIndex.

## Implementation

```typescript
class SyncEngine {
    async dryRun(): Promise<DryRunResult> {
        // 1. Populate cache from local storage
        await this.populateCache(await this.getLocalSessions());
        
        // 2. Get remote listing
        const remoteSessions = await this.adapter.listSessions();
        
        // 3. Read plugin-file state and compute its selected-component plan
        // 4. Compute plan (same as normal sync)
        const plan = await this.computeSyncPlan();
        
        // 5. Return without executing or saving state
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
- **Panel**: Show planning stages, a combined chat/plugin summary, and per-item breakdown
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

## Progress Requirements

- Show cache population, remote listing, state loading, and plan computation.
- Switch from indeterminate planning to `completed / total` when the plan is known.
- Keep the final plan and 100% progress visible after completion.
- Report conflicts as attention-required/partial rather than complete.

## Related

- SyncIt: `src/main.ts` — `performDryRun()`
- `src/sync/SyncEngine.ts`
