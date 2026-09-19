#### 01:52:00 IST - T42g: Sync Visibility & Observability task created (design phase)

**Context:** Deepak directed (2026-09-19 late IST): sync runs with zero user feedback ("What is being downloaded, uploaded, overwritten. Transfer rates, stats, logs. Nothing."). Audit of `triggerSync`/`ChatSyncPanel`/sync engine found 7 gaps (toast-only non-panel paths, silent auto-sync failures, no bytes/rates in snapshot, opaque conflicts, no log viewer, silent startup init, dead SyncProgressModal). Reference: `code/obsidian-syncit` observability UI (156a125, 2026-09-01). Design-first workflow directed by Deepak: Luna generates HTML mockups → Cloudy screenshot review + refinement → Deepak sign-off → implement.

**Action:** Created `memory-bank/tasks/T42g.md`; registry row in tasks.md (next free letter — T42e = dry-run taken, T42f = superseded).

**Files:**
- Created: memory-bank/tasks/T42g.md
- Modified: memory-bank/tasks.md (T42g row)
