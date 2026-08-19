import { Setting, Notice } from "obsidian";
import ObsidianAIPlugin from "../main";
import { createSection } from "./helpers";
import { getOrCreateTelemetryId } from "../lib/telemetry";

export function renderTelemetrySection(
	containerEl: HTMLElement,
	plugin: ObsidianAIPlugin,
	saveSettings: (options?: { refresh?: boolean; quiet?: boolean }) => Promise<void>,
): void {
	const sectionEl = createSection(
		containerEl,
		"Telemetry & Privacy",
		"Help improve the plugin by sharing anonymous usage statistics. No personal data is collected.",
	);

	// Ensure telemetry ID exists
	if (!plugin.settings.telemetryId) {
		plugin.settings.telemetryId = getOrCreateTelemetryId();
		void saveSettings({ quiet: true });
	}

	new Setting(sectionEl)
		.setName("Share anonymous usage statistics")
		.setDesc("Enable to help us understand which features are used and identify issues. You can disable this at any time.")
		.addToggle((toggle) => {
			toggle.setValue(plugin.settings.telemetryEnabled).onChange(async (value) => {
				plugin.settings.telemetryEnabled = value;
				// Also update telemetryAsked so we don't show the dialog again
				plugin.settings.telemetryAsked = true;
				await saveSettings({ quiet: true });
				new Notice(
					value
						? "Telemetry enabled. Thank you for helping improve the plugin!"
						: "Telemetry disabled. No further data will be collected.",
					3000,
				);
			});
		});

	// Telemetry ID display (for data deletion requests)
	const idContainer = sectionEl.createDiv({
		cls: "obsidian-ai-telemetry-id",
		attr: { style: "margin-top: 12px; padding: 10px; background: var(--background-secondary); border-radius: 6px; font-size: 0.85em;" },
	});

	idContainer.createEl("div", {
		text: "Your anonymous telemetry ID:",
		attr: { style: "font-weight: 600; margin-bottom: 4px;" },
	});

	const idDisplay = idContainer.createEl("code", {
		text: plugin.settings.telemetryId || getOrCreateTelemetryId(),
		attr: {
			style: "font-family: var(--font-monospace); user-select: all; cursor: text;",
		},
	});

	idContainer.createEl("div", {
		text: "Use this ID to request deletion of your telemetry data.",
		attr: { style: "margin-top: 4px; color: var(--text-muted);" },
	});

	// What we collect / don't collect
	const detailsEl = sectionEl.createEl("details", {
		cls: "obsidian-ai-telemetry-details",
		attr: { style: "margin-top: 16px;" },
	});
	detailsEl.createEl("summary", {
		text: "What we collect and what we don't",
		attr: { style: "cursor: pointer; font-weight: 500;" },
	});

	const collectEl = detailsEl.createDiv({
		attr: { style: "margin-top: 8px; padding: 10px; background: var(--background-secondary-alt); border-radius: 4px; font-size: 0.85em; line-height: 1.6;" },
	});

	collectEl.createEl("div", {
		text: "Collected (anonymized):",
		attr: { style: "font-weight: 600; color: var(--text-success); margin-bottom: 4px;" },
	});
	collectEl.createEl("ul", {
		text: "• AI provider type (e.g., DeepSeek, OpenAI)\n• Feature usage counts (e.g., group chat, tool calling)\n• Conversation length in turns (bucketed ranges)\n• Error types (e.g., rate_limit, not error messages)\n• Plugin version",
		attr: { style: "margin: 0; padding-left: 16px;" },
	});

	const dontCollectEl = detailsEl.createDiv({
		attr: { style: "margin-top: 8px; padding: 10px; background: var(--background-secondary-alt); border-radius: 4px; font-size: 0.85em; line-height: 1.6;" },
	});

	dontCollectEl.createEl("div", {
		text: "Never collected:",
		attr: { style: "font-weight: 600; color: var(--text-error); margin-bottom: 4px;" },
	});
	dontCollectEl.createEl("ul", {
		text: "• Message content, prompts, or responses\n• API keys or credentials\n• File names, paths, or vault structure\n• Personal identity or IP address\n• Obsidian installation ID",
		attr: { style: "margin: 0; padding-left: 16px;" },
	});
}
