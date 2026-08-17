import type { ChatSession } from "../types";
import type { CachedSession } from "./StorageAdapter";

const DB_VERSION = 1;

/**
 * Offline-first local cache using IndexedDB.
 * Stores session data with sync status metadata.
 * DB name is scoped to the remote destination to avoid stale sync state
 * when the user changes servers.
 */
export class LocalCache {
	private db: IDBDatabase | null = null;
	private initPromise: Promise<void> | null = null;
	private dbName: string;

	constructor(namespace = "default") {
		// Sanitize namespace for use in DB name
		const safe = namespace.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50);
		this.dbName = `obsidian-ai-sync-${safe}`;
	}

	/** Initialize the IndexedDB connection. Idempotent. */
	async init(): Promise<void> {
		if (this.db) return;
		if (this.initPromise) return this.initPromise;

		this.initPromise = this.doInit();
		return this.initPromise;
	}

	private doInit(): Promise<void> {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(this.dbName, DB_VERSION);

			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				this.db = request.result;
				resolve();
			};

			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;
				if (!db.objectStoreNames.contains("sessions")) {
					db.createObjectStore("sessions", { keyPath: "id" });
				}
				if (!db.objectStoreNames.contains("metadata")) {
					db.createObjectStore("metadata", { keyPath: "key" });
				}
			};
		});
	}

	/** Close the DB connection. */
	async close(): Promise<void> {
		if (this.db) {
			this.db.close();
			this.db = null;
			this.initPromise = null;
		}
	}

	/** Get all cached sessions. */
	async getAllSessions(): Promise<CachedSession[]> {
		await this.init();
		const db = this.db!;
		return new Promise((resolve, reject) => {
			const tx = db.transaction("sessions", "readonly");
			const store = tx.objectStore("sessions");
			const request = store.getAll();
			request.onsuccess = () => resolve(request.result ?? []);
			request.onerror = () => reject(request.error);
		});
	}

	/** Get a single session by ID. */
	async getSession(id: string): Promise<CachedSession | null> {
		await this.init();
		const db = this.db!;
		return new Promise((resolve, reject) => {
			const tx = db.transaction("sessions", "readonly");
			const store = tx.objectStore("sessions");
			const request = store.get(id);
			request.onsuccess = () => resolve(request.result ?? null);
			request.onerror = () => reject(request.error);
		});
	}

	/** Put (insert or update) a session. Marks as pending sync. */
	async putSession(session: ChatSession): Promise<void> {
		await this.init();
		const db = this.db!;
		const cached: CachedSession = {
			...session,
			_syncStatus: "pending",
			_localModifiedAt: Date.now(),
			_version: (session as CachedSession)._version ?? 1,
		};
		return new Promise((resolve, reject) => {
			const tx = db.transaction("sessions", "readwrite");
			const store = tx.objectStore("sessions");
			const request = store.put(cached);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}

	/** Mark a session as synced (after successful remote upload).
	 *  @param remoteModifiedAt Server timestamp (optional)
	 *  @param etag Server ETag (optional) */
	async markSynced(id: string, remoteModifiedAt?: number, etag?: string): Promise<void> {
		await this.init();
		const db = this.db!;
		return new Promise((resolve, reject) => {
			const tx = db.transaction("sessions", "readwrite");
			const store = tx.objectStore("sessions");
			const getReq = store.get(id);
			getReq.onsuccess = () => {
				const session = getReq.result;
				if (session) {
					session._syncStatus = "synced";
					if (remoteModifiedAt !== undefined) {
						session._remoteModifiedAt = remoteModifiedAt;
					}
					if (etag !== undefined) {
						session._etag = etag;
					}
					const putReq = store.put(session);
					putReq.onsuccess = () => resolve();
					putReq.onerror = () => reject(putReq.error);
				} else {
					resolve();
				}
			};
			getReq.onerror = () => reject(getReq.error);
		});
	}

	/** Mark a session as having a conflict. */
	async markConflict(id: string): Promise<void> {
		await this.init();
		const db = this.db!;
		return new Promise((resolve, reject) => {
			const tx = db.transaction("sessions", "readwrite");
			const store = tx.objectStore("sessions");
			const getReq = store.get(id);
			getReq.onsuccess = () => {
				const session = getReq.result;
				if (session) {
					session._syncStatus = "conflict";
					const putReq = store.put(session);
					putReq.onsuccess = () => resolve();
					putReq.onerror = () => reject(putReq.error);
				} else {
					resolve();
				}
			};
			getReq.onerror = () => reject(getReq.error);
		});
	}

	/** Delete a session from the cache. */
	async deleteSession(id: string): Promise<void> {
		await this.init();
		const db = this.db!;
		return new Promise((resolve, reject) => {
			const tx = db.transaction("sessions", "readwrite");
			const store = tx.objectStore("sessions");
			const request = store.delete(id);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}

	/** Get the last successful sync timestamp. */
	async getLastSyncTime(): Promise<number | null> {
		await this.init();
		const db = this.db!;
		return new Promise((resolve, reject) => {
			const tx = db.transaction("metadata", "readonly");
			const store = tx.objectStore("metadata");
			const request = store.get("lastSyncTime");
			request.onsuccess = () => {
				const result = request.result;
				resolve(result?.value ?? null);
			};
			request.onerror = () => reject(request.error);
		});
	}

	/** Set the last successful sync timestamp. */
	async setLastSyncTime(time: number): Promise<void> {
		await this.init();
		const db = this.db!;
		return new Promise((resolve, reject) => {
			const tx = db.transaction("metadata", "readwrite");
			const store = tx.objectStore("metadata");
			const request = store.put({ key: "lastSyncTime", value: time });
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}

	/** Clear all cached data. Use with caution. */
	async clear(): Promise<void> {
		await this.init();
		const db = this.db!;
		return new Promise((resolve, reject) => {
			const tx = db.transaction(["sessions", "metadata"], "readwrite");
			tx.objectStore("sessions").clear();
			tx.objectStore("metadata").clear();
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}
}
