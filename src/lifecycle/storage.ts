import type { ChatSession } from "../types";
import { createFileLogger } from "../logger";
import { createStorage } from "../storage/ChatStorage";
import { ChatStorageMigration } from "../storage/Migration";
import { MigrationPromptModal } from "../modals/MigrationPromptModal";
import { SessionStorage } from "../storage/session-storage";
import { PersonaLoader } from "../intelligence/PersonaLoader";
import { SearchIndex } from "../search/index";
import { SessionSummarizer } from "../intelligence/SessionSummarizer";
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

export {
	syncPluginData,
	serializePluginData,
	deserializePluginData,
	openRemoteStorageSettings,
} from "./pluginDataSync";

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
