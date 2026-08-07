import { createElement } from "react";
import { createRoot } from "react-dom/client";
import ObsidianAIPlugin from "../main";
import { getActiveProviderProfile } from "../settings";
import { createSection, getProviderLabel } from "./helpers";

export function renderHeroSection(
	containerEl: HTMLElement,
	plugin: ObsidianAIPlugin,
): void {
	const profile = getActiveProviderProfile(plugin.settings);
	const heroEl = containerEl.createDiv({ cls: "obsidian-ai-settings-hero" });
	const copyEl = heroEl.createDiv();
	copyEl.createEl("h2", { text: "Settings" });
	copyEl.createEl("p", {
		text: "Provider profiles, chat defaults, commands, and diagnostics.",
	});

	const metaEl = heroEl.createDiv({ cls: "obsidian-ai-settings-hero-meta" });
	createHeroMeta(metaEl, "Active profile", profile.name);
	createHeroMeta(metaEl, "Provider", getProviderLabel(profile.provider));
	createHeroMeta(metaEl, "Model", profile.model || "Unset");
}

function createHeroMeta(
	containerEl: HTMLElement,
	label: string,
	value: string,
): void {
	const itemEl = containerEl.createDiv({
		cls: "obsidian-ai-settings-hero-item",
	});
	itemEl.createEl("div", {
		text: label,
		cls: "obsidian-ai-settings-hero-label",
	});
	itemEl.createEl("div", {
		text: value,
		cls: "obsidian-ai-settings-hero-value",
	});
}
