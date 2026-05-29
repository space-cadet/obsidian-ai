import { App, Notice, PluginSettingTab } from "obsidian";
import ObsidianAIPlugin from "../main";
import { ProviderProfile } from "../settings";
import { getActiveProviderProfile } from "../settings";
import { renderAgentToolsSection } from "./agentTools";
import { renderAdvancedSection } from "./advanced";
import { renderChatDefaultsSection } from "./chatDefaults";
import { renderCustomCommandsSection } from "./customCommands";
import { renderDiagnosticsSection } from "./diagnostics";
import { renderHeroSection } from "./hero";
import { renderProviderProfilesSection } from "./providerProfiles";
import { renderWebSearchSection } from "./webSearch";

function debounce(fn: () => void, ms: number): () => void {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	return () => {
		if (timeout) {
			clearTimeout(timeout);
		}
		timeout = setTimeout(() => fn(), ms);
	};
}

export class ObsidianAISettingsTab extends PluginSettingTab {
	plugin: ObsidianAIPlugin;
	private isDisplaying = false;
	private pendingRefresh = false;
	private debouncedProfileSave = debounce(() => {
		void this.saveSettings({ quiet: true });
	}, 250);

	constructor(app: App, plugin: ObsidianAIPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private get activeProfile(): ProviderProfile {
		return getActiveProviderProfile(this.plugin.settings);
	}

	private async saveSettings(options?: {
		refresh?: boolean;
		quiet?: boolean;
	}) {
		const refresh = options?.refresh ?? false;
		const quiet = options?.quiet ?? false;
		await this.plugin.saveSettings();
		this.plugin.chatapi.updateSettings(this.plugin.settings);

		if (refresh) {
			if (this.isDisplaying) {
				this.pendingRefresh = true;
				return;
			}
			this.display();
			return;
		}

		if (!quiet) {
			new Notice("Settings saved", 1800);
		}
	}

	display(): void {
		this.isDisplaying = true;
		try {
			const { containerEl } = this;
			containerEl.empty();
			containerEl.addClass("obsidian-ai-settings");

			renderHeroSection(containerEl, this.plugin);
			renderProviderProfilesSection(containerEl, this.plugin);
			renderChatDefaultsSection(containerEl, this.plugin, this.saveSettings.bind(this));
			renderAgentToolsSection(containerEl, this.plugin, this.saveSettings.bind(this));
			renderWebSearchSection(containerEl, this.plugin, this.saveSettings.bind(this));
			renderAdvancedSection(containerEl, this.plugin, this.saveSettings.bind(this));
			renderCustomCommandsSection(containerEl, this.plugin, this.saveSettings.bind(this));
			renderDiagnosticsSection(containerEl, this.plugin, this.app, this.saveSettings.bind(this));
		} finally {
			this.isDisplaying = false;
			if (this.pendingRefresh) {
				this.pendingRefresh = false;
				this.display();
			}
		}
	}
}
