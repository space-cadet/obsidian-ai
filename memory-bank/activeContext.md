# Active Context

*Last Updated: 2026-08-02 18:56 IST*

## Current Focus
**T32: Security Hardening** ✅ COMPLETED (2026-08-02)

### Security Fixes (2026-08-02)
**Status:** ✅ COMPLETED

**Path Traversal Protection** ✅
- **File:** `src/agent/ToolExecutor.ts`
- **Fix:** Added `isPathAllowed()` blocking `.obsidian/`, `.trash/`, `.git/`, and `../` paths
- **Impact:** Prevents LLM from reading plugin config, other plugins' data, or escaping vault

**XSS Sanitization** ✅
- **Files:** `src/components/MessageBubble.tsx`, `src/components/ChatMessages.tsx`
- **Fix:** `sanitizeHtmlForRenderer()` strips `<script>`, `javascript:`, `on*` handlers, `data:text/html`, `<iframe>` before `MarkdownRenderer.render()`
- **Impact:** Prevents LLM from injecting executable code into rendered messages

**SSRF Validation** ✅
- **File:** `src/api/AgentApiManager.ts`
- **Fix:** `validateAgentUrl()` blocks localhost, private IPs (10.x, 172.16-31.x, 192.168.x), non-HTTP(S) schemes
- **Impact:** Prevents malicious agent profiles from accessing internal services

**ReDoS Fix** ✅
- **File:** `src/agent/ToolExecutor.ts`
- **Fix:** Replaced regex-based DuckDuckGo HTML scraping with `DOMParser`
- **Impact:** Eliminates catastrophic backtracking on untrusted HTML

**JSON Validation** ✅
- **File:** `src/storage/ChatStorage.ts`
- **Fix:** Per-line try/catch + schema validation in `_loadMessages()`
- **Impact:** Gracefully handles malformed session files

**Test Results:** 140 tests pass (8 files), including 15 new security tests

---

## Previous Work (2026-07-29)
**T15 follow-up complete** — Past-session search, inline result links, and shared internal tabs are implemented. Tab-heading visual polish is deferred.

### Bug Fixes (2026-07-28)
**Status:** ✅ COMPLETED (4/4)

**T27: Gemini thought_signature Error** ✅
- **File:** `src/api.ts`
- **Fix:** Added `google: { structuredOutputs: false }` provider option for Gemini in `streamChatWithTools()`

**T28: Obsidian Note Link Click Crash** ✅
- **File:** `src/components/MessageBubble.tsx`
- **Fix:** Added `setupLinkInterception()` to intercept all `<a>` clicks in rendered messages

**T29: Android Background Processing** ⏸️ DEFERRED
- **File:** `src/components/ChatApp.tsx`
- **Status:** Investigation complete. Decision: accept mobile limitation.

**T30: System Information Context** ✅
- **File:** `src/lib/systemPrompt.ts`
- **Fix:** Injected `[System Context]` block into every system prompt

**T31: Chat Input Draft Auto-Save** ✅ COMPLETED (2026-07-29)
- **Files:** `src/types.ts`, `src/components/ChatInput.tsx`, `src/components/ChatApp.tsx`

## Active Tasks
- **[T11]**: 🔄 **IN PROGRESS** — Log size limit, startup crash fix, CI/CD archive fix.
- **[T22]**: 🔄 **IN PROGRESS** — Phases 0–3 complete. ChatApp.tsx: 1,948 → 636 lines. Phases 4–5 pending.
- **[T16]**: 🔄 **IN PROGRESS** — Phases 1–17 implemented. Debate mode working.
- **[T14]**: 🔄 **IN PROGRESS** — Phase 3 integration test.
- **[T15]**: 🔄 **IN PROGRESS** — Past-session search and shared internal tabs complete. Tab-heading polish deferred.
- **[T17]**: ⏸️ **PENDING** — Advanced vault tools. Backlinks + YAML first.
- **[T26]**: 🔄 **IN PROGRESS** — AI Intelligence Layer. Phase 2 complete (SessionSummarizer). Phases 3–5 pending.
- **[T8]**: 🔄 **IN PROGRESS** — Open source release prep.
- **[T32]**: ✅ **COMPLETED** — Security Hardening (Path Traversal, XSS, SSRF, ReDoS)
- **[T13]**: ✅ **COMPLETED**
- **[T18]**: ✅ **COMPLETED**
- **[T19]**: ✅ **COMPLETED**
- **[T21]**: ✅ **COMPLETED**
- **[T24]**: ✅ **COMPLETED**
- **[T23]**: ✅ **COMPLETED**
