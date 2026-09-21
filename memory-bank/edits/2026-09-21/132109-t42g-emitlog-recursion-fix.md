#### 13:21:09 IST - T42g: emitLog self-recursion fix (stack overflow on every sync path)

**Action:** Modified
**Files:**
- Modified: src/lifecycle/sync.ts (two `emitLog` helper definitions, ~L197 rebuild path and ~L409 triggerSync path)

Commit `5749148` (main, 2026-09-21 13:21 IST, morning session). Symptom in
Deepak's debug log: upload/download/conflict ALL failing with
`Maximum call stack size exceeded` (per-session catches in SyncEngine
:352/:390/:432). Root cause: both helpers read
`const emitLog = (entry) => { plugin.syncHub?.publishLog(entry); emitLog(entry); }`
— unconditional synchronous self-call introduced by the T42g hub-wiring
commit `e604eed`. Both sites now call `options?.onLog?.(entry)` (the
interface's real callback). Why the unit suites missed it: the bug lives in
lifecycle wiring, not hub/engine internals, and `emit()` swallows listener
errors. Build green; pushed.
