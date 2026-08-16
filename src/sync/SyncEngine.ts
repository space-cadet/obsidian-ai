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

	constructor(config: SyncEngineConfig) {
		this.adapter = config.adapter;
		this.cache = config.cache;
		this.crypto = config.crypto;
		this.passphrase = config.passphrase;
		this.conflictStrategy = config.conflictStrategy ?? "last-write-wins";
		this.logger = config.logger;
	}

	get currentState(): SyncState {
		return this.state;
	}

	/** Initialize adapter and derive encryption key. */
	async initialize(config: unknown): Promise<void> {
		this.log("info", "SyncEngine: initializing...");
		await this.adapter.initialize(config);
		await this.cache.init();

		// Derive key from passphrase (plaintext mode if empty)
		const salt = await this.crypto.deriveKey(this.passphrase);
		if (salt) {
			this.log("info", `SyncEngine: key derived (salt: ${btoa(String.fromCharCode(...salt)).slice(0, 8)}...)`);
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
		this.log("info", "SyncEngine: starting sync...");

		const errors: string[] = [];

		try {
			const plan = await this.computeSyncPlan();

			// Upload local changes
			for (const session of plan.upload) {
				try {
					await this.uploadSession(session);
				} catch (err: any) {
					const msg = `Upload failed for ${session.id}: ${err.message}`;
					this.log("error", msg);
					errors.push(msg);
				}
			}

			// Download remote changes
			for (const meta of plan.download) {
				try {
					await this.downloadSession(meta);
				} catch (err: any) {
					const msg = `Download failed for ${meta.id}: ${err.message}`;
					this.log("error", msg);
					errors.push(msg);
				}
			}

			// Handle conflicts
			for (const conflict of plan.conflicts) {
				try {
					await this.resolveConflict(conflict.local, conflict.remote);
				} catch (err: any) {
					const msg = `Conflict resolution failed for ${conflict.local.id}: ${err.message}`;
					this.log("error", msg);
					errors.push(msg);
					await this.cache.markConflict(conflict.local.id);
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
	private async computeSyncPlan(): Promise<SyncPlan> {
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
				if (remote.modifiedAt > (local._remoteModifiedAt ?? 0)) {
					// Remote is newer: download
					download.push(remote);
				} else {
					skipped++;
				}
			} else {
				// Local has pending changes
				if (remote.modifiedAt > (local._remoteModifiedAt ?? 0)) {
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

		await this.adapter.putSession(payload);
		await this.cache.markSynced(session.id);
		this.log("debug", `SyncEngine: uploaded ${session.id}`);
	}

	/** Download and decrypt a single session from remote storage. */
	private async downloadSession(meta: RemoteSessionMeta): Promise<void> {
		const encrypted = await this.adapter.getSession(meta.id);
		if (!encrypted) {
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
			throw new Error(`Checksum mismatch for session ${meta.id}`);
		}

		const session: ChatSession = JSON.parse(plaintext);
		const cached: ChatSession = {
			...session,
			// Mark as synced since it came from remote
		};

		await this.cache.putSession(cached);
		await this.cache.markSynced(meta.id);
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
