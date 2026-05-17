import { App, Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import ObsidianAIPlugin from "./main";
import { cursorPrompt, selectionPrompt } from "./default_prompts";
import { SlashCommand } from "./modules/commands/source";

function debounce(fn: () => void, ms: number): () => void {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	return () => {
		if (timeout) {
			clearTimeout(timeout);
		}
		timeout = setTimeout(() => fn(), ms);
	};
}

export type ProviderType =
	| "openai"
	| "ollama"
	| "custom"
	| "gemini"
	| "azure"
	| "anthropic"
	| "deepseek"
	| "kimi"
	| "openrouter"
	| "agent";

export type WebSearchProvider = "brave" | "duckduckgo" | "searxng" | "tavily" | "exa";

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
	// Agent provider fields
	endpointUrl?: string;    // Agent: OpenResponses endpoint URL
	agentId?: string;        // Agent: x-openclaw-agent-id header
	sessionKey?: string;     // Agent: stable session key
	autoApprove?: boolean;   // Agent: auto-execute tool calls
	maxSteps?: number;       // Agent: max tool iterations
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
	maxContextMessages: number;
	maxSavedConversations: number;
	autoNameSessions: boolean;
	debugLogLevel: "off" | "error" | "info" | "debug";
	debugLogRetention: number;
	enableAgentTools: boolean;
	autoApply: boolean;
	maxAgentSteps: number;
	// Web Search settings
	webSearchProvider: WebSearchProvider;
	braveApiKey: string;
	searxngUrl: string;
	tavilyApiKey: string;
	exaApiKey: string;
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
	return `profile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const getProviderColor = (provider: ProviderType): string => {
	const colors: Record<string, string> = {
		openai: "#10a37f",
		anthropic: "#d97757",
		google: "#4285f4",
		gemini: "#4285f4",
		deepseek: "#4d6bfa",
		ollama: "#ff6b35",
		openrouter: "#ef4444",
		kimi: "#2563eb",
		azure: "#0078d4",
		custom: "#8b5cf6",
		agent: "#f59e0b",
	};
	return colors[provider] || "#6b7280";
};

export const getDefaultProfileName = (provider: ProviderType): string => {
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
		case "agent":
			return "Agent (OpenResponses)";
		case "ollama":
		default:
			return "Local Ollama";
	}
};

export const getDefaultModel = (provider: ProviderType): string => {
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
		case "agent":
			return "openclaw";
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
		case "agent":
			return "http://localhost:18789/v1/responses";
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
		// Agent fields
		endpointUrl: overrides.endpointUrl ?? "",
		agentId: overrides.agentId ?? "main",
		sessionKey: overrides.sessionKey ?? "",
		autoApprove: overrides.autoApprove ?? false,
		maxSteps: overrides.maxSteps ?? 10,
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
	createProviderProfile({ provider: "agent", name: "Agent (OpenResponses)" }),
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
	maxContextMessages: 10,
	maxSavedConversations: 20,
	autoNameSessions: false,
	debugLogLevel: "error",
	debugLogRetention: 200,
	enableAgentTools: true,
	autoApply: false,
	maxAgentSteps: 5,
	webSearchProvider: "duckduckgo",
	braveApiKey: "",
	searxngUrl: "",
	tavilyApiKey: "",
	exaApiKey: "",
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
		maxContextMessages: merged.maxContextMessages ?? 10,
		maxSavedConversations: merged.maxSavedConversations ?? 20,
		autoNameSessions: Boolean(merged.autoNameSessions),
		debugLogLevel: merged.debugLogLevel ?? "error",
		debugLogRetention: merged.debugLogRetention ?? 200,
		enableAgentTools: Boolean(merged.enableAgentTools ?? true),
		autoApply: Boolean(merged.autoApply ?? false),
		maxAgentSteps: merged.maxAgentSteps ?? 5,
		webSearchProvider: (merged.webSearchProvider as WebSearchProvider) ?? "duckduckgo",
		braveApiKey: merged.braveApiKey ?? "",
		searxngUrl: merged.searxngUrl ?? "",
		tavilyApiKey: merged.tavilyApiKey ?? "",
		exaApiKey: merged.exaApiKey ?? "",
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
	private isDisplaying = false;
	private pendingRefresh = false;
	private debouncedProfileSave = debounce(() => {
		void this.saveSettings({ quiet: true });
	}, 250);

	constructor(app: App, plugin: ObsidianAIPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private get activeProfile(): ProviderProfile {
		return getActiveProviderProfile(this.plugin.settings);
	}

	private async saveSettings(options?: {
		refresh?: boolean;
		quiet?: boolean;
	}) {
		const refresh = options?.refresh ?? false;
		const quiet = options?.quiet ?? false;
		await this.plugin.saveSettings();
		this.plugin.chatapi.updateSettings(this.plugin.settings);

		if (refresh) {
			if (this.isDisplaying) {
				this.pendingRefresh = true;
				return;
			}
			this.display();
			return;
		}

		if (!quiet) {
			new Notice("Settings saved", 1800);
		}
	}

	display(): void {
		this.isDisplaying = true;
		try {
			const { containerEl } = this;
			containerEl.empty();
			containerEl.addClass("obsidian-ai-settings");

			this.renderHero(containerEl);
			this.renderProviderProfiles(containerEl);
			this.renderChatDefaults(containerEl);
			this.renderAgentTools(containerEl);
			this.renderWebSearch(containerEl);
			this.renderAdvanced(containerEl);
			this.renderCustomCommands(containerEl);
			this.renderDiagnostics(containerEl);
		} finally {
			this.isDisplaying = false;
			if (this.pendingRefresh) {
				this.pendingRefresh = false;
				this.display();
			}
		}
	}

	private createSection(
		containerEl: HTMLElement,
		title: string,
		description?: string,
	): HTMLElement {
		const sectionEl = containerEl.createDiv({
			cls: "obsidian-ai-settings-section",
		});
		sectionEl.createEl("h3", { text: title });
		if (description) {
			sectionEl.createEl("p", {
				text: description,
				cls: "obsidian-ai-settings-section-desc",
			});
		}
		return sectionEl;
	}

	private renderHero(containerEl: HTMLElement): void {
		const profile = this.activeProfile;
		const heroEl = containerEl.createDiv({ cls: "obsidian-ai-settings-hero" });
		const copyEl = heroEl.createDiv();
		copyEl.createEl("div", {
			text: "Obsidian AI Settings",
			cls: "obsidian-ai-settings-eyebrow",
		});
		copyEl.createEl("h2", { text: "Settings" });
		copyEl.createEl("p", {
			text: "Provider profiles, chat defaults, commands, and diagnostics.",
		});

		const metaEl = heroEl.createDiv({ cls: "obsidian-ai-settings-hero-meta" });
		this.createHeroMeta(metaEl, "Active profile", profile.name);
		this.createHeroMeta(metaEl, "Provider", this.getProviderLabel(profile.provider));
		this.createHeroMeta(metaEl, "Model", profile.model || "Unset");
	}

	private createHeroMeta(
		containerEl: HTMLElement,
		label: string,
		value: string,
	): void {
		const itemEl = containerEl.createDiv({
			cls: "obsidian-ai-settings-hero-item",
		});
		itemEl.createEl("div", {
			text: label,
			cls: "obsidian-ai-settings-hero-label",
		});
		itemEl.createEl("div", {
			text: value,
			cls: "obsidian-ai-settings-hero-value",
		});
	}

	private getProviderLabel(provider: ProviderType): string {
		switch (provider) {
			case "openai":
				return "OpenAI";
			case "anthropic":
				return "Anthropic";
			case "deepseek":
				return "DeepSeek";
			case "kimi":
				return "Kimi";
			case "gemini":
				return "Gemini";
			case "openrouter":
				return "OpenRouter";
			case "azure":
				return "Azure OpenAI";
			case "custom":
				return "Custom endpoint";
			case "ollama":
			default:
				return "Ollama";
		}
	}

	private renderProviderProfiles(containerEl: HTMLElement): void {
		const sectionEl = this.createSection(
			containerEl,
			"Provider Profiles",
			"Store multiple provider configurations and switch between them without rewriting credentials.",
		);

		// Mount React profile list into a dedicated container
		const reactContainer = sectionEl.createDiv({
			cls: "obsidian-ai-settings-react-profiles",
		});

		const { createRoot } = require("react-dom/client");
		const { createElement } = require("react");
		const { ProfileList } = require("./components/ProfileCard");
		const { ChatErrorBoundary } = require("./components/ErrorBoundary");

		const root = createRoot(reactContainer);
		root.render(
			createElement(
				ChatErrorBoundary,
				null,
				createElement(ProfileList, { plugin: this.plugin }),
			),
		);

		// Store root so we can unmount on refresh
		(reactContainer as any).__reactRoot = root;
	}

	private renderModelPicker(
		containerEl: HTMLElement,
		profile: ProviderProfile,
	): void {
		const cachedModels = profile.modelCache?.models ?? [];
		const hasCache = cachedModels.length > 0;

		const modelSetting = new Setting(containerEl)
			.setName("Model")
			.setDesc(
				hasCache
					? `${cachedModels.length} cached models for ${this.getProviderLabel(profile.provider)}. Search, click to select, or type a custom value.`
					: "Model or deployment name to use for this profile.",
			);

		const wrapper = modelSetting.controlEl.createDiv({
			cls: "obsidian-ai-settings-model-picker",
		});
		const searchRow = wrapper.createDiv({
			cls: "obsidian-ai-settings-model-row",
		});

		const searchEl = searchRow.createEl("input", {
			type: "text",
			placeholder: hasCache ? "Search cached models..." : "Type model name...",
		});
		searchEl.value = profile.model;

		const fetchButton = searchRow.createEl("button", {
			text: hasCache ? "Refresh" : "Fetch",
		});
		fetchButton.classList.add("mod-cta");

		let listEl: HTMLDivElement | null = null;
		if (hasCache) {
			listEl = wrapper.createDiv({
				cls: "obsidian-ai-settings-model-list",
			});
		}

		const renderList = (filter: string) => {
			if (!listEl) {
				return;
			}
			listEl.empty();
			const term = filter.trim().toLowerCase();
			const filtered = term
				? cachedModels.filter((model) =>
						model.toLowerCase().includes(term),
					)
				: cachedModels;
			const visibleModels = filtered.slice(0, 200);

			for (const model of visibleModels) {
				const itemEl = listEl.createDiv({
					text: model,
					cls: "obsidian-ai-settings-model-item",
				});
				if (model === profile.model) {
					itemEl.addClass("is-active");
				}

				itemEl.addEventListener("click", async () => {
					profile.model = model;
					profile.updatedAt = Date.now();
					searchEl.value = model;
					await this.saveSettings({ quiet: true });
					renderList(searchEl.value);
					new Notice(`Model set to ${model}`, 1800);
				});
			}

			if (visibleModels.length === 0) {
				listEl.createDiv({
					text: "No cached models match your search.",
					cls: "obsidian-ai-settings-model-empty",
				});
			} else if (filtered.length > visibleModels.length) {
				listEl.createDiv({
					text: `Showing first ${visibleModels.length} of ${filtered.length} models.`,
					cls: "obsidian-ai-settings-model-empty",
				});
			}
		};

		renderList("");

		searchEl.addEventListener("input", () => {
			profile.model = searchEl.value.trim();
			profile.updatedAt = Date.now();
			this.debouncedProfileSave();
			renderList(searchEl.value);
		});

		fetchButton.addEventListener("click", async () => {
			fetchButton.setText("Fetching...");
			fetchButton.setAttribute("disabled", "true");
			try {
				const models = await this.plugin.chatapi.fetchModels(profile);
				if (models.length === 0) {
					new Notice("No models found for this provider.", 3000);
				} else {
					profile.modelCache = {
						models,
						fetchedAt: Date.now(),
					};
					profile.updatedAt = Date.now();
					await this.saveSettings({ refresh: true, quiet: true });
					new Notice(`Loaded ${models.length} models.`, 2500);
				}
			} catch (error: any) {
				new Notice(`Failed to fetch models: ${error.message || error}`, 5000);
			} finally {
				fetchButton.setText(hasCache ? "Refresh" : "Fetch");
				fetchButton.removeAttribute("disabled");
			}
		});
	}

	private renderChatDefaults(containerEl: HTMLElement): void {
		const sectionEl = this.createSection(
			containerEl,
			"Chat Defaults",
			"Control what context gets pulled into chat sessions and how much conversation state is retained.",
		);

		new Setting(sectionEl)
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

		new Setting(sectionEl)
			.setName("Auto-name sessions")
			.setDesc(
				"Generate chat titles automatically once a conversation has enough context.",
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.autoNameSessions)
					.onChange(async (value) => {
						this.plugin.settings.autoNameSessions = value;
						await this.saveSettings();
					});
			});

		new Setting(sectionEl)
			.setName("Max saved conversations")
			.setDesc(
				"Maximum number of chat sessions to keep before older ones are trimmed.",
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

		new Setting(sectionEl)
			.setName("Max context tokens")
			.setDesc("Approximate context budget for note/context loading.")
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

		new Setting(sectionEl)
			.setName("Max context messages")
			.setDesc(
				"Maximum previous messages to include in the conversation context. Older messages are silently dropped.",
			)
			.addText((text) => {
				text.setPlaceholder("10")
					.setValue(String(this.plugin.settings.maxContextMessages))
					.inputEl.addEventListener("blur", async () => {
						const value = Number.parseInt(text.getValue(), 10);
						this.plugin.settings.maxContextMessages =
							Number.isFinite(value) && value > 0 ? value : 10;
						await this.saveSettings();
					});
			});
	}

	private renderAgentTools(containerEl: HTMLElement): void {
		const sectionEl = this.createSection(
			containerEl,
			"Agent Tools",
			"Allow the AI to read, edit, create, and append to notes through the built-in tool layer.",
		);

		new Setting(sectionEl)
			.setName("Enable agent tools")
			.setDesc(
				"When enabled, the AI can invoke tools to interact with your vault during chat conversations.",
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.enableAgentTools)
					.onChange(async (value) => {
						this.plugin.settings.enableAgentTools = value;
						await this.saveSettings();
					});
			});

		new Setting(sectionEl)
			.setName("Auto-apply edits")
			.setDesc(
				"Apply note edits automatically without asking for confirmation. (Not recommended for important notes.)",
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.autoApply)
					.onChange(async (value) => {
						this.plugin.settings.autoApply = value;
						await this.saveSettings();
					});
			});

		new Setting(sectionEl)
			.setName("Max agent steps")
			.setDesc(
				"Maximum number of tool call rounds per message. Higher values allow more complex multi-step reasoning.",
			)
			.addText((text) => {
				text.setPlaceholder("5")
					.setValue(String(this.plugin.settings.maxAgentSteps))
					.inputEl.addEventListener("blur", async () => {
						const value = Number.parseInt(text.getValue(), 10);
						this.plugin.settings.maxAgentSteps =
							Number.isFinite(value) && value > 0 ? value : 5;
						await this.saveSettings();
					});
			});
	}

	private renderWebSearch(containerEl: HTMLElement): void {
		const sectionEl = this.createSection(
			containerEl,
			"Web Search",
			"Configure how the AI searches the web for current information.",
		);

		new Setting(sectionEl)
			.setName("Search provider")
			.setDesc("Choose the search engine to use for web queries.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("duckduckgo", "DuckDuckGo (free, no API key)")
					.addOption("brave", "Brave Search API (requires key)")
					.addOption("tavily", "Tavily AI Search (requires key)")
					.addOption("exa", "Exa AI Search (requires key)")
					.addOption("searxng", "SearXNG (self-hosted)")
					.setValue(this.plugin.settings.webSearchProvider)
					.onChange(async (value) => {
						this.plugin.settings.webSearchProvider = value as WebSearchProvider;
						await this.saveSettings({ refresh: true, quiet: true });
					}),
			);

		// Brave API key (only shown when Brave is selected)
		if (this.plugin.settings.webSearchProvider === "brave") {
			new Setting(sectionEl)
				.setName("Brave API key")
				.setDesc(
					"Your Brave Search API key. Get one at https://brave.com/search/api/ (2000 free queries/month).",
				)
				.addText((text) => {
					text.setPlaceholder("BS...")
						.setValue(this.plugin.settings.braveApiKey)
						.inputEl.addEventListener("blur", async () => {
							this.plugin.settings.braveApiKey = text.getValue().trim();
							await this.saveSettings();
						});
					text.inputEl.type = "password";
				});
		}

		// Tavily API key (only shown when Tavily is selected)
		if (this.plugin.settings.webSearchProvider === "tavily") {
			new Setting(sectionEl)
				.setName("Tavily API key")
				.setDesc(
					"Your Tavily API key. Get one at https://tavily.com/ (free tier available).",
				)
				.addText((text) => {
					text.setPlaceholder("tvly-...")
						.setValue(this.plugin.settings.tavilyApiKey)
						.inputEl.addEventListener("blur", async () => {
							this.plugin.settings.tavilyApiKey = text.getValue().trim();
							await this.saveSettings();
						});
					text.inputEl.type = "password";
				});
		}

		// Exa API key (only shown when Exa is selected)
		if (this.plugin.settings.webSearchProvider === "exa") {
			new Setting(sectionEl)
				.setName("Exa API key")
				.setDesc(
					"Your Exa API key. Get one at https://exa.ai/ (free tier available).",
				)
				.addText((text) => {
					text.setPlaceholder("exa-...")
						.setValue(this.plugin.settings.exaApiKey)
						.inputEl.addEventListener("blur", async () => {
							this.plugin.settings.exaApiKey = text.getValue().trim();
							await this.saveSettings();
						});
					text.inputEl.type = "password";
				});
		}

		// SearXNG URL (only shown when SearXNG is selected)
		if (this.plugin.settings.webSearchProvider === "searxng") {
			new Setting(sectionEl)
				.setName("SearXNG instance URL")
				.setDesc(
					"URL of your SearXNG instance, e.g. https://search.example.com",
				)
				.addText((text) => {
					text.setPlaceholder("https://...")
						.setValue(this.plugin.settings.searxngUrl)
						.inputEl.addEventListener("blur", async () => {
							this.plugin.settings.searxngUrl = text.getValue().trim().replace(/\/$/, "");
							await this.saveSettings();
						});
				});
		}
	}

	private renderAdvanced(containerEl: HTMLElement): void {
		const sectionEl = this.createSection(
			containerEl,
			"Advanced",
			"Adjust inline prompt behavior and low-level interaction details.",
		);

		new Setting(sectionEl)
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

		new Setting(sectionEl)
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

		new Setting(sectionEl)
			.setName("Message history")
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

	private renderCustomCommands(containerEl: HTMLElement): void {
		const sectionEl = this.createSection(
			containerEl,
			"Custom Commands",
			"Add reusable inline-edit commands triggered by a shared prefix.",
		);

		new Setting(sectionEl)
			.setName("Command prefix")
			.setDesc("The prefix used to trigger custom commands.")
			.addText((text) => {
				text.setPlaceholder("/")
					.setValue(this.plugin.settings.commandPrefix)
					.inputEl.addEventListener("blur", async () => {
						this.plugin.settings.commandPrefix =
							text.getValue().charAt(0) || "/";
						await this.saveSettings();
					});
			});

		this.plugin.settings.customCommands.forEach((command, index) => {
			new Setting(sectionEl)
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
							await this.saveSettings({
								refresh: true,
								quiet: true,
							});
						}),
				);
		});

		new Setting(sectionEl).addButton((btn) =>
			btn
				.setButtonText("Add Command")
				.setCta()
				.onClick(async () => {
					this.plugin.settings.customCommands.push({
						keyword: "new_command",
						prompt: "",
					});
					await this.saveSettings({ refresh: true, quiet: true });
				}),
		);
	}

	private renderDiagnostics(containerEl: HTMLElement): void {
		const sectionEl = this.createSection(
			containerEl,
			"Diagnostics",
			"Monitor runtime state, manage debug behavior, and clear saved chat data when needed.",
		);

		new Setting(sectionEl)
			.setName("Debug log level")
			.setDesc("Choose how much runtime information the plugin records.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("off", "Off")
					.addOption("error", "Errors only")
					.addOption("info", "Info")
					.addOption("debug", "Debug")
					.setValue(this.plugin.settings.debugLogLevel)
					.onChange(async (value) => {
						this.plugin.settings.debugLogLevel = value as
							| "off"
							| "error"
							| "info"
							| "debug";
						await this.saveSettings();
					}),
			);

		new Setting(sectionEl)
			.setName("Debug log retention")
			.setDesc("Approximate number of log lines to retain before rotation.")
			.addText((text) => {
				text.setPlaceholder("200")
					.setValue(String(this.plugin.settings.debugLogRetention))
					.inputEl.addEventListener("blur", async () => {
						const value = Number.parseInt(text.getValue(), 10);
						this.plugin.settings.debugLogRetention =
							Number.isFinite(value) && value > 0 ? value : 200;
						await this.saveSettings();
					});
			});

		const metricsEl = sectionEl.createDiv({ cls: "obsidian-ai-settings-metrics" });

		const createMetric = (label: string, value: string) => {
			const wrapper = metricsEl.createDiv({
				cls: "obsidian-ai-settings-metric",
			});
			wrapper.createEl("div", {
				text: label,
				cls: "obsidian-ai-settings-metric-label",
			});
			const valueEl = wrapper.createEl("div", {
				text: value,
				cls: "obsidian-ai-settings-metric-value",
			});
			return valueEl;
		};

		const heapUsedEl = createMetric("JS Heap Used", "—");
		const heapTotalEl = createMetric("JS Heap Total", "—");
		const heapLimitEl = createMetric("JS Heap Limit", "—");
		const domNodesEl = createMetric("DOM Nodes", "—");
		const sessionsEl = createMetric("Chat Sessions", "—");
		const messagesEl = createMetric("Total Messages", "—");

		const refreshMetrics = async () => {
			const mem = (performance as any).memory;
			if (mem) {
				heapUsedEl.textContent = `${(mem.usedJSHeapSize / 1024 / 1024).toFixed(1)} MB`;
				heapTotalEl.textContent = `${(mem.totalJSHeapSize / 1024 / 1024).toFixed(1)} MB`;
				heapLimitEl.textContent = `${(mem.jsHeapSizeLimit / 1024 / 1024).toFixed(1)} MB`;
			} else {
				heapUsedEl.textContent = "N/A";
				heapTotalEl.textContent = "N/A";
				heapLimitEl.textContent = "N/A";
			}

			domNodesEl.textContent = String(
				document.getElementsByTagName("*").length,
			);

			try {
				const chatData = await this.plugin.loadChatData();
				const sessionCount = chatData.sessions.length;
				const msgCount = chatData.sessions.reduce(
					(sum, s) => sum + s.messages.length,
					0,
				);
				sessionsEl.textContent = String(sessionCount);
				messagesEl.textContent = String(msgCount);
			} catch {
				sessionsEl.textContent = "?";
				messagesEl.textContent = "?";
			}
		};

		new Setting(sectionEl)
			.setName("Refresh metrics")
			.setDesc("Update the diagnostic numbers above.")
			.addButton((btn) =>
				btn
					.setButtonText("Refresh")
					.setIcon("refresh-cw")
					.onClick(() => {
						btn.setDisabled(true);
						refreshMetrics().then(() => {
							btn.setDisabled(false);
						});
					}),
			);

		new Setting(sectionEl)
			.setName("Force garbage collection")
			.setDesc(
				"To force GC, open DevTools (Ctrl/Cmd+Shift+I) and run the GC profiler.",
			)
			.addButton((btn) =>
				btn
					.setButtonText("Open DevTools")
					.onClick(() => {
						// @ts-ignore
						if (this.app?.vault?.adapter?.openDevTools) {
							// @ts-ignore
							this.app.vault.adapter.openDevTools();
						} else {
							new Notice(
								"DevTools shortcut: Ctrl+Shift+I (or Cmd+Opt+I on macOS)",
								8000,
							);
						}
					}),
			);

		new Setting(sectionEl)
			.setName("Clear all chat history")
			.setDesc(
				"Permanently delete all saved chat sessions. This frees up storage memory.",
			)
			.addButton((btn) =>
				btn
					.setButtonText("Clear History")
					.setWarning()
					.onClick(async () => {
						const modal = new Modal(this.app);
						modal.titleEl.setText("Clear all chat history?");
						modal.contentEl.createEl("p", {
							text: "This will permanently delete all chat sessions. This action cannot be undone.",
						});
						const btnContainer = modal.contentEl.createEl("div");
						btnContainer.style.display = "flex";
						btnContainer.style.gap = "8px";
						btnContainer.style.marginTop = "12px";

						const cancelBtn = btnContainer.createEl("button", {
							text: "Cancel",
						});
						cancelBtn.addEventListener("click", () => {
							modal.close();
						});

						const confirmBtn = btnContainer.createEl("button", {
							text: "Clear All",
						});
						confirmBtn.classList.add("mod-warning");
						confirmBtn.addEventListener("click", async () => {
							await this.plugin.saveChatData({
								sessions: [],
								activeSessionId: null,
							});
							modal.close();
							new Notice("✓ All chat history cleared.");
							refreshMetrics();
						});

						modal.open();
					}),
			);

		refreshMetrics();
	}
}
