import { generateText, streamText } from "ai";
import type { StreamEvent } from "./agent/types";
import {
	getActiveProviderProfile,
	ObsidianAISettings,
	ProviderProfile,
} from "./settings";
import { App, MarkdownView, Notice } from "obsidian";
import { EditorView } from "@codemirror/view";
import { setGeneratedResponseEffect } from "./modules/AIExtension";
import { parseCommand } from "./modules/commands/parser";
import { MessageQueue, HistoryMessage } from "./api/history";
import type { ProviderTokenUsage } from "./types";
import {
	createLanguageModel,
	validateProfile,
	fetchProviderModels,
	normalizeProviderUsage,
	getThinkingProviderOptions,
} from "./api/providers";
import { streamChatWithTools as _streamChatWithTools } from "./api/streaming";

/**
 * Content part for multimodal messages — text, image, or file.
 */
export type MessageContentPart =
	| { type: "text"; text: string }
	| { type: "image"; image: string }
	| { type: "file"; data: string; mimeType: string };

/**
 * A chat message for the AI SDK — supports string or multimodal content.
 * Uses SDK-compatible typing with proper role discrimination.
 */
export type SdkMessage =
	| { role: "system"; content: string | MessageContentPart[] }
	| { role: "user"; content: string | MessageContentPart[] }
	| { role: "assistant"; content: string | MessageContentPart[] };

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
			settings.messageHistory ? settings.maxContextMessages || 50 : 0,
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
		profile?: ProviderProfile,
		signal?: AbortSignal,
	): Promise<string> {
		const model = createLanguageModel(
			profile ?? getActiveProviderProfile(this.settings),
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
				abortSignal: signal,
			});
			return result.text;
		} catch (error: any) {
			if (signal?.aborted || error?.name === "AbortError") {
				throw error;
			}
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
		messages: SdkMessage[],
		signal?: AbortSignal,
		profile?: ProviderProfile,
		thinkingEnabled?: boolean,
		onUsage?: (usage: ProviderTokenUsage) => void,
	): AsyncIterable<string> {
		const model = createLanguageModel(
			profile ?? getActiveProviderProfile(this.settings),
		);
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
				thinkingEnabled,
			),
		});

		for await (const chunk of result.textStream) {
			yield chunk;
		}
		if (onUsage) {
			onUsage(normalizeProviderUsage(await result.usage));
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
		thinkingEnabled?: boolean,
	): AsyncIterable<StreamEvent> {
		yield* _streamChatWithTools(
			messages,
			tools,
			signal,
			profile ?? getActiveProviderProfile(this.settings),
			thinkingEnabled,
		);
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
			settings.messageHistory ? settings.maxContextMessages || 50 : 0,
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
