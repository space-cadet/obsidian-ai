import { App, Modal, Notice, Setting } from "obsidian";
import type ObsidianAIPlugin from "../main";
import { DEFAULT_AGENT_PROMPT } from "../defaultAgentPrompt";

export class AgentPromptModal extends Modal {
	private promptTextarea: HTMLTextAreaElement | null = null;
	private activeView: "base" | "latest" = "base";
	private draftPrompt: string | null = null;

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
		this.renderContent();
	}

	private renderContent(): void {
		this.contentEl.empty();
		this.promptTextarea = null;
		new Setting(this.contentEl)
			.setName("Prompt view")
			.addButton((button) => {
				button.setButtonText("Base prompt");
				if (this.activeView === "base") button.setCta();
				button.buttonEl.setAttribute(
					"aria-pressed",
					String(this.activeView === "base"),
				);
				return button.onClick(() => {
					if (this.activeView === "base") {
						this.draftPrompt =
							this.promptTextarea?.value ?? this.draftPrompt;
					}
					this.activeView = "base";
					this.renderContent();
				});
			})
			.addButton((button) => {
				button.setButtonText("Latest system prompt");
				if (this.activeView === "latest") button.setCta();
				button.buttonEl.setAttribute(
					"aria-pressed",
					String(this.activeView === "latest"),
				);
				return button.onClick(() => {
					if (this.activeView === "base") {
						this.draftPrompt =
							this.promptTextarea?.value ?? this.draftPrompt;
					}
					this.activeView = "latest";
					this.renderContent();
				});
			});

		if (this.activeView === "latest") {
			this.renderLatestPrompt();
			return;
		}

		this.contentEl.createEl("p", {
			text: "Edit the shared base prompt here. Chat Lab adds request-specific persona and memory, tool guidance, date and platform, task instructions, and participants to form the system prompt.",
		});

		new Setting(this.contentEl)
			.setName("Main instructions")
			.addTextArea((textarea) => {
				textarea
					.setValue(
						this.draftPrompt ?? this.plugin.settings.agentPrompt,
					)
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

	private renderLatestPrompt(): void {
		const latest = this.plugin.latestSystemPrompt;
		if (!latest) {
			this.contentEl.createEl("p", {
				text: "No system prompt has been sent yet. Send a chat message to create a preview.",
			});
			new Setting(this.contentEl).addButton((button) =>
				button.setButtonText("Close").onClick(() => this.close()),
			);
			return;
		}

		this.contentEl.createEl("p", {
			text: `Latest prompt sent to ${latest.label} · ${new Date(latest.capturedAt).toLocaleString()}. This generated prompt is read-only and is kept only until Chat Lab reloads.`,
		});
		this.contentEl.createEl("p", {
			text: "Note and attachment contents are sent separately as message context and are not included in this system prompt preview.",
		});

		new Setting(this.contentEl)
			.setName("Latest system prompt")
			.addTextArea((textarea) => {
				textarea.setValue(latest.content);
				textarea.inputEl.readOnly = true;
				textarea.inputEl.addClass("agent-prompt-modal-textarea");
				textarea.inputEl.setAttribute(
					"aria-label",
					"Latest generated system prompt",
				);
				textarea.inputEl.rows = 24;
			});

		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText("Close").onClick(() => this.close()),
			)
			.addButton((button) =>
				button
					.setButtonText("Copy system prompt")
					.setCta()
					.onClick(() => {
						void this.copyLatestPrompt(latest.content);
					}),
			);
	}

	private async copyLatestPrompt(prompt: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(prompt);
			new Notice("Latest system prompt copied.");
		} catch {
			new Notice("Could not copy the latest system prompt.");
		}
	}

	onClose(): void {
		this.promptTextarea = null;
		this.activeView = "base";
		this.draftPrompt = null;
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
		const prompt = this.promptTextarea?.value ?? this.draftPrompt ?? "";
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
		this.draftPrompt = DEFAULT_AGENT_PROMPT;
		new Notice("Default prompt loaded. Select Save to apply it.");
	}
}
