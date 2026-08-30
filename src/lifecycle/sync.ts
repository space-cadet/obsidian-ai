// src/lifecycle/sync.ts
import { Notice } from "obsidian";
import type { SyncLogEntry, SyncProgressSnapshot } from "../sync/SyncProgress";
import { SyncEngine } from "../sync/SyncEngine";
import { LocalCache } from "../sync/LocalCache";
import { EncryptionLayer } from "../sync/EncryptionLayer";
import { WebDAVStorageAdapter } from "../sync/WebDAVStorageAdapter";
import { SyncProgressModal } from "../modals/SyncProgressModal";
import { SyncLogger } from "../sync/SyncLogger";
import { StorageAdapter } from "../sync/StorageAdapter";
import { SyncIndexManager } from "../sync/SyncIndexManager";
import { createPluginIndexStorage } from "../sync/SyncIndex";
import { makeSyncIdentity } from "../sync/SyncIdentity";
import { DurableSyncRetryStore } from "../sync/SyncRetryStore";
import type ObsidianAIPlugin from "../main";
import { loadChatData } from "./persistence";
import { syncPluginData } from "./storage";

let lastSyncConfigHash = "";

/** Initialize SyncEngine for remote storage sync. Recreates if settings changed. */
export async function initSyncEngine(plugin: ObsidianAIPlugin): Promise<void> {
	const rs = plugin.settings.remoteStorage;
	if (!rs.enabled || rs.backend === "none") {
		plugin.syncEngine = null;
		plugin.syncIdentity = null;
		plugin.syncRetryStore = null;
		return;
	}

	const vaultAdapter = plugin.app.vault.adapter as any;
	const vaultId = `${plugin.app.vault.getName()}|${vaultAdapter.getBasePath?.() ?? ""}`;
	const syncIdentity = makeSyncIdentity({
		vaultId,
		backend: rs.backend,
		server: rs.webdav?.url ?? "",
		account: rs.webdav?.username ?? "",
		remotePath: rs.webdav?.prefix ?? "",
		encryptionIdentity: rs.passphrase ?? "",
	});

	// Build a config hash to detect changes
	const configHash = JSON.stringify({
		backend: rs.backend,
		url: rs.webdav?.url,
		prefix: rs.webdav?.prefix,
		username: rs.webdav?.username,
		passphrase: rs.passphrase,
		conflictStrategy: rs.conflictStrategy,
		concurrencyLimit: rs.concurrencyLimit,
		identity: syncIdentity,
	});

	// Skip re-init if config unchanged and engine exists
	if (plugin.syncEngine && configHash === lastSyncConfigHash) {
		return;
	}

	lastSyncConfigHash = configHash;

	// Dispose old engine if exists
	if (plugin.syncEngine) {
		plugin.logger?.log(
			"info",
			"SyncEngine: reconfiguring with new settings",
		);
	}

	try {
		const adapter = new WebDAVStorageAdapter();
		const cacheNamespace = syncIdentity;
		const cache = new LocalCache(cacheNamespace);
		const crypto = new EncryptionLayer();
		const retryStore = new DurableSyncRetryStore(
			{
				load: async () =>
					((await plugin.loadData()) as Record<
						string,
						unknown
					> | null) ?? null,
				save: async (data) => plugin.saveData(data),
			},
			syncIdentity,
		);
		plugin.syncIdentity = syncIdentity;
		plugin.syncRetryStore = retryStore;

		// T42a: Create sync index manager backed by plugin data
		const indexStorage = createPluginIndexStorage(plugin, "syncIndex");
		const indexManager = new SyncIndexManager(indexStorage);

		plugin.syncEngine = new SyncEngine({
			adapter,
			cache,
			crypto,
			passphrase: rs.passphrase,
			conflictStrategy: rs.conflictStrategy,
			concurrencyLimit: rs.concurrencyLimit ?? 3,
			indexManager,
			identity: syncIdentity,
			retryStore,
			logger: {
				log: (level: string, msg: string) => {
					plugin.logger?.log(level as any, `[SyncEngine] ${msg}`);
				},
			},
			onSessionDownloaded: async (session) => {
				// Merge downloaded session into app storage
				const chatData = await plugin.loadChatData();
				const sessions = chatData.sessions || [];
				const idx = sessions.findIndex((s) => s.id === session.id);
				if (idx >= 0) {
					sessions[idx] = session;
				} else {
					sessions.push(session);
				}
				await plugin.saveChatData({ ...chatData, sessions });
				plugin.logger?.log(
					"info",
					`[SyncEngine] Downloaded session ${session.id} merged into storage`,
				);
			},
		});

		if (rs.backend === "webdav" && rs.webdav) {
			await plugin.syncEngine.initialize({
				url: rs.webdav.url,
				username: rs.webdav.username,
				password: rs.webdav.password,
				prefix: rs.webdav.prefix,
				identity: syncIdentity,
			});
			plugin.logger?.log("info", "SyncEngine initialized (WebDAV)");
		}
		// TODO: S3 and custom backends
	} catch (err: any) {
		plugin.logger?.log("error", `SyncEngine init failed: ${err.message}`);
		console.error("[ObsidianAI] SyncEngine init failed:", err);
		plugin.syncEngine = null;
	}
}

/** Trigger a manual sync and update settings.
 *  Sidebar is the primary UI; pass `{ useModal: true }` to also show the modal. */
export async function rebuildSyncIndex(
	plugin: ObsidianAIPlugin,
	choice: "remote" | "local" | "compare",
	options?: {
		onLog?: (entry: SyncLogEntry) => void;
		onProgress?: (progress: SyncProgressSnapshot) => void;
	},
): Promise<{
	uploaded: number;
	downloaded: number;
	conflicts: number;
	skipped: number;
}> {
	if (!plugin.syncEngine) await initSyncEngine(plugin);
	if (!plugin.syncEngine) throw new Error("Sync is not configured");

	// Build title map from local sessions for better title resolution (T43a)
	const chatData = await plugin.loadChatData();
	const titleMap = new Map(
		chatData.sessions?.map((s: any) => [s.id, s.title]) ?? [],
	);

	const previousHandler = plugin.syncEngine.getProgressHandler();
	const rebuildStart = Date.now();
	let rebuildTotal = 0;
	let rebuildCompleted = 0;
	const emitRebuildProgress = (
		progress: Partial<SyncProgressSnapshot> &
			Pick<SyncProgressSnapshot, "phase" | "stage">,
	) =>
		options?.onProgress?.({
			phase: progress.phase,
			stage: progress.stage,
			total: progress.total ?? rebuildTotal,
			completed: progress.completed ?? rebuildCompleted,
			uploaded: progress.uploaded ?? 0,
			downloaded: progress.downloaded ?? 0,
			conflicts: progress.conflicts ?? 0,
			skipped: progress.skipped ?? 0,
			elapsedMs: Date.now() - rebuildStart,
			indeterminate: progress.indeterminate,
		});
	try {
		plugin.syncEngine.setProgressHandler((event) => {
			if (event.type === "stage") {
				if (event.total !== undefined) rebuildTotal = event.total;
				if (event.completed !== undefined)
					rebuildCompleted = event.completed;
				emitRebuildProgress({
					phase: event.phase ?? "rebuilding",
					stage: event.stage ?? "Rebuilding sync record",
					total: rebuildTotal,
					completed: rebuildCompleted,
					indeterminate: event.indeterminate,
				});
				return;
			}
			if (event.type !== "session" || !event.direction) return;
			const title =
				titleMap.get(event.id) ||
				_getSessionTitle(plugin, event.id)?.trim() ||
				`Session ${event.id.slice(0, 8)}…`;
			if (event.status === "done") rebuildCompleted++;
			options?.onLog?.({
				id: `session:${event.id}`,
				operation: event.direction,
				title,
				status:
					event.status === "error"
						? "error"
						: event.status === "done"
							? "done"
							: "active",
				message: event.error,
				timestamp: Date.now(),
			});
			emitRebuildProgress({
				phase: event.status === "error" ? "error" : "rebuilding",
				stage: "Applying rebuild plan",
				total: rebuildTotal,
				completed: rebuildCompleted,
			});
		});
		const result = await plugin.syncEngine.rebuildIndex(choice);
		new Notice("Sync record rebuilt.");
		return {
			uploaded: result.uploaded,
			downloaded: result.downloaded,
			conflicts: result.conflicts,
			skipped: result.skipped,
		};
	} finally {
		if (previousHandler) {
			plugin.syncEngine!.setProgressHandler(previousHandler);
		}
	}
}

export function cancelSync(plugin: ObsidianAIPlugin): void {
	plugin.syncEngine?.cancel();
}

export async function triggerSync(
	plugin: ObsidianAIPlugin,
	dryRun = false,
	options?: {
		useModal?: boolean;
		direction?: "both" | "upload" | "download";
		onProgress?: (progress: SyncProgressSnapshot) => void;
		onLog?: (entry: SyncLogEntry) => void;
	},
): Promise<{
	ok: boolean;
	message: string;
	uploaded: number;
	downloaded: number;
	conflicts: number;
	skipped: number;
	errors: string[];
	pluginData?: {
		status: "complete" | "partial" | "failed";
		uploaded: boolean;
		downloaded: boolean;
		conflict: boolean;
		failed: number;
		errors: string[];
	};
	chatSessions?: {
		status: "complete" | "partial" | "failed";
		retryable: number;
	};
}> {
	// Lazy-init sync engine if not already initialized (e.g., user enabled sync after plugin load)
	if (!plugin.syncEngine) {
		await initSyncEngine(plugin);
	}
	if (!plugin.syncEngine) {
		const msg =
			"Sync not configured. Enable Remote Storage and enter credentials.";
		new Notice(msg);
		return {
			ok: false,
			message: msg,
			uploaded: 0,
			downloaded: 0,
			conflicts: 0,
			skipped: 0,
			errors: [msg],
		};
	}

	plugin.syncEngine.dryRun = dryRun;
	const startTime = Date.now();
	const syncLogger = new SyncLogger(plugin.app, plugin.manifest.id);

	// ── Modal: primary progress UI ──
	let modal: SyncProgressModal | null = null;
	if (options?.useModal) {
		modal = new SyncProgressModal(plugin.app, 0, {
			onCancel: () => {
				plugin.syncEngine?.cancel();
			},
		});
		modal.open();
	}

	// Wire progress callback into sync engine → modal
	let completedOps = 0;
	// Track operation counts for progress callbacks
	let progressUploaded = 0;
	let progressDownloaded = 0;
	let progressConflicts = 0;
	let progressSkipped = 0;
	let totalOps = 0;
	const emitProgress = (
		progress: Partial<SyncProgressSnapshot> &
			Pick<SyncProgressSnapshot, "phase" | "stage">,
	) =>
		options?.onProgress?.({
			phase: progress.phase,
			stage: progress.stage,
			total: progress.total ?? totalOps,
			completed: progress.completed ?? completedOps,
			uploaded: progress.uploaded ?? progressUploaded,
			downloaded: progress.downloaded ?? progressDownloaded,
			conflicts: progress.conflicts ?? progressConflicts,
			skipped: progress.skipped ?? progressSkipped,
			elapsedMs: Date.now() - startTime,
			indeterminate: progress.indeterminate,
		});

	try {
		// Compute sync plan (may fail if offline, bad credentials, etc.)
		emitProgress({
			phase: "planning",
			stage: "Reading local sessions",
			indeterminate: true,
		});
		modal?.addLog("system", "Reading local sessions...");
		await _populateSyncCache(plugin);
		emitProgress({
			phase: "planning",
			stage: "Reading remote sessions",
			indeterminate: true,
		});
		const direction =
			options?.direction ??
			plugin.settings.remoteStorage.syncDirection ??
			"both";
		const sc = plugin.settings.syncComponents;
		const pluginDataOps =
			Number(sc.pluginSettings || sc.apiKeys) +
			Number(sc.memory) +
			Number(sc.memoryAudit) +
			Number(sc.persona) +
			Number(sc.usageStats);
		totalOps = pluginDataOps;
		modal?.setTotal(totalOps);

		// Set up progress handler now that totalOps is known
		// Build title map from local sessions for better remote session titles
		const chatData = await plugin.loadChatData();
		const titleMap = new Map(
			chatData.sessions?.map((s: any) => [s.id, s.title]) ?? [],
		);

		plugin.syncEngine?.setProgressHandler((event) => {
			if (event.type === "stage") {
				if (event.total !== undefined) {
					totalOps = event.total + pluginDataOps;
					modal?.setTotal(totalOps);
				}
				modal?.addLog("system", event.stage ?? "Planning sync…");
				emitProgress({
					phase: event.phase ?? "planning",
					stage: event.stage ?? "Planning sync…",
					total: totalOps,
					completed: event.completed ?? completedOps,
					indeterminate: event.indeterminate,
				});
				return;
			}
			if (event.type === "session") {
				const title =
					titleMap.get(event.id) ||
					_getSessionTitle(plugin, event.id)?.trim() ||
					`Session ${event.id.slice(0, 8)}…`;
				if (event.status === "start") {
					if (event.direction) {
						modal?.addLog(event.direction, `${title}`, {
							id: event.id,
						});
					}
					options?.onLog?.({
						id: `session:${event.id}`,
						operation: event.direction || "system",
						title,
						status: "active",
						timestamp: Date.now(),
					});
				} else if (event.status === "done") {
					completedOps++;
					if (event.direction === "upload") progressUploaded++;
					if (event.direction === "download") progressDownloaded++;
					if (event.direction === "conflict") progressConflicts++;
					if (event.direction) {
						modal?.addLog(event.direction, `${title}`, {
							id: event.id,
							done: true,
						});
					}
					options?.onLog?.({
						id: `session:${event.id}`,
						operation: event.direction || "system",
						title,
						status: "done",
						timestamp: Date.now(),
					});
					emitProgress({
						phase: "syncing",
						stage: "Syncing chat sessions",
						total: totalOps,
						completed: completedOps,
					});
					if (event.direction) {
						syncLogger.log({
							timestamp: Date.now(),
							deviceId: syncLogger["deviceId"],
							action: event.direction,
							sessionId: event.id,
							sessionTitle: title,
							message: "success",
						});
					}
				} else if (event.status === "error") {
					modal?.addLog("error", `${title}: ${event.error}`, {
						id: event.id,
						error: true,
					});
					options?.onLog?.({
						id: `session:${event.id}`,
						operation: "error",
						title,
						status: "error",
						message: event.error,
						timestamp: Date.now(),
					});
					syncLogger.log({
						timestamp: Date.now(),
						deviceId: syncLogger["deviceId"],
						action: "error",
						sessionId: event.id,
						sessionTitle: title,
						message: event.error || "unknown error",
					});
				}
			}
		});

		const result = await plugin.syncEngine.sync(options?.direction);
		let pluginDataResult:
			| Awaited<ReturnType<typeof syncPluginData>>
			| undefined;
		emitProgress({
			phase: dryRun ? "planning" : "syncing",
			stage: dryRun ? "Planning plugin data" : "Syncing plugin data",
			total: totalOps,
		});
		pluginDataResult = await syncPluginData(plugin, direction, {
			dryRun,
			onProgress: (event) => {
				const title = `Plugin data: ${event.id}`;
				const operation = event.direction;
				if (event.status === "start") {
					modal?.addLog(operation, title, {
						id: `plugin:${event.id}`,
					});
					options?.onLog?.({
						id: `plugin:${event.id}`,
						operation,
						title,
						status: "active",
						timestamp: Date.now(),
					});
					return;
				}
				completedOps++;
				if (operation === "upload") progressUploaded++;
				if (operation === "download") progressDownloaded++;
				if (operation === "conflict") progressConflicts++;
				if (operation === "skip") progressSkipped++;
				if (event.status === "error") {
					modal?.addLog("error", `${title}: ${event.error}`, {
						id: `plugin:${event.id}`,
						error: true,
					});
					options?.onLog?.({
						id: `plugin:${event.id}`,
						operation: "error",
						title,
						status: "error",
						message: event.error,
						timestamp: Date.now(),
					});
				} else {
					modal?.addLog(operation, title, {
						id: `plugin:${event.id}`,
						done: true,
					});
					options?.onLog?.({
						id: `plugin:${event.id}`,
						operation,
						title,
						status: "done",
						timestamp: Date.now(),
					});
				}
				emitProgress({
					phase: dryRun ? "planning" : "syncing",
					stage: dryRun
						? "Planning plugin data"
						: "Syncing plugin data",
					total: totalOps,
					completed: completedOps,
				});
			},
		});
		const durationMs = Date.now() - startTime;
		if (!dryRun) {
			plugin.settings.remoteStorage.lastSyncTime = Date.now();
			await plugin.saveSettings();
		}

		const parts: string[] = [];
		if (result.uploaded > 0) parts.push(`↑${result.uploaded}`);
		if (result.downloaded > 0) parts.push(`↓${result.downloaded}`);
		if (result.conflicts > 0) parts.push(`⚡${result.conflicts}`);
		if (result.skipped > 0) parts.push(`⊘${result.skipped}`);
		if (result.errors.length > 0) parts.push(`⚠️ ${result.errors.length}`);
		if (pluginDataResult) {
			if (pluginDataResult.uploaded) parts.push("plugin ↑");
			if (pluginDataResult.downloaded) parts.push("plugin ↓");
			if (pluginDataResult.conflict) parts.push("plugin ⚡");
			if (pluginDataResult.failed > 0)
				parts.push(`plugin ⚠️ ${pluginDataResult.failed}`);
		}

		const msg = parts.length > 0 ? parts.join(" ") : "Nothing to sync";
		const ok =
			result.errors.length === 0 &&
			(!pluginDataResult || pluginDataResult.status === "complete");
		const combinedErrors = [
			...result.errors,
			...(pluginDataResult?.errors ?? []),
		];
		emitProgress({
			phase: combinedErrors.length > 0 ? "error" : "complete",
			stage:
				combinedErrors.length > 0
					? dryRun
						? "Dry-run finished with attention"
						: "Sync finished with attention"
					: dryRun
						? "Dry run complete"
						: "Sync complete",
			total: totalOps,
			completed: totalOps,
			indeterminate: false,
		});

		// Record session to logs
		const sessionRecord = {
			timestamp: Date.now(),
			deviceId: syncLogger["deviceId"],
			result: { ...result, message: msg },
			durationMs,
		};
		if (!dryRun) {
			syncLogger.recordSession(sessionRecord);
			await syncLogger.flushLocal();
		}
		if (plugin.syncEngine && !dryRun) {
			const adapter = (plugin.syncEngine as any)
				.adapter as StorageAdapter;
			await syncLogger.appendRemote(adapter, sessionRecord);
		}

		modal?.finish({ ...result, errors: combinedErrors, message: msg });

		// Toast notification
		if (ok) {
			new Notice(
				dryRun
					? `🔍 Dry run complete: ${msg}`
					: `✅ Sync complete: ${msg}`,
				6000,
			);
		} else {
			new Notice(`⚠️ Sync finished with errors: ${msg}`, 8000);
		}

		return {
			ok,
			message: msg,
			uploaded: result.uploaded,
			downloaded: result.downloaded,
			conflicts: result.conflicts,
			skipped: result.skipped,
			errors: combinedErrors,
			pluginData: pluginDataResult
				? {
						status: pluginDataResult.status,
						uploaded: pluginDataResult.uploaded,
						downloaded: pluginDataResult.downloaded,
						conflict: pluginDataResult.conflict,
						failed: pluginDataResult.failed,
						errors: pluginDataResult.errors,
					}
				: undefined,
			chatSessions: {
				status:
					result.status ??
					(result.errors.length === 0 ? "complete" : "partial"),
				retryable: result.retryable?.length ?? 0,
			},
		};
	} catch (err: any) {
		const msg = `Sync failed: ${err.message}`;
		const durationMs = Date.now() - startTime;
		emitProgress({
			phase: "error",
			stage: dryRun ? "Dry run failed" : "Sync failed",
			total: totalOps,
			completed: totalOps,
			indeterminate: false,
		});
		if (!dryRun) {
			syncLogger.recordSession({
				timestamp: Date.now(),
				deviceId: syncLogger["deviceId"],
				result: {
					uploaded: 0,
					downloaded: 0,
					conflicts: 0,
					skipped: 0,
					errors: [err.message],
					message: msg,
				},
				durationMs,
			});
			await syncLogger.flushLocal();
		}

		modal?.finish({
			uploaded: 0,
			downloaded: 0,
			conflicts: 0,
			skipped: 0,
			errors: [err.message],
			message: msg,
		});
		new Notice(`❌ ${msg}`, 8000);
		return {
			ok: false,
			message: msg,
			uploaded: 0,
			downloaded: 0,
			conflicts: 0,
			skipped: 0,
			errors: [msg],
		};
	} finally {
		plugin.syncEngine.dryRun = false;
	}
}

/** Look up a session title by ID from current chat data */
function _getSessionTitle(
	plugin: ObsidianAIPlugin,
	sessionId: string,
): string | undefined {
	// Look up from loaded chat data
	const chatData = (plugin as any)._chatData;
	if (chatData?.sessions) {
		const session = chatData.sessions.find((s: any) => s.id === sessionId);
		if (session?.title) return session.title;
	}
	// Fallback to sync engine cache if available
	const cache = (plugin.syncEngine as any)?.cache;
	if (cache?.sessions) {
		const session = cache.sessions.find((s: any) => s.id === sessionId);
		if (session?.title) return session.title;
	}
	return undefined;
}

/** Copy current chat sessions from Obsidian storage into the sync cache */
async function _populateSyncCache(plugin: ObsidianAIPlugin): Promise<void> {
	if (!plugin.syncEngine) return;
	try {
		const chatData = await plugin.loadChatData();
		(plugin as any)._chatData = chatData;
		const sessions = chatData.sessions || [];
		await plugin.syncEngine.populateCache(sessions);
	} catch (err: any) {
		plugin.logger?.log(
			"warn",
			`SyncEngine: failed to populate cache: ${err.message}`,
		);
	}
}
