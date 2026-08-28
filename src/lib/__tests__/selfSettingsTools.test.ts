import { describe, it, expect } from "vitest";
import {
	sanitizeSettings,
	validateSettingUpdate,
	MUTABLE_SETTING_KEYS,
} from "../selfSettingsTools";
import type { ObsidianAISettings } from "../../settings";

function makeTestSettings(
	overrides: Partial<ObsidianAISettings> = {},
): ObsidianAISettings {
	return {
		providerProfiles: [
			{
				id: "default",
				name: "Test",
				provider: "openai",
				model: "gpt-4",
				apiKey: "sk-test-secret-key",
				customURL: "",
				azureEndpoint: "",
				azureApiVersion: "",
				createdAt: 0,
				updatedAt: 0,
			},
		],
		activeProviderProfileId: "default",
		selectedProfileIds: [],
		selectionPrompt: "",
		cursorPrompt: "",
		customCommands: [],
		commandPrefix: "/",
		messageHistory: false,
		includeActiveNote: false,
		maxContextTokens: 8000,
		maxContextMessages: 10,
		maxRequestTokens: 32000,
		preserveRecentMessages: 4,
		compactionTriggerTokens: 24000,
		compactionReleaseTokens: 16000,
		requestResponseReserveTokens: 4096,
		maxToolResultTokens: 4000,
		toolHistoryMode: "elide",
		maxSavedConversations: 20,
		autoNameSessions: false,
		chatStorageFormat: "legacy",
		maxSessionsInSidebar: 50,
		sessionBackupCount: 3,
		debugLogLevel: "error",
		debugLogRetention: 200,
		debugLogMaxSizeMB: 5,
		enableAgentTools: true,
		autoApply: false,
		enabledIntegrationProviderIds: [],
		maxAgentSteps: 5,
		pressEnterToSend: true,
		chatTabTitleWidth: 160,
		restoreChatTabs: true,
		showFullRequestTokens: true,
		developerMode: false,
		contextPickerPathDisplay: "duplicates",
		webSearchProvider: "duckduckgo",
		braveApiKey: "brave-secret",
		searxngUrl: "",
		tavilyApiKey: "tavily-secret",
		exaApiKey: "exa-secret",
		pdfExtractionMethod: "auto",
		pdfExtractionServerUrl: "",
		pdfMaxPages: 50,
		intelligence: {
			enableIntelligence: false,
			personaPath: "intelligence/persona.md",
			memoryPath: "intelligence/memory.md",
			identityContextBudget: 2000,
			autoSummarize: false,
			autoSummarizeMinMessages: 4,
			enableMemoryAuditTool: false,
		},
		syncRelayUrl: "ws://localhost:8080",
		syncRelayUrlHistory: [],
		syncRoomId: "obsidian-ai-chat",
		syncUserName: "User",
		checkForUpdates: true,
		updateChannel: "stable",
		lastUpdateCheck: 0,
		autoUpdate: false,
		remoteStorage: {
			enabled: false,
			backend: "none",
			passphrase: "secret-passphrase",
			autoSync: false,
			syncIntervalMinutes: 30,
			conflictStrategy: "last-write-wins",
			syncDirection: "both",
			concurrencyLimit: 3,
			webdav: {
				type: "webdav",
				url: "",
				username: "",
				password: "webdav-password",
				prefix: "obsidian-ai-sync/",
				enabled: false,
			},
			s3: {
				type: "s3",
				endpoint: "",
				region: "us-east-1",
				bucket: "",
				prefix: "obsidian-ai-sync/",
				accessKeyId: "s3-access",
				secretAccessKey: "s3-secret",
				enabled: false,
			},
			lastSyncTime: 0,
		},
		syncComponents: {
			chatSessions: true,
			pluginSettings: true,
			apiKeys: false,
			memory: true,
			memoryAudit: false,
			persona: true,
			usageStats: false,
		},
		...overrides,
	} as ObsidianAISettings;
}

describe("sanitizeSettings", () => {
	it("redacts apiKey from provider profiles", () => {
		const settings = makeTestSettings();
		const sanitized = sanitizeSettings(settings);
		const profiles = sanitized.providerProfiles as Array<
			Record<string, unknown>
		>;
		expect(profiles[0].apiKey).toBe("[REDACTED]");
	});

	it("redacts web search API keys", () => {
		const settings = makeTestSettings();
		const sanitized = sanitizeSettings(settings);
		expect(sanitized.braveApiKey).toBe("[REDACTED]");
		expect(sanitized.tavilyApiKey).toBe("[REDACTED]");
		expect(sanitized.exaApiKey).toBe("[REDACTED]");
	});

	it("redacts remote storage credentials", () => {
		const settings = makeTestSettings();
		const sanitized = sanitizeSettings(settings);
		const remote = sanitized.remoteStorage as Record<string, unknown>;
		expect(remote.passphrase).toBe("[REDACTED]");
		const webdav = remote.webdav as Record<string, unknown>;
		expect(webdav.password).toBe("[REDACTED]");
		const s3 = remote.s3 as Record<string, unknown>;
		expect(s3.secretAccessKey).toBe("[REDACTED]");
	});

	it("includes expected non-sensitive keys", () => {
		const settings = makeTestSettings();
		const sanitized = sanitizeSettings(settings);
		expect(sanitized.maxContextMessages).toBe(10);
		expect(sanitized.maxToolResultTokens).toBe(4000);
		expect(sanitized.enableAgentTools).toBe(true);
		expect(sanitized.autoApply).toBe(false);
		expect(sanitized.showFullRequestTokens).toBe(true);
		expect(sanitized.pressEnterToSend).toBe(true);
		expect(sanitized.autoNameSessions).toBe(false);
		expect(sanitized.messageHistory).toBe(false);
		expect(sanitized.includeActiveNote).toBe(false);
		expect(sanitized.toolHistoryMode).toBe("elide");
		expect(sanitized.developerMode).toBe(false);
	});

	it("preserves nested structure for non-sensitive parts", () => {
		const settings = makeTestSettings();
		const sanitized = sanitizeSettings(settings);
		const remote = sanitized.remoteStorage as Record<string, unknown>;
		expect(remote.enabled).toBe(false);
		expect(remote.backend).toBe("none");
		expect(remote.syncDirection).toBe("both");
		const webdav = remote.webdav as Record<string, unknown>;
		expect(webdav.url).toBe("");
		expect(webdav.prefix).toBe("obsidian-ai-sync/");
	});

	it("does not expose apiKey anywhere in output", () => {
		const settings = makeTestSettings();
		const sanitized = sanitizeSettings(settings);
		const json = JSON.stringify(sanitized);
		expect(json).not.toContain("sk-test-secret-key");
		expect(json).not.toContain("brave-secret");
		expect(json).not.toContain("tavily-secret");
		expect(json).not.toContain("exa-secret");
		expect(json).not.toContain("webdav-password");
		expect(json).not.toContain("s3-secret");
		expect(json).not.toContain("secret-passphrase");
	});
});

describe("validateSettingUpdate", () => {
	it("accepts whitelisted keys with correct types", () => {
		const result = validateSettingUpdate("maxContextMessages", 20);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.key).toBe("maxContextMessages");
			expect(result.value).toBe(20);
		}
	});

	it("rejects non-whitelisted keys", () => {
		const result = validateSettingUpdate("apiKey", "new-key");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("not in the mutable whitelist");
		}
	});

	it("rejects string for number field", () => {
		const result = validateSettingUpdate("maxContextMessages", "20");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("must be a positive number");
		}
	});

	it("rejects number for boolean field", () => {
		const result = validateSettingUpdate("enableAgentTools", 1);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("must be a boolean");
		}
	});

	it("rejects invalid toolHistoryMode value", () => {
		const result = validateSettingUpdate("toolHistoryMode", "full");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain(
				'must be either "elide" or "preserve"',
			);
		}
	});

	it("accepts valid toolHistoryMode values", () => {
		const elide = validateSettingUpdate("toolHistoryMode", "elide");
		expect(elide.ok).toBe(true);
		const preserve = validateSettingUpdate("toolHistoryMode", "preserve");
		expect(preserve.ok).toBe(true);
	});

	it("accepts developerMode as a mutable key", () => {
		const result = validateSettingUpdate("developerMode", true);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.key).toBe("developerMode");
			expect(result.value).toBe(true);
		}
	});

	it("rejects zero for positive number fields", () => {
		const result = validateSettingUpdate("maxContextMessages", 0);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("positive number");
		}
	});

	it("rejects negative numbers", () => {
		const result = validateSettingUpdate("maxToolResultTokens", -1);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("positive number");
		}
	});

	it("accepts messageHistory as boolean-like number", () => {
		// messageHistory is typed as number in the whitelist validation
		const result = validateSettingUpdate("messageHistory", 5);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value).toBe(5);
		}
	});
});

describe("MUTABLE_SETTING_KEYS", () => {
	it("contains exactly the expected keys", () => {
		expect(MUTABLE_SETTING_KEYS).toEqual([
			"maxContextMessages",
			"maxToolResultTokens",
			"enableAgentTools",
			"autoApply",
			"showFullRequestTokens",
			"pressEnterToSend",
			"autoNameSessions",
			"messageHistory",
			"includeActiveNote",
			"toolHistoryMode",
			"developerMode",
		]);
	});
});
