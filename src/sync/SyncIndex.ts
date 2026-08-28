/**
 * Sync index types for obsidian-ai chat session sync.
 *
 * The sync index tracks the state of each session from the last successful
 * sync. It is persisted to plugin data (not IndexedDB) so it survives
 * cache resets and restarts. It is invalidated when server config changes.
 *
 * T42a: Sync Index
 */

/** Single entry in the sync index for a chat session. */
export interface SyncIndexEntry {
	/** SHA-256 checksum of the plaintext session JSON at time of last sync. */
	localChecksum: string;
	/** Local session updatedAt timestamp at time of last sync. */
	localMtime: number;
	/** Size in bytes of the plaintext session JSON at time of last sync. */
	localSize: number;
	/** Remote modifiedAt timestamp at time of last sync. */
	remoteMtime: number;
	/** Remote content size in bytes at time of last sync. */
	remoteSize?: number;
	/** Server ETag at time of last sync (most reliable change detector). */
	etag?: string;
}

/** The full sync index — persisted snapshot of last successful sync state. */
export interface SyncIndex {
	/** Timestamp (ms) of the last successful sync that built this index. */
	lastSyncTime: number;
	/** Hash of server config used to detect changes and invalidate the index. */
	serverSignature: string;
	/** Map of session ID → sync index entry. */
	entries: Record<string, SyncIndexEntry>;
}

/** Minimal storage interface for persisting the sync index to plugin data. */
export interface IndexStorage {
	load(): Promise<Record<string, unknown> | null>;
	save(data: Record<string, unknown>): Promise<void>;
}

/** Build an Obsidian Plugin-backed IndexStorage from a Plugin instance. */
export function createPluginIndexStorage(
	plugin: {
		loadData(): Promise<Record<string, unknown> | null>;
		saveData(data: Record<string, unknown>): Promise<void>;
	},
	key = "syncIndex",
): IndexStorage {
	return {
		async load() {
			const data = await plugin.loadData();
			return (data as Record<string, unknown> | null) ?? null;
		},
		async save(indexData) {
			const data = ((await plugin.loadData()) ?? {}) as Record<
				string,
				unknown
			>;
			data[key] = indexData;
			await plugin.saveData(data);
		},
	};
}
