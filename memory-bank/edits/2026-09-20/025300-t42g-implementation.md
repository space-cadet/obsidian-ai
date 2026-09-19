#### 02:53:00 IST - T42g: Sync visibility implementation (mockups approved by Deepak)

**Task:** T42g (Sync Visibility & Observability)

**Actions:**
- Created: `src/sync/SyncStatusHub.ts` (app-wide sync status bus), `src/sync/SyncStatusBar.ts` (status-bar indicator), `src/sync/SyncEngine.planBytes.test.ts`, `src/sync/SyncStatusHub.test.ts`, `src/sync/SyncLogger.test.ts`, `src/components/__tests__/ChatSyncPanel.test.tsx`, `SyncLogModal` in SyncLogger.ts
- Modified: `src/sync/SyncProgress.ts` (byte fields + SyncOperationFailure), `src/sync/StorageAdapter.ts` (plan bytes + estimateSessionBytes), `src/sync/SyncEngine.ts` (planBytes/bytes events), `src/lifecycle/sync.ts` (hub publish on all paths), `src/lifecycle/persistence.ts` (auto trigger label), `src/main.ts` (hub field + status bar mount), `src/views/ObsidianAIChatView.ts` (ChatPluginLike + syncHub + triggerSync), `src/components/ChatSyncPanel.tsx` (full rebuild ~430 lines, hub-driven), `src/ui/registration.ts` (Chat Sync: Sync Now command w/ modal), `styles.css` (+~510 lines sync-*)
- Deleted: old v2 panel internals (useSyncController etc.) — replaced by hub subscription

**Decisions:**
- Per-conflict decision chips DEFERRED (needs reconciliation-decision store in engine — recorded in T42g.md)
- SyncProgressModal kept and wired (command palette) instead of deleted
- rates derived (bytes÷elapsed), no adapter streaming work

**Commits:** 0720540 (bytes), e604eed (hub+statusbar), bfd525b (panel+logger+css)
**Verification:** vitest 537/537, tsc --noEmit clean
