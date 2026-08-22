# Progress UI Design (Obsidian-AI)

*Created: 2026-08-19*
*Related Tasks: T42f, T58, T58d, T42*
*Status: Historical T42f sidebar design; current integrated-panel follow-up is specified in `integrated-sync-ui-design.md` and T58d.*

## Problem

Sync progress is only visible in a blocking modal. Users can't see sync status at a glance.

## Solution

Add a persistent sync status indicator that shows:
- Last sync time
- Current sync state (idle/syncing/error)
- Quick access to sync log

## Design Options

### Option A: Header Badge (Recommended)
Add a small badge to the chat view header:

```
┌─────────────────────────────────┐
│ Chat Lab AI          [🔄 2m ago] │
├─────────────────────────────────┤
│                                 │
│   ... chat content ...          │
│                                 │
└─────────────────────────────────┘
```

States:
- `🔄 2m ago` — synced 2 minutes ago
- `⏳ Syncing...` — active sync
- `⚠️ Error` — last sync failed
- `—` — never synced

Click opens sync log modal.

### Option B: Settings Status Line
Add a status line to the Remote Storage settings section:

```
Last sync: 2 minutes ago
Sessions: 50 local, 50 remote
Status: ✅ Up to date
[Sync Now] [Dry Run]
```

### Option C: Full Sidebar (Future)
Dedicated sidebar view like SyncIt:
- Session list with sync status icons
- Progress bar during active sync
- Per-session last-modified timestamps

## Implementation

```typescript
// SyncStatusStore ( reactive )
interface SyncStatus {
    state: 'idle' | 'syncing' | 'error';
    lastSyncTime: number | null;
    lastResult: SyncResult | null;
}

// Component
function SyncStatusBadge({ status }: { status: SyncStatus }) {
    if (status.state === 'syncing') return '⏳ Syncing...';
    if (status.state === 'error') return '⚠️ Error';
    if (!status.lastSyncTime) return '—';
    return `🔄 ${formatTimeAgo(status.lastSyncTime)}`;
}
```

## Related

- SyncIt: `src/ui/SyncSidebarView.ts`
- `src/components/SyncStatusIndicator.tsx`
