import type { ChatHost, ChatHostSettings } from "./ChatHost";
import type { ProviderProfile } from "../settings";

/**
 * Fixture host for browser preview / Storybook.
 * No Obsidian dependencies — all operations are stubbed.
 */
export class FixtureChatHost implements ChatHost {
	notify(message: string): void {
		console.log("[FixtureHost] notify:", message);
	}

	async renderMarkdown(
		markdown: string,
		target: HTMLElement,
		_sourcePath?: string,
	): Promise<void> {
		// Simple markdown-to-HTML for preview; parse into nodes without assigning innerHTML.
		const html = markdown
			.replace(/^### (.*$)/gim, "<h3>$1</h3>")
			.replace(/^## (.*$)/gim, "<h2>$1</h2>")
			.replace(/^# (.*$)/gim, "<h1>$1</h1>")
			.replace(/\*\*(.*)\*\*/gim, "<b>$1</b>")
			.replace(/\*(.*)\*/gim, "<i>$1</i>")
			.replace(/```([\s\S]*?)```/gim, "<pre><code>$1</code></pre>")
			.replace(/`([^`]+)`/gim, "<code>$1</code>")
			.replace(/\n/gim, "<br>");
		const parsed = new DOMParser().parseFromString(html, "text/html");
		target.replaceChildren(...Array.from(parsed.body.childNodes));
	}

	renderIcon(iconId: string, target: HTMLElement): void {
		target.textContent = `[${iconId}]`;
	}

	getSettings(): ChatHostSettings {
		return fixtureSettings;
	}

	getProviderProfiles(): ProviderProfile[] {
		return fixtureProfiles;
	}

	getActiveProviderProfile(): ProviderProfile {
		return fixtureProfiles[0];
	}

	async readFile(path: string): Promise<string | null> {
		return `# Fixture Note: ${path}\n\nThis is mock content for preview.`;
	}

	openNote(_path: string): void {
		// no-op in preview
	}

	getActiveNoteName(): string | null {
		return "Fixture-Note";
	}

	async applyNoteChange(_path: string, _content: string): Promise<void> {
		// no-op
	}

	async appendToNote(_path: string, _content: string): Promise<void> {
		// no-op
	}

	async createNote(_path: string, _content: string): Promise<void> {
		// no-op
	}

	showContextMenu(
		items: { label: string; action: () => void }[],
		_event: MouseEvent,
	): void {
		// Simple alert for preview
		const choice = window.prompt(
			"Context menu:\n" + items.map((i, idx) => `${idx}: ${i.label}`).join("\n"),
		);
		const idx = parseInt(choice ?? "", 10);
		if (!isNaN(idx) && items[idx]) {
			items[idx].action();
		}
	}

	async loadChatData(): Promise<import("./ChatHost").StoredChatData> {
		return { sessions: [], activeSessionId: null };
	}

	async saveChatData() {
		// no-op
	}

	async saveSettings() {
		// no-op
	}
}

const fixtureProfiles: ProviderProfile[] = [
	{
		id: "fixture-openai",
		name: "OpenAI (Fixture)",
		provider: "openai",
		model: "gpt-4o-mini",
		createdAt: Date.now(),
		updatedAt: Date.now(),
	},
	{
		id: "fixture-anthropic",
		name: "Anthropic (Fixture)",
		provider: "anthropic",
		model: "claude-3-5-sonnet",
		createdAt: Date.now(),
		updatedAt: Date.now(),
	},
];

const fixtureSettings: ChatHostSettings = {
	providerProfiles: fixtureProfiles,
	enableAgentTools: true,
	autoApply: false,
	maxAgentSteps: 5,
	pressEnterToSend: true,
	restoreChatTabs: true,
	chatTabTitleWidth: 160,
	syncRelayUrl: "ws://localhost:8080",
	syncRoomId: "obsidian-ai-chat",
	syncUserName: "FixtureUser",
	autoNameSessions: false,
	debugLogLevel: "error",
};
