import { Setting } from "obsidian";
import ObsidianAIPlugin from "../main";
import { createSection } from "./helpers";

export function renderChatDefaultsSection(
	containerEl: HTMLElement,
	plugin: ObsidianAIPlugin,
	saveSettings: (options?: { refresh?: boolean; quiet?: boolean }) => Promise<void>,
): void {
	const sectionEl = createSection(
		containerEl,
		"Chat Defaults",
		"Control what context gets pulled into chat sessions and how much conversation state is retained.",
	);

	new Setting(sectionEl)
		.setName("Context picker path display")
		.setDesc(
			"How to show file paths in the context picker. 'Never' shows filenames only. 'Always' shows the parent folder for every file. 'When duplicates' shows the parent folder only when multiple files share the same name.",
		)
		.addDropdown((dropdown) => {
			dropdown
				.addOption("never", "Never")
				.addOption("always", "Always")
				.addOption("duplicates", "When duplicates")
				.setValue(plugin.settings.contextPickerPathDisplay)
				.onChange(async (value) => {
					plugin.settings.contextPickerPathDisplay = value as "never" | "always" | "duplicates";
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Press Enter to send")
		.setDesc(
			"When enabled, pressing Enter sends the message and Shift+Enter inserts a new line. When disabled, Enter inserts a new line and you must click the send button.",
		)
		.addToggle((toggle) => {
			toggle
				.setValue(plugin.settings.pressEnterToSend)
				.onChange(async (value) => {
					plugin.settings.pressEnterToSend = value;
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Include active note")
		.setDesc(
			"Automatically include the active note when chat context is implemented.",
		)
		.addToggle((toggle) => {
			toggle
				.setValue(plugin.settings.includeActiveNote)
				.onChange(async (value) => {
					plugin.settings.includeActiveNote = value;
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Auto-name sessions")
		.setDesc(
			"Generate chat titles automatically once a conversation has enough context.",
		)
		.addToggle((toggle) => {
			toggle
				.setValue(plugin.settings.autoNameSessions)
				.onChange(async (value) => {
					plugin.settings.autoNameSessions = value;
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Chat tab title width")
		.setDesc(
			"Width of each chat tab title before the tab strip scrolls. Use 120–360 px.",
		)
		.addText((text) => {
			text.setPlaceholder("160")
				.setValue(String(plugin.settings.chatTabTitleWidth))
				.inputEl.addEventListener("blur", async () => {
					const value = Number.parseInt(text.getValue(), 10);
					plugin.settings.chatTabTitleWidth = Number.isFinite(value)
						? Math.min(360, Math.max(120, value))
						: 160;
					text.setValue(String(plugin.settings.chatTabTitleWidth));
					document.querySelectorAll<HTMLElement>(".chat-session-tabs").forEach((tabStrip) => {
						tabStrip.style.setProperty(
							"--chat-tab-title-width",
							`${plugin.settings.chatTabTitleWidth}px`,
						);
					});
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Max saved conversations")
		.setDesc(
			"Maximum number of chat sessions to keep before older ones are trimmed.",
		)
		.addText((text) => {
			text.setPlaceholder("20")
				.setValue(
					String(plugin.settings.maxSavedConversations),
				)
				.inputEl.addEventListener("blur", async () => {
					const value = Number.parseInt(text.getValue(), 10);
					plugin.settings.maxSavedConversations =
						Number.isFinite(value) && value > 0 ? value : 20;
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Max context tokens")
		.setDesc("Approximate context budget for note/context loading.")
		.addText((text) => {
			text.setPlaceholder("8000")
				.setValue(String(plugin.settings.maxContextTokens))
				.inputEl.addEventListener("blur", async () => {
					const value = Number.parseInt(text.getValue(), 10);
					plugin.settings.maxContextTokens =
						Number.isFinite(value) && value > 0 ? value : 8000;
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Max context messages")
		.setDesc(
			"Maximum previous messages to include in the conversation context. Older messages are silently dropped.",
		)
		.addText((text) => {
			text.setPlaceholder("10")
				.setValue(String(plugin.settings.maxContextMessages))
				.inputEl.addEventListener("blur", async () => {
					const value = Number.parseInt(text.getValue(), 10);
					plugin.settings.maxContextMessages =
						Number.isFinite(value) && value > 0 ? value : 10;
					await saveSettings();
				});
		});
}
