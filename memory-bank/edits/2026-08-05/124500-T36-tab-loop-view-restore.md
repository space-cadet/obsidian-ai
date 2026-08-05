# Edit Chunk: T36 Stable Per-Tab Model Selection and Restored Chat View State

**Timestamp:** 2026-08-05 12:45 IST
**Status:** Complete

## Scope

Eliminate model-selection feedback in internal chat tabs and restore the saved
tab arrangement and scroll positions after reload.

## Changes

- Restored a tab's profile selection once on activation and skipped that
  programmatic selection in the session write-back effect.
- Removed ActionBar's participant-count debug output.
- Persisted saved open-tab order, active tab, and per-session scroll offsets in
  both supported chat storage formats.
- Added a default-on Chat Defaults toggle controlling reload restoration.

## Verification

- `pnpm test --pool=threads --maxWorkers=1`: 153 passed.
- `pnpm run build`: passed.
- `git diff --check`: passed.
