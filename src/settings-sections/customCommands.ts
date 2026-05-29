import { Setting } from "obsidian";
import ObsidianAIPlugin from "../main";
import { createSection } from "./helpers";

export function renderCustomCommandsSection(
	containerEl: HTMLElement,
	plugin: ObsidianAIPlugin,
	saveSettings: (options?: { refresh?: boolean; quiet?: boolean }) => Promise<void>,
): void {
	const sectionEl = createSection(
		containerEl,
		"Custom Commands",
		"Add reusable inline-edit commands triggered by a shared prefix.",
	);

	new Setting(sectionEl)
		.setName("Command prefix")
		.setDesc("The prefix used to trigger custom commands.")
		.addText((text) => {
			text.setPlaceholder("/")
				.setValue(plugin.settings.commandPrefix)
				.inputEl.addEventListener("blur", async () => {
					plugin.settings.commandPrefix =
						text.getValue().charAt(0) || "/";
					await saveSettings();
				});
		});

	plugin.settings.customCommands.forEach((command, index) => {
		new Setting(sectionEl)
			.setName(`Command: ${command.keyword}`)
			.setDesc("Edit the command prompt.")
			.addText((text) => {
				text.setValue(command.keyword)
					.setPlaceholder("Command name")
					.inputEl.addEventListener("blur", async () => {
						plugin.settings.customCommands[index].keyword =
							text.getValue();
						await saveSettings();
					});
			})
			.addTextArea((textarea) => {
				textarea
					.setValue(command.prompt)
					.setPlaceholder("Command prompt")
					.inputEl.addEventListener("blur", async () => {
						plugin.settings.customCommands[index].prompt =
							textarea.getValue();
						await saveSettings();
					});
			})
			.addExtraButton((btn) =>
				btn
					.setIcon("trash")
					.setTooltip("Delete this command")
					.onClick(async () => {
						plugin.settings.customCommands.splice(
							index,
							1,
						);
						await saveSettings({
							refresh: true,
							quiet: true,
						});
					}),
			);
	});

	new Setting(sectionEl).addButton((btn) =>
		btn
			.setButtonText("Add Command")
			.setCta()
			.onClick(async () => {
				plugin.settings.customCommands.push({
					keyword: "new_command",
					prompt: "",
				});
				await saveSettings({ refresh: true, quiet: true });
			}),
	);
}
