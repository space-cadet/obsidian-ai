#### 23:05:00 IST - T24a: Created subtask + post-merge memory-bank closeout

**Action:** Created
**Files:**
- Created: memory-bank/tasks/T24a.md
- Modified: memory-bank/tasks.md (T24a row; T24 completed row restored;
  T11 row refreshed to ✅)
- Modified: memory-bank/tasks/T71.md (merged + device-verified notes)
- Modified: memory-bank/tasks/T24.md (open item → T24a)
- Modified: memory-bank/activeContext.md, progress.md, session_cache.md
  (2026-09-19 perf PR merged entry)
- Modified: memory-bank/sessions/2026-09-19-chat-perf-index-only-startup.md
  (late-session addendum)
- Modified: memory-bank/edit_history.md (backfilled the 2026-09-19 section)

PR #8 merged to main (`c83e593`, 2026-09-19 22:52 IST) after Deepak's device
verification. T71 ✅ (chat scroll perf + streaming follow), T24 ✅ (index-only
startup + codex wave-2/3 hardening), T11 ✅ (event logging + startup phase
timings). Suite 517/517, CI green.

T24a tracks the known regression from index-only startup: global search only
covers hydrated sessions (Codex P2, deferred across review waves 1–3).
Options recorded: A hydrate-on-search (Cloudy's lean), B disk-backed search,
C visible scope note. Pending Deepak's decision; does not block v1.6.0.

Also logged the process lesson: PR work at high context on Kimi degraded
into a tool-call loop (17× reads, 38 min silence, same pattern as the
2026-08-23 degradation) — wrap such work in shorter sessions.
