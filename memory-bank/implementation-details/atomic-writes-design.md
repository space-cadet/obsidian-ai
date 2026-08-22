# Atomic Writes Design (Obsidian-AI)

*Created: 2026-08-19*
*Related Tasks: T42b, T42*

## Current Status

The temporary-file pattern is implemented for WebDAV session uploads. Cleanup during initialization is still open, and auxiliary plugin-data files do not yet use this pattern.

## Problem

If an upload is interrupted, the server may have a partial/corrupted session file. Obsidian-ai writes directly to the final path.

## Solution

Write to a temporary path first, then atomic MOVE to the final path.

## Pattern

```typescript
async putSession(session: EncryptedSession): Promise<PutResult> {
    const id = session.id;
    const tempPath = `${this.prefix}sessions/${id}.json.tmp`;
    const finalPath = `${this.prefix}sessions/${id}.json`;
    
    try {
        // 1. Write payload to temp path
        await this.request('PUT', tempPath, {
            body: JSON.stringify(session),
            contentType: 'application/json'
        });
        
        // 2. Atomic move to final path
        await this.request('MOVE', tempPath, {
            headers: {
                'Destination': this.baseUrl + finalPath,
                'Overwrite': 'T'
            }
        });
        
        return { success: true, path: finalPath };
    } catch (error) {
        // Cleanup temp file on failure
        await this.deleteTempFile(tempPath).catch(() => {});
        throw error;
    }
}
```

## Cleanup

- On sync engine init: scan for `.tmp` files and delete
- On upload error: attempt temp file deletion
- On plugin load: cleanup any orphaned temp files

## WebDAV Compatibility

- `MOVE` is standard WebDAV (RFC 4918)
- Nextcloud, ownCloud, Apache mod_dav all support it
- `Overwrite: T` allows replacing existing files

## Related

- SyncIt: `src/sync/AtomicWrite.ts`
- `src/sync/WebDAVStorageAdapter.ts`
