import { PluginDataManager } from "../data/PluginDataManager";
import type { SyncRetryRecord } from "../sync/SyncRetryStore";
import {
	PluginFileSyncManager,
	createVaultTextSyncTarget,
	type PluginFileSyncConflict,
	type PluginFileSyncState,
	type PluginFileSyncTarget,
} from "../sync/PluginFileSyncManager";
import { requestPluginFileConflictChoice } from "../modals/PluginFileConflictModal";
import type ObsidianAIPlugin from "../main";

// ── Serialization ──────────────────────────────────────────────────────

/**
 * Serialize plugin settings and data for remote sync.
 * Delegates to PluginDataManager for unified serialization.
 */
export function serializePluginData(plugin: ObsidianAIPlugin): object {
	const manager = new PluginDataManager(plugin);
	return manager.createSyncBundle();
}

/**
 * Deserialize and merge plugin data from remote.
 * Delegates to PluginDataManager for unified deserialization.
 */
export async function deserializePluginData(
	plugin: ObsidianAIPlugin,
	data: object,
): Promise<void> {
	const manager = new PluginDataManager(plugin);
	manager.applySyncBundle(data as any);
	await plugin.saveSettings();
	plugin.logger?.log("info", "[T55] Plugin data merged from remote");
}

// ── Sync Orchestration ────────────────────────────────────────────────

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
	const result = _makeEmptyResult();
	if (!plugin.syncEngine) return result;

	const sc = plugin.settings.syncComponents;
	const dir =
		direction ?? plugin.settings.remoteStorage.syncDirection ?? "both";
	const pluginDataPath = `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}`;
	const localAdapter = plugin.app.vault.adapter;

	const targets = _buildSyncTargets(plugin, sc, pluginDataPath, localAdapter);
	if (targets.length === 0) {
		plugin.logger?.log("info", "[pluginDataSync] No components enabled");
		return result;
	}

	try {
		const manager = new PluginFileSyncManager({
			remote: plugin.syncEngine.storageAdapter,
			crypto: plugin.syncEngine.encryptionLayer,
			stateStore: _makeStateStore(plugin),
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
			_logResults(plugin, syncResult.items);
		}
	} catch (err: any) {
		const message = `Plugin data sync failed: ${err.message}`;
		result.failed += 1;
		result.status = "failed";
		result.errors.push(message);
		plugin.logger?.log("warn", `[pluginDataSync] ${message}`);
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

// ── Internal Helpers ───────────────────────────────────────────────────

function _makeEmptyResult(): ReturnType<typeof syncPluginData> extends Promise<
	infer R
>
	? R
	: never {
	return {
		uploaded: false,
		downloaded: false,
		conflict: false,
		failed: 0,
		errors: [],
		status: "complete",
		retryable: [],
		items: [],
	};
}

function _buildSyncTargets(
	plugin: ObsidianAIPlugin,
	sc: ObsidianAIPlugin["settings"]["syncComponents"],
	pluginDataPath: string,
	localAdapter: any,
): PluginFileSyncTarget[] {
	const targets: PluginFileSyncTarget[] = [];

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
				JSON.stringify(serializePluginData(plugin), null, 2),
			writeLocal: async (content) => {
				const data = JSON.parse(content);
				await deserializePluginData(plugin, data);
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
		// Usage stats are computed on the fly and are intentionally upload-only
		targets.push({
			id: "usage-stats",
			remotePath: "usage-stats.json",
			allowDownload: false,
			readLocal: async () => {
				const chatData = await plugin.loadChatData();
				const { summarizeLlmUsage } = await import("../lib/usageStats");
				const stats = summarizeLlmUsage(chatData.sessions || []);
				return JSON.stringify(stats, null, 2);
			},
			writeLocal: async () => {
				// Usage data is derived locally and is intentionally upload-only.
			},
		});
	}

	return targets;
}

function _makeStateStore(
	plugin: ObsidianAIPlugin,
): {
	load: () => Promise<PluginFileSyncState | null>;
	save: (state: PluginFileSyncState) => Promise<void>;
} {
	return {
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
}

function _logResults(
	plugin: ObsidianAIPlugin,
	items: Array<{
		id: string;
		status: string;
		error?: string;
	}>,
): void {
	for (const item of items) {
		if (item.status === "failed" || item.status === "conflict") {
			plugin.logger?.log(
				"warn",
				`[pluginDataSync] Failed ${item.id}: ${item.error}`,
			);
		} else if (item.status !== "skipped") {
			plugin.logger?.log(
				"info",
				`[pluginDataSync] ${item.status} ${item.id}`,
			);
		}
	}
}
