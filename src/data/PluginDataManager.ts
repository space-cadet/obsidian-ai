import type ObsidianAIPlugin from "../main";
import {
	DEFAULT_SETTINGS,
	type ObsidianAISettings,
	type SyncComponentConfig,
} from "../settings";
import { migrateRecentModelsToProviders } from "../lib/recentModels";

/** Fields that should never be overwritten from remote or import sources */
const CREDENTIAL_KEYS = [
	"apiKey",
	"authToken",
	"passphrase",
	"password",
	"secretAccessKey",
	"accessKeyId",
	"tavilyApiKey",
	"exaApiKey",
	"braveApiKey",
];

/** Keys that are considered sensitive and should be redacted by default */
const SENSITIVE_KEYS = [
	"apiKey",
	"authToken",
	"passphrase",
	"password",
	"secretAccessKey",
	"accessKeyId",
	"tavilyApiKey",
	"exaApiKey",
	"braveApiKey",
];

function deepClone<T>(obj: T): T {
	return JSON.parse(JSON.stringify(obj));
}

function redactSensitiveValues(obj: any): any {
	if (obj === null || obj === undefined) return obj;
	if (typeof obj === "string") return obj;
	if (Array.isArray(obj)) {
		return obj.map(redactSensitiveValues);
	}
	if (typeof obj === "object") {
		const result: any = {};
		for (const [key, value] of Object.entries(obj)) {
			if (
				SENSITIVE_KEYS.includes(key) &&
				typeof value === "string" &&
				value
			) {
				result[key] = "REDACTED";
			} else {
				result[key] = redactSensitiveValues(value);
			}
		}
		return result;
	}
	return obj;
}

/**
 * Extract plugin settings filtered by component selection.
 * Used by both export and remote sync to produce a consistent data snapshot.
 */
function extractSettings(
	plugin: ObsidianAIPlugin,
	components: SyncComponentConfig,
	includeSecrets: boolean,
	mode: "export" | "sync" = "export",
): Partial<ObsidianAISettings> {
	const settings = deepClone(plugin.settings);

	// For export mode, don't strip keys here — redactSensitiveValues handles redaction later
	// For sync mode, actually remove keys when apiKeys is disabled
	if (mode === "sync" && !components.apiKeys) {
		settings.providerProfiles = settings.providerProfiles.map((p: any) => ({
			...p,
			apiKey: "",
			password: "",
		}));
	}

	// If pluginSettings disabled, zero out non-essential fields
	if (!components.pluginSettings) {
		settings.selectionPrompt = "";
		settings.cursorPrompt = "";
		settings.customCommands = [];
		settings.messageHistory = false;
		settings.includeActiveNote = false;
		settings.maxContextTokens = DEFAULT_SETTINGS.maxContextTokens;
		settings.maxContextMessages = DEFAULT_SETTINGS.maxContextMessages;
		settings.maxSavedConversations = DEFAULT_SETTINGS.maxSavedConversations;
		settings.autoNameSessions = false;
		settings.enableAgentTools = true;
		settings.autoApply = false;
		settings.maxAgentSteps = DEFAULT_SETTINGS.maxAgentSteps;
		settings.pressEnterToSend = true;
		settings.chatTabTitleWidth = DEFAULT_SETTINGS.chatTabTitleWidth;
		settings.restoreChatTabs = true;
		settings.showFullRequestTokens = true;
		settings.contextPickerPathDisplay =
			DEFAULT_SETTINGS.contextPickerPathDisplay;
		settings.webSearchProvider = DEFAULT_SETTINGS.webSearchProvider;
		settings.pdfExtractionMethod = DEFAULT_SETTINGS.pdfExtractionMethod;
		settings.pdfMaxPages = DEFAULT_SETTINGS.pdfMaxPages;
		settings.intelligence = deepClone(DEFAULT_SETTINGS.intelligence);
		settings.checkForUpdates = true;
		settings.updateChannel = "stable";
		settings.autoUpdate = false;
		settings.providerProfiles = [];
		settings.activeProviderProfileId = "";
		settings.selectedProfileIds = [];
	}

	// If chatSessions disabled, disable remote storage
	if (!components.chatSessions) {
		settings.remoteStorage = {
			...settings.remoteStorage,
			enabled: false,
		};
	}

	return settings;
}

/**
 * Merge imported/remote settings into current settings.
 * Preserves local credentials and remote storage config by default.
 */
function mergeSettings(
	current: ObsidianAISettings,
	imported: Partial<ObsidianAISettings>,
	options: {
		preserveCredentials?: boolean;
		preserveRemoteStorage?: boolean;
	} = {},
): ObsidianAISettings {
	const { preserveCredentials = true, preserveRemoteStorage = true } =
		options;

	// Merge provider profiles by ID
	const mergedProfiles = [...current.providerProfiles];
	if (imported.providerProfiles) {
		for (const importedProfile of imported.providerProfiles) {
			const idx = mergedProfiles.findIndex(
				(p) => p.id === importedProfile.id,
			);
			if (idx >= 0) {
				mergedProfiles[idx] = {
					...mergedProfiles[idx],
					...importedProfile,
				};
			} else {
				mergedProfiles.push(importedProfile);
			}
		}
	}

	const result: ObsidianAISettings = {
		...current,
		...imported,
		providerProfiles: mergedProfiles,
	};
	result.recentModels = migrateRecentModelsToProviders(
		result.recentModels ?? {},
		result.providerProfiles,
	);

	// Restore defaults for any missing required fields
	for (const key of Object.keys(DEFAULT_SETTINGS) as Array<
		keyof ObsidianAISettings
	>) {
		if (result[key] === undefined) {
			(result as any)[key] = deepClone(DEFAULT_SETTINGS[key]);
		}
	}

	// Preserve credentials: restore local values for credential keys
	if (preserveCredentials) {
		for (let i = 0; i < result.providerProfiles.length; i++) {
			const localProfile = current.providerProfiles.find(
				(p) => p.id === result.providerProfiles[i].id,
			);
			if (localProfile) {
				for (const key of CREDENTIAL_KEYS) {
					if (
						(localProfile as any)[key] &&
						!(result.providerProfiles[i] as any)[key]
					) {
						(result.providerProfiles[i] as any)[key] = (
							localProfile as any
						)[key];
					}
				}
			}
		}
	}

	// Preserve remote storage credentials
	if (preserveRemoteStorage && imported.remoteStorage) {
		result.remoteStorage = {
			...imported.remoteStorage,
			webdav: current.remoteStorage.webdav,
			s3: current.remoteStorage.s3,
		};
	}

	return result;
}

export interface ExportBundle {
	schemaVersion: number;
	exportedAt: string;
	version: string;
	settings: ObsidianAISettings;
}

export interface SyncBundle {
	version: number;
	components: Partial<SyncComponentConfig>;
	settings?: Partial<ObsidianAISettings>;
	syncIndex?: any;
}

/**
 * Unified manager for all plugin data serialization and deserialization.
 * Used by export/import, remote sync, and any future data portability features.
 */
export class PluginDataManager {
	constructor(private plugin: ObsidianAIPlugin) {}

	/**
	 * Create an export bundle for backup/migration.
	 * Respects sync component selection and redacts secrets by default.
	 */
	createExportBundle(includeSecrets: boolean = false): ExportBundle {
		const sc = this.plugin.settings.syncComponents;
		let settings = extractSettings(
			this.plugin,
			sc,
			includeSecrets,
			"export",
		) as ObsidianAISettings;

		if (!includeSecrets) {
			settings = redactSensitiveValues(settings);
		}

		return {
			schemaVersion: 1,
			exportedAt: new Date().toISOString(),
			version: this.plugin.manifest.version,
			settings,
		};
	}

	/**
	 * Create a sync bundle for remote storage upload.
	 * Only includes components enabled in syncComponents.
	 */
	createSyncBundle(): SyncBundle {
		const sc = this.plugin.settings.syncComponents;
		const settings = extractSettings(this.plugin, sc, true, "sync");

		const bundle: SyncBundle = {
			version: 1,
			components: {
				pluginSettings: sc.pluginSettings,
				apiKeys: sc.apiKeys,
				memory: sc.memory,
				memoryAudit: sc.memoryAudit,
				persona: sc.persona,
				usageStats: sc.usageStats,
			},
		};

		if (sc.pluginSettings) {
			bundle.settings = settings;
			bundle.syncIndex =
				(this.plugin.syncEngine as any)?.indexManager?.getIndex?.() ??
				null;
		}

		return bundle;
	}

	/**
	 * Apply an export bundle (from backup/migration).
	 */
	applyExportBundle(bundle: ExportBundle): void {
		this.plugin.settings = mergeSettings(
			this.plugin.settings,
			bundle.settings,
			{
				preserveCredentials: true,
				preserveRemoteStorage: true,
			},
		);
	}

	/**
	 * Apply a sync bundle (from remote storage).
	 * Only merges components that are enabled locally.
	 */
	applySyncBundle(bundle: SyncBundle): void {
		const sc = this.plugin.settings.syncComponents;

		if (sc.pluginSettings && bundle.settings) {
			this.plugin.settings = mergeSettings(
				this.plugin.settings,
				bundle.settings,
				{
					preserveCredentials: !sc.apiKeys,
					preserveRemoteStorage: true,
				},
			);
		}

		if (bundle.syncIndex && this.plugin.syncEngine) {
			const indexManager = (this.plugin.syncEngine as any).indexManager;
			if (indexManager?.mergeIndex) {
				indexManager.mergeIndex(bundle.syncIndex);
			}
		}
	}

	/**
	 * Validate that imported data has the expected structure.
	 */
	validateImport(data: any): { valid: boolean; error?: string } {
		if (!data || typeof data !== "object") {
			return { valid: false, error: "Invalid JSON: not an object" };
		}
		if (!data.settings || typeof data.settings !== "object") {
			return {
				valid: false,
				error: "Invalid format: missing 'settings' field",
			};
		}
		if (typeof data.schemaVersion !== "number") {
			return {
				valid: false,
				error: "Invalid format: missing or invalid 'schemaVersion'",
			};
		}
		if (data.schemaVersion > 1) {
			return {
				valid: false,
				error: `Unsupported schema version: ${data.schemaVersion}. Current: 1`,
			};
		}
		return { valid: true };
	}
}

// Re-export helpers for standalone use
export { extractSettings, mergeSettings, redactSensitiveValues, deepClone };
