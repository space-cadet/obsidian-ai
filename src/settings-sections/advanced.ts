import { Setting } from "obsidian";
import ObsidianAIPlugin from "../main";
import { createSection } from "./helpers";

export function renderAdvancedSection(
	containerEl: HTMLElement,
	plugin: ObsidianAIPlugin,
	saveSettings: (options?: { refresh?: boolean; quiet?: boolean }) => Promise<void>,
): void {
	const sectionEl = createSection(
		containerEl,
		"Advanced",
		"Adjust inline prompt behavior and low-level interaction details.",
	);

	new Setting(sectionEl)
		.setName("Selection prompt")
		.setDesc(
			"System prompt used when the tooltip is triggered with selected text.",
		)
		.addTextArea((textarea) => {
			textarea
				.setPlaceholder("e.g., Summarize the selected text.")
				.setValue(plugin.settings.selectionPrompt)
				.inputEl.addEventListener("blur", async () => {
					plugin.settings.selectionPrompt =
						textarea.getValue();
					await saveSettings();
				});
			textarea.inputEl.classList.add("wide-text-settings");
		});

	new Setting(sectionEl)
		.setName("Cursor prompt")
		.setDesc(
			"System prompt used when the tooltip is triggered without selected text.",
		)
		.addTextArea((textarea) => {
			textarea
				.setPlaceholder(
					"e.g., Generate text based on cursor position.",
				)
				.setValue(plugin.settings.cursorPrompt)
				.inputEl.addEventListener("blur", async () => {
					plugin.settings.cursorPrompt = textarea.getValue();
					await saveSettings();
				});
			textarea.inputEl.classList.add("wide-text-settings");
		});

	new Setting(sectionEl)
		.setName("Message history")
		.setDesc(
			"Enable prompt history navigation in the inline tooltip using the up/down arrow keys.",
		)
		.addToggle((toggle) => {
			toggle
				.setValue(plugin.settings.messageHistory)
				.onChange(async (value) => {
					plugin.settings.messageHistory = value;
					await saveSettings();
				});
		});
}
