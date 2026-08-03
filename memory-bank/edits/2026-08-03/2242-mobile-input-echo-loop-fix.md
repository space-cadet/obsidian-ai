# Edit Chunk: T32 Regression — Mobile Input Erased

**Task:** T32 (obsidian-ai Security Hardening — but this is a regression from prior streaming fix work)
**Period:** 2026-08-03 22:36–22:42 IST (UTC+5:30)
**Agent:** kimi/k3

## Changes

### Modified
- `src/components/ChatInput.tsx` — Fixed mobile input echo-loop

## Summary

**Regression introduced:** Earlier streaming bubble fix (T15/T19 era) added `useEffect([editMessage, draft])` that unconditionally set input value from `draft` prop. This created an echo loop on mobile:

1. User types → `handleInputChange` → `setValue` + `onDraftChange`
2. Parent debounces and saves draft → passes updated `draft` prop
3. `useEffect` runs → `setValue(draft)` overwrites user's typing
4. On mobile keyboard, this causes every keystroke to be erased

**Fix:** Added `valueRef` to track live input value. useEffect now only updates from draft when `draft !== valueRef.current`, breaking the echo loop while preserving session-switch draft loading.

## Files
- `src/components/ChatInput.tsx`

## Git Commit
- `09aae62` — fix(mobile): Prevent message input from being erased on mobile
