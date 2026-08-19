import { Notice, Setting } from "obsidian";
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
	const settings = includeSecrets
		? deepClone(plugin.settings)
		: redactSensitiveValues(deepClone(plugin.settings));
	return {
		schemaVersion: CURRENT_SCHEMA_VERSION,
		exportedAt: new Date().toISOString(),
		version: plugin.manifest.version,
		settings: settings as ObsidianAISettings,
	};
}

function triggerDownload(filename: string, data: string, mimeType: string): void {
	const blob = new Blob([data], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
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
		.setDesc("Download your settings as a JSON file. API keys and passwords are redacted by default.")
		.addButton((button) => {
			button.setButtonText("Export").onClick(() => {
				const exported = exportSettings(plugin, false);
				const json = JSON.stringify(exported, null, 2);
				const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
				triggerDownload(`chat-lab-settings-${timestamp}.json`, json, "application/json");
				new Notice("Settings exported with sensitive values redacted", 3000);
			});
		});

	new Setting(sectionEl)
		.setName("Export with secrets")
		.setDesc("⚠️ Export including API keys and passwords. Only use this for personal backups — never share this file.")
		.addButton((button) => {
			button.setButtonText("Export with secrets").setWarning().onClick(() => {
				const exported = exportSettings(plugin, true);
				const json = JSON.stringify(exported, null, 2);
				const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
				triggerDownload(`chat-lab-settings-${timestamp}-full.json`, json, "application/json");
				new Notice("Settings exported with secrets included", 3000);
			});
		});

	new Setting(sectionEl)
		.setName("Import settings")
		.setDesc("Load settings from a previously exported JSON file. Existing profiles are merged by ID.")
		.addButton((button) => {
			button.setButtonText("Import…").onClick(() => {
				const input = document.createElement("input");
				input.type = "file";
				input.accept = ".json,application/json";
				input.onchange = async (event) => {
					const file = (event.target as HTMLInputElement).files?.[0];
					if (!file) return;

					try {
						const text = await file.text();
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
				};
				input.click();
			});
		});
}
