import { Notice, MarkdownRenderer, Menu, TFile } from "obsidian";
import type { App } from "obsidian";
import type { ChatHost, ChatHostSettings, StoredChatData } from "./ChatHost";
import type { ProviderProfile } from "../settings";
import { getActiveProviderProfile } from "../settings";
import type { ChatPluginLike } from "../views/ObsidianAIChatView";

/**
 * Production adapter — bridges ChatHost to Obsidian APIs.
 */
export class ObsidianChatHost implements ChatHost {
	constructor(private plugin: ChatPluginLike) {}

	private get app(): App {
		return this.plugin.app;
	}

	// ─── Notifications ───
	notify(message: string): void {
		new Notice(message);
	}

	// ─── Markdown Rendering ───
	async renderMarkdown(
		markdown: string,
		target: HTMLElement,
		sourcePath?: string,
	): Promise<void> {
		await MarkdownRenderer.render(
			this.app,
			markdown,
			target,
			sourcePath ?? "",
			this.plugin as unknown as import("obsidian").Component,
		);
	}

	// ─── Icon Rendering ───
	renderIcon(iconId: string, target: HTMLElement): void {
		import("obsidian").then(({ setIcon }) => setIcon(target, iconId));
	}

	// ─── Settings Access ───
	getSettings(): ChatHostSettings {
		return this.plugin.settings;
	}

	getProviderProfiles(): ProviderProfile[] {
		return this.plugin.settings.providerProfiles;
	}

	getActiveProviderProfile(): ProviderProfile {
		return getActiveProviderProfile(this.plugin.settings);
	}

	// ─── Vault / Workspace ───
	async readFile(path: string): Promise<string | null> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			return this.app.vault.read(file);
		}
		return null;
	}

	openNote(path: string): void {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			this.app.workspace.getLeaf().openFile(file);
		}
	}

	getActiveNoteName(): string | null {
		const leaf = this.app.workspace.activeLeaf;
		if (!leaf) return null;
		const view = leaf.view;
		if (view && "file" in view && view.file instanceof TFile) {
			return view.file.basename;
		}
		return null;
	}

	// ─── Note Mutations ───
	async applyNoteChange(path: string, content: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			await this.app.vault.modify(file, content);
		}
	}

	async appendToNote(path: string, content: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			const existing = await this.app.vault.read(file);
			await this.app.vault.modify(file, existing + content);
		}
	}

	async createNote(path: string, content: string): Promise<void> {
		await this.app.vault.create(path, content);
	}

	// ─── Context Menu ───
	showContextMenu(
		items: { label: string; action: () => void }[],
		event: MouseEvent,
	): void {
		const menu = new Menu();
		for (const item of items) {
			menu.addItem((mi) =>
				mi.setTitle(item.label).onClick(() => item.action()),
			);
		}
		menu.showAtMouseEvent(event);
	}

	// ─── Session Persistence ───
	async loadChatData(): Promise<StoredChatData> {
		return this.plugin.loadChatData();
	}

	async saveChatData(data: StoredChatData): Promise<void> {
		return this.plugin.saveChatData(data);
	}

	async saveSettings(): Promise<void> {
		return this.plugin.saveSettings();
	}
}
