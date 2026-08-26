import { Setting, Notice } from "obsidian";
import ObsidianAIPlugin from "../main";
import { createSection } from "./helpers";
import { ChatStorageMigration } from "../storage/Migration";

export function renderAdvancedSection(
	containerEl: HTMLElement,
	plugin: ObsidianAIPlugin,
	saveSettings: (options?: {
		refresh?: boolean;
		quiet?: boolean;
	}) => Promise<void>,
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
					plugin.settings.selectionPrompt = textarea.getValue();
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
				.setPlaceholder("e.g., Generate text based on cursor position.")
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

	// ─── Storage settings ───
	new Setting(sectionEl)
		.setName("Chat storage format")
		.setDesc(
			"Legacy = single data.json (old). JSONL = split sessions (fast, searchable, corruption-isolated).",
		)
		.addDropdown((dropdown) => {
			dropdown
				.addOption("legacy", "Legacy (data.json)")
				.addOption("jsonl", "JSONL (split sessions)")
				.setValue(plugin.settings.chatStorageFormat)
				.onChange(async (value) => {
					plugin.settings.chatStorageFormat = value as
						| "legacy"
						| "jsonl";
					await saveSettings({ refresh: true });
				});
		});

	new Setting(sectionEl)
		.setName("Max sessions in sidebar")
		.setDesc(
			"Number of sessions shown in the sidebar before pagination. Not a hard cap on total sessions.",
		)
		.addSlider((slider) => {
			slider
				.setLimits(10, 200, 10)
				.setValue(plugin.settings.maxSessionsInSidebar)
				.setDynamicTooltip()
				.onChange(async (value) => {
					plugin.settings.maxSessionsInSidebar = value;
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Session backup count")
		.setDesc(
			"Number of rolling backups to keep of data.json before writes.",
		)
		.addSlider((slider) => {
			slider
				.setLimits(1, 10, 1)
				.setValue(plugin.settings.sessionBackupCount)
				.setDynamicTooltip()
				.onChange(async (value) => {
					plugin.settings.sessionBackupCount = value;
					await saveSettings();
				});
		});

	// Migration button (only shown if legacy data detected)
	const migration = new ChatStorageMigration({
		app: plugin.app,
		manifest: plugin.manifest,
		settings: plugin.settings,
		loadData: () => plugin.loadData(),
		saveData: (data) => plugin.saveData(data),
		logger: plugin.logger,
	});

	// Developer mode toggle (T61)
	new Setting(sectionEl)
		.setName("Developer mode")
		.setDesc(
			"When enabled, the AI can read and modify select plugin settings via tools. " +
				"This gives the agent more autonomy — use with caution.",
		)
		.addToggle((toggle) => {
			toggle
				.setValue(plugin.settings.developerMode)
				.onChange(async (value) => {
					plugin.settings.developerMode = value;
					await saveSettings();
				});
		});

	migration.canMigrate().then((canMigrate) => {
		if (canMigrate) {
			new Setting(sectionEl)
				.setName("Migrate chat data")
				.setDesc(
					"Convert legacy chat data in data.json to the new JSONL format.",
				)
				.addButton((btn) => {
					btn.setButtonText("Migrate now")
						.setCta()
						.onClick(async () => {
							btn.setDisabled(true);
							btn.setButtonText("Migrating...");
							const result = await migration.migrate();
							if (result.success) {
								new Notice(
									`Migrated ${result.sessionCount} sessions (${result.messageCount} messages) to JSONL`,
								);
								plugin.settings.chatStorageFormat = "jsonl";
								await saveSettings({ refresh: true });
							} else {
								new Notice(`Migration failed: ${result.error}`);
								btn.setDisabled(false);
								btn.setButtonText("Migrate now");
							}
						});
				});
		}
	});
}
