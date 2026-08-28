# Error Log — Obsidian AI Plugin

## ERR-20260828-001: Community Review Blocking Errors (v1.4.0)

**Date:** 2026-08-28
**Severity:** Blocking — prevents Community Directory approval
**Source:** Obsidian Community Plugin Review

### Error 1: `no-unsupported-api`
**Rule:** `obsidianmd/no-unsupported-api`
**Locations:**
- `src/lifecycle/storage.ts:1234,1262`
- `src/sync/SyncLogger.ts:41,44`

**Problem:** Code uses Obsidian APIs newer than declared `minAppVersion: 1.4.5`.
- `SyncLogger.ts:41,44` — `app.loadLocalStorage()` / `app.saveLocalStorage()` (requires Obsidian ≥1.5.0)
- `storage.ts:1234,1262` — TBD (need exact line inspection)

**Fix options:**
1. Bump `minAppVersion` to 1.5.0 (simplest, but excludes older Obsidian users)
2. Replace with browser `localStorage` + namespace (more compatible)

**Decision:** Replace with browser `localStorage` to maintain compatibility.

---

### Error 2: `no-static-styles-assignment`
**Rule:** `obsidianmd/no-static-styles-assignment`
**Locations:**
- `src/modals/SyncProgressModal.ts` — ~30+ instances (heavy)
- `src/settings-sections/syncComponents.ts:41` — 1 instance
- `src/settings-sections/remoteStorageSettings.ts:398` — 1 instance

**Problem:** Direct `element.style.property = "value"` assignments instead of CSS classes or Obsidian helpers.

**Fix:** Move all inline styles to `styles.css` with proper CSS classes, apply via `addClass()`.

---

## Resolution Plan

1. Fix `SyncLogger.ts` — replace `app.loadLocalStorage/saveLocalStorage` with namespaced `localStorage`
2. Fix `storage.ts` — inspect lines 1234,1262 and fix
3. Refactor `SyncProgressModal.ts` — extract all inline styles to CSS classes
4. Fix `syncComponents.ts:41` — extract warning style to CSS
5. Fix `remoteStorageSettings.ts:398` — extract style to CSS
6. Verify with `pnpm lint:eslint`
7. Release as v1.4.1

**Status:** 🔄 In Progress
