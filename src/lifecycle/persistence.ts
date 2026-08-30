import { normalizeSettings } from "../settings";
import type { StoredChatData } from "../types";
import { createStorage, type StorageDeps } from "../storage/ChatStorage";
import type ObsidianAIPlugin from "../main";

/** Build the dependencies shared by the chat storage implementations. */
export function createStorageDeps(plugin: ObsidianAIPlugin): StorageDeps {
	return {
		app: plugin.app,
		manifest: plugin.manifest,
		settings: plugin.settings,
		loadData: () => plugin.loadData(),
		saveData: (data) => plugin.saveData(data),
		logger: plugin.logger,
	};
}

export async function loadSettings(plugin: ObsidianAIPlugin): Promise<void> {
	plugin.logger?.log("info", "loadSettings: reading data.json");
	const raw = await plugin.loadData();
	plugin._settingsLoadedFromFile = raw !== null && typeof raw === "object";
	plugin.logger?.log(
		"info",
		`loadSettings: _settingsLoadedFromFile=${plugin._settingsLoadedFromFile}, raw=${raw ? "exists" : "null"}`,
	);
	plugin.settings = normalizeSettings(raw);

	// Restore WebDAV password from localStorage (not synced, not in data.json)
	const savedPassword = localStorage.getItem("obsidian-ai:webdav-password");
	if (savedPassword && plugin.settings.remoteStorage.webdav) {
		plugin.settings.remoteStorage.webdav.password = savedPassword;
	}

	plugin.logger?.setMaxSize(plugin.settings.debugLogMaxSizeMB * 1024 * 1024);
}

export async function saveSettings(plugin: ObsidianAIPlugin): Promise<void> {
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
		localStorage.setItem("obsidian-ai:webdav-password", webdavPassword);
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
	await ensureRollingBackup(plugin, existing);
	await plugin.saveData(payload);
	plugin.logger?.log("info", "saveSettings: data.json written successfully");
}

export async function loadChatData(
	plugin: ObsidianAIPlugin,
): Promise<StoredChatData> {
	plugin.logger?.log("info", "loadChatData: delegating to storage layer");
	if (!plugin._chatStorage) {
		plugin._chatStorage = createStorage(
			createStorageDeps(plugin),
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
			createStorageDeps(plugin),
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

/** Debounced auto-sync trigger. Waits 3s of inactivity before syncing. */
let autoSyncTimeout: number | null = null;

export function scheduleAutoSync(plugin: ObsidianAIPlugin): void {
	if (autoSyncTimeout) {
		window.clearTimeout(autoSyncTimeout);
	}
	autoSyncTimeout = window.setTimeout(() => {
		autoSyncTimeout = null;
		if (plugin.settings.remoteStorage?.autoSync) {
			plugin.triggerSync().catch((err) => {
				plugin.logger?.log("warn", `Auto-sync failed: ${err.message}`);
			});
		}
	}, 3000);
}

/** Create rolling backups of data.json before writes. */
async function ensureRollingBackup(
	plugin: ObsidianAIPlugin,
	_currentData: unknown,
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
