import { ItemView, WorkspaceLeaf } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import { createElement } from "react";
import ChatApp from "../components/ChatApp";
import { ChatApiManager } from "../api";
import { App } from "obsidian";

export const CHAT_VIEWTYPE = "inlineai-chat-view";

export interface ChatPluginLike {
	app: App;
	chatapi: ChatApiManager;
	manifest: { id: string };
}

export class InlineAIChatView extends ItemView {
	private root: Root | null = null;
	private plugin: ChatPluginLike;

	constructor(leaf: WorkspaceLeaf, plugin: ChatPluginLike) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return CHAT_VIEWTYPE;
	}

	getDisplayText(): string {
		return "InlineAI Chat";
	}

	getIcon(): string {
		return "message-square";
	}

	async onOpen(): Promise<void> {
		this.root = createRoot(this.contentEl);
		this.root.render(createElement(ChatApp, { plugin: this.plugin }));
	}

	async onClose(): Promise<void> {
		this.root?.unmount();
		this.root = null;
	}
}
