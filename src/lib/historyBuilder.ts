import type { ChatMessage } from "../types";
import type { ToolCall, ToolResult } from "../agent/types";
import { truncateTextForTokens } from "../context/contextBudget";

export interface HistoryEntry {
	role: "user" | "assistant" | "tool";
	content: any;
}

/**
 * Build conversation history preserving tool call/result context.
 *
 * The Vercel AI SDK requires tool calls and results to be passed as
 * separate messages in a specific shape. This reconstructs that shape
 * from the persisted ChatMessage so multi-turn agent loops work.
 *
 * When toolHistoryMode is "elide", tool call arguments and result content
 * are replaced with short placeholders to reduce token usage in history
 * replay. The persisted transcript remains untouched.
 */
export function buildHistoryWithTools(
	messages: ChatMessage[],
	maxMessages: number,
	maxToolResultTokens: number,
	toolHistoryMode: "elide" | "preserve" = "elide",
): HistoryEntry[] {
	const result: HistoryEntry[] = [];

	for (const m of messages.slice(-maxMessages)) {
		// Skip debug/system messages — never sent to model
		if (m.isDebug) continue;

		if (m.role === "user") {
			result.push({
				role: "user",
				content: buildReplayContent(m),
			});
			continue;
		}

		// Assistant message — check for tool calls
		const toolCalls = m.contentParts?.filter(
			(p): p is import("../types").ContentPart & { type: "tool_call" } =>
				p.type === "tool_call",
		);

		if (toolCalls && toolCalls.length > 0) {
			const assistantContent: any[] = [];
			const toolResults: any[] = [];

			for (const part of m.contentParts!) {
				if (part.type === "text") {
					assistantContent.push({
						type: "text",
						text: part.content,
					});
				} else if (part.type === "tool_call") {
					assistantContent.push({
						type: "tool-call",
						toolCallId: part.call.toolCallId,
						toolName: part.call.toolName,
						input:
							toolHistoryMode === "elide"
								? "[elided]"
								: part.call.args,
						...(part.call.providerMetadata
							? {
									providerOptions: part.call.providerMetadata,
								}
							: {}),
					});

					if (part.result) {
						const rawResult = part.result.error
							? `Error: ${part.result.error}`
							: part.result.content || "";
						const resultText =
							toolHistoryMode === "elide"
								? `[${rawResult.length} chars, elided]`
								: truncateTextForTokens(
										rawResult,
										maxToolResultTokens,
									);
						toolResults.push({
							type: "tool-result",
							toolCallId: part.call.toolCallId,
							toolName: part.call.toolName,
							output: {
								type: "text",
								value: resultText,
							},
						});
					}
				}
			}

			if (assistantContent.length > 0) {
				result.push({
					role: "assistant",
					content: assistantContent,
				});
			}

			if (toolResults.length > 0) {
				result.push({
					role: "tool",
					content: toolResults,
				});
			}
		} else if (m.toolCalls && m.toolCalls.length > 0) {
			// Fallback: reconstruct from toolCalls (older format)
			const assistantContent: any[] = [];
			const toolResults: any[] = [];

			if (m.content) {
				assistantContent.push({
					type: "text",
					text: m.content,
				});
			}

			for (const tc of m.toolCalls) {
				assistantContent.push({
					type: "tool-call",
					toolCallId: tc.call.toolCallId,
					toolName: tc.call.toolName,
					input:
						toolHistoryMode === "elide" ? "[elided]" : tc.call.args,
					...(tc.call.providerMetadata
						? {
								providerOptions: tc.call.providerMetadata,
							}
						: {}),
				});

				if (tc.result) {
					const rawResult = tc.result.error
						? `Error: ${tc.result.error}`
						: tc.result.content || "";
					const resultText =
						toolHistoryMode === "elide"
							? `[${rawResult.length} chars, elided]`
							: truncateTextForTokens(
									rawResult,
									maxToolResultTokens,
								);
					toolResults.push({
						type: "tool-result",
						toolCallId: tc.call.toolCallId,
						toolName: tc.call.toolName,
						output: {
							type: "text",
							value: resultText,
						},
					});
				}
			}

			if (assistantContent.length > 0) {
				result.push({
					role: "assistant",
					content: assistantContent,
				});
			}

			if (toolResults.length > 0) {
				result.push({
					role: "tool",
					content: toolResults,
				});
			}
		} else {
			// Plain text message
			result.push({
				role: "assistant",
				content: m.content,
			});
		}
	}

	return result;
}

function buildReplayContent(
	message: ChatMessage,
): string | import("../api").MessageContentPart[] {
	const replayText =
		message.remote && message.fromUserId
			? `[Remote User ${message.fromUserId}]: ${message.content}`
			: message.content;

	if (!message.resolvedParts || message.resolvedParts.length === 0) {
		return replayText;
	}

	return [
		{ type: "text", text: replayText },
		...(message.resolvedParts as import("../api").MessageContentPart[]),
	];
}
