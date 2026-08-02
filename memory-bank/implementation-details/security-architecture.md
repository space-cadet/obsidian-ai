# Security Architecture — obsidian-ai

*Created: 2026-08-02 18:58 IST*
*Last Updated: 2026-08-02 18:58 IST*

## Overview

This document describes the security architecture implemented in obsidian-ai following the T32 security audit (2026-08-02). The plugin handles untrusted input from two primary sources:
1. **LLM-generated content** — streamed text, tool calls, reasoning
2. **External network requests** — agent endpoints, web search APIs

The threat model assumes a compromised or jailbroken LLM could attempt to:
- Read sensitive files (`.obsidian/` config, other plugins' data)
- Execute JavaScript in the Obsidian renderer
- Exfiltrate data via SSRF to internal services
- Cause denial of service via ReDoS or resource exhaustion

## Defense Layers

### Layer 1: Path Traversal Protection

**Location:** `src/agent/ToolExecutor.ts`

All file operation tools (`read_note`, `edit_note`, `create_note`, `delete_note`, `move_note`, `patch_note`, `edit_section`, `create_folder`) enforce path boundaries before resolving files.

**Blocked patterns:**
- `^\.obsidian\b` — plugin configuration and data
- `^\.trash\b` — Obsidian trash folder
- `^\.git\b` — git internals
- `^\.+\/`, `\.\.\/` — parent directory traversal

**Implementation:**
```typescript
const FORBIDDEN_PATH_PATTERNS = [
    /^\.obsidian\b/,
    /^\.trash\b/,
    /^\.git\b/,
    /^\.+\//,
    /\.\.\//,
];

function isPathAllowed(path: string): boolean {
    const normalized = normalizePath(path);
    return !FORBIDDEN_PATH_PATTERNS.some((re) => re.test(normalized));
}
```

**Rationale:** Obsidian plugins run with full vault access. The LLM should not be able to read API keys from `data.json` or corrupt other plugins' state.

**Limitation:** This blocks the `.obsidian/` directory but does not prevent reading notes the user considers private. Future work: per-folder allowlists.

---

### Layer 2: XSS Sanitization

**Location:** `src/lib/sanitizeHtml.ts`, applied in `MessageBubble.tsx` and `ChatMessages.tsx`

Obsidian's `MarkdownRenderer.render()` processes markdown into HTML and can execute embedded JavaScript (DataviewJS, `<script>` tags, `onerror` handlers). Since LLM output is rendered directly, unsanitized content is an XSS vector.

**Stripped elements:**
- `<script>` tags and contents
- `javascript:` URLs in `href`/`src`
- `on*` event handlers (`onclick`, `onerror`, etc.)
- `data:text/html` URLs
- `<iframe>`, `<object>`, `<embed>` tags

**Implementation:**
```typescript
export function sanitizeHtmlForRenderer(text: string): string {
    return text
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/(href|src)\s*=\s*["']?javascript:/gi, '$1="blocked:')
        .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "")
        .replace(/(href|src)\s*=\s*["']?data:text\/html/gi, '$1="blocked:')
        .replace(/<(iframe|object|embed)[\s\S]*?<\/\1>/gi, "")
        .replace(/<(iframe|object|embed)[^>]*\/>/gi, "");
}
```

**Rationale:** Defense in depth. Even if Obsidian's sandbox contains most exploits, plugins often have elevated permissions. Stripping executable content before rendering eliminates the attack surface.

**Limitation:** Regex-based sanitization is not as robust as DOMPurify. Obsidian does not expose DOMPurify to plugins. Future work: wrap rendering in an iframe with `sandbox` attribute.

---

### Layer 3: SSRF Prevention

**Location:** `src/api/AgentApiManager.ts`

Agent profiles allow users to configure arbitrary endpoint URLs for remote OpenClaw agents. A malicious or misconfigured profile could point to internal services (`localhost`, `192.168.x.x`, AWS metadata endpoint).

**Blocked patterns:**
- `localhost`, `127.0.0.1`, `[::1]`
- Private IP ranges: `10.x`, `172.16-31.x`, `192.168.x`, `169.254.x`
- Non-HTTP(S) schemes: `file://`, `ftp://`, `data://`, `javascript://`

**Implementation:**
```typescript
export function validateAgentUrl(urlStr: string): { ok: boolean; error?: string } {
    const url = new URL(urlStr);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        return { ok: false, error: "Only http:// and https:// are allowed." };
    }
    if (hostname === "localhost" || hostname === "[::1]") {
        return { ok: false, error: "localhost is not allowed." };
    }
    if (PRIVATE_IP_RANGES.some((re) => re.test(hostname))) {
        return { ok: false, error: "Private IP addresses are not allowed." };
    }
    return { ok: true };
}
```

**Rationale:** SSRF is a common vulnerability in applications that make HTTP requests to user-supplied URLs. Blocking private IPs and localhost prevents access to internal services that may not be authenticated.

**Limitation:** DNS rebinding (where a hostname resolves to a private IP after validation) is not addressed. Future work: resolve hostname before validation and cache the result.

---

### Layer 4: ReDoS Mitigation

**Location:** `src/agent/ToolExecutor.ts` (DuckDuckGo search)

The DuckDuckGo search tool scrapes HTML results. The original implementation used complex regex with `.*?` lazy quantifiers on untrusted HTML, which is vulnerable to catastrophic backtracking.

**Fix:** Replaced regex scraping with `DOMParser`, which parses HTML in linear time.

**Before (vulnerable):**
```typescript
const resultRegex = /<div class="result[^"]*"[^>]*>.*?<a[^>]+href="([^"]*)"[^>]*class="result__a"[^>]*>(.*?)<\/a>.*?<a[^>]+class="result__snippet"[^>]*>(.*?)<\/a>.*?<\/div>/gs;
```

**After (safe):**
```typescript
const parser = new DOMParser();
const doc = parser.parseFromString(html, "text/html");
const linkElements = doc.querySelectorAll("a.result__a");
```

**Rationale:** Regex is the wrong tool for HTML parsing. `DOMParser` is available in Obsidian's Electron environment and handles malformed HTML safely.

---

### Layer 5: Input Validation

**Location:** `src/storage/ChatStorage.ts`

Session messages are stored as JSON Lines (`.jsonl`). Loading parses each line with `JSON.parse()`. Malformed lines could crash the plugin.

**Fix:** Per-line try/catch with schema validation.

```typescript
for (const line of lines) {
    try {
        const parsed = JSON.parse(line);
        if (
            parsed &&
            typeof parsed === "object" &&
            typeof parsed.id === "string" &&
            typeof parsed.role === "string" &&
            ["user", "assistant", "system"].includes(parsed.role)
        ) {
            messages.push(parsed as ChatMessage);
        }
    } catch {
        logger?.log("warn", `Failed to parse message line`);
    }
}
```

**Rationale:** Graceful degradation. One corrupt line should not prevent loading the entire session history.

---

## Known Limitations (Accepted Risk)

### Plaintext API Keys

**Location:** `src/settings.ts` → `data.json`

All provider API keys are stored unencrypted in the plugin's `data.json`. Rolling backups (`.bak`, `.bak.1`, etc.) also contain plaintext keys.

**Why accepted:** Obsidian does not provide a secure keystore API for plugins. The alternative (prompting for keys on every session) is unacceptable UX.

**Partial mitigation:** Path traversal protection prevents the LLM from reading `.obsidian/plugins/obsidian-ai/data.json` directly.

**Future work:** Consider using the OS keychain via a native module, or encrypting keys with a user-provided passphrase.

### Debug Log Exposure

**Location:** `src/logger.ts`

Debug logs may contain chat messages, API responses, and tool call arguments.

**Mitigation:** Log level is configurable (`off`/`error`/`info`/`debug`). Default is `error`. Retention is limited (`debugLogRetention` default 200 lines, `debugLogMaxSizeMB` default 5MB).

---

## Test Coverage

**File:** `src/agent/__tests__/security.test.ts`

15 tests covering:
- Script tag removal
- Multiline script removal
- `javascript:` URL blocking
- `onerror` handler stripping
- `data:text/html` URL blocking
- `iframe` removal
- Safe markdown passthrough
- Valid HTTPS URL acceptance
- localhost blocking
- 127.0.0.1 blocking
- Private IP blocking (10.x, 172.16-31.x, 192.168.x)
- `file://` blocking
- `data://` blocking
- `javascript://` blocking

All tests pass (140 total across 8 files).

---

## Audit Trail

- **Audit date:** 2026-08-02
- **Auditor:** Cloudy (kimi/k3)
- **Scope:** Full codebase (90+ files)
- **Findings:** 7 issues (3 critical, 4 medium)
- **Fixes implemented:** 5 (2 accepted as known limitations)
- **Tests added:** 15
- **Task:** T32
