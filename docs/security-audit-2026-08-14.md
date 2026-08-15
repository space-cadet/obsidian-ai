# Security Audit Report — Chat Lab v1.3.0

**Date:** 2026-08-14
**Auditor:** Sage (automated + manual review)
**Scope:** `src/` directory, dependencies, build artifacts

---

## ✅ Passes

### 1. No Hardcoded Secrets

- **Result:** PASS
- **Evidence:** Grepped for `api_key`, `apikey`, `secret`, `token`, `password` across all source files. No hardcoded credentials found. All API keys are user-configured via Settings UI.

### 2. XSS Protection — Markdown Rendering

- **Result:** PASS (with defense-in-depth)
- **Evidence:**
    - `sanitizeHtmlForRenderer()` strips `<script>`, `javascript:`, `on*=` handlers, `data:text/html`, `<iframe/object/embed>` before rendering
    - All `innerHTML` assignments in message rendering go through sanitization
    - Used in: `MessageBubble.tsx`, `ChatMessages.tsx`
- **Caveat:** Regex-based sanitization is not as robust as DOMPurify. Consider migrating to `DOMPurify` for production hardening. This is acceptable for community plugin review.

### 3. No `eval()` or `Function()` Constructor

- **Result:** PASS
- **Evidence:** No dynamic code execution found. All `setTimeout`/`setInterval` usage is for legitimate UI timing (debouncing, reconnection, focus management).

### 4. Path Traversal Protection

- **Result:** PASS
- **Evidence:**
    - `normalizePath()` used before all file operations
    - `checkPathInVault()` validates paths stay within vault root
    - Tool execution validates paths before reading/writing
    - Tests: `security.test.ts` covers path traversal attempts

### 5. SSRF Protection

- **Result:** PASS
- **Evidence:**
    - Web search URLs are validated (protocol whitelist: `http:`, `https:`)
    - No raw `fetch()` to user-provided URLs — all external calls use Obsidian's `requestUrl()` API
    - WebSocket connections are user-configured (relay URL in settings)

### 6. No Unauthorized External Network Calls

- **Result:** PASS
- **Evidence:**
    - `updater/PluginUpdater.ts`: Only calls GitHub API (`api.github.com`) for release checks
    - `WebSocketSyncAdapter.ts`: Only connects to user-configured relay URL
    - No telemetry, analytics, or unexpected outbound connections

### 7. Dependency Audit

- **Result:** 23 vulnerabilities found — ALL in dev dependencies
- **Details:**
    - `undici` (via `jsdom` → `vitest`): HTTP response queue poisoning — LOW severity
    - Affects: test runner only, NOT production build
    - Production dependencies: clean (no vulnerabilities in runtime deps)
- **Recommendation:** Update dev dependencies before next release, but not blocking for submission.

### 8. Tool Approval Flow

- **Result:** PASS
- **Evidence:** All 13 agentic tools require explicit user approval before execution. No tool runs automatically. User can disable tools entirely in settings.

---

## ⚠️ Recommendations (Non-blocking)

1. **Migrate to DOMPurify** — Replace regex-based HTML sanitization with `DOMPurify` for stronger XSS protection
2. **Content Security Policy** — Consider adding CSP headers if serving standalone UI preview
3. **Rate limiting** — Add client-side rate limiting for WebSocket reconnections (already has exponential backoff)
4. **Update dev dependencies** — Run `pnpm update` to clear the 23 audit warnings

---

## Verdict

**SAFE FOR COMMUNITY PLUGIN SUBMISSION**

No critical security issues found. All production code paths are protected. The 23 npm audit findings are exclusively in test infrastructure.
