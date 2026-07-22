import { ItemView, WorkspaceLeaf } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import { createElement } from "react";
import ChatApp from "../components/ChatApp";
import { ChatErrorBoundary } from "../components/ErrorBoundary";
import { ChatApiManager } from "../api";
import { App } from "obsidian";
import { StoredChatData } from "../types";
import { ObsidianAISettings } from "../settings";

export const CHAT_VIEWTYPE = "obsidian-ai-chat-view";

export interface ChatPluginLike {
	app: App;
	chatapi: ChatApiManager;
	manifest: { id: string };
	settings: ObsidianAISettings;
	personaLoader: import("../intelligence/PersonaLoader").PersonaLoader | null;
	searchIndex: import("../search/index").SearchIndex | null;
	loadChatData(): Promise<StoredChatData>;
	saveChatData(data: StoredChatData): Promise<void>;
	saveSettings(): Promise<void>;
}

export interface ObsidianAIChatViewOptions {
	/** Optional profile ID to bind this chat panel to. */
	profileId?: string;
}

export class ObsidianAIChatView extends ItemView {
	private root: Root | null = null;
	private plugin: ChatPluginLike;
	private options: ObsidianAIChatViewOptions;

	constructor(
		leaf: WorkspaceLeaf,
		plugin: ChatPluginLike,
		options: ObsidianAIChatViewOptions = {},
	) {
		super(leaf);
		this.plugin = plugin;
		this.options = options;
	}

	getViewType(): string {
		return CHAT_VIEWTYPE;
	}

	getDisplayText(): string {
		return "Obsidian AI Chat";
	}

	getIcon(): string {
		return "message-square";
	}

	async onOpen(): Promise<void> {
		this.root = createRoot(this.contentEl);
		this.root.render(
			createElement(
				ChatErrorBoundary,
				null,
				createElement(ChatApp, {
					plugin: this.plugin,
					profileId: this.options.profileId,
				}),
			),
		);
	}

	async onClose(): Promise<void> {
		this.root?.unmount();
		this.root = null;
	}
}
