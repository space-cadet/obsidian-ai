import { Setting, Notice } from "obsidian";
import ObsidianAIPlugin from "../main";
import { createSection } from "./helpers";

export function renderIntelligenceSection(
	containerEl: HTMLElement,
	plugin: ObsidianAIPlugin,
	saveSettings: (options?: { refresh?: boolean; quiet?: boolean }) => Promise<void>,
): void {
	const sectionEl = createSection(
		containerEl,
		"AI Intelligence Layer",
		"Give the AI persistent memory, identity, and cross-session awareness — like a local OpenClaw inside Obsidian.",
	);

	new Setting(sectionEl)
		.setName("Enable intelligence layer")
		.setDesc(
			"When enabled, the AI loads a persistent persona and memory on every session. " +
			"It can create memories and search past conversations.",
		)
		.addToggle((toggle) => {
			toggle
				.setValue(plugin.settings.intelligence.enableIntelligence)
				.onChange(async (value) => {
					plugin.settings.intelligence.enableIntelligence = value;
					if (value && plugin.personaLoader) {
						await plugin.personaLoader.ensureDefaults();
					}
					await saveSettings({ refresh: true });
				});
		});

	if (!plugin.settings.intelligence.enableIntelligence) {
		// Collapse the rest when disabled
		const hint = sectionEl.createEl("div", {
			cls: "setting-item-description",
		});
		hint.style.padding = "0 16px 12px";
		hint.style.color = "var(--text-muted)";
		hint.textContent =
			"Turn this on to unlock memory creation, persona loading, and cross-session search. " +
			"All data stays in the plugin directory — never in your vault.";
		return;
	}

	new Setting(sectionEl)
		.setName("Identity context budget")
		.setDesc(
			"Max tokens for persona + memory injected into the system prompt. " +
			"Higher values = more context but consume more of your model's window.",
		)
		.addText((text) => {
			text.setPlaceholder("2000")
				.setValue(String(plugin.settings.intelligence.identityContextBudget))
				.inputEl.addEventListener("blur", async () => {
					const value = Number.parseInt(text.getValue(), 10);
					plugin.settings.intelligence.identityContextBudget =
						Number.isFinite(value) && value >= 500 ? value : 2000;
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Persona file path")
		.setDesc(
			"Path to the AI's static identity file, relative to the plugin folder. " +
			"Edit this to customize how the AI behaves.",
		)
		.addText((text) => {
			text.setPlaceholder("intelligence/persona.md")
				.setValue(plugin.settings.intelligence.personaPath)
				.onChange(async (value) => {
					plugin.settings.intelligence.personaPath = value || "intelligence/persona.md";
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Memory file path")
		.setDesc(
			"Path to the AI's dynamic memory file. The AI appends facts, preferences, and project updates here.",
		)
		.addText((text) => {
			text.setPlaceholder("intelligence/memory.md")
				.setValue(plugin.settings.intelligence.memoryPath)
				.onChange(async (value) => {
					plugin.settings.intelligence.memoryPath = value || "intelligence/memory.md";
					await saveSettings();
				});
		});

	const openDirBtn = sectionEl.createEl("button", {
		text: "Open intelligence folder",
		cls: "mod-cta",
	});
	openDirBtn.style.margin = "8px 16px 12px";
	openDirBtn.addEventListener("click", () => {
		const dir = `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}/intelligence`;
		// Copy path to clipboard and notify user
		navigator.clipboard.writeText(dir).catch(() => {});
		new (require("obsidian").Notice)(
			`Intelligence folder path copied to clipboard:\n${dir}`,
			8000,
		);
	});
}
