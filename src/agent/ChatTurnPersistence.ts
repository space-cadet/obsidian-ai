import type {
	ChatMessage,
	ChatSession,
	ContentPart,
	ContextItem,
} from "../types";
import type { ProviderTokenUsage } from "../types";
import type { ToolCall, ToolResult } from "./types";

export interface AssistantMessageOptions {
	content: string;
	command?: ChatMessage["command"];
	estimatedTokens: number;
	requestTokenEstimate?: number;
	providerUsage?: ProviderTokenUsage;
	modelName?: string;
	responseTimeMs?: number;
	toolCalls?: Array<{ call: ToolCall; result?: ToolResult }>;
	contentParts?: ContentPart[];
}

/** Create the persisted assistant message after a completed turn. */
export function createAssistantMessage(
	options: AssistantMessageOptions,
): ChatMessage {
	return {
		id: crypto.randomUUID(),
		role: "assistant",
		content: options.content,
		timestamp: Date.now(),
		command: options.command,
		estimatedTokens: options.estimatedTokens,
		requestTokenEstimate: options.requestTokenEstimate,
		providerUsage: options.providerUsage,
		modelName: options.modelName,
		responseTimeMs: options.responseTimeMs,
		toolCalls: options.toolCalls,
		contentParts: options.contentParts,
	};
}

/** Add a message to one session without changing the other sessions. */
export function appendMessageToSession(
	sessions: ChatSession[],
	sessionId: string,
	message: ChatMessage,
	contextItems?: ContextItem[],
): ChatSession[] {
	return sessions.map((session) =>
		session.id === sessionId
			? {
					...session,
					messages: [...session.messages, message],
					updatedAt: Date.now(),
					...(contextItems ? { contextItems } : {}),
				}
			: session,
	);
}
