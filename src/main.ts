// main.ts
import { Plugin, MarkdownView, App, Notice } from "obsidian";
import { EditorView } from "@codemirror/view";
import {
	ObsidianAISettings,
	DEFAULT_SETTINGS,
	normalizeSettings,
} from "./settings";
import { ObsidianAISettingsTab } from "./settings-sections/SettingsTab";
import {
	acceptTooltipEffect,
	commandEffect,
	dismissTooltipEffect,
	FloatingTooltipExtension,
} from "./modules/WidgetExtension";
import { ChatApiManager } from "./api";
import { generatedResponseState } from "./modules/AIExtension";
import {
	buildSelectionHiglightState,
	currentSelectionState,
	setSelectionInfoEffect,
} from "./modules/SelectionState";
import { diffExtension } from "./modules/diffExtension";
import { ObsidianAIChatView, CHAT_VIEWTYPE } from "./views/ObsidianAIChatView";
// import { GroupChatView, GROUP_CHAT_VIEWTYPE } from "./views/GroupChatView";
import { StoredChatData, ChatSession } from "./types";
import { createFileLogger, FileLogger } from "./logger";
import { createStorage, ChatStorage, StorageDeps } from "./storage/ChatStorage";
import { ChatStorageMigration } from "./storage/Migration";
import { MigrationPromptModal } from "./modals/MigrationPromptModal";


import { AgentApiManager } from "./api/AgentApiManager";

import { SessionStorage } from "./storage/session-storage";

export default class ObsidianAIPlugin extends Plugin {
	settings: ObsidianAISettings = DEFAULT_SETTINGS;
	chatapi!: ChatApiManager;
	agentapi: AgentApiManager | null = null;
	logger!: FileLogger;
	sessionStorage: SessionStorage | null = null;

	// Data integrity guards
	private _backupCreated = false;
	private _settingsLoadedFromFile = false;
	private _saveInProgress = false;
	private _pendingChatData: StoredChatData | null = null;
	private _chatStorage: ChatStorage | null = null;
	private _migrationPromptShown = false;

	async onload() {
		// Initialize file logger FIRST so any crash during load is captured.
		this.logger = createFileLogger(this.app, this.manifest.id);
		await this.logger.init();

		await this.loadSettings();
		this.logger.setMaxSize(this.settings.debugLogMaxSizeMB * 1024 * 1024);
		this.chatapi = new ChatApiManager(this.settings, this.app);

		// Initialize low-level session storage
		this.sessionStorage = new SessionStorage({
			app: this.app,
			manifest: this.manifest,
			logger: this.logger,
		});

		// Initialize chat storage layer
		this._chatStorage = createStorage(this._storageDeps(), this.settings.chatStorageFormat);

		// Detect legacy format and prompt for migration (non-blocking, once per session)
		if (this.settings.chatStorageFormat === "legacy") {
			const hasLegacy = await this._chatStorage.detectLegacyFormat();
			if (hasLegacy && !this._migrationPromptShown) {
				this._migrationPromptShown = true;
				const migration = new ChatStorageMigration(this._storageDeps());
				new MigrationPromptModal(
					this.app,
					migration,
					async () => {
						// On migrate: switch to jsonl format and reinitialize storage
						this.settings.chatStorageFormat = "jsonl";
						this._chatStorage = createStorage(this._storageDeps(), "jsonl");
						await this.saveSettings();
					},
					() => {
						// On keep legacy: do nothing, user can migrate later
					},
					() => {
						// On remind later: do nothing, will prompt again next session
					},
				).open();
			}
		}

		this.registerView(
			CHAT_VIEWTYPE,
			(leaf) => new ObsidianAIChatView(leaf, this, {}),
		);

		// GROUP_CHAT_VIEW hidden — code preserved in GroupChatView.ts
		// this.registerView(
		// 	GROUP_CHAT_VIEWTYPE,
		// 	(leaf) => new GroupChatView(leaf, this),
		// );

		// this.addRibbonIcon("users", "Open AI Council (Group Chat)", () => {
		// 	this.activateGroupChatView();
		// });

		// this.addCommand({
		// 	id: "open-ai-council",
		// 	name: "Open AI Council (Group Chat)",
		// 	callback: () => this.activateGroupChatView(),
		// });

		this.addRibbonIcon("message-square", "Open Obsidian AI Chat", () => {
			this.activateChatView();
		});

		this.addCommand({
			id: "open-obsidian-ai-chat",
			name: "Open Obsidian AI Chat",
			callback: () => this.activateChatView(),
		});

		this.registerEditorExtension([
			FloatingTooltipExtension(this.chatapi, this),
			generatedResponseState,
			currentSelectionState,
			buildSelectionHiglightState,
			diffExtension,
		]);

		// Add command to show tooltip
		this.addCommand({
			id: "show-cursor-tooltip",
			name: "Show cursor tooltip",
			callback: () => {
				const markdownView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					const cmEditor = (markdownView.editor as any)
						.cm as EditorView;

					// Grab the main selection range
					const { from, to } = cmEditor.state.selection.main;
					const effects = [];

					if (from !== to) {
						// If there is a real selection, store it
						const selectedText = cmEditor.state.doc.sliceString(
							from,
							to,
						);
						effects.push(
							setSelectionInfoEffect.of({
								from,
								to,
								text: selectedText,
							}),
						);
					} else {
						// If no selection, store cursor position instead of null
						effects.push(
							setSelectionInfoEffect.of({ from, to, text: "" }),
						);
					}

					// Also trigger the overlay
					effects.push(commandEffect.of(null));

					// Dispatch all effects in one go
					cmEditor.dispatch({ effects });
				}
			},
			hotkeys: [],
		});
		this.addCommand({
			id: "accept-tooltip",
			name: "Accept tooltip suggestion",
			callback: () => {
				const markdownView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					const cmEditor = (markdownView.editor as any)
						.cm as EditorView;

					const response = cmEditor.state.field(
						generatedResponseState,
						false,
					);
					if (response) {
						cmEditor.dispatch({
							effects: acceptTooltipEffect.of(null),
						});
						cmEditor.dispatch({
							effects: dismissTooltipEffect.of(null),
						});
					}
				}
			},
		});
		this.addCommand({
			id: "discard-tooltip",
			name: "Discard tooltip suggestion",
			callback: () => {
				const markdownView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					const cmEditor = (markdownView.editor as any)
						.cm as EditorView;
					const response = cmEditor.state.field(
						generatedResponseState,
						false,
					);
					if (response) {
						cmEditor.dispatch({
							effects: dismissTooltipEffect.of(null),
						});
					}
				}
			},
		});

		// Add settings tab
		this.addSettingTab(new ObsidianAISettingsTab(this.app, this));

		// Command to clear debug log
		this.addCommand({
			id: "clear-debug-log",
			name: "Clear debug log file",
			callback: async () => {
				await this.logger.clear();
				new Notice("Debug log cleared.");
			},
		});
	}

	async activateChatView() {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(CHAT_VIEWTYPE)[0];
		if (!leaf) {
			leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
			await leaf.setViewState({ type: CHAT_VIEWTYPE, active: true });
		}
		workspace.revealLeaf(leaf);
	}

	// async activateGroupChatView() {
	// 	const { workspace } = this.app;
	// 	let leaf = workspace.getLeavesOfType(GROUP_CHAT_VIEWTYPE)[0];
	// 	if (!leaf) {
	// 		leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
	// 		await leaf.setViewState({ type: GROUP_CHAT_VIEWTYPE, active: true });
	// 	}
	// 	workspace.revealLeaf(leaf);
	// }

	onunload() {
		this.logger.stopMemoryLogging();
		this.logger.flushNow();
		this.app.workspace.detachLeavesOfType(CHAT_VIEWTYPE);
		// this.app.workspace.detachLeavesOfType(GROUP_CHAT_VIEWTYPE);
	}

	/** Build the storage dependency bag */
	private _storageDeps(): StorageDeps {
		return {
			app: this.app,
			manifest: this.manifest,
			settings: this.settings,
			loadData: () => this.loadData(),
			saveData: (data) => this.saveData(data),
			logger: this.logger,
		};
	}

	// ─────────────────────────────────────────────────────────────
	// Safe data persistence layer
	// ─────────────────────────────────────────────────────────────

	async loadSettings() {
		this.logger?.log("info", "loadSettings: reading data.json");
		const raw = await this.loadData();
		this._settingsLoadedFromFile = raw !== null && typeof raw === "object";
		this.logger?.log(
			"info",
			`loadSettings: _settingsLoadedFromFile=${this._settingsLoadedFromFile}, raw=${raw ? "exists" : "null"}`,
		);
		this.settings = normalizeSettings(raw);
		this.logger?.setMaxSize(this.settings.debugLogMaxSizeMB * 1024 * 1024);
	}

	async saveSettings() {
		this.logger?.log(
			"info",
			`saveSettings called: _settingsLoadedFromFile=${this._settingsLoadedFromFile}`,
		);

		// Guard: don't overwrite with defaults if we never successfully loaded user data.
		if (!this._settingsLoadedFromFile) {
			this.logger?.log(
				"warn",
				"saveSettings blocked: no valid data.json was loaded; refusing to overwrite with defaults",
			);
			return;
		}

		const existing = (await this.loadData()) ?? {};
		let payload: Record<string, any> = { ...existing, ...this.settings };

		// When using JSONL storage, strip legacy chat data keys from data.json
		// to avoid accidentally re-introducing legacy format after migration
		if (this.settings.chatStorageFormat === "jsonl") {
			delete payload.chatData;
			delete payload.chatMessages;
		}

		// Skip write if nothing changed
		if (JSON.stringify(payload) === JSON.stringify(existing)) {
			this.logger?.log("info", "saveSettings skipped: no changes");
			return;
		}

		this.logger?.log("info", "saveSettings: writing data.json to disk");
		await this._ensureRollingBackup(existing);
		await this.saveData(payload);
		this.logger?.log("info", "saveSettings: data.json written successfully");
	}

	async loadChatData(): Promise<StoredChatData> {
		this.logger?.log("info", "loadChatData: delegating to storage layer");
		if (!this._chatStorage) {
			this._chatStorage = createStorage(this._storageDeps(), this.settings.chatStorageFormat);
		}
		return this._chatStorage.loadChatData();
	}

	async saveChatData(chatData: StoredChatData): Promise<void> {
		if (!this._chatStorage) {
			this._chatStorage = createStorage(this._storageDeps(), this.settings.chatStorageFormat);
		}
		if (this._saveInProgress) {
			this._pendingChatData = chatData;
			this.logger?.log(
				"info",
				"saveChatData queued: save already in progress",
			);
			return;
		}
		this._saveInProgress = true;

		try {
			let nextChatData: StoredChatData | null = chatData;
			while (nextChatData) {
				this._pendingChatData = null;
				this.logger?.log("info", "saveChatData: writing via storage layer");
				await this._chatStorage.saveChatData(nextChatData);
				this.logger?.log(
					"info",
					"saveChatData: storage layer wrote successfully",
				);

				nextChatData = this._pendingChatData;
				if (nextChatData) {
					this.logger?.log(
						"info",
						"saveChatData: flushing queued snapshot",
					);
				}
			}
		} finally {
			this._saveInProgress = false;
		}
	}

	/** Create rolling backups of data.json before writes */
	private async _ensureRollingBackup(currentData: unknown): Promise<void> {
		try {
			const adapter = this.app.vault.adapter;
			const pluginDir = `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
			const dataPath = `${pluginDir}/data.json`;
			const backupCount = this.settings.sessionBackupCount ?? 3;

			const exists = await adapter.exists(dataPath);
			if (!exists) return;

			const content = await adapter.read(dataPath);

			// Rotate existing backups: .bak.2 -> .bak.3, .bak.1 -> .bak.2, .bak -> .bak.1
			for (let i = backupCount - 1; i >= 1; i--) {
				const src = i === 1 ? `${dataPath}.bak` : `${dataPath}.bak.${i - 1}`;
				const dst = `${dataPath}.bak.${i}`;
				if (await adapter.exists(src)) {
					await adapter.write(dst, await adapter.read(src));
				}
			}

			// Write the new .bak
			await adapter.write(`${dataPath}.bak`, content);
			this.logger?.log("info", `Rolling backup created for data.json (keeping ${backupCount} copies)`);
		} catch (e) {
			this.logger?.log("warn", `Failed to create rolling backup: ${e}`);
		}
	}
}
