# Edit History

*Last Updated: 2026-08-02 18:57:00 IST*

---

## 2026-08-02

#### 18:55:00 IST - T32: Security Hardening — Path Traversal, XSS, SSRF, ReDoS
- Modified `src/agent/ToolExecutor.ts` - Added `isPathAllowed()` and `denyPath()` helpers; applied path checks to all file operation tools
- Created `src/lib/sanitizeHtml.ts` - `sanitizeHtmlForRenderer()` strips `<script>`, `javascript:`, `on*` handlers, `data:text/html`, `<iframe>`
- Modified `src/components/MessageBubble.tsx` - Applied `sanitizeHtmlForRenderer()` before all `MarkdownRenderer.render()` calls
- Modified `src/components/ChatMessages.tsx` - Applied `sanitizeHtmlForRenderer()` to streaming text parts
- Modified `src/api/AgentApiManager.ts` - Added `validateAgentUrl()` helper blocking localhost, private IPs, non-HTTP(S) schemes
- Modified `src/agent/ToolExecutor.ts` - Replaced regex-based DuckDuckGo HTML scraping with `DOMParser`
- Modified `src/storage/ChatStorage.ts` - Added per-line try/catch + schema validation in `_loadMessages()`
- Created `src/agent/__tests__/security.test.ts` - 15 tests covering XSS sanitization and SSRF validation
- Created `memory-bank/tasks/T32.md` - Security hardening task documentation
- Modified `memory-bank/tasks.md` - Added T32 to completed tasks
- Created `memory-bank/edits/2026-08-02/1855-T32-security-hardening.md` - Edit chunk for canonical record

## 2026-07-29

#### 13:47:51 IST - T15: Document past-session search and shared tab implementation
- Created `memory-bank/implementation-details/past-session-search-and-tabs.md` - Documented indexing, current-session exclusion, agent prompts, inline links, internal tabs, scrolling, composer shortcuts, verification, and attribution.
- Modified `memory-bank/tasks/T15.md` - Added the implemented feature set, documentation link, deferred tab-heading polish, and GPT 5.6 Terra Low attribution.
- Modified `memory-bank/sessions/2026-07-29-afternoon.md` - Closed the session with the final committed state and deferred follow-up.
- Modified `memory-bank/session_cache.md` - Marked the T15 session complete.
- Modified `memory-bank/implementation-details/chat-session-persistence.md` - Linked persistence storage to saved-session retrieval behavior.
- Modified `memory-bank/implementation-details/agentic-tool-calling.md` - Documented the read-only saved-session search tool and active-session exclusion.
- Modified `memory-bank/implementation-details/chat-ui-features.md` - Documented shared tabs, link navigation, shortcut behavior, and deferred tab-heading polish.
- Modified `memory-bank/progress.md` and `memory-bank/activeContext.md` - Synchronized completed feature status, deferred follow-up, and model attribution.

#### 13:38:56 IST - T15: Record past-session search and internal tab UI work
- Created `memory-bank/sessions/2026-07-29-afternoon.md` - Logged scope, modified files, current verification state, and GPT 5.6 Terra Low attribution for all work in the session.
- Modified `memory-bank/session_cache.md` - Set the active T15 session and recorded model attribution.
- Modified `memory-bank/activeContext.md` - Updated T15's current tab/search UI state and model attribution.


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
