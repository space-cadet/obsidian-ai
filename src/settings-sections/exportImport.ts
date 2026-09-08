import { FuzzySuggestModal, Modal, Notice, Setting, TFile } from "obsidian";
import ObsidianAIPlugin from "../main";
import { createSection, createSliderWithValue } from "./helpers";
import { PluginDataManager } from "../data/PluginDataManager";
import { ChatStorageMigration } from "../storage/Migration";

async function saveExportToVault(
	plugin: ObsidianAIPlugin,
	filename: string,
	data: string,
): Promise<void> {
	// Save to vault root so user can see it immediately (works on desktop + mobile)
	await plugin.app.vault.adapter.write(filename, data);
}

function getExportFilename(includeSecrets: boolean): string {
	const timestamp = new Date()
		.toISOString()
		.replace(/[:.]/g, "-")
		.slice(0, 19);
	return includeSecrets
		? `chat-lab-settings-${timestamp}-full.json`
		: `chat-lab-settings-${timestamp}.json`;
}

export function renderExportImportSection(
	containerEl: HTMLElement,
	plugin: ObsidianAIPlugin,
	saveSettings: (options?: {
		refresh?: boolean;
		quiet?: boolean;
	}) => Promise<void>,
): void {
	const sectionEl = createSection(
		containerEl,
		"Backup & Restore",
		"Export your configuration for backup or migration, or import settings from a previous export.",
	);

	const manager = new PluginDataManager(plugin);

	new Setting(sectionEl)
		.setName("Export settings")
		.setDesc(
			"Save your settings as a JSON file in the vault config folder. API keys and passwords are redacted by default.",
		)
		.addButton((button) => {
			button.setButtonText("Export").onClick(async () => {
				try {
					const exported = manager.createExportBundle(false);
					const json = JSON.stringify(exported, null, 2);
					const filename = getExportFilename(false);
					await saveExportToVault(plugin, filename, json);
					new Notice(`Settings exported to ${filename}`, 3000);
				} catch (e: any) {
					new Notice(`Export failed: ${e.message}`, 5000);
				}
			});
		});

	new Setting(sectionEl)
		.setName("Export with secrets")
		.setDesc(
			"⚠️ Export including API keys and passwords. Only use this for personal backups — never share this file.",
		)
		.addButton((button) => {
			button
				.setButtonText("Export with secrets")
				.setWarning()
				.onClick(async () => {
					try {
						const exported = manager.createExportBundle(true);
						const json = JSON.stringify(exported, null, 2);
						const filename = getExportFilename(true);
						await saveExportToVault(plugin, filename, json);
						new Notice(
							`Settings exported (with secrets) to ${filename}`,
							3000,
						);
					} catch (e: any) {
						new Notice(`Export failed: ${e.message}`, 5000);
					}
				});
		});

	new Setting(sectionEl)
		.setName("Import settings")
		.setDesc(
			"Load settings from a previously exported JSON file in your vault.",
		)
		.addButton((button) => {
			button.setButtonText("Import…").onClick(async () => {
				// Find all JSON files in vault that look like exports
				const jsonFiles = plugin.app.vault
					.getFiles()
					.filter(
						(f: TFile) =>
							f.extension === "json" &&
							f.basename.startsWith("chat-lab-settings"),
					);

				if (jsonFiles.length === 0) {
					new Notice(
						"No export files found. Look for 'chat-lab-settings-*.json' in your vault.",
						5000,
					);
					return;
				}

				// Show fuzzy finder for JSON files
				class ExportFileSuggester extends FuzzySuggestModal<TFile> {
					getItems(): TFile[] {
						return jsonFiles;
					}
					getItemText(item: TFile): string {
						return item.path;
					}
					onChooseItem(file: TFile): void {
						void importFromFile(
							plugin,
							file,
							manager,
							saveSettings,
						);
					}
				}
				new ExportFileSuggester(plugin.app).open();
			});
		});

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

	const backupSetting = new Setting(sectionEl)
		.setName("Session backup count")
		.setDesc(
			"Number of rolling backups to keep of data.json before writes.",
		);
	createSliderWithValue(backupSetting, {
		value: plugin.settings.sessionBackupCount,
		min: 1,
		max: 10,
		step: 1,
		onChange: async (value) => {
			plugin.settings.sessionBackupCount = value;
			await saveSettings();
		},
	});

	const migration = new ChatStorageMigration({
		app: plugin.app,
		manifest: plugin.manifest,
		settings: plugin.settings,
		loadData: () => plugin.loadData(),
		saveData: (data) => plugin.saveData(data),
		logger: plugin.logger,
	});

	// Migration is shown only when legacy data is detected.
	migration.canMigrate().then((canMigrate) => {
		if (!canMigrate) return;
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
	});

	new Setting(sectionEl)
		.setName("Clear all chat history")
		.setDesc(
			"Permanently delete all saved chat sessions. This frees up storage space.",
		)
		.addButton((btn) =>
			btn
				.setButtonText("Clear History")
				.setWarning()
				.onClick(async () => {
					const modal = new Modal(plugin.app);
					modal.titleEl.setText("Clear all chat history?");
					modal.contentEl.createEl("p", {
						text: "This will permanently delete all chat sessions. This action cannot be undone.",
					});
					const btnContainer = modal.contentEl.createEl("div");
					btnContainer.setCssStyles({
						display: "flex",
						gap: "8px",
						marginTop: "12px",
					});

					const cancelBtn = btnContainer.createEl("button", {
						text: "Cancel",
					});
					cancelBtn.addEventListener("click", () => modal.close());

					const confirmBtn = btnContainer.createEl("button", {
						text: "Clear All",
					});
					confirmBtn.classList.add("mod-warning");
					confirmBtn.addEventListener("click", async () => {
						await plugin.saveChatData({
							sessions: [],
							activeSessionId: null,
						});
						modal.close();
						new Notice("✓ All chat history cleared.");
					});

					modal.open();
				}),
		);
}

async function importFromFile(
	plugin: ObsidianAIPlugin,
	file: TFile,
	manager: PluginDataManager,
	saveSettings: (options?: {
		refresh?: boolean;
		quiet?: boolean;
	}) => Promise<void>,
): Promise<void> {
	try {
		const text = await plugin.app.vault.read(file);
		const data = JSON.parse(text);
		const validation = manager.validateImport(data);
		if (!validation.valid) {
			new Notice(`Import failed: ${validation.error}`, 5000);
			return;
		}

		const imported = data.settings;
		const current = plugin.settings;

		// Count changes for user feedback
		const importedProfileIds = new Set(
			imported.providerProfiles?.map((p: any) => p.id) ?? [],
		);
		const currentProfileIds = new Set(
			current.providerProfiles.map((p) => p.id),
		);
		const newProfiles =
			imported.providerProfiles?.filter(
				(p: any) => !currentProfileIds.has(p.id),
			).length ?? 0;
		const updatedProfiles =
			imported.providerProfiles?.filter((p: any) =>
				currentProfileIds.has(p.id),
			).length ?? 0;

		manager.applyExportBundle(data);
		await saveSettings({ refresh: true });
		new Notice(
			`Settings imported: ${newProfiles} new profile(s), ${updatedProfiles} updated.`,
			4000,
		);
	} catch (e: any) {
		new Notice(`Import failed: ${e.message}`, 5000);
	}
}
