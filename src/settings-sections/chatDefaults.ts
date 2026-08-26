import { Setting } from "obsidian";
import ObsidianAIPlugin from "../main";
import { createSection } from "./helpers";

export function renderChatDefaultsSection(
	containerEl: HTMLElement,
	plugin: ObsidianAIPlugin,
	saveSettings: (options?: {
		refresh?: boolean;
		quiet?: boolean;
	}) => Promise<void>,
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
					plugin.settings.contextPickerPathDisplay = value as
						| "never"
						| "always"
						| "duplicates";
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Show full request token count")
		.setDesc(
			"When enabled, the token counter shows the complete API request payload (system prompt + conversation history + message). When disabled, it shows only the current message tokens.",
		)
		.addToggle((toggle) => {
			toggle
				.setValue(plugin.settings.showFullRequestTokens)
				.onChange(async (value) => {
					plugin.settings.showFullRequestTokens = value;
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
			"Allowed range: 120–360 px. Default: 160 px. Wider tabs show more of each title before the tab strip scrolls.",
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
					document
						.querySelectorAll<HTMLElement>(".chat-session-tabs")
						.forEach((tabStrip) => {
							tabStrip.style.setProperty(
								"--chat-tab-title-width",
								`${plugin.settings.chatTabTitleWidth}px`,
							);
						});
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Restore chat tabs after reload")
		.setDesc(
			"Reopen saved chat tabs, the active tab, and each tab's scroll position after Obsidian or this plugin reloads. Draft tabs are not restored.",
		)
		.addToggle((toggle) => {
			toggle
				.setValue(plugin.settings.restoreChatTabs)
				.onChange(async (value) => {
					plugin.settings.restoreChatTabs = value;
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
				.setValue(String(plugin.settings.maxSavedConversations))
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

	new Setting(sectionEl)
		.setName("Model request token budget")
		.setDesc(
			"Maximum estimated tokens sent for the system prompt, conversation history, current message, tools, and response reserve. Recent messages are preserved first. Set to 0 to use the legacy message-count limit only.",
		)
		.addText((text) => {
			text.setPlaceholder("32000")
				.setValue(String(plugin.settings.maxRequestTokens))
				.inputEl.addEventListener("blur", async () => {
					const value = Number.parseInt(text.getValue(), 10);
					plugin.settings.maxRequestTokens =
						Number.isFinite(value) && value >= 0 ? value : 32000;
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Recent messages to preserve")
		.setDesc(
			"Number of newest messages retained verbatim when the request budget trims older history.",
		)
		.addText((text) => {
			text.setPlaceholder("4")
				.setValue(String(plugin.settings.preserveRecentMessages))
				.inputEl.addEventListener("blur", async () => {
					const value = Number.parseInt(text.getValue(), 10);
					plugin.settings.preserveRecentMessages =
						Number.isFinite(value) && value > 0 ? value : 4;
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Response token reserve")
		.setDesc(
			"Tokens held back for the assistant response and agent tool-loop continuations.",
		)
		.addText((text) => {
			text.setPlaceholder("4096")
				.setValue(String(plugin.settings.requestResponseReserveTokens))
				.inputEl.addEventListener("blur", async () => {
					const value = Number.parseInt(text.getValue(), 10);
					plugin.settings.requestResponseReserveTokens =
						Number.isFinite(value) && value >= 0 ? value : 4096;
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Compaction trigger tokens")
		.setDesc(
			"Estimated history size at which old conversation turns are summarized. Set to 0 to disable semantic compaction.",
		)
		.addText((text) => {
			text.setPlaceholder("24000")
				.setValue(String(plugin.settings.compactionTriggerTokens))
				.inputEl.addEventListener("blur", async () => {
					const value = Number.parseInt(text.getValue(), 10);
					plugin.settings.compactionTriggerTokens =
						Number.isFinite(value) && value >= 0 ? value : 24000;
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Compaction release tokens")
		.setDesc(
			"Estimated history size below which a future compaction may be triggered again. Keep below the trigger threshold.",
		)
		.addText((text) => {
			text.setPlaceholder("16000")
				.setValue(String(plugin.settings.compactionReleaseTokens))
				.inputEl.addEventListener("blur", async () => {
					const value = Number.parseInt(text.getValue(), 10);
					plugin.settings.compactionReleaseTokens =
						Number.isFinite(value) && value >= 0 ? value : 16000;
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Max tool-result replay tokens")
		.setDesc(
			"Maximum estimated tokens from one tool result replayed to the model. Full results remain in the saved transcript for display and export.",
		)
		.addText((text) => {
			text.setPlaceholder("4000")
				.setValue(String(plugin.settings.maxToolResultTokens))
				.inputEl.addEventListener("blur", async () => {
					const value = Number.parseInt(text.getValue(), 10);
					plugin.settings.maxToolResultTokens =
						Number.isFinite(value) && value > 0 ? value : 4000;
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Tool history mode")
		.setDesc(
			"How tool calls and results appear in conversation history. 'Elide' hides payloads to save tokens (default). 'Preserve' keeps full detail for debugging.",
		)
		.addDropdown((dropdown) => {
			dropdown
				.addOption("elide", "Elide (saves tokens)")
				.addOption("preserve", "Preserve (full detail)")
				.setValue(plugin.settings.toolHistoryMode ?? "elide")
				.onChange(async (value) => {
					plugin.settings.toolHistoryMode = value as
						| "elide"
						| "preserve";
					await saveSettings();
				});
		});
}
