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
import { SyncIndexManager } from "./SyncIndexManager";
import { runWithConcurrency } from "./ConcurrencyLimiter";
import type { SyncIndex } from "./SyncIndex";

export type SyncState = "idle" | "syncing" | "error" | "locked";
export type ConflictStrategy = "last-write-wins" | "keep-both" | "manual";

export interface SyncEngineConfig {
	adapter: StorageAdapter;
	cache: LocalCache;
	crypto: EncryptionLayer;
	passphrase: string;
	conflictStrategy?: ConflictStrategy;
	logger?: { log(level: string, msg: string): void };
	progress?: (event: {
		type: string;
		id: string;
		direction?: "upload" | "download" | "conflict";
		status: "start" | "done" | "error";
		error?: string;
	}) => void;
	/** Called when a session is downloaded from remote. Implementor should save to app storage. */
	onSessionDownloaded?: (session: ChatSession) => Promise<void>;
	/** Optional sync index manager for skipping unchanged sessions (T42a). */
	indexManager?: SyncIndexManager;
	/** Max parallel upload/download operations (T42c). */
	concurrencyLimit?: number;
	/** Dry run mode: compute plan but do not transfer anything (T42e). */
	dryRun?: boolean;
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
	private progress?: (event: {
		type: string;
		id: string;
		direction?: "upload" | "download" | "conflict";
		status: "start" | "done" | "error";
		error?: string;
	}) => void;
	private logHandler?: (level: string, msg: string) => void;
	private onSessionDownloaded?: (session: ChatSession) => Promise<void>;
	private _cancelled = false;
	private indexManager?: SyncIndexManager;
	private serverConfig?: { url: string; username: string; prefix?: string };
	private concurrencyLimit: number;
	dryRun: boolean;

	constructor(config: SyncEngineConfig) {
		this.adapter = config.adapter;
		this.cache = config.cache;
		this.crypto = config.crypto;
		this.passphrase = config.passphrase;
		this.conflictStrategy = config.conflictStrategy ?? "last-write-wins";
		this.logger = config.logger;
		this.progress = config.progress;
		this.onSessionDownloaded = config.onSessionDownloaded;
		this.indexManager = config.indexManager;
		this.concurrencyLimit = config.concurrencyLimit ?? 3;
		this.dryRun = config.dryRun ?? false;
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

		// Store normalized server config for sync index signature (T42a)
		const cfg = config as Record<string, unknown>;
		if (cfg.url && cfg.username) {
			this.serverConfig = {
				url: String(cfg.url),
				username: String(cfg.username),
				prefix: cfg.prefix ? String(cfg.prefix) : undefined,
			};
		}

		// Key is NOT derived here — deriveKey uses payload salt on decrypt
		if (this.passphrase) {
			this.log(
				"info",
				"SyncEngine: encryption enabled (key derived per-payload)",
			);
		} else {
			this.log(
				"warn",
				"SyncEngine: encryption disabled (plaintext mode)",
			);
		}
	}

	/** Perform a full sync: upload local changes, download remote changes, resolve conflicts. */
	async sync(): Promise<SyncResult> {
		if (this.state === "syncing") {
			this.log("warn", "SyncEngine: sync already in progress, skipping");
			return {
				uploaded: 0,
				downloaded: 0,
				conflicts: 0,
				skipped: 0,
				errors: ["Sync already in progress"],
			};
		}

		this.state = "syncing";
		this._cancelled = false;
		this.log("info", "SyncEngine: starting sync...");

		const errors: string[] = [];
		let uploaded = 0,
			downloaded = 0,
			conflicts = 0;

		// T42a: Load sync index
		let index: SyncIndex | null = null;
		let serverSignature = "";
		if (this.indexManager && this.serverConfig) {
			serverSignature = SyncIndexManager.makeServerSignature(this.serverConfig);
			index = await this.indexManager.load(serverSignature);
			if (index) {
				this.log(
					"info",
					`SyncEngine: loaded sync index (${Object.keys(index.entries).length} entries)`,
				);
			} else {
				this.log("info", "SyncEngine: no valid sync index, starting fresh");
			}
		}

		// Track successfully synced sessions for index update
		const syncedLocals: ChatSession[] = [];
		const syncedRemotes: RemoteSessionMeta[] = [];

		try {
			const plan = await this.computeSyncPlan(index);

			// T42e: Dry run mode — compute plan but do not transfer anything
			if (this.dryRun) {
				this.log(
					"info",
					`Dry run: would upload ${plan.upload.length}, download ${plan.download.length}, skip ${plan.skipped}`,
				);

				for (const session of plan.upload) {
					if (this._cancelled) {
						errors.push("Cancelled by user");
						break;
					}
					this.progress?.({
						type: "session",
						id: session.id,
						direction: "upload",
						status: "start",
					});
					this.progress?.({
						type: "session",
						id: session.id,
						direction: "upload",
						status: "done",
					});
					uploaded++;
				}

				for (const meta of plan.download) {
					if (this._cancelled) {
						errors.push("Cancelled by user");
						break;
					}
					this.progress?.({
						type: "session",
						id: meta.id,
						direction: "download",
						status: "start",
					});
					this.progress?.({
						type: "session",
						id: meta.id,
						direction: "download",
						status: "done",
					});
					downloaded++;
				}

				for (const conflict of plan.conflicts) {
					if (this._cancelled) {
						errors.push("Cancelled by user");
						break;
					}
					this.progress?.({
						type: "session",
						id: conflict.local.id,
						direction: "conflict",
						status: "start",
					});
					this.progress?.({
						type: "session",
						id: conflict.local.id,
						direction: "conflict",
						status: "done",
					});
					conflicts++;
				}

				this.state = errors.length > 0 ? "error" : "idle";
				return {
					uploaded,
					downloaded,
					conflicts,
					skipped: plan.skipped,
					errors,
				};
			}

			// Upload local changes
			if (!this._cancelled) {
				let uploadCancelledReported = false;
				await runWithConcurrency(plan.upload, this.concurrencyLimit, async (session) => {
					if (this._cancelled) {
						if (!uploadCancelledReported) {
							uploadCancelledReported = true;
							this.log("warn", "SyncEngine: cancelled during upload");
							errors.push("Cancelled by user");
						}
						return;
					}
					try {
						const remoteMeta = await this.uploadSession(session);
						uploaded++;
						syncedLocals.push(session);
						if (remoteMeta) syncedRemotes.push(remoteMeta);
					} catch (err: any) {
						const msg = `Upload failed for ${session.id}: ${err.message}`;
						this.log("error", msg);
						errors.push(msg);
					}
				});
			}

			// Download remote changes (skip if cancelled)
			if (!this._cancelled) {
				let downloadCancelledReported = false;
				await runWithConcurrency(plan.download, this.concurrencyLimit, async (meta) => {
					if (this._cancelled) {
						if (!downloadCancelledReported) {
							downloadCancelledReported = true;
							this.log("warn", "SyncEngine: cancelled during download");
							errors.push("Cancelled by user");
						}
						return;
					}
					try {
						const localSession = await this.downloadSession(meta);
						downloaded++;
						if (localSession) syncedLocals.push(localSession);
						syncedRemotes.push(meta);
					} catch (err: any) {
						const msg = `Download failed for ${meta.id}: ${err.message}`;
						this.log("error", msg);
						errors.push(msg);
					}
				});
			}

			// Handle conflicts (skip if cancelled)
			if (!this._cancelled) {
				let conflictCancelledReported = false;
				await runWithConcurrency(plan.conflicts, this.concurrencyLimit, async (conflict) => {
					if (this._cancelled) {
						if (!conflictCancelledReported) {
							conflictCancelledReported = true;
							this.log("warn", "SyncEngine: cancelled during conflict resolution");
							errors.push("Cancelled by user");
						}
						return;
					}
					try {
						const resolved = await this.resolveConflict(
							conflict.local,
							conflict.remote,
						);
						conflicts++;
						if (resolved) {
							syncedLocals.push(resolved.local);
							syncedRemotes.push(resolved.remote);
						}
					} catch (err: any) {
						const msg = `Conflict resolution failed for ${conflict.local.id}: ${err.message}`;
						this.log("error", msg);
						errors.push(msg);
						await this.cache.markConflict(conflict.local.id);
					}
				});
			}

			const lastSyncTime = Date.now();
			await this.adapter.setLastSyncTime(lastSyncTime);
			await this.cache.setLastSyncTime(lastSyncTime);

			// T42a: Update sync index after successful operations
			if (!this._cancelled && this.indexManager && serverSignature) {
				try {
					const updatedIndex = await this.indexManager.patchIndex(
						index,
						syncedLocals,
						syncedRemotes,
						serverSignature,
					);
					await this.indexManager.save(updatedIndex);
					this.log(
						"info",
						`SyncEngine: updated sync index (${Object.keys(updatedIndex.entries).length} entries)`,
					);
				} catch (idxErr: any) {
					this.log("warn", `SyncEngine: failed to update sync index: ${idxErr.message}`);
				}
			}

			this.state = errors.length > 0 ? "error" : "idle";
			this.log(
				"info",
				`SyncEngine: sync complete. ↑${uploaded} ↓${downloaded} ⚡${conflicts} ⊘${plan.skipped}`,
			);

			return {
				uploaded,
				downloaded,
				conflicts,
				skipped: plan.skipped,
				errors,
			};
		} catch (err: any) {
			this.state = "error";
			const msg = `SyncEngine: fatal error: ${err.message}`;
			this.log("error", msg);
			errors.push(msg);
			return {
				uploaded: 0,
				downloaded: 0,
				conflicts: 0,
				skipped: 0,
				errors,
			};
		}
	}

	/** Compute the sync plan by comparing local and remote state.
	 *  @param index Optional sync index for skipping unchanged sessions (T42a). */
	async computeSyncPlan(index?: SyncIndex | null): Promise<SyncPlan> {
		const localSessions = await this.cache.getAllSessions();
		const remoteMetas = await this.adapter.listSessions();

		const remoteMap = new Map<string, RemoteSessionMeta>();
		for (const meta of remoteMetas) {
			remoteMap.set(meta.id, meta);
		}

		const upload: ChatSession[] = [];
		const download: RemoteSessionMeta[] = [];
		const conflicts: Array<{
			local: ChatSession;
			remote: RemoteSessionMeta;
		}> = [];
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
			} else {
				// T42a: Check sync index first — skip if both sides unchanged since last sync
				if (
					this.indexManager &&
					index &&
					this.indexManager.isUnchanged(local, remote, index)
				) {
					skipped++;
					continue;
				}

				if (local._syncStatus === "synced") {
					// Both exist, local unchanged since last sync
					// Use ETag comparison if available (most reliable), fallback to timestamp
					const etagChanged =
						local._etag && remote.etag && local._etag !== remote.etag;
					const timestampChanged =
						remote.modifiedAt > (local._remoteModifiedAt ?? 0);
					if (etagChanged || (!local._etag && timestampChanged)) {
						// Remote changed: download
						download.push(remote);
					} else {
						skipped++;
					}
				} else {
					// Local has pending changes
					const etagChanged =
						local._etag && remote.etag && local._etag !== remote.etag;
					const timestampChanged =
						remote.modifiedAt > (local._remoteModifiedAt ?? 0);
					if (etagChanged || (!local._etag && timestampChanged)) {
						// Both changed: conflict
						conflicts.push({ local, remote });
					} else {
						// Local newer: upload
						upload.push(local);
					}
				}
			}
		}

		// Remaining remotes are not in local cache: download all
		for (const meta of remoteMap.values()) {
			download.push(meta);
		}

		return { upload, download, conflicts, skipped };
	}

	/** Rebuild sync state using the user's chosen rule for conflicts. */
	async rebuildIndex(choice: "remote" | "local" | "compare"): Promise<SyncResult> {
		if (choice === "compare") {
			const previousStrategy = this.conflictStrategy;
			this.conflictStrategy = "manual";
			try {
				return await this.sync();
			} finally {
				this.conflictStrategy = previousStrategy;
			}
			return { uploaded: 0, downloaded: 0, conflicts: 0, skipped: 0, errors: [] };
		}

		if (this.state === "syncing") throw new Error("A sync is already running");
		this.state = "syncing";
		try {
			const locals = await this.cache.getAllSessions();
			const remotes = await this.adapter.listSessions();
			const remoteById = new Map(remotes.map((remote) => [remote.id, remote]));
			const plan = await this.computeSyncPlan();
			const targets = new Set(plan.conflicts.map((item) => item.local.id));
			let uploaded = 0;
			let downloaded = 0;

			if (choice === "remote") {
				for (const remote of remotes) {
					if (targets.has(remote.id) || !locals.some((local) => local.id === remote.id)) {
						await this.downloadSession(remote);
						downloaded++;
					}
				}
			} else {
				for (const local of locals) {
					if (targets.has(local.id) || !remoteById.has(local.id)) {
						await this.uploadSession(local);
						uploaded++;
					}
				}
			}

			if (this.indexManager && this.serverConfig) {
				const signature = SyncIndexManager.makeServerSignature(this.serverConfig);
				const refreshedLocals = await this.cache.getAllSessions();
				const refreshedRemotes = await this.adapter.listSessions();
				await this.indexManager.save(
					await this.indexManager.buildIndex(refreshedLocals, refreshedRemotes, signature),
				);
			}
			return { uploaded, downloaded, conflicts: plan.conflicts.length, skipped: plan.skipped, errors: [] };
		} finally {
			this.state = "idle";
		}
	}

	/** Upload a single session to remote storage.
	 *  @returns Remote session metadata if upload succeeded. */
	private async uploadSession(session: ChatSession): Promise<RemoteSessionMeta | undefined> {
		this.progress?.({
			type: "session",
			id: session.id,
			direction: "upload",
			status: "start",
		});
		const plaintext = JSON.stringify(session);
		const sessionChecksum = await checksum(plaintext);
		const encrypted = await this.crypto.encrypt(plaintext);

		const payload: EncryptedSession = {
			id: session.id,
			ciphertext: encrypted.ciphertext,
			checksum: sessionChecksum,
			modifiedAt: session.updatedAt,
			version:
				((session as unknown as Record<string, unknown>)
					._version as number) ?? 1,
		};
		// Only include encryption fields if actually encrypted
		if (!encrypted.unencrypted) {
			payload.iv = encrypted.iv;
			payload.tag = encrypted.tag;
			payload.salt = encrypted.salt;
		}

		const result = await this.adapter.putSession(payload);
		await this.cache.markSynced(session.id, session.updatedAt, result.etag);
		this.progress?.({
			type: "session",
			id: session.id,
			direction: "upload",
			status: "done",
		});
		this.log("debug", `SyncEngine: uploaded ${session.id}`);

		return {
			id: session.id,
			modifiedAt: result.modifiedAt ?? session.updatedAt,
			etag: result.etag,
			size: new TextEncoder().encode(JSON.stringify(payload)).length,
		};
	}

	/** Download and decrypt a single session from remote storage.
	 *  @returns The downloaded local session if successful. */
	private async downloadSession(meta: RemoteSessionMeta): Promise<ChatSession | undefined> {
		this.progress?.({
			type: "session",
			id: meta.id,
			direction: "download",
			status: "start",
		});
		const encrypted = await this.adapter.getSession(meta.id);
		if (!encrypted) {
			this.progress?.({
				type: "session",
				id: meta.id,
				direction: "download",
				status: "error",
				error: "Disappeared during sync",
			});
			this.log(
				"warn",
				`SyncEngine: remote session ${meta.id} disappeared during sync`,
			);
			return undefined;
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
			this.progress?.({
				type: "session",
				id: meta.id,
				direction: "download",
				status: "error",
				error: "Checksum mismatch",
			});
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
		this.progress?.({
			type: "session",
			id: meta.id,
			direction: "download",
			status: "done",
		});
		this.log("debug", `SyncEngine: downloaded ${meta.id}`);

		return cached;
	}

	/** Resolve a conflict between local and remote versions.
	 *  @returns The resolved local and remote metadata if a sync occurred. */
	private async resolveConflict(
		local: ChatSession,
		remote: RemoteSessionMeta,
	): Promise<{ local: ChatSession; remote: RemoteSessionMeta } | undefined> {
		switch (this.conflictStrategy) {
			case "last-write-wins": {
				if (local.updatedAt > remote.modifiedAt) {
					this.log("info", `Conflict: local wins for ${local.id}`);
					const result = await this.uploadSession(local);
					if (result) return { local, remote: result };
				} else {
					this.log("info", `Conflict: remote wins for ${local.id}`);
					const downloaded = await this.downloadSession(remote);
					if (downloaded) return { local: downloaded, remote };
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
					const plaintext = await this.crypto.decrypt(
						payload,
						this.passphrase,
					);
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

					await this.cache.markSynced(
						newSession.id,
						remote.modifiedAt,
						remote.etag,
					);
				}
				// Keep local as-is (re-mark as pending so it uploads)
				await this.cache.putSession(local);
				break;
			}
			case "manual": {
				this.log(
					"info",
					`Conflict: queuing manual resolution for ${local.id}`,
				);
				await this.cache.markConflict(local.id);
				break;
			}
		}
		return undefined;
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
		this.log(
			"info",
			`SyncEngine: cache populated with ${sessions.length} sessions`,
		);
	}

	/** Set a log callback for live log streaming (e.g. to sidebar). */
	setLogHandler(handler: (level: string, msg: string) => void): void {
		this.logHandler = handler;
	}

	/** Set a progress callback for per-session sync events. */
	setProgressHandler(
		handler: (event: {
			type: string;
			id: string;
			direction?: "upload" | "download" | "conflict";
			status: "start" | "done" | "error";
			error?: string;
		}) => void,
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
		this.logHandler?.(level, msg);
	}
}
