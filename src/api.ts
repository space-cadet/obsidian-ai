import { generateText, streamText } from "ai";
import type { StreamEvent } from "./agent/types";
import {
	getActiveProviderProfile,
	ObsidianAISettings,
	ProviderProfile,
} from "./settings";
import { App, Notice } from "obsidian";
import type { ProviderTokenUsage } from "./types";
import type { ThinkingMode } from "./types";
import { estimateTokens } from "./context/tokenEstimator";
import {
	createLanguageModel,
	validateProfile,
	fetchProviderModels,
	normalizeProviderUsage,
	getThinkingProviderOptions,
} from "./api/providers";
import { streamChatWithTools as _streamChatWithTools } from "./api/streaming";
import { getSdkReasoningLevel } from "./api/thinkingModes";

/**
 * Content part for multimodal messages — text, image, or file.
 */
export type MessageContentPart =
	| { type: "text"; text: string }
	| { type: "image"; image: string }
	| { type: "file"; data: string; mediaType: string };

/**
 * A chat message for the AI SDK — supports string or multimodal content.
 * Uses SDK-compatible typing with proper role discrimination.
 */
export type SdkMessage =
	| { role: "system"; content: string | MessageContentPart[] }
	| { role: "user"; content: string | MessageContentPart[] }
	| { role: "assistant"; content: string | MessageContentPart[] };

export interface ApiCallTelemetryResult {
	text: string;
	errorMessage?: string;
	requestTokenEstimate: number;
	providerUsage?: ProviderTokenUsage;
	responseTimeMs: number;
}

/**
 * Maps a provider type to its required credential fields.
 * Returns an error message string if validation fails, or null if valid.
 */
export { validateProfile };

/**
 * Class to manage interactions with different chat APIs.
 */
export class ChatApiManager {
	private app: App;
	private settings: ObsidianAISettings;
	private logger?: { log: (level: string, ...args: any[]) => void };

	/**
	 * Initializes the ChatApiManager with the given settings.
	 * @param settings - Configuration settings for the chat API.
	 * @param app - The Obsidian App instance.
	 */
	constructor(settings: ObsidianAISettings, app: App) {
		this.app = app;
		this.settings = settings;
	}

	/** Attach the file logger (wired by storage lifecycle after creation). */
	setLogger(logger: { log: (level: string, ...args: any[]) => void }) {
		this.logger = logger;
	}

	/**
	 * Calls the chat API with the provided content and context.
	 * Blocking chat API call.
	 * @param systemMessage - The system message to send to the chat API.
	 * @param message - The user's message to send to the chat API.
	 * @returns A promise that resolves with the generated content or an error message.
	 */
	public async callApi(
		systemMessage: string,
		message: string,
		profile?: ProviderProfile,
		signal?: AbortSignal,
	): Promise<string> {
		const result = await this.callApiWithTelemetry(
			systemMessage,
			message,
			profile,
			signal,
		);
		return result.text;
	}

	/** Call the model while retaining usage for non-chat requests such as compaction. */
	public async callApiWithTelemetry(
		systemMessage: string,
		message: string,
		profile?: ProviderProfile,
		signal?: AbortSignal,
	): Promise<ApiCallTelemetryResult> {
		const startedAt = Date.now();
		const requestTokenEstimate =
			estimateTokens(systemMessage) + estimateTokens(message);
		const model = createLanguageModel(
			profile ?? getActiveProviderProfile(this.settings),
			this.app,
		);
		if (!model) {
			new Notice(
				"⚠️ Chat client is not initialized. Please check your settings.",
			);
			return {
				text: "⚠️ Chat client is not available.",
				errorMessage: "Chat client is not available.",
				requestTokenEstimate,
				responseTimeMs: Date.now() - startedAt,
			};
		}

		try {
			const activeProfile =
				profile ?? getActiveProviderProfile(this.settings);
			if (activeProfile.provider === "codex") {
				const result = streamText({
					model,
					system: systemMessage,
					messages: [{ role: "user", content: message }],
					abortSignal: signal,
					providerOptions: getThinkingProviderOptions(activeProfile),
				});
				let text = "";
				for await (const chunk of result.textStream) text += chunk;
				return {
					text,
					requestTokenEstimate,
					providerUsage: normalizeProviderUsage(await result.usage),
					responseTimeMs: Date.now() - startedAt,
				};
			}

			const result = await generateText({
				model,
				system: systemMessage,
				messages: [{ role: "user", content: message }],
				abortSignal: signal,
			});
			return {
				text: result.text,
				requestTokenEstimate,
				providerUsage: normalizeProviderUsage(result.usage),
				responseTimeMs: Date.now() - startedAt,
			};
		} catch (error: any) {
			if (signal?.aborted || error?.name === "AbortError") {
				throw error;
			}
			console.error("Error calling the chat model:", error);
			new Notice(`❌ Error calling the chat model: ${error.message}`);
			return {
				text: "⚠️ Failed to generate a response. Please try again later.",
				errorMessage: error?.message || "Failed to generate a response.",
				requestTokenEstimate,
				responseTimeMs: Date.now() - startedAt,
			};
		}
	}

	/**
	 * Streams a chat conversation.
	 * Yields text chunks for progressive display.
	 * @param messages - Array of conversation messages.
	 * @param signal - AbortSignal for cancellation.
	 */
	public async *streamChat(
		messages: SdkMessage[],
		signal?: AbortSignal,
		profile?: ProviderProfile,
		thinkingMode?: ThinkingMode,
		onUsage?: (usage: ProviderTokenUsage) => void,
	): AsyncIterable<string> {
		const activeProfile =
			profile ?? getActiveProviderProfile(this.settings);
		this.logger?.log(
			"debug",
			`[API] stream start — model ${activeProfile.model}, ${messages.length} message(s)`,
		);
		const model = createLanguageModel(activeProfile, this.app);
		if (!model) {
			throw new Error("Chat client is not initialized.");
		}

		// Extract system messages — SDK 7.x requires them as a separate parameter
		const systemParts: string[] = [];
		const chatMessages: SdkMessage[] = [];
		for (const m of messages) {
			if (m.role === "system") {
				systemParts.push(
					typeof m.content === "string"
						? m.content
						: m.content
								.map((c) => ("text" in c ? c.text : ""))
								.join(""),
				);
			} else {
				chatMessages.push(m);
			}
		}
		const system =
			systemParts.length > 0 ? systemParts.join("\n\n") : undefined;

		const result = streamText({
			model,
			system,
			messages: chatMessages as any,
			abortSignal: signal,
			providerOptions: getThinkingProviderOptions(
				profile ?? getActiveProviderProfile(this.settings),
				thinkingMode,
			),
			reasoning:
				activeProfile.provider === "openrouter"
					? undefined
					: getSdkReasoningLevel(
							thinkingMode ?? "provider-default",
							activeProfile,
						),
		});

		try {
			for await (const chunk of result.textStream) {
				yield chunk;
			}
			if (onUsage) {
				onUsage(normalizeProviderUsage(await result.usage));
			}
		} catch (e: any) {
			if (!signal?.aborted && e?.name !== "AbortError") {
				this.logger?.log(
					"error",
					`[API] stream error — model ${activeProfile.model}: ${e?.message ?? String(e)}`,
				);
			}
			throw e;
		}
	}

	/**
	 * Streams a chat conversation with tool calling support.
	 * Yields structured StreamEvent types for progressive display and tool interaction.
	 * Each call performs a single step (stopWhen: isStepCount(1)).
	 * The caller is responsible for executing tools and calling again for subsequent steps.
	 * @param messages - Array of conversation messages (including tool messages).
	 * @param tools - Record of tool definitions.
	 * @param signal - AbortSignal for cancellation.
	 */
	public async *streamChatWithTools(
		messages: SdkMessage[],
		tools: any,
		signal?: AbortSignal,
		profile?: ProviderProfile,
		thinkingMode?: ThinkingMode,
	): AsyncIterable<StreamEvent> {
		const activeProfile =
			profile ?? getActiveProviderProfile(this.settings);
		this.logger?.log(
			"debug",
			`[API] tool-step stream start — model ${activeProfile.model}, ${messages.length} message(s)`,
		);
		try {
			yield* _streamChatWithTools(
				messages,
				tools,
				signal,
				activeProfile,
				thinkingMode,
				this.app,
			);
		} catch (e: any) {
			if (!signal?.aborted && e?.name !== "AbortError") {
				this.logger?.log(
					"error",
					`[API] tool-step stream error — model ${activeProfile.model}: ${e?.message ?? String(e)}`,
				);
			}
			throw e;
		}
	}

	/**
	 * Fetches available models for a provider profile.
	 * @param profile - Provider profile to fetch models for.
	 * @returns Array of model IDs.
	 */
	public async fetchModels(profile: ProviderProfile): Promise<string[]> {
		return fetchProviderModels(profile, this.app);
	}

	/**
	 * Updates the manager's settings.
	 * @param settings - New configuration settings for the chat API.
	 */
	public updateSettings(settings: ObsidianAISettings): void {
		this.settings = settings;
	}

	/**
	 * Validates the active provider profile by checking required fields.
	 * @returns true if the profile is valid.
	 */
	public testConnection(): boolean {
		const profile = getActiveProviderProfile(this.settings);
		return validateProfile(profile, this.app) === null;
	}

	/**
	 * Makes a lightweight API call to verify the active provider profile works.
	 * @returns Object with ok status and a human-readable message.
	 */
	public async testApiConnection(): Promise<{
		ok: boolean;
		message: string;
	}> {
		const profile = getActiveProviderProfile(this.settings);
		const fieldError = validateProfile(profile, this.app);
		if (fieldError) {
			return { ok: false, message: fieldError };
		}

		const model = createLanguageModel(profile, this.app);
		if (!model) {
			return {
				ok: false,
				message: "Could not create language model. Check settings.",
			};
		}

		try {
			if (profile.provider === "codex") {
				const result = streamText({
					model,
					messages: [{ role: "user", content: "Hi" }],
					providerOptions: getThinkingProviderOptions(profile),
				});
				for await (const _chunk of result.textStream) {
					// Consume the stream so the provider's completion status is checked.
				}
			} else {
				await generateText({
					model,
					messages: [{ role: "user", content: "Hi" }],
				});
			}
			return {
				ok: true,
				message: `${profile.name} is connected and responding.`,
			};
		} catch (error: any) {
			console.error("Test connection failed:", error);
			const msg = error.message || String(error);
			if (msg.includes("401") || msg.includes("Unauthorized")) {
				return {
					ok: false,
					message:
						profile.provider === "codex"
							? "Codex authorization failed. Sign in again."
							: "Invalid API key. Check your credentials.",
				};
			}
			if (msg.includes("404") || msg.includes("Not Found")) {
				return {
					ok: false,
					message: "Model not found. Check the model name.",
				};
			}
			if (msg.includes("ENOTFOUND") || msg.includes("ECONNREFUSED")) {
				return {
					ok: false,
					message:
						"Could not reach provider. Check your network or endpoint URL.",
				};
			}
			return { ok: false, message: `Connection failed: ${msg}` };
		}
	}
}
