# Edit History

*Last Updated: 2026-08-09 04:14 IST*

## 2026-08-09

#### 04:14 IST - T40: Multi-User Chat — BRAT distribution verified, relay server connection verified. Updated task status, active context, progress, session cache, task registry, and implementation design doc.
- Modified `memory-bank/tasks/T40.md` - Updated status and Phase 1 checklist
- Modified `memory-bank/activeContext.md` - Updated T40 status and current focus
- Modified `memory-bank/progress.md` - Added verification entry for T40
- Modified `memory-bank/tasks.md` - Added T40 to active tasks registry
- Modified `memory-bank/session_cache.md` - Updated for current session
- Modified `memory-bank/implementation/multi-user-chat-design.md` - Added Phase 1 Verification Log section
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

