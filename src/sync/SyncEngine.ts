import type { ChatSession } from "../types";
import type {
	StorageAdapter,
	EncryptedSession,
	RemoteSessionMeta,
	SyncResult,
	SyncPlan,
	CachedSession,
} from "./StorageAdapter";
import { estimateSessionBytes } from "./StorageAdapter";
import { LocalCache } from "./LocalCache";
import { EncryptionLayer, checksum } from "./EncryptionLayer";
import { SyncIndexManager } from "./SyncIndexManager";
import { runWithConcurrency } from "./ConcurrencyLimiter";
import type { SyncIndex } from "./SyncIndex";
import {
	SYNC_MANIFEST_PATH,
	parseSyncManifest,
	type SyncManifest,
} from "./SyncManifest";
import { DurableSyncRetryStore } from "./SyncRetryStore";
import type { SyncEngineProgressEvent } from "./SyncProgress";

export type SyncState = "idle" | "syncing" | "error" | "locked";
export type ConflictStrategy = "last-write-wins" | "keep-both" | "manual";
const SESSION_DELETIONS_PATH = "session-deletions.json";

/** T46: Read-only comparison of local and remote stores (SyncEngine.examine). */
export interface SyncExamination {
	/** Sessions currently in the local sync cache. */
	localCount: number;
	/** Sessions currently listed on the remote store. */
	remoteCount: number;
	/** Sessions a sync would upload, with display titles. */
	upload: Array<{ id: string; title: string }>;
	/** Sessions a sync would download (remote-only or unverified locals). */
	download: Array<{ id: string; title: string }>;
	/** Both-changed pairs a sync would resolve per conflict strategy. */
	conflicts: Array<{ id: string; title: string }>;
	/** Sessions identical on both sides — no transfer needed. */
	unchanged: number;
	/** Sessions explicitly deleted locally and pending remote deletion. */
	deleteRemote?: Array<{ id: string; title: string }>;
	/** Sessions deleted on another device and pending local removal. */
	deleteLocal?: string[];
	uploadBytes: number;
	downloadBytes: number;
}

export interface SyncEngineConfig {
	adapter: StorageAdapter;
	cache: LocalCache;
	crypto: EncryptionLayer;
	passphrase: string;
	conflictStrategy?: ConflictStrategy;
	logger?: { log(level: string, msg: string): void };
	progress?: (event: SyncEngineProgressEvent) => void;
	/** Called when a session is downloaded from remote. Implementor should save to app storage. */
	onSessionDownloaded?: (session: ChatSession) => Promise<void>;
	/** Called when a deletion tombstone arrives from another device. */
	onSessionDeleted?: (sessionId: string) => Promise<void>;
	/** Optional sync index manager for skipping unchanged sessions (T42a). */
	indexManager?: SyncIndexManager;
	/** Max parallel upload/download operations (T42c). */
	concurrencyLimit?: number;
	/** Permit sync to remove sessions inferred as deleted. Defaults to false. */
	allowDeletions?: boolean;
	/** Dry run mode: compute plan but do not transfer anything (T42e). */
	dryRun?: boolean;
	/** Complete identity used to isolate cache, index, and retry state. */
	identity?: string;
	retryStore?: DurableSyncRetryStore;
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
	private progress?: (event: SyncEngineProgressEvent) => void;
	private logHandler?: (level: string, msg: string) => void;
	private onSessionDownloaded?: (session: ChatSession) => Promise<void>;
	private onSessionDeleted?: (sessionId: string) => Promise<void>;
	private _cancelled = false;
	private indexManager?: SyncIndexManager;
	private serverConfig?: {
		url: string;
		username: string;
		prefix?: string;
		identity?: string;
	};
	private identity?: string;
	private retryStore?: DurableSyncRetryStore;
	private concurrencyLimit: number;
	private allowDeletions: boolean;
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
		this.onSessionDeleted = config.onSessionDeleted;
		this.indexManager = config.indexManager;
		this.concurrencyLimit = config.concurrencyLimit ?? 3;
		this.allowDeletions = config.allowDeletions ?? false;
		this.dryRun = config.dryRun ?? false;
		this.identity = config.identity;
		this.retryStore = config.retryStore;
	}

	get currentState(): SyncState {
		return this.state;
	}

	/** Expose the configured backend to the plugin-data sync layer. */
	get storageAdapter(): StorageAdapter {
		return this.adapter;
	}

	/** Reuse the same encryption settings for sessions and plugin files. */
	get encryptionLayer(): EncryptionLayer {
		return this.crypto;
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
		this.crypto.setPassphrase(this.passphrase);

		// Store normalized server config for sync index signature (T42a)
		const cfg = config as Record<string, unknown>;
		if (cfg.url && cfg.username) {
			this.serverConfig = {
				url: String(cfg.url),
				username: String(cfg.username),
				prefix: cfg.prefix ? String(cfg.prefix) : undefined,
				identity: this.identity,
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
	async sync(
		direction?: "both" | "upload" | "download",
	): Promise<SyncResult> {
		if (this.state === "syncing") {
			this.log("warn", "SyncEngine: sync already in progress, skipping");
			return {
				uploaded: 0,
				downloaded: 0,
				conflicts: 0,
				skipped: 0,
				errors: ["Sync already in progress"],
				status: "failed",
			};
		}

		this.state = "syncing";
		this._cancelled = false;
		this.log("info", "SyncEngine: starting sync...");

		const errors: string[] = [];
		let uploaded = 0,
			downloaded = 0,
			conflicts = 0,
			deleted = 0;

		// T42a: Load sync index
		const { index, serverSignature } = await this._loadIndex();
		const deletionLedger = await this.loadSessionDeletions();

		// Track successfully synced sessions for index update
		const syncedLocals: ChatSession[] = [];
		const syncedRemotes: RemoteSessionMeta[] = [];
		const successfulDeletionIds = new Set<string>();

		try {
			this.progress?.({
				type: "stage",
				id: "sync:plan",
				phase: "planning",
				stage: "Building sync plan",
				status: "start",
				indeterminate: true,
			});
			let plan = await this.computeSyncPlan(
				index,
				new Set(deletionLedger.keys()),
			);

			// T43: Apply direction filter
			if (direction === "upload") {
				plan = {
					...plan,
					download: [],
					conflicts: [],
					deleteLocal: [],
				};
			} else if (direction === "download") {
				plan = { ...plan, upload: [], conflicts: [], deleteRemote: [] };
			}
			// T42g: recompute planned bytes after direction filtering
			plan = {
				...plan,
				uploadBytes: plan.upload.reduce(
					(n, s) => n + estimateSessionBytes(s),
					0,
				),
				downloadBytes: plan.download.reduce(
					(n, m) => n + (m.size ?? 0),
					0,
				),
			};
			this.progress?.({
				type: "stage",
				id: "sync:plan",
				phase: "planning",
				stage: `Plan ready: ↑${plan.upload.length} ↓${plan.download.length} ⚡${plan.conflicts.length} ⊘${plan.skipped}`,
				status: "done",
				total:
					plan.upload.length +
					plan.download.length +
					plan.conflicts.length +
					plan.deleteRemote.length +
					plan.deleteLocal.length,
				completed: 0,
				planBytes: {
					upload: plan.uploadBytes,
					download: plan.downloadBytes,
				},
			});

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
						bytes: estimateSessionBytes(session),
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
						bytes: meta.size ?? 0,
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

				for (const meta of plan.deleteRemote) {
					this.progress?.({
						type: "session",
						id: meta.id,
						direction: "delete",
						status: "start",
					});
					this.progress?.({
						type: "session",
						id: meta.id,
						direction: "delete",
						status: "done",
					});
					deleted++;
				}

				for (const id of plan.deleteLocal) {
					this.progress?.({
						type: "session",
						id,
						direction: "delete",
						status: "start",
					});
					this.progress?.({
						type: "session",
						id,
						direction: "delete",
						status: "done",
					});
					deleted++;
				}

				this.state = errors.length > 0 ? "error" : "idle";
				return {
					uploaded,
					downloaded,
					deleted,
					conflicts,
					skipped: plan.skipped,
					errors,
					status: errors.length > 0 ? "partial" : "complete",
					retryable: await this.retryStore?.list(),
				};
			}

			// Apply explicit local deletions to the remote store before any
			// uploads. A shared tombstone prevents another device from restoring
			// the deleted session on its next sync.
			if (!this._cancelled && plan.deleteRemote.length > 0) {
				for (const meta of plan.deleteRemote) {
					try {
						this.progress?.({
							type: "session",
							id: meta.id,
							direction: "delete",
							status: "start",
						});
						await this.adapter.deleteSession(meta.id);
						deletionLedger.set(meta.id, Date.now());
						successfulDeletionIds.add(meta.id);
						deleted++;
						this.progress?.({
							type: "session",
							id: meta.id,
							direction: "delete",
							status: "done",
						});
					} catch (err: any) {
						const msg = `Delete failed for ${meta.id}: ${err.message}`;
						errors.push(msg);
						this.progress?.({
							type: "session",
							id: meta.id,
							direction: "delete",
							status: "error",
							error: msg,
						});
					}
				}
				if (deletionLedger.size > 0) {
					await this.saveSessionDeletions(deletionLedger);
				}
			}

			if (!this._cancelled && plan.deleteLocal.length > 0) {
				for (const id of plan.deleteLocal) {
					try {
						await this.onSessionDeleted?.(id);
						await this.cache.deleteSession(id);
						successfulDeletionIds.add(id);
						deleted++;
						this.progress?.({
							type: "session",
							id,
							direction: "delete",
							status: "done",
						});
					} catch (err: any) {
						const msg = `Local delete failed for ${id}: ${err.message}`;
						errors.push(msg);
						this.progress?.({
							type: "session",
							id,
							direction: "delete",
							status: "error",
							error: msg,
						});
					}
				}
			}

			// Upload local changes
			if (!this._cancelled) {
				let uploadCancelledReported = false;
				await runWithConcurrency(
					plan.upload,
					this.concurrencyLimit,
					async (session) => {
						if (this._cancelled) {
							if (!uploadCancelledReported) {
								uploadCancelledReported = true;
								this.log(
									"warn",
									"SyncEngine: cancelled during upload",
								);
								errors.push("Cancelled by user");
							}
							return;
						}
						try {
							const remoteMeta =
								await this.uploadSession(session);
							uploaded++;
							syncedLocals.push(session);
							if (remoteMeta) syncedRemotes.push(remoteMeta);
						} catch (err: any) {
							const msg = `Upload failed for ${session.id}: ${err.message}`;
							this.log("error", msg);
							errors.push(msg);
							await this.retryStore?.record(
								"chat-session",
								session.id,
								msg,
							);
						}
					},
				);
			}

			// Download remote changes (skip if cancelled)
			if (!this._cancelled) {
				let downloadCancelledReported = false;
				await runWithConcurrency(
					plan.download,
					this.concurrencyLimit,
					async (meta) => {
						if (this._cancelled) {
							if (!downloadCancelledReported) {
								downloadCancelledReported = true;
								this.log(
									"warn",
									"SyncEngine: cancelled during download",
								);
								errors.push("Cancelled by user");
							}
							return;
						}
						try {
							const localSession =
								await this.downloadSession(meta);
							downloaded++;
							if (localSession) syncedLocals.push(localSession);
							syncedRemotes.push(meta);
						} catch (err: any) {
							const msg = `Download failed for ${meta.id}: ${err.message}`;
							this.log("error", msg);
							errors.push(msg);
							await this.retryStore?.record(
								"chat-session",
								meta.id,
								msg,
							);
						}
					},
				);
			}

			// Handle conflicts (skip if cancelled)
			if (!this._cancelled) {
				let conflictCancelledReported = false;
				await runWithConcurrency(
					plan.conflicts,
					this.concurrencyLimit,
					async (conflict) => {
						if (this._cancelled) {
							if (!conflictCancelledReported) {
								conflictCancelledReported = true;
								this.log(
									"warn",
									"SyncEngine: cancelled during conflict resolution",
								);
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
							await this.retryStore?.record(
								"chat-session",
								conflict.local.id,
								msg,
							);
							await this.cache.markConflict(conflict.local.id);
						}
					},
				);
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
					for (const id of successfulDeletionIds) {
						delete updatedIndex.entries[id];
					}
					await this.indexManager.save(updatedIndex);
					this.log(
						"info",
						`SyncEngine: updated sync index (${Object.keys(updatedIndex.entries).length} entries)`,
					);
				} catch (idxErr: any) {
					this.log(
						"warn",
						`SyncEngine: failed to update sync index: ${idxErr.message}`,
					);
				}
			}

			if (!this._cancelled) {
				try {
					const manifestLocals = await this.cache.getAllSessions();
					const manifestRemotes = await this.adapter.listSessions();
					await this.writeSessionManifest(
						manifestLocals,
						manifestRemotes,
					);
				} catch (manifestErr: any) {
					this.log(
						"warn",
						`SyncEngine: failed to update session manifest: ${manifestErr.message}`,
					);
				}
			}

			this.state = errors.length > 0 ? "error" : "idle";
			this.log(
				"info",
				`SyncEngine: sync complete. ↑${uploaded} ↓${downloaded} ⌫${deleted} ⚡${conflicts} ⊘${plan.skipped}`,
			);

			return {
				uploaded,
				downloaded,
				deleted,
				conflicts,
				skipped: plan.skipped,
				errors,
				status:
					errors.length === 0
						? "complete"
						: uploaded + downloaded + conflicts > 0 || deleted > 0
							? "partial"
							: "failed",
				retryable: await this.retryStore?.list(),
			};
		} catch (err: any) {
			this.state = "error";
			const msg = `SyncEngine: fatal error: ${err.message}`;
			this.log("error", msg);
			errors.push(msg);
			return {
				uploaded: 0,
				downloaded: 0,
				deleted: 0,
				conflicts: 0,
				skipped: 0,
				errors,
				status: "failed",
				retryable: await this.retryStore?.list(),
			};
		}
	}

	/** T42a: Load the persisted sync index (shared by sync() and examine()). */
	private async _loadIndex(): Promise<{
		index: SyncIndex | null;
		serverSignature: string;
	}> {
		let index: SyncIndex | null = null;
		let serverSignature = "";
		if (this.indexManager && this.serverConfig) {
			serverSignature = SyncIndexManager.makeServerSignature(
				this.serverConfig,
			);
			index = await this.indexManager.load(serverSignature);
			if (index) {
				this.log(
					"info",
					`SyncEngine: loaded sync index (${Object.keys(index.entries).length} entries)`,
				);
			} else {
				this.log(
					"info",
					"SyncEngine: no valid sync index, starting fresh",
				);
			}
		}
		return { index, serverSignature };
	}

	/** T46: Compare local and remote stores without transferring anything.
	 *  Mirrors sync()'s plan phase — same index load, same direction filter —
	 *  so the reported counts and lists match what a real run would do. */
	async examine(
		direction?: "both" | "upload" | "download",
	): Promise<SyncExamination> {
		if (this.state === "syncing") {
			throw new Error("Sync in progress");
		}
		const { index } = await this._loadIndex();
		const deletionLedger = await this.loadSessionDeletions();
		let plan = await this.computeSyncPlan(
			index,
			new Set(deletionLedger.keys()),
		);
		// T43: same direction filter as sync()
		if (direction === "upload") {
			plan = { ...plan, download: [], conflicts: [], deleteLocal: [] };
		} else if (direction === "download") {
			plan = { ...plan, upload: [], conflicts: [], deleteRemote: [] };
		}
		plan = {
			...plan,
			uploadBytes: plan.upload.reduce(
				(n, s) => n + estimateSessionBytes(s),
				0,
			),
			downloadBytes: plan.download.reduce((n, m) => n + (m.size ?? 0), 0),
		};
		const locals = await this.cache.getAllSessions();
		const byId = new Map<string, CachedSession>();
		for (const s of locals) byId.set(s.id, s);
		const manifest = await this.loadSessionManifest();
		const titleFor = (id: string): string =>
			byId.get(id)?.title?.trim() ||
			manifest?.entries[id]?.title?.trim() ||
			id.slice(0, 8);
		const remoteMetas = (await this.adapter.listSessions()).filter(
			(meta) => !deletionLedger.has(meta.id),
		);
		return {
			localCount: locals.length,
			remoteCount: remoteMetas.length,
			upload: plan.upload.map((s) => ({
				id: s.id,
				title: s.title?.trim() || s.id.slice(0, 8),
			})),
			download: plan.download.map((m) => ({
				id: m.id,
				title: titleFor(m.id),
			})),
			conflicts: plan.conflicts.map((c) => ({
				id: c.local.id,
				title: c.local.title?.trim() || c.local.id.slice(0, 8),
			})),
			deleteRemote: plan.deleteRemote.map((meta) => ({
				id: meta.id,
				title: titleFor(meta.id),
			})),
			deleteLocal: plan.deleteLocal,
			unchanged: plan.skipped,
			uploadBytes: plan.uploadBytes,
			downloadBytes: plan.downloadBytes,
		};
	}

	/** Rebuild the local sync index from the current stores without transfers. */
	async rebuildIndexFromCurrentState(): Promise<{
		localCount: number;
		remoteCount: number;
	}> {
		if (this.state === "syncing") {
			throw new Error("Sync in progress");
		}
		if (!this.indexManager || !this.serverConfig) {
			throw new Error("Sync index is not configured");
		}

		const locals = await this.cache.getAllSessions();
		const remotes = await this.adapter.listSessions();
		const serverSignature = SyncIndexManager.makeServerSignature(
			this.serverConfig,
		);
		const rebuilt = await this.indexManager.buildIndex(
			locals,
			remotes,
			serverSignature,
		);
		await this.indexManager.save(rebuilt);
		await this.writeSessionManifest(locals, remotes, true);
		this.log(
			"info",
			`SyncEngine: rebuilt sync index (${Object.keys(rebuilt.entries).length} entries)`,
		);
		return { localCount: locals.length, remoteCount: remotes.length };
	}

	/** Return titles known locally or in the plain remote metadata manifest. */
	async getKnownSessionTitles(): Promise<Map<string, string>> {
		const titles = new Map<string, string>();
		const locals = await this.cache.getAllSessions();
		for (const session of locals) {
			if (session.title?.trim())
				titles.set(session.id, session.title.trim());
		}
		const manifest = await this.loadSessionManifest();
		for (const [id, entry] of Object.entries(manifest?.entries ?? {})) {
			if (entry.title?.trim() && !titles.has(id)) {
				titles.set(id, entry.title.trim());
			}
		}
		return titles;
	}

	/** Compute the sync plan by comparing local and remote state.
	 *  @param index Optional sync index for skipping unchanged sessions (T42a). */
	async computeSyncPlan(
		index?: SyncIndex | null,
		deletedIds = new Set<string>(),
	): Promise<SyncPlan> {
		const localSessions = await this.cache.getAllSessions();
		const remoteMetas = (await this.adapter.listSessions()).filter(
			(meta) => !deletedIds.has(meta.id),
		);
		return this.computeSyncPlanFromState(
			localSessions,
			remoteMetas,
			index,
			deletedIds,
		);
	}

	/** Compute a plan from already-loaded state so rebuild does not rescan. */
	private computeSyncPlanFromState(
		localSessions: CachedSession[],
		remoteMetas: RemoteSessionMeta[],
		index?: SyncIndex | null,
		deletedIds = new Set<string>(),
	): SyncPlan {
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
		const deleteRemote: RemoteSessionMeta[] = [];
		const deleteLocal: string[] = [];
		let skipped = 0;

		for (const local of localSessions) {
			if (deletedIds.has(local.id)) {
				if (this.allowDeletions) {
					deleteLocal.push(local.id);
				} else {
					skipped++;
				}
				continue;
			}
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

				// Unverified local: message content could not be loaded
				// (hydrated === false — missing/corrupt message file, failed
				// hydrate). Metadata may match remote exactly while the real
				// data is gone, so the only complete, trustworthy copy is
				// remote. Re-download to self-repair; never upload a stub.
				if (local.hydrated === false) {
					download.push(remote);
					continue;
				}

				if (local._syncStatus === "synced") {
					// Both exist, local unchanged since last sync
					// Use ETag comparison if available (most reliable), fallback to timestamp
					const etagChanged =
						local._etag &&
						remote.etag &&
						local._etag !== remote.etag;
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
						local._etag &&
						remote.etag &&
						local._etag !== remote.etag;
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

		// An index entry with no live local session is an explicit local
		// deletion. Only a previously synced ID is eligible; a new device with
		// no index must download remote sessions normally.
		if (index && this.allowDeletions) {
			const liveIds = new Set(localSessions.map((session) => session.id));
			for (const id of Object.keys(index.entries)) {
				if (liveIds.has(id) || deletedIds.has(id)) continue;
				const remote = remoteMap.get(id);
				if (remote) {
					deleteRemote.push(remote);
					remoteMap.delete(id);
				}
			}
		}

		// Remaining remotes are not in local cache: download all
		for (const meta of remoteMap.values()) {
			download.push(meta);
		}

		return {
			upload,
			download,
			conflicts,
			deleteRemote,
			deleteLocal,
			skipped,
			uploadBytes: upload.reduce(
				(n, s) => n + estimateSessionBytes(s),
				0,
			),
			downloadBytes: download.reduce((n, m) => n + (m.size ?? 0), 0),
		};
	}

	/** Rebuild sync state using the user's chosen rule for conflicts. */
	async rebuildIndex(
		choice: "remote" | "local" | "compare",
	): Promise<SyncResult> {
		if (choice === "compare") {
			this.progress?.({
				type: "stage",
				id: "rebuild:compare",
				phase: "rebuilding",
				stage: "Comparing local and remote copies",
				status: "start",
				indeterminate: true,
			});
			const previousStrategy = this.conflictStrategy;
			this.conflictStrategy = "manual";
			try {
				const result = await this.sync();
				this.progress?.({
					type: "stage",
					id: "rebuild:compare",
					phase: "complete",
					stage: "Comparison complete",
					status: "done",
					total:
						result.uploaded +
						result.downloaded +
						result.conflicts +
						result.skipped,
					completed:
						result.uploaded +
						result.downloaded +
						result.conflicts +
						result.skipped,
				});
				return result;
			} finally {
				this.conflictStrategy = previousStrategy;
			}
		}

		if (this.state === "syncing")
			throw new Error("A sync is already running");
		this.state = "syncing";
		this._cancelled = false;
		try {
			this.progress?.({
				type: "stage",
				id: "rebuild:scan",
				phase: "rebuilding",
				stage: "Reading local and remote sessions",
				status: "start",
				indeterminate: true,
			});
			const locals = await this.cache.getAllSessions();
			const remotes = await this.adapter.listSessions();
			const remoteById = new Map(
				remotes.map((remote) => [remote.id, remote]),
			);
			const localById = new Map(locals.map((local) => [local.id, local]));
			const plan = this.computeSyncPlanFromState(locals, remotes);
			const conflictIds = new Set(
				plan.conflicts.map((item) => item.local.id),
			);
			const downloadTargets =
				choice === "remote"
					? remotes.filter(
							(remote) =>
								conflictIds.has(remote.id) ||
								!localById.has(remote.id) ||
								// Local copies whose content can't be verified carry
								// no trustworthy data — remote is the only complete
								// copy and must replace them, not be skipped.
								localById.get(remote.id)!.hydrated === false,
						)
					: [];
			const uploadTargets =
				choice === "local"
					? locals.filter(
							(local) =>
								conflictIds.has(local.id) ||
								!remoteById.has(local.id),
						)
					: [];
			const transferTotal = uploadTargets.length + downloadTargets.length;
			this.progress?.({
				type: "stage",
				id: "rebuild:scan",
				phase: "rebuilding",
				stage: "Rebuild plan ready",
				status: "done",
				total: transferTotal,
				completed: 0,
			});
			let uploaded = 0;
			let downloaded = 0;
			const errors: string[] = [];

			await runWithConcurrency(
				downloadTargets,
				this.concurrencyLimit,
				async (remote) => {
					if (this._cancelled) return;
					try {
						if (await this.downloadSession(remote)) downloaded++;
						else errors.push(`Download failed for ${remote.id}`);
					} catch (error: any) {
						errors.push(
							`Download failed for ${remote.id}: ${error.message}`,
						);
					}
				},
			);
			await runWithConcurrency(
				uploadTargets,
				this.concurrencyLimit,
				async (local) => {
					if (this._cancelled) return;
					try {
						if (await this.uploadSession(local)) uploaded++;
					} catch (error: any) {
						errors.push(
							`Upload failed for ${local.id}: ${error.message}`,
						);
					}
				},
			);

			if (!this._cancelled && this.indexManager && this.serverConfig) {
				this.progress?.({
					type: "stage",
					id: "rebuild:index",
					phase: "rebuilding",
					stage: "Writing rebuilt sync index",
					status: "start",
					total: transferTotal,
					completed: transferTotal,
				});
				const signature = SyncIndexManager.makeServerSignature(
					this.serverConfig,
				);
				const refreshedLocals = await this.cache.getAllSessions();
				const refreshedRemotes = await this.adapter.listSessions();
				await this.indexManager.save(
					await this.indexManager.buildIndex(
						refreshedLocals,
						refreshedRemotes,
						signature,
					),
				);
			}
			this.progress?.({
				type: "stage",
				id: "rebuild:complete",
				phase:
					this._cancelled || errors.length > 0 ? "error" : "complete",
				stage: this._cancelled
					? "Rebuild cancelled"
					: "Rebuild complete",
				status: this._cancelled || errors.length > 0 ? "error" : "done",
				total: transferTotal,
				completed: transferTotal,
				error: errors[0],
			});
			return {
				uploaded,
				downloaded,
				conflicts: plan.conflicts.length,
				skipped: plan.skipped,
				errors: this._cancelled
					? ["Cancelled by user", ...errors]
					: errors,
				status:
					this._cancelled || errors.length > 0
						? uploaded + downloaded > 0
							? "partial"
							: "failed"
						: "complete",
			};
		} finally {
			this.state = "idle";
		}
	}

	/** Get the current progress handler (for save/restore patterns). */
	getProgressHandler():
		| ((event: SyncEngineProgressEvent) => void)
		| undefined {
		return this.progress;
	}

	/** Upload a single session to remote storage.
	 *  @returns Remote session metadata if upload succeeded. */
	private async uploadSession(
		session: ChatSession,
	): Promise<RemoteSessionMeta | undefined> {
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

		const payloadBytes = new TextEncoder().encode(
			JSON.stringify(payload),
		).length;
		const result = await this.adapter.putSession(payload);
		await this.cache.markSynced(session.id, session.updatedAt, result.etag);
		await this.retryStore?.clear("chat-session", session.id);
		this.progress?.({
			type: "session",
			id: session.id,
			direction: "upload",
			status: "done",
			bytes: payloadBytes,
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
	private async downloadSession(
		meta: RemoteSessionMeta,
	): Promise<ChatSession | undefined> {
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
			// This copy carries the full decrypted remote payload — mark it
			// hydrated so the unverified-local guard doesn't re-queue it.
			hydrated: true,
			// Mark as synced since it came from remote
		};

		await this.cache.putSession(cached);

		// Persist to app storage BEFORE marking synced so failures are retryable
		if (this.onSessionDownloaded) {
			await this.onSessionDownloaded(cached);
		}

		await this.cache.markSynced(meta.id, meta.modifiedAt, meta.etag);
		await this.retryStore?.clear("chat-session", meta.id);
		this.progress?.({
			type: "session",
			id: meta.id,
			direction: "download",
			status: "done",
			bytes: meta.size ?? 0,
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
	 *  Preserves synced status for sessions that haven't changed.
	 *  Evicts cache entries whose session no longer exists in live storage. */
	async populateCache(sessions: ChatSession[]): Promise<void> {
		// Evict stale entries: anything in the cache that is not in the
		// live storage list has been deleted/pruned and must not be synced.
		const liveIds = new Set(sessions.map((s) => s.id));
		const cached = await this.cache.getAllSessions();
		for (const entry of cached) {
			if (!liveIds.has(entry.id)) {
				await this.cache.deleteSession(entry.id);
				this.log(
					"info",
					`SyncEngine: evicted stale cache entry ${entry.id} (not in live storage)`,
				);
			}
		}

		for (const session of sessions) {
			if (session.hydrated === false) {
				// The app store could not supply this session's real content
				// (missing/corrupt message file). A cached "synced" copy is
				// unverifiable — evict it so the plan treats the session as
				// remote-only and re-downloads. Never putSession() the stub:
				// a pending stub would upload and clobber the remote copy.
				const existing = await this.cache.getSession(session.id);
				if (existing) {
					await this.cache.deleteSession(session.id);
					this.log(
						"warn",
						`SyncEngine: evicted unverified cache entry for ${session.id} (hydrate failed)`,
					);
				}
				continue;
			}
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

	/** Read the shared chat-session deletion tombstones. */
	private async loadSessionDeletions(): Promise<Map<string, number>> {
		try {
			const raw = await this.adapter.readText(SESSION_DELETIONS_PATH);
			if (!raw) return new Map();
			const parsed = JSON.parse(raw) as Record<string, unknown>;
			return new Map(
				Object.entries(parsed).flatMap(([id, value]) =>
					typeof value === "number" && Number.isFinite(value)
						? [[id, value] as [string, number]]
						: [],
				),
			);
		} catch (err) {
			this.log(
				"warn",
				`SyncEngine: failed to read deletion ledger: ${String(err)}`,
			);
			return new Map();
		}
	}

	/** Persist the shared chat-session deletion tombstones atomically. */
	private async saveSessionDeletions(
		deletions: Map<string, number>,
	): Promise<void> {
		const entries = [...deletions.entries()]
			.sort((a, b) => a[1] - b[1])
			.slice(-2000);
		await this.adapter.writeTextAtomic(
			SESSION_DELETIONS_PATH,
			JSON.stringify(Object.fromEntries(entries)),
			"application/json",
		);
	}

	/** Read the plain remote metadata manifest, if one exists. */
	private async loadSessionManifest(): Promise<SyncManifest | null> {
		return parseSyncManifest(
			await this.adapter.readText(SYNC_MANIFEST_PATH),
		);
	}

	/**
	 * Persist titles and transport metadata separately from session payloads.
	 * Existing manifest titles are retained for remote-only sessions. Rebuild
	 * index explicitly opts into a one-time plaintext payload scan to seed
	 * titles for older remotes that predate the manifest.
	 */
	private async writeSessionManifest(
		locals: ChatSession[],
		remotes: RemoteSessionMeta[],
		seedMissingTitles = false,
	): Promise<void> {
		const previous = await this.loadSessionManifest();
		const localById = new Map(
			locals.map((session) => [session.id, session]),
		);
		const entries: SyncManifest["entries"] = {};

		for (const remote of remotes) {
			let title =
				remote.title?.trim() || localById.get(remote.id)?.title?.trim();
			if (!title) title = previous?.entries[remote.id]?.title?.trim();

			if (!title && seedMissingTitles) {
				try {
					const payload = await this.adapter.getSession(remote.id);
					// Only parse the intentionally supported plaintext payload shape.
					// Encrypted payloads remain opaque and keep the ID fallback.
					if (
						payload &&
						!payload.iv &&
						!payload.tag &&
						!payload.salt
					) {
						const session = JSON.parse(
							payload.ciphertext,
						) as ChatSession;
						title = session.title?.trim();
					}
				} catch {
					// A missing/unreadable title must not prevent index rebuilding.
				}
			}

			entries[remote.id] = {
				...(title ? { title } : {}),
				modifiedAt: remote.modifiedAt,
				size: remote.size,
				etag: remote.etag,
			};
		}

		const manifest: SyncManifest = {
			version: 1,
			generatedAt: Date.now(),
			entries,
		};
		await this.adapter.writeTextAtomic(
			SYNC_MANIFEST_PATH,
			JSON.stringify(manifest),
			"application/json",
		);
	}

	/** Set a log callback for live log streaming (e.g. to sidebar). */
	setLogHandler(handler: (level: string, msg: string) => void): void {
		this.logHandler = handler;
	}

	/** Set a progress callback for per-session sync events. */
	setProgressHandler(
		handler: (event: SyncEngineProgressEvent) => void,
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
