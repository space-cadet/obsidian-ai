// src/lifecycle/storage.ts
import type { ChatSession } from "../types";
import { createFileLogger } from "../logger";
import { createStorage } from "../storage/ChatStorage";
import { ChatStorageMigration } from "../storage/Migration";
import { MigrationPromptModal } from "../modals/MigrationPromptModal";
import { requestPluginFileConflictChoice } from "../modals/PluginFileConflictModal";
import { SessionStorage } from "../storage/session-storage";
import { PersonaLoader } from "../intelligence/PersonaLoader";
import { SearchIndex } from "../search/index";
import { SessionSummarizer } from "../intelligence/SessionSummarizer";
import { PluginDataManager } from "../data/PluginDataManager";
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
import {
	createStorageDeps,
	loadSettings,
	saveSettings,
} from "./persistence";

export {
	loadChatData,
	loadSettings,
	saveChatData,
	saveSettings,
} from "./persistence";

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
		memoryCoreSize: plugin.settings.intelligence?.memoryCoreSize,
		memoryBackupRetention:
			plugin.settings.intelligence?.memoryBackupRetention,
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
		createStorageDeps(plugin),
		plugin.settings.chatStorageFormat,
	);

	// Detect legacy format and prompt for migration (non-blocking, once per session)
	if (plugin.settings.chatStorageFormat === "legacy") {
		const hasLegacy = await plugin._chatStorage.detectLegacyFormat();
		if (hasLegacy && !plugin._migrationPromptShown) {
			plugin._migrationPromptShown = true;
			const migration = new ChatStorageMigration(
				createStorageDeps(plugin),
			);
			new MigrationPromptModal(
				plugin.app,
				migration,
				async () => {
					// On migrate: switch to jsonl format and reinitialize storage
					plugin.settings.chatStorageFormat = "jsonl";
					plugin._chatStorage = createStorage(
						createStorageDeps(plugin),
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
	if (!plugin.personaLoader) return;
	const personaLoader = plugin.personaLoader;
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
		const curation = await personaLoader.tierMemoryStore.evaluateStaged();
		plugin.logger?.log(
			"info",
			`[onSessionEnd] Curated memory: promoted ${curation.promoted}, demoted ${curation.demoted}`,
		);
	} catch (e) {
		plugin.logger?.log("warn", `[onSessionEnd] Summarization failed: ${e}`);
	}
}

export function cleanupStorage(plugin: ObsidianAIPlugin): void {
	plugin.logger.stopMemoryLogging();
	plugin.logger.flushNow();
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
