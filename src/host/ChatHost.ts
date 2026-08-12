import type { ObsidianAISettings, ProviderProfile } from "../settings";
import type { StoredChatData } from "../types";

/**
 * Neutral host interface — no Obsidian imports.
 *
 * Provides the minimal surface the chat UI needs from its runtime
 * environment. Production adapter is Obsidian-backed; fixture adapter
 * is used for browser preview / Storybook.
 */
export interface ChatHost {
	// ─── Notifications ───
	/** Show a transient toast/notice to the user. */
	notify(message: string): void;

	// ─── Markdown Rendering ───
	/**
	 * Render markdown into the supplied HTMLElement.
	 * Production: Obsidian MarkdownRenderer. Preview: simple HTML converter.
	 */
	renderMarkdown(
		markdown: string,
		target: HTMLElement,
		sourcePath?: string,
	): Promise<void>;

	// ─── Icon Rendering ───
	/** Render an Obsidian-style icon into the target element. */
	renderIcon(iconId: string, target: HTMLElement): void;

	// ─── Settings Access ───
	getSettings(): ChatHostSettings;
	getProviderProfiles(): ProviderProfile[];
	getActiveProviderProfile(): ProviderProfile;

	// ─── Vault / Workspace ───
	/** Read a vault file as text. Returns null if not found. */
	readFile(path: string): Promise<string | null>;
	/** Open a note by path in the workspace. */
	openNote(path: string): void;
	/** Name of the currently active note, or null. */
	getActiveNoteName(): string | null;

	// ─── Note Mutations (tool actions) ───
	applyNoteChange(path: string, content: string): Promise<void>;
	appendToNote(path: string, content: string): Promise<void>;
	createNote(path: string, content: string): Promise<void>;

	// ─── Context Menu ───
	/** Show a native context menu with the given items. */
	showContextMenu(
		items: { label: string; action: () => void }[],
		event: MouseEvent,
	): void;

	// ─── Session Persistence (plugin bridge) ───
	loadChatData(): Promise<StoredChatData>;
	saveChatData(data: StoredChatData): Promise<void>;
	saveSettings(): Promise<void>;
}

/** Settings subset needed by the UI layer. */
export interface ChatHostSettings extends Pick<
	ObsidianAISettings,
	| "providerProfiles"
	| "enableAgentTools"
	| "autoApply"
	| "maxAgentSteps"
	| "pressEnterToSend"
	| "restoreChatTabs"
	| "chatTabTitleWidth"
	| "syncRelayUrl"
	| "syncRoomId"
	| "syncUserName"
	| "autoNameSessions"
	| "debugLogLevel"
> {}

export type { StoredChatData } from "../types";
