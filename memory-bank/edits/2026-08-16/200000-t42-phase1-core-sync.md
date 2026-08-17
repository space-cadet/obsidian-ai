# Edit Chunk: T42 Phase 1 — Core Sync Architecture

**Date:** 2026-08-16  
**Branch:** `t42-remote-storage`  
**Commit:** `ac24ced`  
**Task:** T42

## Summary
Implemented the foundational architecture for remote chat storage and sync. Four core files providing pluggable backends, offline-first caching, zero-knowledge encryption, and delta sync with conflict resolution.

## Files Added

### `src/sync/StorageAdapter.ts`
- `StorageAdapter` interface: initialize, disconnect, listSessions, getSession, putSession, deleteSession, getLastSyncTime, setLastSyncTime
- `EncryptedSession`: id, iv, ciphertext, tag, salt, checksum, modifiedAt, version
- `RemoteSessionMeta`: id, modifiedAt, etag?, size?
- `SyncResult`: uploaded, downloaded, conflicts, skipped, errors[]
- `SyncPlan`: upload[], download[], conflicts[], skipped count
- `CachedSession`: extends ChatSession with _syncStatus, _localModifiedAt, _remoteModifiedAt, _version

### `src/sync/LocalCache.ts`
- IndexedDB wrapper with two object stores: `sessions` (keyPath: id), `metadata` (keyPath: key)
- Methods: getAllSessions, getSession, putSession, markSynced, markConflict, deleteSession, getLastSyncTime, setLastSyncTime, clear
- Sync status enum: pending | synced | conflict

### `src/sync/EncryptionLayer.ts`
- `deriveKey(passphrase, existingSalt?)` — PBKDF2 100k iterations, SHA-256, AES-256-GCM
- `encrypt(plaintext)` — random IV, returns iv/ciphertext/tag/salt base64
- `decrypt(payload, passphrase?)` — re-derives key if not in memory, verifies auth tag
- `checksum(plaintext)` — SHA-256 hex
- `clear()` — wipes key from memory

### `src/sync/SyncEngine.ts`
- Config: adapter, cache, crypto, passphrase, conflictStrategy, logger
- State machine: idle → syncing → idle | error
- `sync()` — full sync: compute plan → upload → download → resolve conflicts
- `computeSyncPlan()` — O(n) comparison using hash maps
- Conflict strategies: last-write-wins (default), keep-both, manual
- `disconnect()` — clears crypto key, closes cache

## Build Status
- TypeScript: clean (no errors from new code)
- Tests: 236/236 pass

## Memory Bank Updates
- `memory-bank/tasks/T42.md` — Phase 1 checklist marked in progress
- `memory-bank/activeContext.md` — T42 entry added at top
- `memory-bank/session_cache.md` — session summary written

## Next
- Phase 2: S3StorageAdapter implementation
- Settings integration for remote storage config
- Sync status UI badge
