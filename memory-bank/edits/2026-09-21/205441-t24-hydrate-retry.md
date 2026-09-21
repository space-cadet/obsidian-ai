#### 20:54:41 IST - T24: failed hydrate read no longer marks session hydrated (synced sessions opened empty)

**Action:** Modified
**Files:**
- Modified: src/storage/ChatStorage.ts (`_hydrateSessionImpl`: read throw OR 0-messages-when-index-expects-N → session stays unhydrated, retries next open, error logged; partial reads warn)
- Modified: src/hooks/useSessionActions.ts (silent `.catch(() => {})` → console.error + Notice "Failed to load session messages — will retry on next open")

Commit `20ae983` (main, 2026-09-21 20:54 IST, afternoon session). Index-only
startup (`99860e6`) follow-on found during T42g device testing on T42g: one
failed/empty first read permanently marked the session hydrated, so synced
sessions opened empty and never retried. Device-verified by Deepak
(16:19 UTC — "Good. It works."). ChatStorage suite 12/12; build green.
