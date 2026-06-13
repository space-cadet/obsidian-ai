# Edit Chunk: 2026-06-13 07:18 IST

## Issues Addressed

1. **Mobile background execution** — Documented OS-level limitation in README.md
2. **@-mention folder regression** — Fixed folders not appearing when no query typed
3. **Token usage totals** — Added per-session total token display

## Changes

### Fix: @-mention folder visibility (ChatInput.tsx)

When typing `@` with no query, the dropdown only showed the first 10 candidates — which were always notes since notes are listed first. Folders and tags were invisible unless the user typed enough to filter down.

**Fix:** In `filteredCandidates` useMemo, when no query is present, return a balanced mix:
- First 7 notes
- First 5 folders  
- First 5 tags

Total: up to 17 items, scrollable within the 220px dropdown.

### Feature: Token usage totals

**Helper added:** `getSessionTotalTokens(session)` in `src/lib/sessionUtils.ts`
- Sums `estimatedTokens` across all messages in a session

**Display locations:**
1. **SessionPickerModal** — Each session row shows `~X tokens` next to message count
2. **ChatApp** — Running total below ChatInput: "~X tokens across Y messages"
3. **GroupChatApp** — Same running total below ChatInput

**CSS added:**
- `.chat-session-tokens` — muted style for token count in session picker
- `.chat-session-token-total` — right-aligned faint text below input

### Documentation: Mobile background execution (README.md)

Added "Mobile Notes" section explaining:
- Webview suspension when app goes to background (OS limitation, not plugin bug)
- What stops: LLM streams, tool calls, network requests, timers
- What persists: chat history, session state via local storage
- Recommendation: keep app in foreground for long operations
- Mobile-responsive UI features listed

## Files Changed

| File | Change |
|------|--------|
| `src/components/ChatInput.tsx` | Balanced candidate mix when no query |
| `src/lib/sessionUtils.ts` | `getSessionTotalTokens()` helper |
| `src/components/SessionPickerModal.tsx` | Token total in session meta line |
| `src/components/ChatApp.tsx` | Running total below ChatInput |
| `src/components/GroupChatApp.tsx` | Running total below ChatInput |
| `styles.css` | `.chat-session-tokens`, `.chat-session-token-total` |
| `README.md` | Mobile Notes section |

## Build Status

✅ `tsc -noEmit -skipLibCheck && esbuild` passes

## Git Commit

`44c1dc9` on `main`
