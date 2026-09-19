#### 22:37:00 IST - T71/T24: Modified — Codex wave-3 fixes (hydration guard preservation + scroll restore after lazy fill)

**Action:** Modified
**Files:**
- Modified: src/storage/ChatStorage.ts (`hydratedSessionIds` set; metadata reads skip re-flagging known-hydrated sessions)
- Modified: src/components/ChatMessages.tsx (`pendingHydrationRestoreRef`; restore effect re-applies once on `hasMessages` flip; follow effect skips hydration-fill growth)
- Modified: src/storage/__tests__/ChatStorage.test.ts (3 regression cases)
- Modified: src/components/__tests__/ChatMessages.followScroll.test.tsx (2 regression cases)
- Modified: 14 PR-wide source files (prettier sweep so CI's changed-files check passes)

Codex wave-3 review on `a0bbbd0` flagged two issues from the index-only
startup work (T24). **P1:** sync's metadata-only `loadChatData()` cleared and
rebuilt `unhydratedSessions` from the index, re-flagging already-hydrated
sessions — the next open would re-read the file and could revert newer
in-memory messages to disk state. Fix: `JsonlStorage.hydratedSessionIds`
tracks sessions hydrated via `hydrateSession()` or saved with real messages;
metadata reads only guard sessions not in that set (never-opened and new
remote sessions stay protected). **P2:** switching to an index-only session
ran the scroll-restore effect against an empty DOM (browser clamps to 0) and
the hydration fill then follow-scrolled to the bottom. Fix: restore effect
defers via `pendingHydrationRestoreRef` when `!hasMessages && top > 0` and
re-applies on the one-shot `hasMessages` flip; follow effect early-returns on
that fill growth.

Commits: `4ffc923` (fixes), `5632d86` (prettier, first pass), then PR-wide
prettier sweep (14 files) in the final push. Suite 517/517, tsc clean.
CI's prettier job checks ALL PR-changed files vs main — several earlier
branch commits had never been prettier-formatted; swept them all.

Deferred (needs Deepak decision): global search scope over index-only
sessions (P2, flagged since wave-1) — hydrate-on-search vs disk-backed
search vs visible scope note.
