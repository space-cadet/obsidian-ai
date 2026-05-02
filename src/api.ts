// api.ts
import { generateText, streamText } from "ai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
	getActiveProviderProfile,
	getDefaultEndpoint,
	ObsidianAISettings,
	ProviderProfile,
	ProviderType,
} from "./settings";
import { App, MarkdownView, Notice } from "obsidian";
import { EditorView } from "@codemirror/view";
import { setGeneratedResponseEffect } from "./modules/AIExtension";
import { parseCommand } from "./modules/commands/parser";
import { MessageQueue } from "./modules/messageHistory/queue";

const MESSAGE_HISTORY_LIMIT = 20;

export type HistoryMessage = {
	mode: string;
	userPrompt: string;
};

/**
 * Maps a provider type to its required credential fields.
 * Returns an error message string if validation fails, or null if valid.
 */
function validateProfile(profile: ProviderProfile): string | null {
	switch (profile.provider) {
		case "openai":
			return profile.apiKey ? null : "OpenAI API key is required.";
		case "anthropic":
			return profile.apiKey ? null : "Anthropic API key is required.";
		case "deepseek":
			return profile.apiKey ? null : "DeepSeek API key is required.";
		case "kimi":
			return profile.apiKey ? null : "Kimi API key is required.";
		case "gemini":
			return profile.apiKey ? null : "Gemini API key is required.";
		case "openrouter":
			return profile.apiKey ? null : "OpenRouter API key is required.";
		case "azure":
			if (!profile.apiKey || !profile.azureEndpoint) {
				return "API key and Azure endpoint are required.";
			}
			return null;
		case "custom":
			if (!profile.apiKey || !profile.customURL) {
				return "API key and custom base URL are required.";
			}
			return null;
		case "ollama":
			return null;
		default:
			return `Unsupported provider: ${profile.provider}`;
	}
}

/**
 * Creates a Vercel AI SDK language model from a provider profile.
 */
function createLanguageModel(profile: ProviderProfile): LanguageModelV3 | null {
	const error = validateProfile(profile);
	if (error) {
		new Notice(`⚠️ ${error} Please check your settings.`);
		return null;
	}

	try {
		switch (profile.provider) {
			case "openai": {
				const provider = createOpenAI({
					apiKey: profile.apiKey,
					baseURL:
						profile.customURL?.trim() ||
						getDefaultEndpoint("openai"),
				});
				return provider.chat(profile.model);
			}

			case "anthropic": {
				const provider = createAnthropic({
					apiKey: profile.apiKey,
					baseURL:
						profile.customURL?.trim() ||
						getDefaultEndpoint("anthropic"),
				});
				return provider.chat(profile.model);
			}

			case "gemini": {
				const provider = createGoogleGenerativeAI({
					apiKey: profile.apiKey,
					baseURL:
						profile.customURL?.trim() ||
						getDefaultEndpoint("gemini"),
				});
				return provider(profile.model);
			}

			case "deepseek": {
				const provider = createDeepSeek({
					apiKey: profile.apiKey,
					baseURL:
						profile.customURL?.trim() ||
						getDefaultEndpoint("deepseek"),
				});
				return provider.chat(profile.model);
			}

			case "ollama": {
				const provider = createOpenAI({
					baseURL:
						profile.customURL?.trim() ||
						getDefaultEndpoint("ollama"),
				});
				return provider.chat(profile.model);
			}

			case "openrouter": {
				const provider = createOpenRouter({
					apiKey: profile.apiKey,
					baseURL:
						profile.customURL?.trim() ||
						getDefaultEndpoint("openrouter"),
				});
				return provider.chat(profile.model);
			}

			case "kimi": {
				const provider = createOpenAI({
					apiKey: profile.apiKey,
					baseURL:
						profile.customURL?.trim() || getDefaultEndpoint("kimi"),
				});
				return provider.chat(profile.model);
			}

			case "custom": {
				const provider = createOpenAI({
					apiKey: profile.apiKey,
					baseURL: profile.customURL!.trim(),
				});
				return provider.chat(profile.model);
			}

			case "azure": {
				const provider = createOpenAI({
					apiKey: profile.apiKey,
					baseURL: profile.azureEndpoint!.trim(),
				});
				return provider.chat(profile.model);
			}

			default:
				new Notice(
					`⚠️ Unsupported provider: ${(profile as ProviderProfile).provider}`,
				);
				return null;
		}
	} catch (error: any) {
		console.error("Error creating language model:", error);
		new Notice(`❌ Error creating language model: ${error.message}`);
		return null;
	}
}

/**
 * Fetches available models from the provider's API.
 * Returns a list of model IDs or an empty array on error.
 */
async function fetchProviderModels(
	profile: ProviderProfile,
): Promise<string[]> {
	try {
		switch (profile.provider) {
			case "openai": {
				const baseURL =
					profile.customURL?.trim() || getDefaultEndpoint("openai");
				const res = await fetch(`${baseURL}/models`, {
					headers: {
						Authorization: `Bearer ${profile.apiKey}`,
					},
				});
				if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
				const data = await res.json();
				return (data.data ?? [])
					.map((m: any) => m.id)
					.filter((id: string) => id.includes("gpt"));
			}

			case "anthropic": {
				// Anthropic has no public models API; return known models.
				return [
					"claude-3-5-sonnet-latest",
					"claude-3-5-sonnet-20241022",
					"claude-3-5-haiku-latest",
					"claude-3-5-haiku-20241022",
					"claude-3-opus-latest",
					"claude-3-opus-20240229",
					"claude-3-sonnet-20240229",
					"claude-3-haiku-20240307",
				];
			}

			case "gemini": {
				const baseURL =
					profile.customURL?.trim() || getDefaultEndpoint("gemini");
				const res = await fetch(
					`${baseURL}/models?key=${profile.apiKey}`,
				);
				if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
				const data = await res.json();
				return (data.models ?? [])
					.map((m: any) => m.name.replace("models/", ""))
					.filter((id: string) => id.startsWith("gemini"));
			}

			case "deepseek": {
				const baseURL =
					profile.customURL?.trim() || getDefaultEndpoint("deepseek");
				const res = await fetch(`${baseURL}/models`, {
					headers: {
						Authorization: `Bearer ${profile.apiKey}`,
					},
				});
				if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
				const data = await res.json();
				return (data.data ?? []).map((m: any) => m.id);
			}

			case "openrouter": {
				const baseURL =
					profile.customURL?.trim() ||
					getDefaultEndpoint("openrouter");
				const res = await fetch(`${baseURL}/models`);
				if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
				const data = await res.json();
				return (data.data ?? []).map((m: any) => m.id);
			}

			case "kimi": {
				const baseURL =
					profile.customURL?.trim() || getDefaultEndpoint("kimi");
				const res = await fetch(`${baseURL}/models`, {
					headers: {
						Authorization: `Bearer ${profile.apiKey}`,
					},
				});
				if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
				const data = await res.json();
				return (data.data ?? [])
					.map((m: any) => m.id)
					.filter((id: string) => id.includes("kimi"));
			}

			case "ollama": {
				const baseURL =
					profile.customURL?.trim() || getDefaultEndpoint("ollama");
				const res = await fetch(
					`${baseURL.replace("/v1", "")}/api/tags`,
				);
				if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
				const data = await res.json();
				return (data.models ?? []).map((m: any) => m.name);
			}

			case "custom": {
				const baseURL = profile.customURL!.trim();
				const res = await fetch(`${baseURL}/models`, {
					headers: {
						Authorization: `Bearer ${profile.apiKey}`,
					},
				});
				if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
				const data = await res.json();
				return (data.data ?? []).map((m: any) => m.id);
			}

			case "azure": {
				// Azure OpenAI: list deployments via management API or fallback
				const endpoint = profile.azureEndpoint!.trim();
				const instanceMatch = endpoint.match(
					/https:\/\/([^.]+)\.(?:openai|cognitiveservices)\.azure\.com/,
				);
				if (!instanceMatch) {
					throw new Error(
						"Could not parse Azure instance name from endpoint.",
					);
				}
				const instance = instanceMatch[1];
				const res = await fetch(
					`https://${instance}.openai.azure.com/openai/deployments?api-version=2023-03-15-preview`,
					{
						headers: {
							"api-key": profile.apiKey!,
						},
					},
				);
				if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
				const data = await res.json();
				return (data.data ?? []).map((m: any) => m.id || m.model);
			}

			default:
				return [];
		}
	} catch (error: any) {
		console.error("Error fetching models:", error);
		throw error;
	}
}

/**
 * Class to manage interactions with different chat APIs.
 */
export class ChatApiManager {
	private app: App;
	private settings: ObsidianAISettings;
	private messageHistory: MessageQueue<HistoryMessage>;

	/**
	 * Initializes the ChatApiManager with the given settings.
	 * @param settings - Configuration settings for the chat API.
	 * @param app - The Obsidian App instance.
	 */
	constructor(settings: ObsidianAISettings, app: App) {
		this.app = app;
		this.settings = settings;
		this.messageHistory = new MessageQueue<HistoryMessage>(
			settings.messageHistory ? MESSAGE_HISTORY_LIMIT : 0,
		);
	}

	/**
	 * Calls the chat API with the provided content and context.
	 * Blocking call for the inline tooltip.
	 * @param systemMessage - The system message to send to the chat API.
	 * @param message - The user's message to send to the chat API.
	 * @returns A promise that resolves with the generated content or an error message.
	 */
	public async callApi(
		systemMessage: string,
		message: string,
	): Promise<string> {
		const model = createLanguageModel(
			getActiveProviderProfile(this.settings),
		);
		if (!model) {
			new Notice(
				"⚠️ Chat client is not initialized. Please check your settings.",
			);
			return "⚠️ Chat client is not available.";
		}

		try {
			const result = await generateText({
				model,
				system: systemMessage,
				messages: [{ role: "user", content: message }],
			});
			return result.text;
		} catch (error: any) {
			console.error("Error calling the chat model:", error);
			new Notice(`❌ Error calling the chat model: ${error.message}`);
			return "⚠️ Failed to generate a response. Please try again later.";
		}
	}

	/**
	 * Streams a chat conversation.
	 * Yields text chunks for progressive display.
	 * @param messages - Array of conversation messages.
	 * @param signal - AbortSignal for cancellation.
	 */
	public async *streamChat(
		messages: Array<{
			role: "user" | "assistant" | "system";
			content: string;
		}>,
		signal?: AbortSignal,
	): AsyncIterable<string> {
		const model = createLanguageModel(
			getActiveProviderProfile(this.settings),
		);
		if (!model) {
			throw new Error("Chat client is not initialized.");
		}

		const result = streamText({
			model,
			messages,
			abortSignal: signal,
		});

		for await (const chunk of result.textStream) {
			yield chunk;
		}
	}

	/**
	 * Fetches available models for a provider profile.
	 * @param profile - Provider profile to fetch models for.
	 * @returns Array of model IDs.
	 */
	public async fetchModels(profile: ProviderProfile): Promise<string[]> {
		return fetchProviderModels(profile);
	}

	/**
	 * Handles user input and updates the editor with the response.
	 * @param systemPrompt - The system prompt to send to the chat API.
	 * @param userRequest - The user's request to process.
	 * @returns The AI-generated response or an error message.
	 */
	private async handleEditorUpdate(
		systemPrompt: string,
		userRequest: string,
	): Promise<string> {
		try {
			const response = await this.callApi(systemPrompt, userRequest);
			if (!response) return "⚠️ No response generated.";

			const markdownView =
				this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!markdownView) {
				new Notice("⚠️ No active Markdown editor found.");
				return "";
			}

			const mainEditorView = (markdownView.editor as any)
				.cm as EditorView;
			mainEditorView?.dispatch({
				effects: setGeneratedResponseEffect.of({
					airesponse: response,
					prompt: userRequest,
				}),
			});

			return response;
		} catch (error: any) {
			console.error("Error processing request:", error);
			new Notice(`❌ Error processing request: ${error.message}`);
			return "⚠️ Failed to process request.";
		}
	}

	/**
	 * Processes selected text using the specified prompt and transformation.
	 * @param userPrompt - The transformation prompt (e.g., "Add Emojis").
	 * @param selectedText - The selected text to transform.
	 * @returns The transformed text or an error message.
	 */
	public async callSelection(
		userPrompt: string,
		selectedText: string,
	): Promise<string> {
		userPrompt = parseCommand(
			userPrompt,
			this.settings.commandPrefix,
			this.settings.customCommands,
		);

		let isCursor = false;
		if (selectedText.trim().length === 0) {
			isCursor = true;
		}

		const systemPrompt = isCursor
			? this.settings.cursorPrompt
			: this.settings.selectionPrompt;
		let finalUserPrompt = ``;
		const mode = isCursor ? "cursor" : "selection";
		if (this.settings.messageHistory) {
			this.messageHistory.enqueue({ mode, userPrompt });
		}

		if (isCursor) {
			finalUserPrompt = `
      **Task:** ${userPrompt}  
      **Output:**`;
		} else {
			finalUserPrompt = `
      **Task:** ${userPrompt}  
      **Input:**  
      ${selectedText}

      **Output:**`;
		}
		return this.handleEditorUpdate(systemPrompt, finalUserPrompt);
	}

	/**
	 * Updates the manager's settings.
	 * @param settings - New configuration settings for the chat API.
	 */
	public updateSettings(settings: ObsidianAISettings): void {
		this.settings = settings;
		this.messageHistory = new MessageQueue<HistoryMessage>(
			settings.messageHistory ? MESSAGE_HISTORY_LIMIT : 0,
		);
	}

	/**
	 * Validates the active provider profile by checking required fields.
	 * @returns true if the profile is valid.
	 */
	public testConnection(): boolean {
		const profile = getActiveProviderProfile(this.settings);
		return validateProfile(profile) === null;
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
		const fieldError = validateProfile(profile);
		if (fieldError) {
			return { ok: false, message: fieldError };
		}

		const model = createLanguageModel(profile);
		if (!model) {
			return {
				ok: false,
				message: "Could not create language model. Check settings.",
			};
		}

		try {
			await generateText({
				model,
				messages: [{ role: "user", content: "Hi" }],
			});
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
					message: "Invalid API key. Check your credentials.",
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

	public getMessageHistory(): HistoryMessage[] {
		return this.messageHistory.getItems();
	}
}
