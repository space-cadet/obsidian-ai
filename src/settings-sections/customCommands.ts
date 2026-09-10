import { Setting } from "obsidian";
import ObsidianAIPlugin from "../main";
import { createSection } from "./helpers";
import { BUILTIN_BANG_COMMANDS } from "../lib/builtinCommands";

export function renderCustomCommandsSection(
	containerEl: HTMLElement,
	plugin: ObsidianAIPlugin,
	saveSettings: (options?: {
		refresh?: boolean;
		quiet?: boolean;
	}) => Promise<void>,
): void {
	const sectionEl = createSection(
		containerEl,
		"Custom Commands",
		"Add reusable inline-edit commands triggered by a shared prefix. Built-in ! commands are always available in chat.",
	);

	const referenceEl = sectionEl.createDiv({
		cls: "obsidian-ai-command-reference",
	});
	referenceEl.createEl("h4", { text: "Built-in ! commands" });
	referenceEl.createEl("p", {
		text: "Enter these commands in the chat composer. They run locally and are never sent to the AI model.",
		cls: "setting-item-description",
	});
	const table = referenceEl.createEl("table");
	const header = table.createEl("tr");
	header.createEl("th", { text: "Command" });
	header.createEl("th", { text: "Description" });
	for (const { command, description } of BUILTIN_BANG_COMMANDS) {
		const row = table.createEl("tr");
		row.createEl("td", { text: command });
		row.createEl("td", { text: description });
	}

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
		const commandSetting = new Setting(sectionEl)
			.setName(`Command ${index + 1}`)
			.setDesc("Set the keyword and prompt used by this command.")
			.addText((text) => {
				text.setValue(command.keyword)
					.setPlaceholder("Command name")
					.inputEl.addEventListener("blur", async () => {
						plugin.settings.customCommands[index].keyword =
							text.getValue();
						await saveSettings();
					});
			});
		const promptSetting = new Setting(sectionEl)
			.setName("Prompt")
			.setDesc(`Prompt for ${command.keyword || "this command"}.`);
		promptSetting.addTextArea((textarea) => {
			textarea
				.setValue(command.prompt)
				.setPlaceholder("Command prompt")
				.inputEl.addEventListener("blur", async () => {
					plugin.settings.customCommands[index].prompt =
						textarea.getValue();
					await saveSettings();
				});
			textarea.inputEl.classList.add("wide-text-settings");
		});
		commandSetting.addExtraButton((btn) =>
			btn
				.setIcon("trash")
				.setTooltip("Delete this command")
				.onClick(async () => {
					plugin.settings.customCommands.splice(index, 1);
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
