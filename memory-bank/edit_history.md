# Edit History

*Last Updated: 2026-08-12 10:54:55 IST*

## 2026-08-12

#### 10:54:55 IST - T43: Reinstall dependencies and clear the TypeScript check
- Modified `tsconfig.json` - Enable `skipLibCheck` in the base configuration to match the production build policy.
- Updated `memory-bank/tasks/T43.md` - Record dependency alignment and passing TypeScript/build verification.
- Updated `memory-bank/implementation-details/multi-user-agent-chat.md` - Document the stale AI SDK installation diagnosis and resolution.
- Updated `memory-bank/activeContext.md` - Mark the AI SDK mismatch resolved and record final verification.
- Updated `memory-bank/progress.md` - Record dependency alignment and passing checks.
- Updated `memory-bank/changelog.md` - Record the TypeScript/build verification cleanup.
- Updated `memory-bank/errorLog.md` - Record the stale dependency diagnosis and resolution.
- Updated `memory-bank/session_cache.md` - Add the dependency and typecheck completion to the current session.
- Updated `memory-bank/sessions/2026-08-12-morning.md` - Append the dependency reinstall, TypeScript fix, and verification results.
- Created `memory-bank/edits/2026-08-12/105455-T43-typescript-check.md` - Record the canonical edit chunk.

#### 10:35:04 IST - T43, T15, T8: Mobile chat hardening, model badge fix, and format-gate cleanup
- Modified `src/components/ChatApp.tsx` - Count selected model IDs directly for the model-selection badge.
- Created `src/components/__tests__/ActionBar.test.tsx` - Cover zero, one, and two model selections and separate remote-user counts.
- Modified `styles.css` - Constrain the chat flex scroll chain, add touch scrolling behavior, and remove mobile composer bottom padding.
- Modified `memory-bank/tasks/T43.md` - Record mobile hardening, badge correction, tests, formatting, and verification.
- Modified `memory-bank/implementation-details/multi-user-agent-chat.md` - Document mobile scroll/composer behavior and badge count rules.
- Modified `memory-bank/activeContext.md` - Record the completed follow-up and current verification state.
- Modified `memory-bank/progress.md` - Record the completed mobile and selection-count follow-up.
- Modified `memory-bank/changelog.md` - Add the unreleased mobile, badge, test, and format-gate changes.
- Modified `memory-bank/tasks.md` - Move T43 to the completed registry.
- Modified `memory-bank/session_cache.md` - Close T43 and record the current session and history.
- Created `memory-bank/sessions/2026-08-12-morning.md` - Record the completed session and requested title.
- Created `memory-bank/edits/2026-08-12/103504-T43-mobile-hardening.md` - Record the canonical edit chunk.

## 2026-08-11

#### 08:01:32 IST - T40, T43: Merge participant routing and scope repository format check
- Modified `memory-bank/tasks/T43.md` - Recorded Phase 4 delivery, merge commit `de38d697`, verification results, and deferred Phase 5 scope
- Modified `memory-bank/tasks/T40.md` - Linked the resolved remote-message behavior to the merged T43 architecture
- Modified `memory-bank/activeContext.md` - Reconciled T40/T43 status with `main` and recorded the format-check follow-up
- Modified `memory-bank/progress.md` - Recorded T43 merge and repository CI verification
- Modified `memory-bank/session_cache.md` - Updated current focus, counts, T43 delivery status, and next-session priority
- Modified `memory-bank/implementation-details/multi-user-agent-chat.md` - Marked delivered participant-routing capabilities and retained Phase 5 boundary
- Modified `memory-bank/sessions/2026-08-10-evening.md` - Appended the merged-work closeout and session title
- Modified `memory-bank/tasks.md` - Updated registry last-updated timestamp

## 2026-08-10

#### 21:00:00 IST - T40: Fix message rendering - relay sends type 'chat' not 'message'
- Modified `src/sync/WebSocketSyncAdapter.ts` - Fixed message type check from 'message' to 'chat'
- Modified `src/sync/WebSocketSyncAdapter.ts` - Extract content directly from data instead of data.message
- Modified `src/sync/WebSocketSyncAdapter.ts` - Fixed echo check to use data.sender instead of inner.sender
- Modified `memory-bank/tasks/T40.md` - Documented known bugs section with AI-triggering issue

#### 16:00:00 IST - T42: Create remote chat storage task and design doc
- Created `memory-bank/tasks/T42.md` - Remote chat storage task definition
- Created `memory-bank/implementation-details/remote-chat-storage-design.md` - Architecture design

#### 15:30:00 IST - T40: UI bug fixes for presence tracking
- Modified `src/components/ChatApp.tsx` - Added remoteUserCount prop to ActionBar
- Modified `src/components/ActionBar.tsx` - Fixed badge visibility, improved globe icon state
- Modified `src/hooks/useChatUI.ts` - Fixed callback race condition (register before connect)
- Modified `relay/server.js` - Include self in roster, fix join/leave broadcast order

#### 12:00:00 IST - T40: Presence tracking implementation - Phase 2 complete
- Modified `src/sync/SyncAdapter.ts` - Added onUserList and onPresence hooks to interface
- Modified `src/sync/WebSocketSyncAdapter.ts` - Implemented presence protocol (roster, join, leave)
- Modified `src/hooks/useChatUI.ts` - Added connectedUsers state tracking
- Modified `src/components/ActionBar.tsx` - Added remote user dropdown with radio icon and badge
- Modified `src/components/ChatApp.tsx` - Wired presence callbacks, register before connect
- Modified `relay/server.js` - Room state management, presence broadcast
- Modified `styles.css` - Dropdown styling with theme variables
- Created `memory-bank/implementation-details/presence-tracking.md` - Design doc for presence system

---

## 2026-08-09

#### 07:01 IST - T40 Phase 1 Complete + T41 Auto-Updater Implementation
- Moved `memory-bank/implementation/*` → `memory-bank/implementation-details/` (canonical location)
- Updated all references across memory-bank files to `implementation-details/`
- Modified `memory-bank/tasks/T40.md` - Marked Phase 1 complete, added UI changes
- Created `memory-bank/tasks/T41.md` - Plugin Auto-Updater with Stable/Dev Channels
- Modified `memory-bank/tasks.md` - Added T41 to active tasks
- Modified `memory-bank/progress.md` - Added T41 entry, updated T40 status
- Modified `memory-bank/activeContext.md` - Added T41 context, updated current focus

#### 04:14 IST - T40: Multi-User Chat — BRAT distribution verified, relay server connection verified. Updated task status, active context, progress, session cache, task registry, and implementation design doc.
- Modified `memory-bank/tasks/T40.md` - Updated status and Phase 1 checklist
- Modified `memory-bank/activeContext.md` - Updated T40 status and current focus
- Modified `memory-bank/progress.md` - Added verification entry for T40
- Modified `memory-bank/tasks.md` - Added T40 to active tasks registry
- Modified `memory-bank/session_cache.md` - Updated for current session
- Modified `memory-bank/implementation-details/multi-user-chat-design.md` - Added Phase 1 Verification Log section
- Created `memory-bank/sessions/2026-08-09-morning.md` - Session log

---

## 2026-08-07

#### 23:23:17 IST - T34: Settings panel UI/UX improvements: removed duplicate headings, fixed React root memory leak, removed Force GC row, added usage bar charts, replaced innerHTML with DOM API, styled audit log, simplified hero, accent CSS variable, hover-reveal actions, larger textareas. Fixed double-zipping in manual build workflow. Added 4 ProfileCard tests.
- Modified `src/components/ProfileCard.tsx` - Modified src/components/ProfileCard.tsx
- Modified `src/settings-sections/SettingsTab.ts` - Modified src/settings-sections/SettingsTab.ts
- Modified `src/settings-sections/diagnostics.ts` - Modified src/settings-sections/diagnostics.ts
- Modified `src/settings-sections/hero.ts` - Modified src/settings-sections/hero.ts
- Modified `src/settings-sections/intelligence.ts` - Modified src/settings-sections/intelligence.ts
- Modified `styles.css` - Modified styles.css
- Modified `.github/workflows/manual-build.yml` - Modified .github/workflows/manual-build.yml
- Created `src/components/__tests__/ProfileCard.test.tsx` - Created src/components/__tests__/ProfileCard.test.tsx
- Created `settings-mockup-improved.html` - Created settings-mockup-improved.html


## 2026-07-14

#### 04:11:49 IST - T8: Promote release from pre-release to proper v1.2.4. GitHub release created with build assets.
- Updated `manifest.json` - Updated manifest.json
- Updated `versions.json` - Updated versions.json

#### 04:09:02 IST - T15: Fix token counter accumulation, remove green streaming border, add live tool result updates without re-rendering entire bubble
- Modified `src/components/ChatApp.tsx` - Modified src/components/ChatApp.tsx
- Modified `src/components/ChatMessages.tsx` - Modified src/components/ChatMessages.tsx
- Modified `styles.css` - Modified styles.css

#### 04:08:55 IST - T15: Fix 4 critical streaming/chat UI bugs: Android flicker, interrupted message loss, retry attachment loss, live token counting
- Modified `src/components/ChatMessages.tsx` - Modified src/components/ChatMessages.tsx
- Modified `src/hooks/useMessageActions.ts` - Modified src/hooks/useMessageActions.ts
- Modified `src/components/ChatApp.tsx` - Modified src/components/ChatApp.tsx
