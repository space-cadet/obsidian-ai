import { streamText, isStepCount } from "ai";
import type { StreamEvent } from "../agent/types";
import type { SdkMessage } from "../api";
import {
	createLanguageModel,
	getThinkingProviderOptions,
	normalizeProviderUsage,
} from "./providers";
import type { ProviderProfile } from "../settings";
import type { App } from "obsidian";
import { prepareCodexTools } from "./toolNames";

/**
 * Streams a chat conversation with tool calling support.
 * Yields structured StreamEvent types for progressive display and tool interaction.
 * Each call performs a single step (stopWhen: isStepCount(1)).
 * The caller is responsible for executing tools and calling again for subsequent steps.
 * @param messages - Array of conversation messages (including tool messages).
 * @param tools - Record of tool definitions.
 * @param signal - AbortSignal for cancellation.
 * @param profile - Resolved provider profile.
 * @param thinkingEnabled - Whether extended thinking is enabled.
 */
export async function* streamChatWithTools(
	messages: SdkMessage[],
	tools: any,
	signal: AbortSignal | undefined,
	profile: ProviderProfile,
	thinkingEnabled: boolean | undefined,
	app?: App,
): AsyncIterable<StreamEvent> {
	const model = createLanguageModel(profile, app);
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

	// ── Gemini-specific: disable structured outputs to avoid thought_signature errors ──
	const providerOptions = {
		...getThinkingProviderOptions(profile, thinkingEnabled),
		// Gemini requires special handling for tool calls
		...(profile.provider === "gemini"
			? {
					google: { structuredOutputs: false },
				}
			: {}),
	};

	const prepared =
		profile.provider === "codex"
			? prepareCodexTools(tools ?? {}, chatMessages)
			: {
					tools,
					messages: chatMessages,
					restoreName: (name: string) => name,
				};
	const result = streamText({
		model,
		system,
		messages: prepared.messages as any,
		tools: prepared.tools,
		stopWhen: isStepCount(1),
		abortSignal: signal,
		providerOptions,
	});

	let streamError: string | undefined;
	for await (const part of result.stream) {
		switch (part.type) {
			case "reasoning-delta":
				yield { type: "reasoning-delta", text: part.text };
				break;
			case "text-delta":
				yield { type: "text-delta", text: part.text };
				break;
			case "tool-call":
				yield {
					type: "tool-call",
					call: {
						toolCallId: part.toolCallId,
						toolName: prepared.restoreName(part.toolName),
						args: part.input as Record<string, unknown>,
						providerMetadata: part.providerMetadata as
							| Record<string, unknown>
							| undefined,
					},
				};
				break;
			case "tool-result":
				yield {
					type: "tool-result",
					callId: part.toolCallId,
					result: part.output,
				};
				break;
			case "tool-error":
				yield {
					type: "tool-error",
					callId: part.toolCallId,
					error: String(part.error),
				};
				break;
			case "finish":
				yield {
					type: "finish",
					reason: part.finishReason,
					providerUsage: normalizeProviderUsage(part.totalUsage),
				};
				break;
			case "error":
				// Finish consuming the SDK stream before the caller throws on this
				// event, so its result promises can settle and clean up.
				streamError ??= String(part.error);
				break;
		}
	}
	if (streamError !== undefined) {
		yield { type: "error", message: streamError };
	}
}
