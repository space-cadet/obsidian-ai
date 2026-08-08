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
	searchIndex: import("../search/index").SearchIndex | null;
	integrationRegistry?: import("../integrations/ProviderRegistry").ProviderRegistry;
	openSessionInNewTab(sessionId: string, messageId: string): Promise<void>;
	loadChatData(): Promise<StoredChatData>;
	saveChatData(data: StoredChatData): Promise<void>;
	saveSettings(): Promise<void>;
}

import { WebSocketSyncAdapter } from "../sync/WebSocketSyncAdapter";
import type { SyncAdapter } from "../sync/SyncAdapter";

export class GroupChatView extends ItemView {
	private root: Root | null = null;
	private plugin: ChatPluginLike;
	private syncAdapter: SyncAdapter | null = null;

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
		// Create sync adapter if settings are configured
		const { syncRelayUrl, syncRoomId, syncUserName } = this.plugin.settings;
		if (syncRelayUrl) {
			this.syncAdapter = new WebSocketSyncAdapter(syncRelayUrl);
			try {
				await this.syncAdapter.connect(syncRoomId, syncUserName);
			} catch (err) {
				console.error("[GroupChatView] Failed to connect sync adapter:", err);
			}
		}

		this.root = createRoot(this.contentEl);
		this.root.render(
			createElement(
				ChatErrorBoundary,
				null,
				createElement(GroupChatApp, { 
					plugin: this.plugin, 
					syncAdapter: this.syncAdapter ?? undefined,
				}),
			),
		);
	}

	async onClose(): Promise<void> {
		this.syncAdapter?.disconnect();
		this.syncAdapter = null;
		this.root?.unmount();
		this.root = null;
	}
}
