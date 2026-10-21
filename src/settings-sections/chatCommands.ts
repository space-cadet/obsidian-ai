import { createSection } from "./helpers";
import { BUILTIN_BANG_COMMANDS } from "../lib/builtinCommands";

export function renderChatCommandsSection(containerEl: HTMLElement): void {
	const sectionEl = createSection(
		containerEl,
		"Chat Commands",
		"Commands handled locally by the chat composer.",
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
}
