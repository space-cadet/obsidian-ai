# Fix: System Information in System Prompt (T30)

**Status:** ✅ COMPLETED  
**Date:** 2026-07-28  
**Related Tasks:** T30  

## Problem

The agent couldn't determine basic system information accessible to Obsidian: current date, time, timezone, platform. This limited context-aware responses.

## Solution

Inject a `[System Context]` block into every system prompt in `buildSystemPrompt()`.

## Code Changes

### `src/lib/systemPrompt.ts`

Added system context block:

```typescript
// ── System Context (date, time, platform) ──
const now = new Date();
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const platformInfo = typeof navigator !== "undefined" 
    ? `Platform: ${navigator.platform || "unknown"}` 
    : "";

prompt += `\n\n[System Context]`;
prompt += `\n- Current date: ${now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
prompt += `\n- Current time: ${now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
prompt += `\n- Timezone: ${tz}`;
if (platformInfo) prompt += `\n- ${platformInfo}`;
prompt += `\n- Locale: ${typeof navigator !== "undefined" ? navigator.language : "unknown"}`;
```

## Information Provided

| Field | Source | Example |
|-------|--------|---------|
| Current date | `Date.toLocaleDateString()` | "Tuesday, July 28, 2026" |
| Current time | `Date.toLocaleTimeString()` | "03:45:22 PM" |
| Timezone | `Intl.DateTimeFormat().resolvedOptions().timeZone` | "Asia/Kolkata" |
| Platform | `navigator.platform` | "Linux x86_64" |
| Locale | `navigator.language` | "en-US" |

## Testing Notes

- Verify date/time updates with each new message
- Check timezone is correct for user's locale
- Ensure minimal token overhead (~50-100 tokens)

## Files Modified

- `src/lib/systemPrompt.ts`
