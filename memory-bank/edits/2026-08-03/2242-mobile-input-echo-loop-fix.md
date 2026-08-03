# Edit Chunk: T32 Regression — Mobile Input Erased

**Task:** T32 (obsidian-ai Security Hardening — but this is a regression from prior streaming fix work)
**Period:** 2026-08-03 22:36–22:49 IST (UTC+5:30)
**Agent:** kimi/k3

## Changes

### Modified
- `src/components/ChatInput.tsx` — Disabled draft feature to fix mobile input erasure
- `src/components/ChatApp.tsx` — Pass undefined for draft/onDraftChange props

## Summary

**Regression introduced:** Earlier streaming bubble fix (T15/T19 era) added `useEffect([editMessage, draft])` that unconditionally set input value from `draft` prop. This created an echo loop on mobile:

1. User types → `handleInputChange` → `setValue` + `onDraftChange`
2. Parent debounces and saves draft → passes updated `draft` prop
3. `useEffect` runs → `setValue(draft)` overwrites user's typing
4. On mobile keyboard, this causes every keystroke to be erased

**Attempted fix (09aae62):** Added `valueRef` to track live input value. useEffect only updates from draft when `draft !== valueRef.current`.
**Result:** Did NOT work — user reported input still being erased.

**Final fix (6feb505):** Completely disabled draft feature:
- `ChatApp.tsx`: Passes `undefined` for `draft` and `onDraftChange` props
- `ChatInput.tsx`: Removed `draft` from useEffect deps, commented out `onDraftChange` call
- This eliminates the echo loop entirely

**Note:** Drafts can be re-enabled later with proper debounce isolation (e.g., only update from draft on session switch, not on every prop change).

## Files
- `src/components/ChatInput.tsx`
- `src/components/ChatApp.tsx`

## Git Commits
- `09aae62` — fix(mobile): Prevent message input from being erased on mobile (attempted, did not work)
- `6feb505` — fix(mobile): Disable draft feature to prevent input erasure (final fix)
