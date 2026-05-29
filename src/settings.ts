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
	/** IDs of profiles selected in the multi-select toolbar (global default) */
	selectedProfileIds: string[];
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
	pressEnterToSend: boolean;
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
	selectedProfileIds: [],
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
	pressEnterToSend: true,
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

	const selectedProfileIds: string[] = Array.isArray(loadedSettings?.selectedProfileIds)
		? loadedSettings.selectedProfileIds.filter((id) =>
			providerProfiles.some((p) => p.id === id),
		)
		: [];

	return {
		providerProfiles,
		activeProviderProfileId,
		selectedProfileIds,
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
		pressEnterToSend: Boolean(merged.pressEnterToSend ?? true),
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

// Re-export SettingsTab for backward compatibility
export { ObsidianAISettingsTab } from "./settings-sections/SettingsTab";
