import { Modal, App, Setting, Notice } from "obsidian";
import type { ChatStorageMigration } from "../storage/Migration";

export class MigrationPromptModal extends Modal {
	private migration: ChatStorageMigration;
	private onMigrate: () => void;
	private onKeepLegacy: () => void;
	private onRemindLater: () => void;

	constructor(
		app: App,
		migration: ChatStorageMigration,
		onMigrate: () => void,
		onKeepLegacy: () => void,
		onRemindLater: () => void,
	) {
		super(app);
		this.migration = migration;
		this.onMigrate = onMigrate;
		this.onKeepLegacy = onKeepLegacy;
		this.onRemindLater = onRemindLater;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Legacy Chat Data Detected" });
		contentEl.createEl("p", {
			text: "Your chat history is stored in the old single-file format. Migrating to the new JSONL format gives you faster saves, better search, and corruption isolation.",
		});

		new Setting(contentEl)
			.setName("Migrate now")
			.setDesc("Convert chat history to JSONL format. Settings stay in data.json.")
			.addButton((btn) =>
				btn
					.setButtonText("Migrate")
					.setCta()
					.onClick(async () => {
						btn.setDisabled(true);
						btn.setButtonText("Migrating...");
						const result = await this.migration.migrate();
						if (result.success) {
							new Notice(
								`Migrated ${result.sessionCount} sessions (${result.messageCount} messages) to JSONL format`,
							);
							this.onMigrate();
							this.close();
						} else {
							new Notice(`Migration failed: ${result.error}`);
							btn.setDisabled(false);
							btn.setButtonText("Migrate");
						}
					}),
			);

		new Setting(contentEl)
			.setName("Keep using legacy")
			.setDesc("Continue with the old format. You can migrate later in Settings.")
			.addButton((btn) =>
				btn.setButtonText("Keep Legacy").onClick(() => {
					this.onKeepLegacy();
					this.close();
				}),
			);

		new Setting(contentEl)
			.setName("Remind me later")
			.addButton((btn) =>
				btn.setButtonText("Later").onClick(() => {
					this.onRemindLater();
					this.close();
				}),
			);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
