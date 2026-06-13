{
  "sessionStart": "2026-06-13 05:02 IST",
  "sessionEnd": "2026-06-13 06:25 IST",
  "lastUpdate": "2026-06-13 06:25 IST",
  "contextTokenEstimate": "N/A",
  "activeTasks": [
    {
      "id": "T11",
      "title": "Debug Logging — log size limit, startup crash fix, CI/CD archive fix",
      "status": "in_progress",
      "nextAction": "User to verify no crash on startup after deleting old debug.log",
      "blocker": null
    },
    {
      "id": "T3",
      "title": "Context & Mentions — @-mention path display",
      "status": "completed",
      "nextAction": "User confirmed working on mobile",
      "blocker": null
    }
  ],
  "recentDecisions": [
    "contextPickerPathDisplay setting: always/never/duplicates (default duplicates) — applies to both Attach File modal and @-mention dropdown",
    "Parent folder path shown inline in muted style (CSS .chat-mention-folder / .chat-picker-item-folder)",
    "Search in both UIs matches full path as well as basename",
    "debugLogMaxSizeMB setting added (default 5MB, range 1–50) — enforces size limit even with adapter.append",
    "truncateIfNeeded deferred to setTimeout(5000) on startup and fire-and-forget in flush() to prevent UI blocking",
    "2-second timeout guard in truncateIfNeeded: if reading huge file hangs, abort and clear file",
    "CI/CD pre-release workflow: force-update latest-dev tag before release so GitHub source archives regenerate"
  ],
  "filesInFlight": [],
  "memoryToUpdate": [
    "memory/2026-06-13.md updated with session log",
    "activeContext.md updated with T11 and T3 changes",
    "tasks/T11.md updated with completion criteria",
    "session_cache.md updated with end time"
  ],
  "noteToNextSession": "T11 partially complete. Log size limit and startup crash fixed. User needs to verify by deleting old debug.log and installing new main.js. CI/CD archive fix pushed — verify on next push. T3 @-mention path display confirmed working. Open: dot folder .memory access investigation, T22 Phase 4, T17 Phase 1."
}
