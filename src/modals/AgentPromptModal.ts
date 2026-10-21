import { App, Modal, Notice, Setting } from "obsidian";
import type ObsidianAIPlugin from "../main";
import { DEFAULT_AGENT_PROMPT } from "../defaultAgentPrompt";

export class AgentPromptModal extends Modal {
	private promptTextarea: HTMLTextAreaElement | null = null;

	constructor(
		app: App,
		private readonly plugin: ObsidianAIPlugin,
		private readonly saveSettings: (options?: {
			refresh?: boolean;
			quiet?: boolean;
		}) => Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("obsidian-ai-agent-prompt-modal");
		this.titleEl.setText("Agent prompt");
		this.contentEl.empty();
		this.contentEl.createEl("p", {
			text: "This is the complete editable base prompt shared by single-agent and group-agent chats. Chat Lab adds the current date and time, note context, available tools, persona and memory, participants, and group-chat instructions when each request is built.",
		});

		new Setting(this.contentEl)
			.setName("Main instructions")
			.addTextArea((textarea) => {
				textarea
					.setValue(this.plugin.settings.agentPrompt)
					.setPlaceholder(DEFAULT_AGENT_PROMPT);
				textarea.inputEl.addClass("agent-prompt-modal-textarea");
				textarea.inputEl.setAttribute(
					"aria-label",
					"Main agent prompt",
				);
				textarea.inputEl.rows = 24;
				this.promptTextarea = textarea.inputEl;
			});

		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText("Cancel").onClick(() => this.close()),
			)
			.addButton((button) =>
				button.setButtonText("Reset to default").onClick(() => {
					void this.resetPrompt();
				}),
			)
			.addButton((button) =>
				button
					.setButtonText("Save")
					.setCta()
					.onClick(() => {
						void this.savePrompt();
					}),
			);

		window.setTimeout(() => this.promptTextarea?.focus(), 0);
	}

	onClose(): void {
		this.promptTextarea = null;
		this.contentEl.empty();
	}

	private async persistPrompt(prompt: string): Promise<boolean> {
		const previous = this.plugin.settings.agentPrompt;
		this.plugin.settings.agentPrompt = prompt;
		try {
			await this.saveSettings();
			return true;
		} catch (error) {
			this.plugin.settings.agentPrompt = previous;
			new Notice(
				`Could not save the agent prompt: ${error instanceof Error ? error.message : String(error)}`,
			);
			return false;
		}
	}

	private async savePrompt(): Promise<void> {
		const prompt = this.promptTextarea?.value ?? "";
		if (!prompt.trim()) {
			new Notice(
				"The agent prompt cannot be empty. Use Reset to default and then Save to restore it.",
			);
			return;
		}
		if (await this.persistPrompt(prompt)) this.close();
	}

	private resetPrompt(): void {
		if (this.promptTextarea)
			this.promptTextarea.value = DEFAULT_AGENT_PROMPT;
		new Notice("Default prompt loaded. Select Save to apply it.");
	}
}
