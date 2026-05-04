import { App, Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import ObsidianAIPlugin from "./main";
import { cursorPrompt, selectionPrompt } from "./default_prompts";
import { SlashCommand } from "./modules/commands/source";

export type ProviderType =
	| "openai"
	| "ollama"
	| "custom"
	| "gemini"
	| "azure"
	| "anthropic"
	| "deepseek"
	| "kimi"
	| "openrouter";

export interface ModelCache {
	models: string[];
	fetchedAt: number;
	error?: string;
}

export interface ProviderProfile {
	id: string;
	name: string;
	provider: ProviderType;
	model: string;
	apiKey?: string;
	customURL?: string;
	azureEndpoint?: string;
	azureApiVersion?: string;
	modelCache?: ModelCache;
	createdAt: number;
	updatedAt: number;
}

export interface ObsidianAISettings {
	providerProfiles: ProviderProfile[];
	activeProviderProfileId: string;
	selectionPrompt: string;
	cursorPrompt: string;
	customCommands: SlashCommand[];
	commandPrefix: string;
	messageHistory: boolean;
	includeActiveNote: boolean;
	maxContextTokens: number;
	maxSavedConversations: number;
	autoNameSessions: boolean;
	debugLogLevel: "off" | "error" | "info" | "debug";
	debugLogRetention: number;
}

type LegacySettings = Partial<ObsidianAISettings> & {
	provider?: ProviderType;
	model?: string;
	apiKey?: string;
	customURL?: string;
	azureEndpoint?: string;
	azureApiVersion?: string;
};

const DEFAULT_PROFILE_ID = "default-provider-profile";

const generateId = (): string => {
	// Avoid crypto.randomUUID — not reliably available in Obsidian's renderer
	return `profile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const getDefaultProfileName = (provider: ProviderType): string => {
	switch (provider) {
		case "openai":
			return "OpenAI";
		case "azure":
			return "Azure OpenAI";
		case "gemini":
			return "Gemini";
		case "anthropic":
			return "Anthropic";
		case "deepseek":
			return "DeepSeek";
		case "kimi":
			return "Kimi";
		case "openrouter":
			return "OpenRouter";
		case "custom":
			return "Custom endpoint";
		case "ollama":
		default:
			return "Local Ollama";
	}
};

const getDefaultModel = (provider: ProviderType): string => {
	switch (provider) {
		case "openai":
			return "gpt-4o-mini";
		case "gemini":
			return "gemini-pro";
		case "azure":
			return "gpt-4";
		case "anthropic":
			return "claude-3-5-sonnet-latest";
		case "deepseek":
			return "deepseek-chat";
		case "kimi":
			return "moonshot-v1-8k";
		case "openrouter":
			return "openai/gpt-4o-mini";
		case "custom":
			return "gpt-4o-mini";
		case "ollama":
		default:
			return "llama3.2";
	}
};

export const getDefaultEndpoint = (provider: ProviderType): string => {
	switch (provider) {
		case "openai":
			return "https://api.openai.com/v1";
		case "anthropic":
			return "https://api.anthropic.com/v1";
		case "gemini":
			return "https://generativelanguage.googleapis.com/v1beta";
		case "deepseek":
			return "https://api.deepseek.com/v1";
		case "openrouter":
			return "https://openrouter.ai/api/v1";
		case "kimi":
			return "https://api.moonshot.ai/v1";
		case "ollama":
			return "http://localhost:11434/v1";
		case "custom":
			return "";
		case "azure":
		default:
			return "";
	}
};

export const createProviderProfile = (
	overrides: Partial<ProviderProfile> = {},
): ProviderProfile => {
	const now = Date.now();
	const provider = overrides.provider ?? "ollama";
	return {
		id: overrides.id ?? generateId(),
		name: overrides.name ?? getDefaultProfileName(provider),
		provider,
		model: overrides.model ?? getDefaultModel(provider),
		apiKey: overrides.apiKey ?? "",
		customURL: overrides.customURL ?? "",
		azureEndpoint: overrides.azureEndpoint ?? "",
		azureApiVersion: overrides.azureApiVersion ?? "2024-02-15-preview",
		modelCache: overrides.modelCache,
		createdAt: overrides.createdAt ?? now,
		updatedAt: overrides.updatedAt ?? now,
	};
};

const DEFAULT_PROFILES: ProviderProfile[] = [
	createProviderProfile({
		id: DEFAULT_PROFILE_ID,
		name: "Local Ollama",
	}),
	createProviderProfile({ provider: "openai", name: "OpenAI" }),
	createProviderProfile({ provider: "anthropic", name: "Anthropic" }),
	createProviderProfile({ provider: "deepseek", name: "DeepSeek" }),
	createProviderProfile({ provider: "kimi", name: "Kimi" }),
	createProviderProfile({ provider: "gemini", name: "Gemini" }),
	createProviderProfile({ provider: "openrouter", name: "OpenRouter" }),
	createProviderProfile({ provider: "custom", name: "Custom endpoint" }),
];

export const DEFAULT_SETTINGS: ObsidianAISettings = {
	providerProfiles: DEFAULT_PROFILES,
	activeProviderProfileId: DEFAULT_PROFILE_ID,
	selectionPrompt: selectionPrompt,
	cursorPrompt: cursorPrompt,
	customCommands: [],
	commandPrefix: "/",
	messageHistory: false,
	includeActiveNote: false,
	maxContextTokens: 8000,
	maxSavedConversations: 20,
	autoNameSessions: false,
	debugLogLevel: "error",
	debugLogRetention: 200,
};

export const normalizeSettings = (
	loadedSettings: LegacySettings | null | undefined,
): ObsidianAISettings => {
	const merged = {
		...DEFAULT_SETTINGS,
		...(loadedSettings ?? {}),
	};

	const providerProfiles =
		Array.isArray(loadedSettings?.providerProfiles) &&
		loadedSettings.providerProfiles.length > 0
			? loadedSettings.providerProfiles.map(normalizeProviderProfile)
			: [createProfileFromLegacySettings(loadedSettings)];

	const activeProviderProfileId: string = providerProfiles.some(
		(profile) => profile.id === loadedSettings?.activeProviderProfileId,
	)
		? (loadedSettings?.activeProviderProfileId as string)
		: providerProfiles[0].id;

	return {
		providerProfiles,
		activeProviderProfileId,
		selectionPrompt: merged.selectionPrompt,
		cursorPrompt: merged.cursorPrompt,
		customCommands: merged.customCommands ?? [],
		commandPrefix: merged.commandPrefix || "/",
		messageHistory: Boolean(merged.messageHistory),
		includeActiveNote: Boolean(merged.includeActiveNote),
		maxContextTokens: merged.maxContextTokens ?? 8000,
		maxSavedConversations: merged.maxSavedConversations ?? 20,
		autoNameSessions: Boolean(merged.autoNameSessions),
		debugLogLevel: merged.debugLogLevel ?? "error",
		debugLogRetention: merged.debugLogRetention ?? 200,
	};
};

export const getActiveProviderProfile = (
	settings: ObsidianAISettings,
): ProviderProfile => {
	return (
		settings.providerProfiles.find(
			(profile) => profile.id === settings.activeProviderProfileId,
		) ?? settings.providerProfiles[0]
	);
};

const createProfileFromLegacySettings = (
	settings: LegacySettings | null | undefined,
): ProviderProfile => {
	const provider = settings?.provider ?? "ollama";
	return createProviderProfile({
		id: DEFAULT_PROFILE_ID,
		name: getDefaultProfileName(provider),
		provider,
		model: settings?.model ?? getDefaultModel(provider),
		apiKey: settings?.apiKey ?? "",
		customURL: settings?.customURL ?? "",
		azureEndpoint: settings?.azureEndpoint ?? "",
		azureApiVersion: settings?.azureApiVersion ?? "2024-02-15-preview",
	});
};

const normalizeProviderProfile = (
	profile: ProviderProfile,
): ProviderProfile => {
	const provider = profile.provider ?? "ollama";
	return createProviderProfile({
		...profile,
		provider,
		name: profile.name || getDefaultProfileName(provider),
		model: profile.model || getDefaultModel(provider),
	});
};

export class ObsidianAISettingsTab extends PluginSettingTab {
	plugin: ObsidianAIPlugin;

	constructor(app: App, plugin: ObsidianAIPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private get activeProfile(): ProviderProfile {
		return getActiveProviderProfile(this.plugin.settings);
	}

	private async saveSettings(refresh = false) {
		await this.plugin.saveSettings();
		this.plugin.chatapi.updateSettings(this.plugin.settings);
		if (refresh) {
			this.display();
		} else {
			new Notice("Settings saved", 2000);
		}
	}

	private showModelPicker(models: string[], profile: ProviderProfile): void {
		const modal = new (class extends Modal {
			profile: ProviderProfile;
			callback: (model: string) => void;
			constructor(
				app: App,
				profile: ProviderProfile,
				callback: (model: string) => void,
			) {
				super(app);
				this.profile = profile;
				this.callback = callback;
			}

			onOpen() {
				const { contentEl } = this;
				contentEl.createEl("h2", { text: "Select a model" });

				// Search input
				const searchEl = contentEl.createEl("input", {
					type: "text",
					placeholder: "Filter models...",
				});
				searchEl.style.width = "100%";
				searchEl.style.marginBottom = "1rem";

				const listEl = contentEl.createEl("div");
				listEl.style.maxHeight = "400px";
				listEl.style.overflowY = "auto";

				const renderList = (filter: string) => {
					listEl.empty();
					const filtered = filter.trim()
						? models.filter((m) =>
								m.toLowerCase().includes(filter.toLowerCase()),
							)
						: models;
					if (filtered.length === 0) {
						listEl.createEl("p", {
							text: "No models match your filter.",
						});
					}
					for (const modelId of filtered) {
						const item = listEl.createEl("div", {
							text: modelId,
							cls: "suggestion-item",
						});
						item.style.padding = "6px 8px";
						item.style.cursor = "pointer";
						item.style.borderRadius = "4px";
						item.addEventListener("mouseenter", () => {
							item.style.background = "var(--interactive-hover)";
						});
						item.addEventListener("mouseleave", () => {
							item.style.background = "";
						});
						item.addEventListener("click", () => {
							this.callback(modelId);
							this.close();
						});
					}
				};

				renderList("");
				searchEl.addEventListener("input", () => {
					renderList(searchEl.value);
				});
			}
		})(this.app, profile, (model) => {
			profile.model = model;
			profile.updatedAt = Date.now();
			this.saveSettings(true);
		});
		modal.open();
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this.displayProviderProfiles(containerEl);
		this.displayChatDefaults(containerEl);
		this.displayAdvancedPrompts(containerEl);
		this.displayCustomCommands(containerEl);
	}

	private displayProviderProfiles(containerEl: HTMLElement): void {
		containerEl.createEl("h3", { text: "Provider Profiles" });
		containerEl.createEl("p", {
			text: "Store multiple provider configurations and choose which one Obsidian AI uses for inline edits and chat.",
		});

		new Setting(containerEl)
			.setName("Active profile")
			.setDesc("Choose the provider profile used for AI requests.")
			.addDropdown((dropdown) => {
				for (const profile of this.plugin.settings.providerProfiles) {
					dropdown.addOption(profile.id, profile.name);
				}
				dropdown
					.setValue(this.plugin.settings.activeProviderProfileId)
					.onChange(async (value) => {
						this.plugin.settings.activeProviderProfileId = value;
						await this.saveSettings(true);
					});
			})
			.addButton((button) =>
				button
					.setButtonText("New")
					.setTooltip("Create a new provider profile")
					.onClick(async () => {
						const profile = createProviderProfile({
							name: "New profile",
						});
						this.plugin.settings.providerProfiles.push(profile);
						this.plugin.settings.activeProviderProfileId =
							profile.id;
						await this.saveSettings(true);
					}),
			)
			.addButton((button) =>
				button
					.setButtonText("Duplicate")
					.setTooltip("Duplicate the active provider profile")
					.onClick(async () => {
						const source = this.activeProfile;
						const duplicate = createProviderProfile({
							...source,
							id: generateId(),
							name: `${source.name} copy`,
							createdAt: Date.now(),
							updatedAt: Date.now(),
						});
						this.plugin.settings.providerProfiles.push(duplicate);
						this.plugin.settings.activeProviderProfileId =
							duplicate.id;
						await this.saveSettings(true);
					}),
			)
			.addButton((button) =>
				button
					.setButtonText("Delete")
					.setTooltip("Delete the active provider profile")
					.setDisabled(
						this.plugin.settings.providerProfiles.length <= 1,
					)
					.onClick(async () => {
						if (this.plugin.settings.providerProfiles.length <= 1) {
							new Notice("Keep at least one provider profile.");
							return;
						}
						const activeId =
							this.plugin.settings.activeProviderProfileId;
						this.plugin.settings.providerProfiles =
							this.plugin.settings.providerProfiles.filter(
								(profile) => profile.id !== activeId,
							);
						this.plugin.settings.activeProviderProfileId =
							this.plugin.settings.providerProfiles[0].id;
						await this.saveSettings(true);
					}),
			)
			.addButton((button) =>
				button
					.setButtonText("Test")
					.setTooltip("Test the active provider profile")
					.onClick(async () => {
						button.setDisabled(true);
						button.setButtonText("Testing...");
						const result =
							await this.plugin.chatapi.testApiConnection();
						button.setDisabled(false);
						button.setButtonText("Test");
						new Notice(
							result.ok
								? `✅ ${result.message}`
								: `❌ ${result.message}`,
							6000,
						);
					}),
			);

		const profile = this.activeProfile;

		new Setting(containerEl)
			.setName("Profile name")
			.setDesc("A local label for this provider configuration.")
			.addText((text) => {
				text.setPlaceholder("Writing - OpenAI")
					.setValue(profile.name)
					.inputEl.addEventListener("blur", async () => {
						profile.name =
							text.getValue().trim() ||
							getDefaultProfileName(profile.provider);
						profile.updatedAt = Date.now();
						await this.saveSettings(true);
					});
			});

		new Setting(containerEl)
			.setName("Provider")
			.setDesc("Choose the inference provider for this profile.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("openai", "OpenAI")
					.addOption("anthropic", "Anthropic")
					.addOption("deepseek", "DeepSeek")
					.addOption("kimi", "Kimi")
					.addOption("gemini", "Gemini")
					.addOption("openrouter", "OpenRouter")
					.addOption("azure", "Azure OpenAI")
					.addOption("ollama", "Ollama")
					.addOption("custom", "Custom/OpenAI-compatible")
					.setValue(profile.provider)
					.onChange(async (value) => {
						profile.provider = value as ProviderType;
						profile.model = getDefaultModel(profile.provider);
						profile.name =
							profile.name ||
							getDefaultProfileName(profile.provider);
						profile.azureEndpoint = "";
						profile.customURL = "";
						profile.updatedAt = Date.now();
						await this.saveSettings(true);
					}),
			);

		new Setting(containerEl)
			.setName("Model")
			.setDesc("Model or deployment name to use for this profile.")
			.addText((text) => {
				text.setPlaceholder("e.g., gpt-4o-mini")
					.setValue(profile.model)
					.inputEl.addEventListener("blur", async () => {
						profile.model =
							text.getValue().trim() ||
							getDefaultModel(profile.provider);
						profile.updatedAt = Date.now();
						await this.saveSettings();
					});
			})
			.addButton((btn) =>
				btn
					.setButtonText("Fetch models")
					.setTooltip("Fetch available models from this provider")
					.onClick(async () => {
						btn.setButtonText("Fetching...").setDisabled(true);
						try {
							const models =
								await this.plugin.chatapi.fetchModels(profile);
							if (models.length === 0) {
								new Notice("No models found.");
							} else {
								this.showModelPicker(models, profile);
							}
						} catch (e: any) {
							new Notice(`❌ ${e.message || e}`);
						}
						btn.setButtonText("Fetch models").setDisabled(false);
					}),
			);

		if (profile.provider !== "ollama") {
			new Setting(containerEl)
				.setName("API key")
				.setDesc("API key for this provider profile.")
				.addText((text) => {
					text.inputEl.type = "password";
					text.setPlaceholder("sk-...")
						.setValue(profile.apiKey || "")
						.inputEl.addEventListener("blur", async () => {
							profile.apiKey = text.getValue().trim();
							profile.updatedAt = Date.now();
							await this.saveSettings();
						});
				});
		}

		new Setting(containerEl)
			.setName("Endpoint")
			.setDesc(
				profile.provider === "ollama"
					? "Override the default http://localhost:11434/v1"
					: profile.provider === "azure"
						? "Azure OpenAI endpoint URL"
						: `Base URL for ${profile.provider}. Leave empty to use the default.`,
			)
			.addText((text) => {
				const placeholder =
					profile.provider === "azure"
						? "https://your-resource.openai.azure.com"
						: getDefaultEndpoint(profile.provider);
				text.setPlaceholder(placeholder)
					.setValue(
						profile.provider === "azure"
							? profile.azureEndpoint || ""
							: profile.customURL || "",
					)
					.inputEl.addEventListener("blur", async () => {
						const value = text.getValue().trim();
						if (profile.provider === "azure") {
							profile.azureEndpoint = value;
						} else {
							profile.customURL = value;
						}
						profile.updatedAt = Date.now();
						await this.saveSettings();
					});
			});

		if (profile.provider === "azure") {
			new Setting(containerEl)
				.setName("Azure API version")
				.setDesc("Azure OpenAI API version to use.")
				.addText((text) => {
					text.setPlaceholder("2024-02-15-preview")
						.setValue(
							profile.azureApiVersion || "2024-02-15-preview",
						)
						.inputEl.addEventListener("blur", async () => {
							profile.azureApiVersion = text.getValue().trim();
							profile.updatedAt = Date.now();
							await this.saveSettings();
						});
				});
		}
	}

	private displayChatDefaults(containerEl: HTMLElement): void {
		containerEl.createEl("h3", { text: "Chat Defaults" });

		new Setting(containerEl)
			.setName("Include active note")
			.setDesc(
				"Automatically include the active note when chat context is implemented.",
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.includeActiveNote)
					.onChange(async (value) => {
						this.plugin.settings.includeActiveNote = value;
						await this.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Max saved conversations")
			.setDesc(
				"Maximum number of conversations to keep once chat persistence is implemented.",
			)
			.addText((text) => {
				text.setPlaceholder("20")
					.setValue(
						String(this.plugin.settings.maxSavedConversations),
					)
					.inputEl.addEventListener("blur", async () => {
						const value = Number.parseInt(text.getValue(), 10);
						this.plugin.settings.maxSavedConversations =
							Number.isFinite(value) && value > 0 ? value : 20;
						await this.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Max context tokens")
			.setDesc(
				"Approximate context budget for future note/context loading.",
			)
			.addText((text) => {
				text.setPlaceholder("8000")
					.setValue(String(this.plugin.settings.maxContextTokens))
					.inputEl.addEventListener("blur", async () => {
						const value = Number.parseInt(text.getValue(), 10);
						this.plugin.settings.maxContextTokens =
							Number.isFinite(value) && value > 0 ? value : 8000;
						await this.saveSettings();
					});
			});
	}

	private displayAdvancedPrompts(containerEl: HTMLElement): void {
		containerEl.createEl("h3", { text: "Advanced" });

		new Setting(containerEl)
			.setName("Selection prompt")
			.setDesc(
				"System prompt used when the tooltip is triggered with selected text.",
			)
			.addTextArea((textarea) => {
				textarea
					.setPlaceholder("e.g., Summarize the selected text.")
					.setValue(this.plugin.settings.selectionPrompt)
					.inputEl.addEventListener("blur", async () => {
						this.plugin.settings.selectionPrompt =
							textarea.getValue();
						await this.saveSettings();
					});
				textarea.inputEl.classList.add("wide-text-settings");
			});

		new Setting(containerEl)
			.setName("Cursor prompt")
			.setDesc(
				"System prompt used when the tooltip is triggered without selected text.",
			)
			.addTextArea((textarea) => {
				textarea
					.setPlaceholder(
						"e.g., Generate text based on cursor position.",
					)
					.setValue(this.plugin.settings.cursorPrompt)
					.inputEl.addEventListener("blur", async () => {
						this.plugin.settings.cursorPrompt = textarea.getValue();
						await this.saveSettings();
					});
				textarea.inputEl.classList.add("wide-text-settings");
			});

		new Setting(containerEl)
			.setName("Message History")
			.setDesc(
				"Enable prompt history navigation in the inline tooltip using the up/down arrow keys.",
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.messageHistory)
					.onChange(async (value) => {
						this.plugin.settings.messageHistory = value;
						await this.saveSettings();
					});
			});
	}

	private displayCustomCommands(containerEl: HTMLElement): void {
		containerEl.createEl("h3", { text: "Custom Commands" });
		containerEl.createEl("p", {
			text: "Add custom inline-edit commands. Triggered with the prefix defined below.",
		});

		new Setting(containerEl)
			.setName("Command Prefix")
			.setDesc("The prefix used to trigger custom commands.")
			.addText((text) => {
				text.setPlaceholder("/")
					.setValue(this.plugin.settings.commandPrefix)
					.inputEl.addEventListener("blur", async () => {
						this.plugin.settings.commandPrefix =
							text.getValue().charAt(0) || "/";
						await this.saveSettings(true);
					});
			});

		this.plugin.settings.customCommands.forEach((command, index) => {
			new Setting(containerEl)
				.setName(`Command: ${command.keyword}`)
				.setDesc("Edit the command prompt.")
				.addText((text) => {
					text.setValue(command.keyword)
						.setPlaceholder("Command name")
						.inputEl.addEventListener("blur", async () => {
							this.plugin.settings.customCommands[index].keyword =
								text.getValue();
							await this.saveSettings();
						});
				})
				.addTextArea((textarea) => {
					textarea
						.setValue(command.prompt)
						.setPlaceholder("Command prompt")
						.inputEl.addEventListener("blur", async () => {
							this.plugin.settings.customCommands[index].prompt =
								textarea.getValue();
							await this.saveSettings();
						});
				})
				.addExtraButton((btn) =>
					btn
						.setIcon("trash")
						.setTooltip("Delete this command")
						.onClick(async () => {
							this.plugin.settings.customCommands.splice(
								index,
								1,
							);
							await this.saveSettings(true);
						}),
				);
		});

		new Setting(containerEl).addButton((btn) =>
			btn
				.setButtonText("Add Command")
				.setCta()
				.onClick(async () => {
					this.plugin.settings.customCommands.push({
						keyword: "new_command",
						prompt: "",
					});
					await this.saveSettings(true);
				}),
		);
	}
}
