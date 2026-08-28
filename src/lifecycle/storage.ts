// src/lifecycle/storage.ts
import { Notice } from "obsidian";
import {
	ObsidianAISettings,
	DEFAULT_SETTINGS,
	normalizeSettings,
} from "../settings";
import { StoredChatData, ChatSession } from "../types";
import type { SyncLogEntry, SyncProgressSnapshot } from "../sync/SyncProgress";
import { createFileLogger, FileLogger } from "../logger";
import {
	createStorage,
	ChatStorage,
	StorageDeps,
} from "../storage/ChatStorage";
import { ChatStorageMigration } from "../storage/Migration";
import { MigrationPromptModal } from "../modals/MigrationPromptModal";
import { requestPluginFileConflictChoice } from "../modals/PluginFileConflictModal";
import { SessionStorage } from "../storage/session-storage";
import { PersonaLoader } from "../intelligence/PersonaLoader";
import { SearchIndex } from "../search/index";
import { SessionSummarizer } from "../intelligence/SessionSummarizer";
import { SyncEngine } from "../sync/SyncEngine";
import { PluginDataManager } from "../data/PluginDataManager";
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
import type { SyncRetryRecord } from "../sync/SyncRetryStore";
import {
	PluginFileSyncManager,
	createVaultTextSyncTarget,
	type PluginFileSyncConflict,
	type PluginFileSyncState,
	type PluginFileSyncTarget,
} from "../sync/PluginFileSyncManager";
import { ProviderRegistry } from "../integrations/ProviderRegistry";
import { ChatApiManager } from "../api";
import type ObsidianAIPlugin from "../main";

export async function initializeStorage(
	plugin: ObsidianAIPlugin,
): Promise<void> {
	await migrateStorage(plugin);

	// Initialize file logger FIRST so any crash during load is captured.
	plugin.logger = createFileLogger(plugin.app, plugin.manifest.id);
	await plugin.logger.init();

	await loadSettings(plugin);

	plugin.integrationRegistry = new ProviderRegistry(
		plugin.app,
		plugin.settings,
	);
	plugin.integrationRegistry.discover();
	plugin.logger.setMaxSize(plugin.settings.debugLogMaxSizeMB * 1024 * 1024);
	plugin.chatapi = new ChatApiManager(plugin.settings, plugin.app);

	// Initialize low-level session storage
	plugin.sessionStorage = new SessionStorage({
		app: plugin.app,
		manifest: plugin.manifest,
		logger: plugin.logger,
	});

	// Initialize intelligence layer (T26)
	plugin.personaLoader = new PersonaLoader({
		app: plugin.app,
		manifest: plugin.manifest,
		logger: plugin.logger,
	});
	plugin.searchIndex = new SearchIndex(plugin.app, plugin.manifest.id);
	if (plugin.settings.intelligence?.enableIntelligence) {
		await plugin.personaLoader.ensureDefaults();
	}

	// Initialize session summarizer (T26 Phase 2)
	plugin.sessionSummarizer = new SessionSummarizer(
		plugin.personaLoader,
		plugin.chatapi,
	);

	// Initialize chat storage layer
	plugin._chatStorage = createStorage(
		_storageDeps(plugin),
		plugin.settings.chatStorageFormat,
	);

	// Detect legacy format and prompt for migration (non-blocking, once per session)
	if (plugin.settings.chatStorageFormat === "legacy") {
		const hasLegacy = await plugin._chatStorage.detectLegacyFormat();
		if (hasLegacy && !plugin._migrationPromptShown) {
			plugin._migrationPromptShown = true;
			const migration = new ChatStorageMigration(_storageDeps(plugin));
			new MigrationPromptModal(
				plugin.app,
				migration,
				async () => {
					// On migrate: switch to jsonl format and reinitialize storage
					plugin.settings.chatStorageFormat = "jsonl";
					plugin._chatStorage = createStorage(
						_storageDeps(plugin),
						"jsonl",
					);
					await plugin.saveSettings();
				},
				() => {
					// On keep legacy: do nothing, user can migrate later
				},
				() => {
					// On remind later: do nothing, will prompt again next session
				},
			).open();
		}
	}
}

/**
 * Preserve existing installations when the technical plugin ID changes.
 * The legacy directory is intentionally retained as a rollback backup.
 */
export async function migrateStorage(plugin: ObsidianAIPlugin): Promise<void> {
	const LEGACY_PLUGIN_ID = "obsidian-ai";
	const adapter = plugin.app.vault.adapter;
	const configDir = plugin.app.vault.configDir;
	const legacyDir = `${configDir}/plugins/${LEGACY_PLUGIN_ID}`;
	const currentDir = `${configDir}/plugins/${plugin.manifest.id}`;

	if (plugin.manifest.id === LEGACY_PLUGIN_ID) return;
	if (
		!(await adapter.exists(legacyDir)) ||
		(await adapter.exists(currentDir))
	)
		return;

	try {
		await adapter.mkdir(currentDir);
		const copyTree = async (
			sourceDir: string,
			destinationDir: string,
		): Promise<void> => {
			const listing = await adapter.list(sourceDir);
			for (const folder of listing.folders) {
				const relative = folder
					.slice(sourceDir.length)
					.replace(/^\//, "");
				const target = `${destinationDir}/${relative}`;
				await adapter.mkdir(target).catch(() => undefined);
				await copyTree(folder, target);
			}
			for (const file of listing.files) {
				const relative = file
					.slice(sourceDir.length)
					.replace(/^\//, "");
				await adapter.write(
					`${destinationDir}/${relative}`,
					await adapter.read(file),
				);
			}
		};
		await copyTree(legacyDir, currentDir);
		plugin.logger?.log(
			"info",
			`Migrated plugin data from ${legacyDir} to ${currentDir}`,
		);
	} catch (error) {
		plugin.logger?.log("error", `Plugin data migration failed: ${error}`);
		throw new Error(
			`Could not migrate existing Obsidian AI data: ${error}`,
		);
	}
}

export async function onSessionEnd(
	plugin: ObsidianAIPlugin,
	session: ChatSession,
): Promise<void> {
	if (!plugin.settings.intelligence?.autoSummarize) return;
	if (!plugin.sessionSummarizer) return;
	if (!plugin.settings.intelligence?.enableIntelligence) return;

	const minMessages =
		plugin.settings.intelligence.autoSummarizeMinMessages ?? 4;
	if (
		!plugin.sessionSummarizer.shouldSummarize(session.messages, minMessages)
	) {
		return;
	}

	const activeProfile =
		plugin.settings.providerProfiles.find(
			(p) =>
				p.id ===
				(session.profileId || plugin.settings.activeProviderProfileId),
		) || plugin.settings.providerProfiles[0];

	if (!activeProfile) return;

	plugin.logger?.log(
		"info",
		`[onSessionEnd] Summarizing session ${session.id}`,
	);
	try {
		const entries = await plugin.sessionSummarizer.summarizeSession(
			session.id,
			session.messages,
			activeProfile,
			{ minMessages },
		);
		plugin.logger?.log(
			"info",
			`[onSessionEnd] Saved ${entries.length} memory entries`,
		);
	} catch (e) {
		plugin.logger?.log("warn", `[onSessionEnd] Summarization failed: ${e}`);
	}
}

export function cleanupStorage(plugin: ObsidianAIPlugin): void {
	plugin.logger.stopMemoryLogging();
	plugin.logger.flushNow();
}

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

// ── T43c: Plugin Data Sync — Delegated to PluginDataManager ────────────

/**
 * Serialize plugin settings and data for remote sync.
 * Delegates to PluginDataManager for unified serialization.
 */
function _serializePluginData(plugin: ObsidianAIPlugin): object {
	const manager = new PluginDataManager(plugin);
	return manager.createSyncBundle();
}

/**
 * Deserialize and merge plugin data from remote.
 * Delegates to PluginDataManager for unified deserialization.
 */
async function _deserializePluginData(
	plugin: ObsidianAIPlugin,
	data: object,
): Promise<void> {
	const manager = new PluginDataManager(plugin);
	manager.applySyncBundle(data as any);
	await plugin.saveSettings();
	plugin.logger?.log("info", "[T55] Plugin data merged from remote");
}

/**
 * Sync plugin data (settings, memory, persona, usage stats) to/from remote.
 * Called automatically after session sync completes.
 * Respects syncComponents selection.
 */
export async function syncPluginData(
	plugin: ObsidianAIPlugin,
	direction?: "upload" | "download" | "both",
	options?: {
		dryRun?: boolean;
		onProgress?: (event: {
			id: string;
			direction: "upload" | "download" | "conflict" | "skip";
			status: "start" | "done" | "error";
			error?: string;
		}) => void;
	},
): Promise<{
	uploaded: boolean;
	downloaded: boolean;
	conflict: boolean;
	failed: number;
	errors: string[];
	status: "complete" | "partial" | "failed";
	retryable: SyncRetryRecord[];
	items: Array<{
		id: string;
		status: string;
		error?: string;
	}>;
}> {
	const result: {
		uploaded: boolean;
		downloaded: boolean;
		conflict: boolean;
		failed: number;
		errors: string[];
		status: "complete" | "partial" | "failed";
		retryable: SyncRetryRecord[];
		items: Array<{ id: string; status: string; error?: string }>;
	} = {
		uploaded: false,
		downloaded: false,
		conflict: false,
		failed: 0,
		errors: [] as string[],
		status: "complete",
		retryable: [] as SyncRetryRecord[],
		items: [] as Array<{ id: string; status: string; error?: string }>,
	};
	if (!plugin.syncEngine) return result;

	const sc = plugin.settings.syncComponents;
	const dir =
		direction ?? plugin.settings.remoteStorage.syncDirection ?? "both";
	const pluginDataPath = `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}`;
	const localAdapter = plugin.app.vault.adapter;
	const targets: PluginFileSyncTarget[] = [];
	const stateStore = {
		load: async (): Promise<PluginFileSyncState | null> => {
			const data = (await plugin.loadData()) as Record<
				string,
				unknown
			> | null;
			return (
				(data?.pluginFileSyncState as
					| PluginFileSyncState
					| undefined) ?? null
			);
		},
		save: async (state: PluginFileSyncState): Promise<void> => {
			const data = ((await plugin.loadData()) ?? {}) as Record<
				string,
				unknown
			>;
			await plugin.saveData({ ...data, pluginFileSyncState: state });
		},
	};
	const saveRecoveryCopy = async (
		id: string,
		content: string,
		reason: string,
	): Promise<void> => {
		const recoveryDir = `${pluginDataPath}/sync-recovery`;
		if (!(await localAdapter.exists(recoveryDir))) {
			await localAdapter.mkdir(recoveryDir);
		}
		await localAdapter.write(
			`${recoveryDir}/${id}.${reason}-${Date.now()}.bak`,
			content,
		);
	};

	if (sc.pluginSettings || sc.apiKeys) {
		targets.push({
			id: "plugin-settings",
			remotePath: "plugin-data.json",
			readLocal: async () =>
				JSON.stringify(_serializePluginData(plugin), null, 2),
			writeLocal: async (content) => {
				const data = JSON.parse(content);
				await _deserializePluginData(plugin, data);
			},
			backupLocal: (content, reason) =>
				saveRecoveryCopy("plugin-settings", content, reason),
			writeConflictCopy: (content) =>
				saveRecoveryCopy("plugin-settings", content, "conflict"),
		});
	}

	if (sc.memory) {
		targets.push(
			createVaultTextSyncTarget(
				"memory",
				"intelligence/memory.json",
				`${pluginDataPath}/intelligence/memory.json`,
				localAdapter,
			),
		);
	}

	if (sc.memoryAudit) {
		targets.push(
			createVaultTextSyncTarget(
				"memory-audit",
				"intelligence/memory-audit.jsonl",
				`${pluginDataPath}/intelligence/memory-audit.jsonl`,
				localAdapter,
			),
		);
	}

	if (sc.persona) {
		targets.push(
			createVaultTextSyncTarget(
				"persona",
				"intelligence/persona.md",
				`${pluginDataPath}/intelligence/persona.md`,
				localAdapter,
			),
		);
	}

	if (sc.usageStats) {
		const chatData = await plugin.loadChatData();
		const { summarizeLlmUsage } = await import("../lib/usageStats");
		const stats = summarizeLlmUsage(chatData.sessions || []);
		targets.push({
			id: "usage-stats",
			remotePath: "usage-stats.json",
			allowDownload: false,
			readLocal: async () => JSON.stringify(stats, null, 2),
			writeLocal: async () => {
				// Usage data is derived locally and is intentionally upload-only.
			},
		});
	}

	try {
		const manager = new PluginFileSyncManager({
			remote: plugin.syncEngine.storageAdapter,
			crypto: plugin.syncEngine.encryptionLayer,
			stateStore,
			identity: plugin.syncIdentity ?? undefined,
			retryStore: plugin.syncRetryStore ?? undefined,
			progress: options?.onProgress,
			resolveConflict: (conflict: PluginFileSyncConflict) =>
				requestPluginFileConflictChoice(plugin.app, conflict),
		});
		const syncResult = options?.dryRun
			? await manager.plan(targets, dir)
			: await manager.sync(targets, dir);
		result.uploaded = syncResult.uploaded > 0;
		result.downloaded = syncResult.downloaded > 0;
		result.failed = syncResult.failed;
		result.conflict = syncResult.conflicts > 0;
		result.errors = syncResult.errors;
		result.status = syncResult.status;
		result.retryable = syncResult.retryable;
		result.items = syncResult.items.map((item) => ({
			id: item.id,
			status: item.status,
			error: item.error,
		}));

		if (!options?.dryRun) {
			for (const item of syncResult.items) {
				if (item.status === "failed" || item.status === "conflict") {
					plugin.logger?.log(
						"warn",
						`[T57a] Failed ${item.id}: ${item.error}`,
					);
				} else if (item.status !== "skipped") {
					plugin.logger?.log(
						"info",
						`[T57a] ${item.status} ${item.id}`,
					);
				}
			}
		}
	} catch (err: any) {
		const message = `Plugin data sync failed: ${err.message}`;
		result.failed += 1;
		result.status = "failed";
		result.errors.push(message);
		plugin.logger?.log("warn", `[T57a] ${message}`);
	}

	return result;
}

/** Open this plugin's settings directly at the Remote Storage section. */
export function openRemoteStorageSettings(plugin: ObsidianAIPlugin): void {
	const setting = (plugin.app as any).setting;
	setting.open();
	setting.openTabById(plugin.manifest.id);
	const reveal = () => {
		const section = document.querySelector<HTMLElement>(
			"#obsidian-ai-settings-remote-storage",
		);
		if (!section) return;
		const scrollContainer = section.parentElement?.closest<HTMLElement>(
			".vertical-tab-content, .setting-tab-content",
		);
		if (scrollContainer) {
			const top =
				section.getBoundingClientRect().top -
				scrollContainer.getBoundingClientRect().top +
				scrollContainer.scrollTop -
				12;
			scrollContainer.scrollTo({ top, behavior: "smooth" });
		} else {
			section.scrollIntoView({ behavior: "smooth", block: "start" });
		}
	};
	window.setTimeout(reveal, 50);
	window.setTimeout(reveal, 250);
}

/** Debounced auto-sync trigger. Waits 3s of inactivity before syncing. */
let autoSyncTimeout: number | null = null;

export function scheduleAutoSync(plugin: ObsidianAIPlugin): void {
	if (autoSyncTimeout) {
		window.clearTimeout(autoSyncTimeout);
	}
	autoSyncTimeout = window.setTimeout(() => {
		autoSyncTimeout = null;
		plugin.triggerSync().catch((err) => {
			plugin.logger?.log("warn", `Auto-sync failed: ${err.message}`);
		});
	}, 3000);
}

function _storageDeps(plugin: ObsidianAIPlugin): StorageDeps {
	return {
		app: plugin.app,
		manifest: plugin.manifest,
		settings: plugin.settings,
		loadData: () => plugin.loadData(),
		saveData: (data) => plugin.saveData(data),
		logger: plugin.logger,
	};
}

// ─────────────────────────────────────────────────────────────
// Safe data persistence layer
// ─────────────────────────────────────────────────────────────

export async function loadSettings(plugin: ObsidianAIPlugin) {
	plugin.logger?.log("info", "loadSettings: reading data.json");
	const raw = await plugin.loadData();
	plugin._settingsLoadedFromFile = raw !== null && typeof raw === "object";
	plugin.logger?.log(
		"info",
		`loadSettings: _settingsLoadedFromFile=${plugin._settingsLoadedFromFile}, raw=${raw ? "exists" : "null"}`,
	);
	plugin.settings = normalizeSettings(raw);

	// Restore WebDAV password from localStorage (not synced, not in data.json)
	const savedPassword = localStorage.getItem(
		"obsidian-ai:webdav-password",
	);
	if (savedPassword && plugin.settings.remoteStorage.webdav) {
		plugin.settings.remoteStorage.webdav.password = savedPassword;
	}

	plugin.logger?.setMaxSize(plugin.settings.debugLogMaxSizeMB * 1024 * 1024);
}

export async function saveSettings(plugin: ObsidianAIPlugin) {
	plugin.logger?.log(
		"info",
		`saveSettings called: _settingsLoadedFromFile=${plugin._settingsLoadedFromFile}`,
	);

	// Guard: don't overwrite with defaults if we never successfully loaded user data.
	if (!plugin._settingsLoadedFromFile) {
		plugin.logger?.log(
			"warn",
			"saveSettings blocked: no valid data.json was loaded; refusing to overwrite with defaults",
		);
		return;
	}

	// Save password to localStorage (or clear if empty)
	const webdavPassword = plugin.settings.remoteStorage.webdav?.password;
	if (webdavPassword) {
		localStorage.setItem(
			"obsidian-ai:webdav-password",
			webdavPassword,
		);
	} else {
		localStorage.removeItem("obsidian-ai:webdav-password");
	}

	const existing = (await plugin.loadData()) ?? {};
	// Deep-clone settings to avoid mutating live config when stripping secrets
	let payload: Record<string, any> = JSON.parse(
		JSON.stringify(plugin.settings),
	);
	payload = { ...existing, ...payload };

	// Strip password from persisted data.json
	if (payload.remoteStorage?.webdav?.password) {
		payload.remoteStorage.webdav.password = "";
	}

	// When using JSONL storage, strip legacy chat data keys from data.json
	// to avoid accidentally re-introducing legacy format after migration
	if (plugin.settings.chatStorageFormat === "jsonl") {
		delete payload.chatData;
		delete payload.chatMessages;
	}

	// Skip write if nothing changed
	if (JSON.stringify(payload) === JSON.stringify(existing)) {
		plugin.logger?.log("info", "saveSettings skipped: no changes");
		return;
	}

	plugin.logger?.log("info", "saveSettings: writing data.json to disk");
	await _ensureRollingBackup(plugin, existing);
	await plugin.saveData(payload);
	plugin.logger?.log("info", "saveSettings: data.json written successfully");
}

export async function loadChatData(
	plugin: ObsidianAIPlugin,
): Promise<StoredChatData> {
	plugin.logger?.log("info", "loadChatData: delegating to storage layer");
	if (!plugin._chatStorage) {
		plugin._chatStorage = createStorage(
			_storageDeps(plugin),
			plugin.settings.chatStorageFormat,
		);
	}
	return plugin._chatStorage.loadChatData();
}

export async function saveChatData(
	plugin: ObsidianAIPlugin,
	chatData: StoredChatData,
): Promise<void> {
	if (!plugin._chatStorage) {
		plugin._chatStorage = createStorage(
			_storageDeps(plugin),
			plugin.settings.chatStorageFormat,
		);
	}
	if (plugin._saveInProgress) {
		plugin._pendingChatData = chatData;
		plugin.logger?.log(
			"info",
			"saveChatData queued: save already in progress",
		);
		return;
	}
	plugin._saveInProgress = true;

	try {
		let nextChatData: StoredChatData | null = chatData;
		while (nextChatData) {
			plugin._pendingChatData = null;
			plugin.logger?.log(
				"info",
				"saveChatData: writing via storage layer",
			);
			await plugin._chatStorage.saveChatData(nextChatData);
			plugin.logger?.log(
				"info",
				"saveChatData: storage layer wrote successfully",
			);

			// Auto-sync to remote if enabled (debounced)
			if (
				plugin.settings.remoteStorage?.enabled &&
				plugin.settings.remoteStorage?.autoSync
			) {
				scheduleAutoSync(plugin);
			}

			// Invalidate search index so next search picks up new messages
			plugin.searchIndex?.invalidate();

			nextChatData = plugin._pendingChatData;
			if (nextChatData) {
				plugin.logger?.log(
					"info",
					"saveChatData: flushing queued snapshot",
				);
			}
		}
	} finally {
		plugin._saveInProgress = false;
	}
}

/** Create rolling backups of data.json before writes */
async function _ensureRollingBackup(
	plugin: ObsidianAIPlugin,
	currentData: unknown,
): Promise<void> {
	try {
		const adapter = plugin.app.vault.adapter;
		const pluginDir = `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}`;
		const dataPath = `${pluginDir}/data.json`;
		const backupCount = plugin.settings.sessionBackupCount ?? 3;

		const exists = await adapter.exists(dataPath);
		if (!exists) return;

		const content = await adapter.read(dataPath);

		// Rotate existing backups: .bak.2 -> .bak.3, .bak.1 -> .bak.2, .bak -> .bak.1
		for (let i = backupCount - 1; i >= 1; i--) {
			const src =
				i === 1 ? `${dataPath}.bak` : `${dataPath}.bak.${i - 1}`;
			const dst = `${dataPath}.bak.${i}`;
			if (await adapter.exists(src)) {
				await adapter.write(dst, await adapter.read(src));
			}
		}

		// Write the new .bak
		await adapter.write(`${dataPath}.bak`, content);
		plugin.logger?.log(
			"info",
			`Rolling backup created for data.json (keeping ${backupCount} copies)`,
		);
	} catch (e) {
		plugin.logger?.log("warn", `Failed to create rolling backup: ${e}`);
	}
}
