# Integrated Sync UI Design

*Design doc for T43: Integrate Sync UI into Chat Lab*
*Created: 2026-08-20*

## Overview

This design merges the standalone sync sidebar into the Chat Lab sidebar as a tab, eliminating the need for a second plugin view. The sync experience becomes part of the chat flow rather than a separate interface.

## User Flow

```
[Chat Lab Sidebar]
    │
    ├── Toolbar: [+] [🕐] [📥▼] [...]
    │               ▲
    │               └─ Dropdown opens
    │                   ├─ 📤 Export chats
    │                   └─ 🔄 Open Sync Tab
    │
    ├── Tab Bar: [Session A] [Session B] [🔄 Sync] [+]
    │                                         ▲
    │                                         └─ Active
    │
    └── Content Area:
        ┌─────────────────────────────────────┐
        │ 🔄 Chat Sync                        │
        ├─────────────────────────────────────┤
        │ Direction: [Both directions ▼]      │
        │ [⏻ Dry Run]  [⚙ Settings]           │
        ├─────────────────────────────────────┤
        │ Status: Ready                       │
        │ Last sync: 2h ago                   │
        ├─────────────────────────────────────┤
        │ [=====>          ] 45%              │
        │ ↑3 ↓2 ⚡0 ⊘12                     │
        ├─────────────────────────────────────┤
        │ 📄 session-title-1    [Uploaded]    │
        │ 📄 session-title-2    [Uploaded]    │
        │ 🔄 session-title-3    [Downloaded]  │
        │ ...                                 │
        ├─────────────────────────────────────┤
        │ [🔄 Sync Now]  [Cancel]             │
        └─────────────────────────────────────┘
```

## Component Design

### ExportDropdown

Replaces the direct export button in ActionBar.

```typescript
interface ExportDropdownProps {
  onExport: () => void;      // Open export modal
  onOpenSync: () => void;    // Open sync tab
}
```

- Trigger: Icon button with `download` icon + chevron
- Menu items:
  - "📤 Export chats…" → calls `onExport()`
  - "🔄 Open Sync" → calls `onOpenSync()`
- Uses Obsidian's `Menu` API or custom dropdown

### ChatSyncPanel

Main sync UI rendered inside the chat content area when sync tab is active.

```typescript
interface ChatSyncPanelProps {
  plugin: ChatPluginLike;
}
```

**Sections:**

1. **Header**: "🔄 Chat Sync" title
2. **Controls Row**:
   - Direction selector: `[Both directions ▼]` (options: Both, Upload only, Download only)
   - Dry run toggle: checkbox "Dry run (no changes)"
   - Settings button: opens plugin settings
3. **Status Area**:
   - Status text: "Ready" / "Syncing…" / "Complete" / "Error"
   - Last sync time
   - Sync plan summary when computing: "↑3 ↓2 ⚡0 ⊘12"
4. **Progress Section** (visible during sync):
   - Progress bar with percentage
   - Stats: uploaded, downloaded, conflicts, skipped counters
   - Elapsed time
5. **Log Area** (scrollable, flex-grow):
   - List of `SyncLogEntry` components
   - Auto-scroll to bottom
   - Max 100 entries (remove oldest)
6. **Action Buttons**:
   - "🔄 Sync Now" (primary, disabled while syncing)
   - "Cancel" (visible during sync)

### SyncLogEntry

Individual log item with color-coded badge.

```typescript
interface SyncLogEntryProps {
  operation: "upload" | "download" | "conflict" | "skip" | "error";
  sessionTitle: string;
  sessionId: string;
  status: "pending" | "done" | "error";
  size?: number;  // bytes
  error?: string;
}
```

Visual:
```
┌────────────────────────────────────────────┐
│ 📄  Session Title              [Uploaded]  │
│     2.3 KB                                 │
└────────────────────────────────────────────┘
```

Badge colors:
- Upload: green background
- Download: blue background
- Conflict: orange background
- Skip: muted gray
- Error: red background

### SyncCompletionCards

Shown after sync completes.

```typescript
interface SyncCompletionCardsProps {
  result: SyncResult;
  durationMs: number;
  isDryRun: boolean;
}
```

Cards (only shown if count > 0):
- 📤 Uploaded: count + size
- 🔄 Downloaded: count + size
- ⚠️ Conflicts: count
- ⏭️ Skipped: count
- 🗑️ Deleted: count (if applicable)

## State Management

### Sync Tab State

Stored in `useChatSession` hook or new `useChatSync` hook:

```typescript
interface SyncTabState {
  isOpen: boolean;
  direction: "both" | "upload" | "download";
  dryRun: boolean;
  isSyncing: boolean;
  progress: SyncProgress | null;
  logEntries: SyncLogEntry[];
  result: SyncResult | null;
  error: string | null;
}
```

### Session Actions Extension

Add to `useSessionActions`:

```typescript
{
  openSyncTab: () => void;
  closeSyncTab: () => void;
  isSyncTabOpen: boolean;
}
```

When `openSyncTab()` is called:
1. Add `"__sync__"` to `openSessionIds` array
2. Set `activeSessionId = "__sync__"`

When `closeSyncTab()` is called:
1. Remove `"__sync__"` from `openSessionIds`
2. If `activeSessionId === "__sync__"`, switch to first available session tab

## Tab Bar Integration

### Special Tab ID

Use `"__sync__"` as the special sync tab ID (unlikely to conflict with UUID session IDs).

### ChatTabBar Changes

```typescript
// In ChatTabBar render
const openSessions = openSessionIds
  .map((id) => {
    if (id === "__sync__") {
      return { id: "__sync__", title: "🔄 Sync" } as ChatSession;
    }
    return sessions.find((session) => session.id === id);
  })
  .filter(Boolean);
```

- No close button for sync tab? Or allow closing like regular tabs
- No rename option (context menu skips rename for `"__sync__"`)
- Clicking sync tab sets `activeSessionId = "__sync__"`

### ChatMainArea Changes

```typescript
// In ChatApp render
{activeSessionId === "__sync__" ? (
  <ChatSyncPanel plugin={plugin} />
) : (
  <ChatMainArea ... />
)}
```

## SyncEngine Direction Control

### API Change

```typescript
// SyncEngine.sync() currently takes no args
async sync(direction?: "both" | "upload" | "download"): Promise<SyncResult>

// If direction is provided, filter the plan:
// - "upload": only execute uploads, skip downloads and conflicts
// - "download": only execute downloads, skip uploads and conflicts
// - "both" (default): execute everything
```

### computeSyncPlan() Change

```typescript
// After computing plan, optionally filter:
if (direction === "upload") {
  plan.download = [];
  plan.conflicts = [];
} else if (direction === "download") {
  plan.upload = [];
  plan.conflicts = [];
}
// Note: conflicts are skipped in one-direction modes
```

## Settings Changes

### RemoteStorageConfig Addition

```typescript
interface RemoteStorageConfig {
  // ... existing fields ...
  /** Default sync direction (T43) */
  syncDirection: "both" | "upload" | "download";
}
```

Default: `"both"`

### Settings UI

Add to Remote Storage settings section:
- "Sync Direction" dropdown
  - Both directions (default)
  - Upload only
  - Download only
- Description: "Default direction for manual sync. Can be overridden per-sync in the sync tab."

## Debug Logging

All sync operations log through the existing `FileLogger`:

```typescript
// In SyncEngine
private log(level: string, msg: string): void {
  this.logger?.log(level, msg);
  this.logHandler?.(level, msg);
}
```

The `logHandler` callback (set via `setLogHandler`) is used for live UI updates. The `logger` (FileLogger) writes to disk.

T43 does not add any new logging infrastructure — it uses what's already there.

## Progress Callback Flow

```
User clicks "Sync Now" in ChatSyncPanel
  → ChatSyncPanel calls plugin.triggerSync(direction, dryRun)
  → main.ts triggerSync():
    - Sets syncEngine.dryRun = dryRun
    - Calls syncEngine.sync(direction)
  → SyncEngine.sync():
    - Computes plan with direction filter
    - Calls progress callback for each operation
    - Calls logHandler for each log line
  → triggerSync() wires callbacks:
    - progress → ChatSyncPanel.updateProgress() (if sync tab open)
    - logHandler → ChatSyncPanel.addLog() (if sync tab open)
    - Also → debug logger
  → ChatSyncPanel updates React state → UI re-renders
```

## Migration Notes

- Existing `SyncSidebarView` users: The sidebar will disappear on next plugin load. Users need to open sync via the export dropdown.
- `SyncProgressModal` is kept as fallback: `triggerSync(dryRun, { useModal: true })` still works
- No data migration needed — sync engine and cache are unchanged

## Testing Checklist

- [ ] Export dropdown shows both options
- [ ] Clicking "Open Sync" opens sync tab
- [ ] Sync tab appears in tab bar with 🔄 icon
- [ ] Switching to sync tab shows sync panel
- [ ] Direction selector defaults to settings value
- [ ] Changing direction in panel doesn't affect settings
- [ ] Dry run toggle works
- [ ] Sync button triggers sync with selected direction
- [ ] Progress bar updates during sync
- [ ] Log entries appear with correct badges
- [ ] Completion cards shown after sync
- [ ] Cancel button stops sync
- [ ] Error state handled gracefully
- [ ] Closing sync tab removes it from tab bar
- [ ] Debug log contains sync operations
- [ ] Settings direction default persists
- [ ] No 2nd sidebar view registered
