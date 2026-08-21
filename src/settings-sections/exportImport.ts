import { Notice, Setting, TFile, FuzzySuggestModal } from "obsidian";
import ObsidianAIPlugin from "../main";
import { createSection } from "./helpers";
import { DEFAULT_SETTINGS, type ObsidianAISettings } from "../settings";

interface ExportedSettings {
	schemaVersion: number;
	exportedAt: string;
	version: string;
	settings: ObsidianAISettings;
}

const CURRENT_SCHEMA_VERSION = 1;

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

function redactSensitiveValues(obj: any): any {
	if (obj === null || obj === undefined) return obj;
	if (typeof obj === "string") return obj;
	if (Array.isArray(obj)) {
		return obj.map(redactSensitiveValues);
	}
	if (typeof obj === "object") {
		const result: any = {};
		for (const [key, value] of Object.entries(obj)) {
			if (SENSITIVE_KEYS.includes(key) && typeof value === "string" && value) {
				result[key] = "REDACTED";
			} else {
				result[key] = redactSensitiveValues(value);
			}
		}
		return result;
	}
	return obj;
}

function deepClone<T>(obj: T): T {
	return JSON.parse(JSON.stringify(obj));
}

function exportSettings(plugin: ObsidianAIPlugin, includeSecrets: boolean): ExportedSettings {
	const sc = plugin.settings.syncComponents;
	let settings = deepClone(plugin.settings);

	// Filter out unselected components from export
	if (!sc.chatSessions) {
		settings = { ...settings, remoteStorage: { ...settings.remoteStorage, enabled: false } };
	}
	if (!sc.pluginSettings) {
		// Zero out plugin settings fields but keep structure
		settings.selectionPrompt = "";
		settings.cursorPrompt = "";
		settings.customCommands = [];
		settings.messageHistory = false;
		settings.includeActiveNote = false;
		settings.maxContextTokens = 8000;
		settings.maxContextMessages = 10;
		settings.maxSavedConversations = 20;
		settings.autoNameSessions = false;
		settings.enableAgentTools = true;
		settings.autoApply = false;
		settings.maxAgentSteps = 5;
		settings.pressEnterToSend = true;
		settings.chatTabTitleWidth = 160;
		settings.restoreChatTabs = true;
		settings.showFullRequestTokens = true;
		settings.contextPickerPathDisplay = "duplicates";
		settings.webSearchProvider = "duckduckgo";
		settings.pdfExtractionMethod = "auto";
		settings.pdfMaxPages = 50;
		settings.intelligence = DEFAULT_SETTINGS.intelligence;
		settings.checkForUpdates = true;
		settings.updateChannel = "stable";
		settings.autoUpdate = false;
	}
	if (!sc.apiKeys && !includeSecrets) {
		// Already redacted by redactSensitiveValues if !includeSecrets
	}

	if (!includeSecrets) {
		settings = redactSensitiveValues(settings);
	}

	return {
		schemaVersion: CURRENT_SCHEMA_VERSION,
		exportedAt: new Date().toISOString(),
		version: plugin.manifest.version,
		settings: settings as ObsidianAISettings,
	};
}

async function saveExportToVault(plugin: ObsidianAIPlugin, filename: string, data: string): Promise<void> {
	// Save to vault root so user can see it immediately (works on desktop + mobile)
	await plugin.app.vault.adapter.write(filename, data);
}

function getExportFilename(includeSecrets: boolean): string {
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	return includeSecrets
		? `chat-lab-settings-${timestamp}-full.json`
		: `chat-lab-settings-${timestamp}.json`;
}

function validateImportedSettings(data: any): { valid: boolean; error?: string; settings?: ObsidianAISettings } {
	if (!data || typeof data !== "object") {
		return { valid: false, error: "Invalid JSON: not an object" };
	}
	if (!data.settings || typeof data.settings !== "object") {
		return { valid: false, error: "Invalid format: missing 'settings' field" };
	}
	if (typeof data.schemaVersion !== "number") {
		return { valid: false, error: "Invalid format: missing or invalid 'schemaVersion'" };
	}
	if (data.schemaVersion > CURRENT_SCHEMA_VERSION) {
		return { valid: false, error: `Unsupported schema version: ${data.schemaVersion}. Current: ${CURRENT_SCHEMA_VERSION}` };
	}
	// Future: apply migrations here for schemaVersion < CURRENT_SCHEMA_VERSION
	return { valid: true, settings: data.settings };
}

function mergeSettings(current: ObsidianAISettings, imported: Partial<ObsidianAISettings>): ObsidianAISettings {
	// Preserve provider profiles: merge by ID, keeping existing ones that aren't in the import
	const mergedProfiles = [...current.providerProfiles];
	if (imported.providerProfiles) {
		for (const importedProfile of imported.providerProfiles) {
			const idx = mergedProfiles.findIndex((p) => p.id === importedProfile.id);
			if (idx >= 0) {
				mergedProfiles[idx] = { ...mergedProfiles[idx], ...importedProfile };
			} else {
				mergedProfiles.push(importedProfile);
			}
		}
	}

	// For other fields, imported values override current values
	const result: ObsidianAISettings = {
		...current,
		...imported,
		providerProfiles: mergedProfiles,
	};

	// Restore defaults for any missing required fields
	for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof ObsidianAISettings>) {
		if (result[key] === undefined) {
			(result as any)[key] = deepClone(DEFAULT_SETTINGS[key]);
		}
	}

	return result;
}

export function renderExportImportSection(
	containerEl: HTMLElement,
	plugin: ObsidianAIPlugin,
	saveSettings: (options?: {
		refresh?: boolean;
		quiet?: boolean;
	}) => Promise<void>,
): void {
	const sectionEl = createSection(
		containerEl,
		"Backup & Restore",
		"Export your configuration for backup or migration, or import settings from a previous export.",
	);

	new Setting(sectionEl)
		.setName("Export settings")
		.setDesc("Save your settings as a JSON file in the vault config folder. API keys and passwords are redacted by default.")
		.addButton((button) => {
			button.setButtonText("Export").onClick(async () => {
				try {
					const exported = exportSettings(plugin, false);
					const json = JSON.stringify(exported, null, 2);
					const filename = getExportFilename(false);
					await saveExportToVault(plugin, filename, json);
					new Notice(`Settings exported to ${filename}`, 3000);
				} catch (e: any) {
					new Notice(`Export failed: ${e.message}`, 5000);
				}
			});
		});

	new Setting(sectionEl)
		.setName("Export with secrets")
		.setDesc("⚠️ Export including API keys and passwords. Only use this for personal backups — never share this file.")
		.addButton((button) => {
			button.setButtonText("Export with secrets").setWarning().onClick(async () => {
				try {
					const exported = exportSettings(plugin, true);
					const json = JSON.stringify(exported, null, 2);
					const filename = getExportFilename(true);
					await saveExportToVault(plugin, filename, json);
					new Notice(`Settings exported (with secrets) to ${filename}`, 3000);
				} catch (e: any) {
					new Notice(`Export failed: ${e.message}`, 5000);
				}
			});
		});

	new Setting(sectionEl)
		.setName("Import settings")
		.setDesc("Load settings from a previously exported JSON file in your vault.")
		.addButton((button) => {
			button.setButtonText("Import…").onClick(async () => {
				// Find all JSON files in vault that look like exports
				const jsonFiles = plugin.app.vault.getFiles().filter((f: TFile) =>
					f.extension === "json" && f.basename.startsWith("chat-lab-settings")
				);

				if (jsonFiles.length === 0) {
					new Notice("No export files found. Look for 'chat-lab-settings-*.json' in your vault.", 5000);
					return;
				}

				// Show fuzzy finder for JSON files
				class ExportFileSuggester extends FuzzySuggestModal<TFile> {
					getItems(): TFile[] { return jsonFiles; }
					getItemText(item: TFile): string { return item.path; }
					onChooseItem(file: TFile): void {
						void importFromFile(plugin, file, saveSettings);
					}
				}
				new ExportFileSuggester(plugin.app).open();
			});
		});
}

async function importFromFile(
	plugin: ObsidianAIPlugin,
	file: TFile,
	saveSettings: (options?: { refresh?: boolean; quiet?: boolean }) => Promise<void>,
): Promise<void> {
	try {
		const text = await plugin.app.vault.read(file);
		const data = JSON.parse(text);
		const validation = validateImportedSettings(data);
		if (!validation.valid) {
			new Notice(`Import failed: ${validation.error}`, 5000);
			return;
		}

		const imported = validation.settings!;
		const current = plugin.settings;

		// Count changes for user feedback
		const importedProfileIds = new Set(imported.providerProfiles?.map((p: any) => p.id) ?? []);
		const currentProfileIds = new Set(current.providerProfiles.map((p) => p.id));
		const newProfiles = imported.providerProfiles?.filter((p: any) => !currentProfileIds.has(p.id)).length ?? 0;
		const updatedProfiles = imported.providerProfiles?.filter((p: any) => currentProfileIds.has(p.id)).length ?? 0;

		plugin.settings = mergeSettings(current, imported);
		await saveSettings({ refresh: true });
		new Notice(
			`Settings imported: ${newProfiles} new profile(s), ${updatedProfiles} updated.`,
			4000,
		);
	} catch (e: any) {
		new Notice(`Import failed: ${e.message}`, 5000);
	}
}
