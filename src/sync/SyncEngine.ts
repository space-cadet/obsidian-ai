import type { ChatSession } from "../types";
import type {
	StorageAdapter,
	EncryptedSession,
	RemoteSessionMeta,
	SyncResult,
	SyncPlan,
} from "./StorageAdapter";
import { LocalCache } from "./LocalCache";
import { EncryptionLayer, checksum } from "./EncryptionLayer";

export type SyncState = "idle" | "syncing" | "error" | "locked";
export type ConflictStrategy = "last-write-wins" | "keep-both" | "manual";

export interface SyncEngineConfig {
	adapter: StorageAdapter;
	cache: LocalCache;
	crypto: EncryptionLayer;
	passphrase: string;
	conflictStrategy?: ConflictStrategy;
	logger?: { log(level: string, msg: string): void };
	progress?: (event: { type: string; id: string; direction?: "upload" | "download"; status: "start" | "done" | "error"; error?: string }) => void;
	/** Called when a session is downloaded from remote. Implementor should save to app storage. */
	onSessionDownloaded?: (session: ChatSession) => Promise<void>;
}

/**
 * Core sync engine: delta sync, conflict resolution, offline queue.
 *
 * State machine: idle → syncing → idle | error
 */
export class SyncEngine {
	private adapter: StorageAdapter;
	private cache: LocalCache;
	private crypto: EncryptionLayer;
	private state: SyncState = "idle";
	private passphrase: string;
	private conflictStrategy: ConflictStrategy;
	private logger?: { log(level: string, msg: string): void };
	private progress?: (event: { type: string; id: string; direction?: "upload" | "download"; status: "start" | "done" | "error"; error?: string }) => void;
	private onSessionDownloaded?: (session: ChatSession) => Promise<void>;
	private _cancelled = false;

	constructor(config: SyncEngineConfig) {
		this.adapter = config.adapter;
		this.cache = config.cache;
		this.crypto = config.crypto;
		this.passphrase = config.passphrase;
		this.conflictStrategy = config.conflictStrategy ?? "last-write-wins";
		this.logger = config.logger;
		this.progress = config.progress;
		this.onSessionDownloaded = config.onSessionDownloaded;
	}

	get currentState(): SyncState {
		return this.state;
	}

	/** Request cancellation of the current sync. Checked between sessions. */
	cancel(): void {
		this._cancelled = true;
		this.log("info", "SyncEngine: cancellation requested");
	}

	/** Check if cancellation was requested. */
	get isCancelled(): boolean {
		return this._cancelled;
	}

	/** Reset cancellation flag. Call before starting a new sync. */
	resetCancellation(): void {
		this._cancelled = false;
	}

	/** Initialize adapter. Key is derived lazily on first encrypt/decrypt. */
	async initialize(config: unknown): Promise<void> {
		this.log("info", "SyncEngine: initializing...");
		await this.adapter.initialize(config);
		await this.cache.init();
		// Key is NOT derived here — deriveKey uses payload salt on decrypt
		if (this.passphrase) {
			this.log("info", "SyncEngine: encryption enabled (key derived per-payload)");
		} else {
			this.log("warn", "SyncEngine: encryption disabled (plaintext mode)");
		}
	}

	/** Perform a full sync: upload local changes, download remote changes, resolve conflicts. */
	async sync(): Promise<SyncResult> {
		if (this.state === "syncing") {
			this.log("warn", "SyncEngine: sync already in progress, skipping");
			return { uploaded: 0, downloaded: 0, conflicts: 0, skipped: 0, errors: ["Sync already in progress"] };
		}

		this.state = "syncing";
		this._cancelled = false;
		this.log("info", "SyncEngine: starting sync...");

		const errors: string[] = [];

		try {
			const plan = await this.computeSyncPlan();

			// Upload local changes
			for (const session of plan.upload) {
				if (this._cancelled) {
					this.log("warn", "SyncEngine: cancelled during upload");
					errors.push("Cancelled by user");
					break;
				}
				try {
					await this.uploadSession(session);
				} catch (err: any) {
					const msg = `Upload failed for ${session.id}: ${err.message}`;
					this.log("error", msg);
					errors.push(msg);
				}
			}

			// Download remote changes (skip if cancelled)
			if (!this._cancelled) {
				for (const meta of plan.download) {
					if (this._cancelled) {
						this.log("warn", "SyncEngine: cancelled during download");
						errors.push("Cancelled by user");
						break;
					}
					try {
						await this.downloadSession(meta);
					} catch (err: any) {
						const msg = `Download failed for ${meta.id}: ${err.message}`;
						this.log("error", msg);
						errors.push(msg);
					}
				}
			}

			// Handle conflicts (skip if cancelled)
			if (!this._cancelled) {
				for (const conflict of plan.conflicts) {
					if (this._cancelled) {
						this.log("warn", "SyncEngine: cancelled during conflict resolution");
						errors.push("Cancelled by user");
						break;
					}
					try {
						await this.resolveConflict(conflict.local, conflict.remote);
					} catch (err: any) {
						const msg = `Conflict resolution failed for ${conflict.local.id}: ${err.message}`;
						this.log("error", msg);
						errors.push(msg);
						await this.cache.markConflict(conflict.local.id);
					}
				}
			}

			const lastSyncTime = Date.now();
			await this.adapter.setLastSyncTime(lastSyncTime);
			await this.cache.setLastSyncTime(lastSyncTime);

			this.state = errors.length > 0 ? "error" : "idle";
			this.log(
				"info",
				`SyncEngine: sync complete. ↑${plan.upload.length} ↓${plan.download.length} ⚡${plan.conflicts.length} ⊘${plan.skipped}`,
			);

			return {
				uploaded: plan.upload.length,
				downloaded: plan.download.length,
				conflicts: plan.conflicts.length,
				skipped: plan.skipped,
				errors,
			};
		} catch (err: any) {
			this.state = "error";
			const msg = `SyncEngine: fatal error: ${err.message}`;
			this.log("error", msg);
			errors.push(msg);
			return { uploaded: 0, downloaded: 0, conflicts: 0, skipped: 0, errors };
		}
	}

	/** Compute the sync plan by comparing local and remote state. */
	async computeSyncPlan(): Promise<SyncPlan> {
		const localSessions = await this.cache.getAllSessions();
		const remoteMetas = await this.adapter.listSessions();

		const remoteMap = new Map<string, RemoteSessionMeta>();
		for (const meta of remoteMetas) {
			remoteMap.set(meta.id, meta);
		}

		const upload: ChatSession[] = [];
		const download: RemoteSessionMeta[] = [];
		const conflicts: Array<{ local: ChatSession; remote: RemoteSessionMeta }> = [];
		let skipped = 0;

		for (const local of localSessions) {
			const remote = remoteMap.get(local.id);
			remoteMap.delete(local.id);

			if (!remote) {
				// Local-only: upload
				if (local._syncStatus !== "synced") {
					upload.push(local);
				} else {
					// Was previously synced but now missing from remote (deleted elsewhere)
					// For now, skip — user can manually delete if desired
					skipped++;
				}
			} else if (local._syncStatus === "synced") {
				// Both exist, local unchanged since last sync
				// Use ETag comparison if available (most reliable), fallback to timestamp
				const etagChanged = local._etag && remote.etag && local._etag !== remote.etag;
				const timestampChanged = remote.modifiedAt > (local._remoteModifiedAt ?? 0);
				if (etagChanged || (!local._etag && timestampChanged)) {
					// Remote changed: download
					download.push(remote);
				} else {
					skipped++;
				}
			} else {
				// Local has pending changes
				const etagChanged = local._etag && remote.etag && local._etag !== remote.etag;
				const timestampChanged = remote.modifiedAt > (local._remoteModifiedAt ?? 0);
				if (etagChanged || (!local._etag && timestampChanged)) {
					// Both changed: conflict
					conflicts.push({ local, remote });
				} else {
					// Local newer: upload
					upload.push(local);
				}
			}
		}

		// Remaining remotes are not in local cache: download all
		for (const meta of remoteMap.values()) {
			download.push(meta);
		}

		return { upload, download, conflicts, skipped };
	}

	/** Upload a single session to remote storage. */
	private async uploadSession(session: ChatSession): Promise<void> {
		this.progress?.({ type: "session", id: session.id, direction: "upload", status: "start" });
		const plaintext = JSON.stringify(session);
		const sessionChecksum = await checksum(plaintext);
		const encrypted = await this.crypto.encrypt(plaintext);

		const payload: EncryptedSession = {
			id: session.id,
			ciphertext: encrypted.ciphertext,
			checksum: sessionChecksum,
			modifiedAt: session.updatedAt,
			version: ((session as unknown as Record<string, unknown>)._version as number) ?? 1,
		};
		// Only include encryption fields if actually encrypted
		if (!encrypted.unencrypted) {
			payload.iv = encrypted.iv;
			payload.tag = encrypted.tag;
			payload.salt = encrypted.salt;
		}

		const result = await this.adapter.putSession(payload);
		await this.cache.markSynced(session.id, session.updatedAt, result.etag);
		this.progress?.({ type: "session", id: session.id, direction: "upload", status: "done" });
		this.log("debug", `SyncEngine: uploaded ${session.id}`);
	}

	/** Download and decrypt a single session from remote storage. */
	private async downloadSession(meta: RemoteSessionMeta): Promise<void> {
		this.progress?.({ type: "session", id: meta.id, direction: "download", status: "start" });
		const encrypted = await this.adapter.getSession(meta.id);
		if (!encrypted) {
			this.progress?.({ type: "session", id: meta.id, direction: "download", status: "error", error: "Disappeared during sync" });
			this.log("warn", `SyncEngine: remote session ${meta.id} disappeared during sync`);
			return;
		}

		const payload = {
			iv: encrypted.iv,
			ciphertext: encrypted.ciphertext,
			tag: encrypted.tag,
			salt: encrypted.salt,
			unencrypted: !encrypted.iv, // plaintext if no IV
		};

		// Decrypt using passphrase (key may not be in memory if session restarted)
		const plaintext = await this.crypto.decrypt(payload, this.passphrase);

		// Verify checksum
		const expectedChecksum = await checksum(plaintext);
		if (expectedChecksum !== encrypted.checksum) {
			this.progress?.({ type: "session", id: meta.id, direction: "download", status: "error", error: "Checksum mismatch" });
			throw new Error(`Checksum mismatch for session ${meta.id}`);
		}

		const session: ChatSession = JSON.parse(plaintext);
		const cached: ChatSession = {
			...session,
			// Mark as synced since it came from remote
		};

		await this.cache.putSession(cached);

		// Persist to app storage BEFORE marking synced so failures are retryable
		if (this.onSessionDownloaded) {
			await this.onSessionDownloaded(cached);
		}

		await this.cache.markSynced(meta.id, meta.modifiedAt, meta.etag);
		this.progress?.({ type: "session", id: meta.id, direction: "download", status: "done" });
		this.log("debug", `SyncEngine: downloaded ${meta.id}`);
	}

	/** Resolve a conflict between local and remote versions. */
	private async resolveConflict(
		local: ChatSession,
		remote: RemoteSessionMeta,
	): Promise<void> {
		switch (this.conflictStrategy) {
			case "last-write-wins": {
				if (local.updatedAt > remote.modifiedAt) {
					this.log("info", `Conflict: local wins for ${local.id}`);
					await this.uploadSession(local);
				} else {
					this.log("info", `Conflict: remote wins for ${local.id}`);
					await this.downloadSession(remote);
				}
				break;
			}
			case "keep-both": {
				this.log("info", `Conflict: keeping both for ${local.id}`);
				// Download remote as a new session with modified ID
				const encrypted = await this.adapter.getSession(remote.id);
				if (encrypted) {
					const payload = {
						iv: encrypted.iv,
						ciphertext: encrypted.ciphertext,
						tag: encrypted.tag,
						salt: encrypted.salt,
						unencrypted: !encrypted.iv,
					};
					const plaintext = await this.crypto.decrypt(payload, this.passphrase);
					const remoteSession: ChatSession = JSON.parse(plaintext);
					const newSession: ChatSession = {
						...remoteSession,
						id: crypto.randomUUID(),
						title: `${remoteSession.title || "Chat"} (conflict)`,
						createdAt: Date.now(),
						updatedAt: Date.now(),
					};
					await this.cache.putSession(newSession);

					// Persist conflict copy to app storage
					if (this.onSessionDownloaded) {
						await this.onSessionDownloaded(newSession);
					}

					await this.cache.markSynced(newSession.id, remote.modifiedAt, remote.etag);
				}
				// Keep local as-is (re-mark as pending so it uploads)
				await this.cache.putSession(local);
				break;
			}
			case "manual": {
				this.log("info", `Conflict: queuing manual resolution for ${local.id}`);
				await this.cache.markConflict(local.id);
				break;
			}
		}
	}

	/** Populate the local cache with sessions from Obsidian's storage.
	 *  Preserves synced status for sessions that haven't changed. */
	async populateCache(sessions: ChatSession[]): Promise<void> {
		for (const session of sessions) {
			// Check if already cached and synced — if so, preserve sync status
			const existing = await this.cache.getSession(session.id);
			if (
				existing &&
				existing._syncStatus === "synced" &&
				existing.updatedAt === session.updatedAt
			) {
				// Unchanged synced session — skip
				continue;
			}
			await this.cache.putSession(session);
		}
		this.log("info", `SyncEngine: cache populated with ${sessions.length} sessions`);
	}

	/** Set a progress callback for per-session sync events. */
	setProgressHandler(
		handler: (event: { type: string; id: string; direction?: "upload" | "download"; status: "start" | "done" | "error"; error?: string }) => void,
	): void {
		this.progress = handler;
	}

	/** Disconnect adapter and clear crypto key. */
	async disconnect(): Promise<void> {
		this.crypto.clear();
		await this.adapter.disconnect();
		await this.cache.close();
		this.state = "idle";
	}

	private log(level: string, msg: string): void {
		this.logger?.log(level, msg);
	}
}
