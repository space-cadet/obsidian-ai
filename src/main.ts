// main.ts
import { Plugin, MarkdownView, App, Notice } from "obsidian";
import { EditorView } from "@codemirror/view";
import {
	ObsidianAISettings,
	DEFAULT_SETTINGS,
	ObsidianAISettingsTab,
	normalizeSettings,
} from "./settings";
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
import { StoredChatData, ChatSession } from "./types";
import { createFileLogger, FileLogger } from "./logger";


import { AgentApiManager } from "./api/AgentApiManager";

export default class ObsidianAIPlugin extends Plugin {
	settings: ObsidianAISettings = DEFAULT_SETTINGS;
	chatapi!: ChatApiManager;
	agentapi: AgentApiManager | null = null;
	logger!: FileLogger;

	// Data integrity guards
	private _backupCreated = false;
	private _settingsLoadedFromFile = false;
	private _saveInProgress = false;
	private _pendingChatData: StoredChatData | null = null;

	async onload() {
		// Initialize file logger FIRST so any crash during load is captured.
		this.logger = createFileLogger(this.app, this.manifest.id);
		await this.logger.init();

		await this.loadSettings();
		this.chatapi = new ChatApiManager(this.settings, this.app);

		this.registerView(
			CHAT_VIEWTYPE,
			(leaf) => new ObsidianAIChatView(leaf, this, {}),
		);

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

	onunload() {
		this.logger.stopMemoryLogging();
		this.logger.flushNow();
		this.app.workspace.detachLeavesOfType(CHAT_VIEWTYPE);
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
		const payload = { ...existing, ...this.settings };

		// Skip write if nothing changed
		if (JSON.stringify(payload) === JSON.stringify(existing)) {
			this.logger?.log("info", "saveSettings skipped: no changes");
			return;
		}

		this.logger?.log("info", "saveSettings: writing data.json to disk");
		await this._ensureBackup(existing);
		await this.saveData(payload);
		this.logger?.log("info", "saveSettings: data.json written successfully");
	}

	async loadChatData(): Promise<StoredChatData> {
		this.logger?.log("info", "loadChatData: reading data.json");
		const data = await this.loadData();

		// New format — ensure contextItems exists on every session
		if (data?.chatData && Array.isArray(data.chatData.sessions)) {
			const chatData = data.chatData as StoredChatData;
			for (const session of chatData.sessions) {
				if (!Array.isArray(session.contextItems)) {
					session.contextItems = [];
				}
			}
			return chatData;
		}

		// Migration from old flat chatMessages array
		if (Array.isArray(data?.chatMessages) && data.chatMessages.length > 0) {
			const migrated: StoredChatData = {
				sessions: [
					{
						id: crypto.randomUUID(),
						title: "Previous Chat",
						createdAt: Date.now(),
						updatedAt: Date.now(),
						messages: data.chatMessages,
						contextItems: [],
					},
				],
				activeSessionId: null,
			};
			return migrated;
		}

		return { sessions: [], activeSessionId: null };
	}

	async saveChatData(chatData: StoredChatData): Promise<void> {
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
				this.logger?.log("info", "saveChatData: writing data.json to disk");
				const data = (await this.loadData()) ?? {};
				const payload = { ...data, chatData: nextChatData };

				await this._ensureBackup(data);
				await this.saveData(payload);
				this.logger?.log(
					"info",
					"saveChatData: data.json written successfully",
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

	/** Create a .bak copy of data.json before the first write each session */
	private async _ensureBackup(currentData: unknown): Promise<void> {
		if (this._backupCreated) return;
		this._backupCreated = true;
		try {
			const adapter = this.app.vault.adapter;
			const pluginDir = `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
			const dataPath = `${pluginDir}/data.json`;
			const backupPath = `${pluginDir}/data.json.bak`;
			const exists = await adapter.exists(dataPath);
			if (exists) {
				const content = await adapter.read(dataPath);
				await adapter.write(backupPath, content);
				this.logger?.log("info", `Backup created: ${backupPath}`);
			}
		} catch (e) {
			this.logger?.log("warn", `Failed to create backup: ${e}`);
		}
	}
}
