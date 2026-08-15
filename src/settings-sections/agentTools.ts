import { Setting } from "obsidian";
import ObsidianAIPlugin from "../main";
import { createSection } from "./helpers";

export function renderAgentToolsSection(
	containerEl: HTMLElement,
	plugin: ObsidianAIPlugin,
	saveSettings: (options?: {
		refresh?: boolean;
		quiet?: boolean;
	}) => Promise<void>,
): void {
	const sectionEl = createSection(
		containerEl,
		"Agent Tools",
		"Allow the AI to read, edit, create, and append to notes through the built-in tool layer.",
	);

	new Setting(sectionEl)
		.setName("Enable agent tools")
		.setDesc(
			"When enabled, the AI can invoke tools to interact with your vault during chat conversations.",
		)
		.addToggle((toggle) => {
			toggle
				.setValue(plugin.settings.enableAgentTools)
				.onChange(async (value) => {
					plugin.settings.enableAgentTools = value;
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Auto-apply edits")
		.setDesc(
			"Apply note edits automatically without asking for confirmation. (Not recommended for important notes.)",
		)
		.addToggle((toggle) => {
			toggle
				.setValue(plugin.settings.autoApply)
				.onChange(async (value) => {
					plugin.settings.autoApply = value;
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Max agent steps")
		.setDesc(
			"Maximum number of tool call rounds per message. Higher values allow more complex multi-step reasoning.",
		)
		.addText((text) => {
			text.setPlaceholder("5")
				.setValue(String(plugin.settings.maxAgentSteps))
				.inputEl.addEventListener("blur", async () => {
					const value = Number.parseInt(text.getValue(), 10);
					plugin.settings.maxAgentSteps =
						Number.isFinite(value) && value > 0 ? value : 5;
					await saveSettings();
				});
		});
}
