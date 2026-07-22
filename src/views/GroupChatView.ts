import { ItemView, WorkspaceLeaf } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import { createElement } from "react";
import GroupChatApp from "../components/GroupChatApp";
import { ChatErrorBoundary } from "../components/ErrorBoundary";
import { ChatApiManager } from "../api";
import { App } from "obsidian";
import { StoredChatData } from "../types";
import { ObsidianAISettings } from "../settings";

export const GROUP_CHAT_VIEWTYPE = "obsidian-ai-group-chat-view";

export interface ChatPluginLike {
	app: App;
	chatapi: ChatApiManager;
	manifest: { id: string };
	settings: ObsidianAISettings;
	personaLoader: import("../intelligence/PersonaLoader").PersonaLoader | null;
	loadChatData(): Promise<StoredChatData>;
	saveChatData(data: StoredChatData): Promise<void>;
	saveSettings(): Promise<void>;
}

export class GroupChatView extends ItemView {
	private root: Root | null = null;
	private plugin: ChatPluginLike;

	constructor(leaf: WorkspaceLeaf, plugin: ChatPluginLike) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return GROUP_CHAT_VIEWTYPE;
	}

	getDisplayText(): string {
		return "AI Council";
	}

	getIcon(): string {
		return "users";
	}

	async onOpen(): Promise<void> {
		this.root = createRoot(this.contentEl);
		this.root.render(
			createElement(
				ChatErrorBoundary,
				null,
				createElement(GroupChatApp, { plugin: this.plugin }),
			),
		);
	}

	async onClose(): Promise<void> {
		this.root?.unmount();
		this.root = null;
	}
}
