# Remote Chat Storage — Implementation Design

*Created: 2026-08-10*
*Related Task: T42*

## Document Status

This is the original design. The WebDAV session path is implemented. Selected
auxiliary plugin files now use the T57a shared envelope and atomic write path.
T57b adds remembered per-file state, recovery copies, explicit conflict choices,
and deletion tombstones. S3/custom-server support, full offline retry, and
complete sync identity handling remain open.

## Overview

This document details the architecture for syncing Obsidian AI chat sessions to remote storage backends. The design prioritizes:

1. **Privacy goal**: Zero-knowledge encryption for data that passes through the encryption layer
2. **Flexibility**: Pluggable backends (S3, WebDAV, custom)
3. **Reliability goal**: Offline-first with retry after a later sync; a separate durable retry queue is not yet implemented
4. **Simplicity**: Minimal configuration, sensible defaults

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Obsidian AI Plugin                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Chat UI   │  │ SyncEngine  │  │   EncryptionLayer      │  │
│  │             │◄─┤             │◄─┤  (AES-256-GCM)         │  │
│  └─────────────┘  └──────┬──────┘  └─────────────────────────┘  │
│                          │                                      │
│                   ┌──────┴──────┐                               │
│                   │ LocalCache  │                               │
│                   │ (IndexedDB) │                               │
│                   └──────┬──────┘                               │
│                          │                                      │
└──────────────────────────┼──────────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────┴─────┐ ┌────┴────┐ ┌────┴────┐
        │    S3     │ │ WebDAV  │ │ Custom  │
        │  Adapter  │ │ Adapter │ │ Adapter │
        └───────────┘ └─────────┘ └─────────┘
```

## Component Details

### Current Scope Boundary

Chat sessions and selected plugin files use encrypted, checksummed envelopes
when encryption is enabled. The plugin files also use atomic remote writes and
safe local replacement. Sync logs still use a separate raw text path, and the
plugin-file system still needs durable retries and complete sync identity
handling; T57b now provides remembered conflict state, recovery copies, and
deletion records.

Deleted sessions are kept rather than removed from the other device or the server. This is a safety choice for now, not complete two-way deletion.

### SyncIt Boundary

Chat Lab should sync only its own plugin data: chat sessions, selected plugin
settings, memory, persona, and the explicitly supported logs or statistics.
It should not add whole-vault sync. SyncIt remains the owner of ordinary vault
files, while [T57](../tasks/T57.md) defines the safe handoff and prevents both
plugins from managing the same remote path.

The existing Integration Provider API is for AI tools, not data transport. A
future separate `dataSyncProvider` contract is described in
[the T57 design](plugin-data-sync-and-syncit-boundary.md).

### 1. StorageAdapter Interface

```typescript
interface StorageAdapter {
    readonly name: string;
    
    // Lifecycle
    initialize(config: unknown): Promise<void>;
    disconnect(): Promise<void>;
    
    // Operations
    listSessions(): Promise<RemoteSession[]>;
    getSession(id: string): Promise<EncryptedSession | null>;
    putSession(session: EncryptedSession): Promise<void>;
    deleteSession(id: string): Promise<void>;
    
    // Metadata
    getLastSyncTime(): Promise<number | null>;
    setLastSyncTime(time: number): Promise<void>;
}

interface EncryptedSession {
    id: string;
    iv: string;           // Base64 nonce
    ciphertext: string;   // Base64 encrypted data
    tag: string;          // Base64 auth tag
    checksum: string;     // SHA-256 of plaintext
    modifiedAt: number;
    version: number;      // For conflict detection
}
```

### 2. SyncEngine

```typescript
class SyncEngine {
    private adapter: StorageAdapter;
    private cache: LocalCache;
    private crypto: EncryptionLayer;
    private state: "idle" | "syncing" | "error" = "idle";
    
    async sync(): Promise<SyncResult> {
        const local = await this.cache.getAllSessions();
        const remote = await this.adapter.listSessions();
        
        const plan = this.computeSyncPlan(local, remote);
        
        // Upload local changes
        for (const session of plan.upload) {
            const encrypted = await this.crypto.encrypt(session);
            await this.adapter.putSession(encrypted);
            await this.cache.markSynced(session.id);
        }
        
        // Download remote changes
        for (const session of plan.download) {
            const encrypted = await this.adapter.getSession(session.id);
            if (encrypted) {
                const decrypted = await this.crypto.decrypt(encrypted);
                await this.cache.putSession(decrypted);
            }
        }
        
        // Handle conflicts
        for (const conflict of plan.conflicts) {
            await this.resolveConflict(conflict);
        }
        
        await this.adapter.setLastSyncTime(Date.now());
        return { uploaded: plan.upload.length, downloaded: plan.download.length, conflicts: plan.conflicts.length };
    }
    
    private computeSyncPlan(local: ChatSession[], remote: RemoteSession[]): SyncPlan {
        // Compare checksums and timestamps
        // O(n) with hash maps
    }
}
```

### 3. EncryptionLayer

```typescript
class EncryptionLayer {
    private key: CryptoKey | null = null;
    
    async deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            "raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveBits", "deriveKey"]
        );
        return crypto.subtle.deriveKey(
            { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"]
        );
    }
    
    async encrypt(plaintext: string): Promise<{ iv: string; ciphertext: string; tag: string }> {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoder = new TextEncoder();
        const data = encoder.encode(plaintext);
        
        const encrypted = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            this.key!,
            data
        );
        
        // AES-GCM appends auth tag to ciphertext
        const combined = new Uint8Array(encrypted);
        const tag = combined.slice(-16);
        const ciphertext = combined.slice(0, -16);
        
        return {
            iv: btoa(String.fromCharCode(...iv)),
            ciphertext: btoa(String.fromCharCode(...ciphertext)),
            tag: btoa(String.fromCharCode(...tag)),
        };
    }
}
```

### 4. LocalCache (IndexedDB)

```typescript
class LocalCache {
    private db: IDBDatabase | null = null;
    
    async init(): Promise<void> {
        this.db = await openDB("obsidian-ai-sync", 1, {
            upgrade(db) {
                db.createObjectStore("sessions", { keyPath: "id" });
                db.createObjectStore("metadata", { keyPath: "key" });
            },
        });
    }
    
    async getAllSessions(): Promise<CachedSession[]> {
        return this.db!.getAll("sessions");
    }
    
    async putSession(session: ChatSession): Promise<void> {
        await this.db!.put("sessions", {
            ...session,
            _syncStatus: "pending",
            _localModifiedAt: Date.now(),
        });
    }
    
    async markSynced(id: string): Promise<void> {
        const session = await this.db!.get("sessions", id);
        if (session) {
            session._syncStatus = "synced";
            await this.db!.put("sessions", session);
        }
    }
}
```

## S3 Backend Implementation

```typescript
class S3StorageAdapter implements StorageAdapter {
    private client: S3Client | null = null;
    private bucket: string = "";
    private prefix: string = "";
    
    async initialize(config: S3Config): Promise<void> {
        this.client = new S3Client({
            endpoint: config.endpoint,
            region: config.region,
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            },
        });
        this.bucket = config.bucket;
        this.prefix = config.prefix || "obsidian-ai/";
    }
    
    async putSession(session: EncryptedSession): Promise<void> {
        const key = `${this.prefix}sessions/${session.id}.json`;
        await this.client!.send(new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: JSON.stringify(session),
            ContentType: "application/json",
            Metadata: {
                "modified-at": String(session.modifiedAt),
                "checksum": session.checksum,
            },
        }));
    }
    
    async getSession(id: string): Promise<EncryptedSession | null> {
        try {
            const key = `${this.prefix}sessions/${id}.json`;
            const response = await this.client!.send(new GetObjectCommand({
                Bucket: this.bucket,
                Key: key,
            }));
            const body = await response.Body?.transformToString();
            return body ? JSON.parse(body) : null;
        } catch (err: any) {
            if (err.name === "NoSuchKey") return null;
            throw err;
        }
    }
    
    async listSessions(): Promise<RemoteSession[]> {
        const response = await this.client!.send(new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: `${this.prefix}sessions/`,
        }));
        
        return (response.Contents || []).map(obj => ({
            id: obj.Key!.split("/").pop()!.replace(".json", ""),
            modifiedAt: Number(obj.LastModified?.getTime()),
            etag: obj.ETag,
        }));
    }
}
```

## Conflict Resolution Strategies

### Strategy 1: Last-Write-Wins (default)
```
if (local.modifiedAt > remote.modifiedAt) {
    upload local;
} else {
    download remote;
}
```

### Strategy 2: Keep Both
```
if (local.checksum !== remote.checksum) {
    create duplicate session: "Session Name (conflict)";
}
```

### Strategy 3: Manual Merge (v2)
Show conflict UI with side-by-side diff, let user choose.

## Sync Trigger Strategies

| Trigger | When | Use Case |
|---------|------|----------|
| Manual | User clicks "Sync Now" | Privacy-conscious, metered connections |
| Interval | Every N minutes | Always-connected desktop |
| Event-driven | On session save/close | Real-time feel |
| Hybrid | Event-driven + periodic catchup | Best of both |

## Security Considerations

1. **Passphrase handling**: Never stored in plugin data. Prompted on first sync, kept in memory only.
2. **Key derivation**: PBKDF2 with 100k iterations, random salt per vault.
3. **Salt storage**: Stored in plaintext on remote (needed for decryption). Not sensitive.
4. **Backup key**: Optional mnemonic seed phrase for disaster recovery.

## Error Handling

```
Sync Error Flow:
  Network error → retry with exponential backoff (max 5 attempts)
  Auth error → prompt for re-authentication
  Conflict → queue for resolution, continue with other sessions
  Encryption error → halt sync, notify user (likely wrong passphrase)
```

## Testing Strategy

1. **Unit tests**: Mock each adapter, test sync logic in isolation
2. **Integration tests**: Local MinIO instance, test real S3 operations
3. **E2E tests**: Two Obsidian instances, verify bidirectional sync
4. **Offline tests**: Disable network, make changes, verify queue, reconnect, verify sync

## Future Extensions

- **Delta sync**: Only sync changed messages within a session (not entire session)
- **Compression**: Brotli compression before encryption for large sessions
- **Team sync**: Shared backend with ACLs (for research groups)
- **Import/Export**: Migrate between backends

---

*This design is a starting point. Implementation will refine based on real-world usage.*
