import { App, Notice, PluginSettingTab, Platform } from "obsidian";
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
import { renderIntelligenceSection } from "./intelligence";
import { renderIntegrationsSection } from "./integrations";
import { renderSyncSection } from "./syncSettings";
import { renderUpdaterSection } from "./updaterSettings";
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

function getScrollableAncestor(element: HTMLElement): HTMLElement | null {
	let ancestor = element.parentElement;
	while (ancestor) {
		const overflowY = window.getComputedStyle(ancestor).overflowY;
		if (
			(overflowY === "auto" || overflowY === "scroll") &&
			ancestor.scrollHeight > ancestor.clientHeight
		) {
			return ancestor;
		}
		ancestor = ancestor.parentElement;
	}
	return null;
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

			// Cleanup existing React roots before re-rendering
			containerEl.querySelectorAll('.obsidian-ai-settings-react-profiles').forEach((el) => {
				const root = (el as any).__reactRoot;
				if (root) root.unmount();
			});

			containerEl.empty();
			containerEl.addClass("obsidian-ai-settings");

			renderHeroSection(containerEl, this.plugin);
			const nav = containerEl.createEl("nav", { cls: "obsidian-ai-settings-toc", attr: { "aria-label": "Settings sections" } });
			[
				["Provider Profiles", "Provider Profiles"],
				["Chat Defaults", "Chat Defaults"],
				["Agent Tools", "Agent Tools"],
				["Integrations", "Integrations"],
				["Intelligence", "AI Intelligence Layer"],
				["Web Search", "Web Search"],
				["Sync", "Multi-User Sync"],
				["Updates", "Updates"],
				["Advanced", "Advanced"],
				["Custom Commands", "Custom Commands"],
				["Diagnostics", "Diagnostics"],
			].filter((item) => item[0] !== "Updates" || Platform.isDesktop)
			.forEach(([label, sectionTitle]) => {
				const id = `obsidian-ai-settings-${sectionTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
				const button = nav.createEl("button", { text: label, attr: { type: "button" } });
				button.addEventListener("click", (event) => {
					event.preventDefault();
					const section = containerEl.querySelector<HTMLElement>(`#${id}`);
					if (!section) return;
					const scrollContainer = getScrollableAncestor(containerEl);
					if (scrollContainer) {
						const top = section.getBoundingClientRect().top
							- scrollContainer.getBoundingClientRect().top
							+ scrollContainer.scrollTop
							- 12;
						scrollContainer.scrollTo({ top, behavior: "smooth" });
					} else {
						section.scrollIntoView({ behavior: "smooth", block: "start" });
					}
				});
			});
			renderProviderProfilesSection(containerEl, this.plugin);
			renderChatDefaultsSection(containerEl, this.plugin, this.saveSettings.bind(this));
			renderAgentToolsSection(containerEl, this.plugin, this.saveSettings.bind(this));
			renderIntegrationsSection(containerEl, this.plugin, this.saveSettings.bind(this));
			renderIntelligenceSection(containerEl, this.plugin, this.saveSettings.bind(this));
			renderWebSearchSection(containerEl, this.plugin, this.saveSettings.bind(this));
			renderSyncSection(containerEl, this.plugin, this.saveSettings.bind(this));
			if (Platform.isDesktop) {
				renderUpdaterSection(containerEl, this.plugin, this.saveSettings.bind(this));
			}
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
