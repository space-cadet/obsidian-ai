import { Setting } from "obsidian";
import ObsidianAIPlugin from "../main";
import { WebSearchProvider } from "../settings";
import { createSection } from "./helpers";

export function renderWebSearchSection(
	containerEl: HTMLElement,
	plugin: ObsidianAIPlugin,
	saveSettings: (options?: {
		refresh?: boolean;
		quiet?: boolean;
	}) => Promise<void>,
): void {
	const sectionEl = createSection(
		containerEl,
		"Web Search",
		"Configure how the AI searches the web for current information.",
	);

	new Setting(sectionEl)
		.setName("Search provider")
		.setDesc("Choose the search engine to use for web queries.")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("duckduckgo", "DuckDuckGo (free, no API key)")
				.addOption("brave", "Brave Search API (requires key)")
				.addOption("tavily", "Tavily AI Search (requires key)")
				.addOption("exa", "Exa AI Search (requires key)")
				.addOption("searxng", "SearXNG (self-hosted)")
				.setValue(plugin.settings.webSearchProvider)
				.onChange(async (value) => {
					plugin.settings.webSearchProvider =
						value as WebSearchProvider;
					await saveSettings({ refresh: true, quiet: true });
				}),
		);

	// Brave API key (only shown when Brave is selected)
	if (plugin.settings.webSearchProvider === "brave") {
		new Setting(sectionEl)
			.setName("Brave API key")
			.setDesc(
				"Your Brave Search API key. Get one at https://brave.com/search/api/ (2000 free queries/month).",
			)
			.addText((text) => {
				text.setPlaceholder("BS...")
					.setValue(plugin.settings.braveApiKey)
					.inputEl.addEventListener("blur", async () => {
						plugin.settings.braveApiKey = text.getValue().trim();
						await saveSettings();
					});
				text.inputEl.type = "password";
			});
	}

	// Tavily API key (only shown when Tavily is selected)
	if (plugin.settings.webSearchProvider === "tavily") {
		new Setting(sectionEl)
			.setName("Tavily API key")
			.setDesc(
				"Your Tavily API key. Get one at https://tavily.com/ (free tier available).",
			)
			.addText((text) => {
				text.setPlaceholder("tvly-...")
					.setValue(plugin.settings.tavilyApiKey)
					.inputEl.addEventListener("blur", async () => {
						plugin.settings.tavilyApiKey = text.getValue().trim();
						await saveSettings();
					});
				text.inputEl.type = "password";
			});
	}

	// Exa API key (only shown when Exa is selected)
	if (plugin.settings.webSearchProvider === "exa") {
		new Setting(sectionEl)
			.setName("Exa API key")
			.setDesc(
				"Your Exa API key. Get one at https://exa.ai/ (free tier available).",
			)
			.addText((text) => {
				text.setPlaceholder("exa-...")
					.setValue(plugin.settings.exaApiKey)
					.inputEl.addEventListener("blur", async () => {
						plugin.settings.exaApiKey = text.getValue().trim();
						await saveSettings();
					});
				text.inputEl.type = "password";
			});
	}

	// SearXNG URL (only shown when SearXNG is selected)
	if (plugin.settings.webSearchProvider === "searxng") {
		new Setting(sectionEl)
			.setName("SearXNG instance URL")
			.setDesc(
				"URL of your SearXNG instance, e.g. https://search.example.com",
			)
			.addText((text) => {
				text.setPlaceholder("https://...")
					.setValue(plugin.settings.searxngUrl)
					.inputEl.addEventListener("blur", async () => {
						plugin.settings.searxngUrl = text
							.getValue()
							.trim()
							.replace(/\/$/, "");
						await saveSettings();
					});
			});
	}
}
