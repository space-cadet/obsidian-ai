import { config } from "dotenv";
import type { App } from "obsidian";
import type { ObsidianAISettings, ProviderProfile } from "../src/settings";
import { DEFAULT_SETTINGS, createProviderProfile } from "../src/settings";

// Load .env file if present
config({ path: ".env" });

// ── Provider key → env var mapping ──
const KEY_ENV_MAP: Record<string, string | undefined> = {
	openai: process.env.OPENAI_API_KEY,
	anthropic: process.env.ANTHROPIC_API_KEY,
	gemini: process.env.GEMINI_API_KEY,
	deepseek: process.env.DEEPSEEK_API_KEY,
	kimi: process.env.KIMI_API_KEY,
	openrouter: process.env.OPENROUTER_API_KEY,
	azure: process.env.AZURE_OPENAI_API_KEY,
	ollama: undefined, // no key needed
	custom: undefined,
	agent: undefined,
};

/** Check if a provider has a configured API key. */
export function hasProviderKey(provider: string): boolean {
	return !!KEY_ENV_MAP[provider];
}

/** Build a ProviderProfile from environment variables. */
export function buildTestProfile(
	provider: string,
	overrides: Partial<ProviderProfile> = {},
): ProviderProfile {
	const apiKey = KEY_ENV_MAP[provider] ?? "";
	const modelEnvVar = `${provider.toUpperCase().replace(/-/g, "_")}_TEST_MODEL`;
	const model = process.env[modelEnvVar] ?? overrides.model ?? getDefaultTestModel(provider);

	return createProviderProfile({
		provider: provider as any,
		apiKey,
		model,
		...overrides,
	});
}

function getDefaultTestModel(provider: string): string {
	switch (provider) {
		case "openai":
			return "gpt-4o-mini";
		case "anthropic":
			return "claude-3-5-haiku-latest";
		case "gemini":
			return "gemini-2.0-flash";
		case "deepseek":
			return "deepseek-chat";
		case "kimi":
			return "kimi-k2.5";
		case "openrouter":
			return "openai/gpt-4o-mini";
		case "ollama":
			return "llama3.2";
		default:
			return "";
	}
}

/** Create a minimal mock App for ChatApiManager. */
export function createMockApp(): App {
	return {
		vault: {
			getAbstractFileByPath: () => null,
			read: async () => "",
			readBinary: async () => new ArrayBuffer(0),
		} as any,
		workspace: {
			getActiveViewOfType: () => null,
		} as any,
		metadataCache: {
			getFirstLinkpathDest: () => null,
		} as any,
	} as App;
}

/** Build ObsidianAISettings with a single active provider profile. */
export function buildTestSettings(
	profile: ProviderProfile,
): ObsidianAISettings {
	return {
		...DEFAULT_SETTINGS,
		providerProfiles: [profile],
		activeProviderProfileId: profile.id,
	};
}

/** Collect all providers that have keys configured. */
export function getConfiguredProviders(): string[] {
	return Object.entries(KEY_ENV_MAP)
		.filter(([provider, key]) => provider !== "ollama" && !!key)
		.map(([provider]) => provider);
}

/** Vitest describe.skipIf wrapper for provider-gated tests. */
export function describeIfProvider(
	provider: string,
	title: string,
	fn: () => void,
) {
	const shouldRun = hasProviderKey(provider);
	if (shouldRun) {
		describe(title, fn);
	} else {
		describe.skip(`${title} [skipped: no ${provider.toUpperCase()} key]`, fn);
	}
}

/** Conditionally run a test if provider key is available. */
export function itIfProvider(
	provider: string,
	title: string,
	fn: () => void | Promise<void>,
	timeout?: number,
) {
	const shouldRun = hasProviderKey(provider);
	if (shouldRun) {
		it(title, fn, timeout);
	} else {
		it.skip(`${title} [skipped: no ${provider.toUpperCase()} key]`, fn, timeout);
	}
}
