// main.ts
import { Plugin, MarkdownView, App } from "obsidian";
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

export default class ObsidianAIPlugin extends Plugin {
	settings: ObsidianAISettings = DEFAULT_SETTINGS;
	chatapi!: ChatApiManager;

	async onload() {
		await this.loadSettings();
		this.chatapi = new ChatApiManager(this.settings, this.app);

		this.registerView(
			CHAT_VIEWTYPE,
			(leaf) => new ObsidianAIChatView(leaf, this),
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
		this.app.workspace.detachLeavesOfType(CHAT_VIEWTYPE);
	}

	async loadSettings() {
		this.settings = normalizeSettings(await this.loadData());
	}

	async saveSettings() {
		// Merge with existing data so chat history (and any other non-settings keys) survive.
		const existing = (await this.loadData()) ?? {};
		await this.saveData({ ...existing, ...this.settings });
	}

	async loadChatData(): Promise<StoredChatData> {
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
			// Save in new format immediately
			await this.saveData({ ...data, chatData: migrated });
			return migrated;
		}

		return { sessions: [], activeSessionId: null };
	}

	async saveChatData(chatData: StoredChatData): Promise<void> {
		const data = (await this.loadData()) ?? {};
		await this.saveData({ ...data, chatData });
	}
}
