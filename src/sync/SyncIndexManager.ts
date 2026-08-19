import type { SyncIndex, SyncIndexEntry, IndexStorage } from "./SyncIndex";
import type { ChatSession } from "../types";
import type { RemoteSessionMeta } from "./StorageAdapter";
import { checksum } from "./EncryptionLayer";

const INDEX_DATA_KEY = "sync-index";

/**
 * Manages the local sync index — a persisted cache of session state from the
 * last successful sync. Used to skip unchanged sessions and avoid redundant
 * network round-trips.
 *
 * T42a: Sync Index — Skip Unchanged Sessions
 */
export class SyncIndexManager {
	private index: SyncIndex | null = null;
	private storage: IndexStorage;
	private dataKey: string;

	constructor(storage: IndexStorage, dataKey = INDEX_DATA_KEY) {
		this.storage = storage;
		this.dataKey = dataKey;
	}

	/**
	 * Generate a server signature from connection config.
	 * If the signature changes, the index is invalidated.
	 *
	 * Normalizes inputs to avoid signature mismatches from trivial
	 * formatting differences (trailing slashes, whitespace).
	 */
	static makeServerSignature(config: {
		url: string;
		username: string;
		prefix?: string;
	}): string {
		const url = config.url.trim().replace(/\/$/, "");
		const username = config.username.trim();
		const prefix = (config.prefix ?? "").trim().replace(/^\//, "").replace(/\/$/, "");
		const raw = `${url}|${username}|${prefix}`;
		let hash = 0;
		for (let i = 0; i < raw.length; i++) {
			const char = raw.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash |= 0;
		}
		return String(hash);
	}

	/**
	 * Load the index from plugin data. Returns null if missing, corrupted,
	 * or server signature mismatch.
	 */
	async load(expectedSignature: string): Promise<SyncIndex | null> {
		if (this.index) {
			if (this.index.serverSignature === expectedSignature) {
				return this.index;
			}
			// Settings or the active server changed after the cache was loaded.
			// Never reuse state belonging to another server configuration.
			this.index = null;
		}

		try {
			const data = await this.storage.load();
			if (!data || !data[this.dataKey]) return null;

			const parsed: SyncIndex = data[this.dataKey] as SyncIndex;

			if (parsed.serverSignature !== expectedSignature) {
				console.info("SyncEngine: Server signature changed, invalidating sync index");
				this.index = null;
				return null;
			}

			this.index = parsed;
			return parsed;
		} catch (err) {
			console.warn("SyncEngine: Failed to load sync index, starting fresh:", err);
			return null;
		}
	}

	/**
	 * Save the index to plugin data.
	 */
	async save(index: SyncIndex): Promise<void> {
		try {
			await this.storage.save({ [this.dataKey]: index });
			this.index = index;
		} catch (err) {
			console.error("SyncEngine: Failed to save sync index:", err);
		}
	}

	/**
	 * Clear the in-memory and persisted index.
	 */
	async clear(): Promise<void> {
		this.index = null;
		try {
			const data = (await this.storage.load()) ?? {};
			delete data[this.dataKey];
			await this.storage.save(data);
		} catch (err) {
			console.error("SyncEngine: Failed to clear sync index:", err);
		}
	}

	/**
	 * Check if a session is unchanged compared to the index.
	 *
	 * A session is "unchanged" if:
	 * - It exists in the index
	 * - Local checksum and mtime match the index
	 * - Remote ETag matches the index (most reliable)
	 * - OR remote mtime matches the index (fallback if no ETag)
	 */
	isUnchanged(
		local: ChatSession,
		remote: RemoteSessionMeta,
		index: SyncIndex | null,
	): boolean {
		if (!index) return false;

		const entry = index.entries[local.id];
		if (!entry) return false;

		// Local must match index exactly
		if (local.updatedAt !== entry.localMtime) {
			return false;
		}

		// Remote check: prefer ETag, fall back to mtime
		if (remote.etag && entry.etag) {
			return remote.etag === entry.etag;
		}

		return remote.modifiedAt === entry.remoteMtime;
	}

	/**
	 * Build a fresh index from the results of a successful sync.
	 *
	 * @param locals - Local sessions that were synced
	 * @param remotes - Remote session metadata that was synced
	 * @param serverSignature - Signature of the current server config
	 */
	async buildIndex(
		locals: ChatSession[],
		remotes: RemoteSessionMeta[],
		serverSignature: string,
	): Promise<SyncIndex> {
		const remoteMap = new Map(remotes.map((r) => [r.id, r]));
		const entries: Record<string, SyncIndexEntry> = {};

		for (const local of locals) {
			const remote = remoteMap.get(local.id);
			if (!remote) continue; // Session was deleted during sync, skip

			const plaintext = JSON.stringify(local);
			const localChecksum = await checksum(plaintext);
			const localSize = new TextEncoder().encode(plaintext).length;

			entries[local.id] = {
				localChecksum,
				localMtime: local.updatedAt,
				localSize,
				remoteMtime: remote.modifiedAt,
				remoteSize: remote.size,
				etag: remote.etag || `${remote.modifiedAt}-${remote.size ?? 0}`,
			};
		}

		return {
			lastSyncTime: Date.now(),
			serverSignature,
			entries,
		};
	}

	/**
	 * Update the index after a partial sync (e.g., only uploads or only downloads).
	 * Preserves entries for sessions that weren't touched.
	 */
	async patchIndex(
		existing: SyncIndex | null,
		updatedLocals: ChatSession[],
		updatedRemotes: RemoteSessionMeta[],
		serverSignature: string,
	): Promise<SyncIndex> {
		const remoteMap = new Map(updatedRemotes.map((r) => [r.id, r]));
		const entries: Record<string, SyncIndexEntry> = { ...existing?.entries };

		for (const local of updatedLocals) {
			const remote = remoteMap.get(local.id);
			if (!remote) continue;

			const plaintext = JSON.stringify(local);
			const localChecksum = await checksum(plaintext);
			const localSize = new TextEncoder().encode(plaintext).length;

			entries[local.id] = {
				localChecksum,
				localMtime: local.updatedAt,
				localSize,
				remoteMtime: remote.modifiedAt,
				remoteSize: remote.size,
				etag: remote.etag || `${remote.modifiedAt}-${remote.size ?? 0}`,
			};
		}

		return {
			lastSyncTime: Date.now(),
			serverSignature,
			entries,
		};
	}
}
