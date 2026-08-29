import type { ChatMessage } from "../types";
import type { ToolCall, ToolResult } from "../agent/types";
import { truncateTextForTokens } from "../context/contextBudget";

export interface HistoryEntry {
	role: "user" | "assistant" | "tool";
	content: any;
}

export interface ToolHistoryPairingCheck {
	valid: boolean;
	errors: string[];
}

type PersistedToolCall = {
	call: ToolCall;
	result?: ToolResult;
};

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
		const contentPartToolCalls = m.contentParts?.filter(
			(p): p is import("../types").ContentPart & { type: "tool_call" } =>
				p.type === "tool_call",
		);

		if (contentPartToolCalls && contentPartToolCalls.length > 0) {
			const assistantContent: any[] = m.contentParts!.map((part): any =>
				part.type === "text"
					? { type: "text", text: part.content }
					: buildToolCallContent(part.call, toolHistoryMode),
			);
			const toolCalls: PersistedToolCall[] = contentPartToolCalls.map(
				(part) => ({ call: part.call, result: part.result }),
			);
			const entries = buildToolHistoryEntries(
				assistantContent,
				toolCalls,
				toolHistoryMode,
				maxToolResultTokens,
			);
			result.push(...entries);
		} else if (m.toolCalls && m.toolCalls.length > 0) {
			// Fallback: reconstruct from toolCalls (older format)
			const assistantContent: any[] = [];

			if (m.content) {
				assistantContent.push({
					type: "text",
					text: m.content,
				});
			}
			assistantContent.push(
				...m.toolCalls.map(({ call }) =>
					buildToolCallContent(call, toolHistoryMode),
				),
			);

			result.push(
				...buildToolHistoryEntries(
					assistantContent,
					m.toolCalls,
					toolHistoryMode,
					maxToolResultTokens,
				),
			);
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

function buildToolHistoryEntries(
	textParts: any[],
	toolCalls: PersistedToolCall[],
	toolHistoryMode: "elide" | "preserve",
	maxToolResultTokens: number,
): HistoryEntry[] {
	const assistantContent: any[] = textParts;
	const toolResults = toolCalls
		.filter(({ result }) => result)
		.map(({ call, result }) => {
			const rawResult = result!.error
				? `Error: ${result!.error}`
				: result!.content || "";
			const resultText =
				toolHistoryMode === "elide"
					? `[${rawResult.length} chars, elided]`
					: truncateTextForTokens(rawResult, maxToolResultTokens);
			return {
				type: "tool-result",
				toolCallId: call.toolCallId,
				toolName: call.toolName,
				output: { type: "text", value: resultText },
			};
		});

	return [
		...(assistantContent.length > 0
			? [{ role: "assistant" as const, content: assistantContent }]
			: []),
		...(toolResults.length > 0
			? [{ role: "tool" as const, content: toolResults }]
			: []),
	];
}

function buildToolCallContent(
	call: ToolCall,
	toolHistoryMode: "elide" | "preserve",
) {
	return {
		type: "tool-call",
		toolCallId: call.toolCallId,
		toolName: call.toolName,
		input: toolHistoryMode === "elide" ? "[elided]" : call.args,
		...(call.providerMetadata
			? { providerOptions: call.providerMetadata }
			: {}),
	};
}

/** Check that every replayed tool result follows a matching tool call. */
export function validateToolHistoryPairing(
	history: HistoryEntry[],
): ToolHistoryPairingCheck {
	const callIds = new Set<string>();
	const errors: string[] = [];

	for (const entry of history) {
		if (!Array.isArray(entry.content)) continue;
		if (entry.role === "assistant") {
			for (const part of entry.content) {
				if (part?.type !== "tool-call") continue;
				if (typeof part.toolCallId !== "string") {
					errors.push("A tool call has no call ID.");
					continue;
				}
				if (callIds.has(part.toolCallId)) {
					errors.push(`Tool call ID repeated: ${part.toolCallId}`);
				}
				callIds.add(part.toolCallId);
			}
		}
		if (entry.role === "tool") {
			for (const part of entry.content) {
				if (part?.type !== "tool-result") continue;
				if (
					typeof part.toolCallId !== "string" ||
					!callIds.has(part.toolCallId)
				) {
					errors.push(
						`Tool result has no preceding call: ${String(part.toolCallId)}`,
					);
				}
			}
		}
	}

	return { valid: errors.length === 0, errors };
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
