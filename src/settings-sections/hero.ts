import { createElement } from "react";
import { createRoot } from "react-dom/client";
import ObsidianAIPlugin from "../main";
import { getActiveProviderProfile } from "../settings";
import { createSection, getProviderLabel } from "./helpers";
import {
	PLUGIN_VERSION,
	GIT_COMMIT_HASH,
	GIT_SHORT_HASH,
	GIT_BRANCH,
} from "../version-info";

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

	// Version / deployment info
	const versionEl = metaEl.createDiv({
		cls: "obsidian-ai-settings-hero-item obsidian-ai-settings-version-info",
	});
	versionEl.createEl("div", {
		text: "Version",
		cls: "obsidian-ai-settings-hero-label",
	});
	const versionValue = versionEl.createEl("div", {
		cls: "obsidian-ai-settings-hero-value",
	});
	// Version badge
	versionValue.createEl("span", {
		text: `v${PLUGIN_VERSION}`,
		cls: "obsidian-ai-settings-version-badge",
	});
	// Branch
	const branchSpan = versionValue.createEl("span", {
		cls: "obsidian-ai-settings-version-detail",
	});
	branchSpan.createEl("span", {
		text: "Branch: ",
		cls: "obsidian-ai-settings-version-detail-label",
	});
	branchSpan.createEl("span", {
		text: GIT_BRANCH,
		cls: "obsidian-ai-settings-version-detail-value",
	});
	// Commit hash (link to GitHub)
	const commitLink = versionValue.createEl("span", {
		cls: "obsidian-ai-settings-version-detail",
	});
	commitLink.createEl("span", {
		text: "Commit: ",
		cls: "obsidian-ai-settings-version-detail-label",
	});
	if (GIT_COMMIT_HASH.length > 7) {
		commitLink.createEl("a", {
			text: GIT_SHORT_HASH,
			cls: "obsidian-ai-settings-version-detail-value obsidian-ai-settings-version-link",
			attr: {
				href: `https://github.com/space-cadet/obsidian-ai/commit/${GIT_COMMIT_HASH}`,
				target: "_blank",
				rel: "noopener noreferrer",
				title: GIT_COMMIT_HASH,
			},
		});
	} else {
		commitLink.createEl("span", {
			text: GIT_SHORT_HASH,
			cls: "obsidian-ai-settings-version-detail-value",
		});
	}
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
