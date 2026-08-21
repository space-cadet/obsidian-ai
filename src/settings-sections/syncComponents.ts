import { Notice, Setting } from "obsidian";
import ObsidianAIPlugin from "../main";
import { createSection } from "./helpers";

export function renderSyncComponentsSection(
	containerEl: HTMLElement,
	plugin: ObsidianAIPlugin,
	saveSettings: (options?: { refresh?: boolean; quiet?: boolean }) => Promise<void>,
): void {
	const sectionEl = createSection(
		containerEl,
		"Sync Components",
		"Choose which data to include when syncing or exporting.",
	);
	sectionEl.id = "obsidian-ai-settings-sync-components";

	const sc = plugin.settings.syncComponents;

	const createToggle = (
		name: string,
		desc: string,
		key: keyof typeof sc,
		warning?: string,
	) => {
		const setting = new Setting(sectionEl)
			.setName(name)
			.setDesc(desc)
			.addToggle((toggle) =>
				toggle.setValue(sc[key]).onChange(async (value) => {
					sc[key] = value;
					await saveSettings({ quiet: true });
				}),
			);
		if (warning) {
			const warningEl = setting.descEl.createEl("span", {
				cls: "setting-item-warning",
			});
			warningEl.style.color = "var(--text-warning)";
			warningEl.textContent = ` ⚠️ ${warning}`;
		}
		return setting;
	};

	createToggle(
		"Chat sessions",
		"Messages, context items, and drafts",
		"chatSessions",
	);

	createToggle(
		"Plugin settings",
		"Prompts, profiles (without API keys), UI preferences, agent config",
		"pluginSettings",
	);

	createToggle(
		"API keys & credentials",
		"Provider API keys, WebDAV passwords, search API keys",
		"apiKeys",
		"Requires encryption passphrase to be set in Remote Storage",
	);

	createToggle(
		"AI Memory",
		"Persistent facts, preferences, insights, and references",
		"memory",
	);

	createToggle(
		"Memory audit log",
		"Record of all memory create/update/delete operations",
		"memoryAudit",
	);

	createToggle(
		"AI Persona",
		"The persona.md identity file used for the Intelligence Layer",
		"persona",
	);

	createToggle(
		"Usage statistics",
		"Aggregated token usage and model statistics",
		"usageStats",
	);
}
