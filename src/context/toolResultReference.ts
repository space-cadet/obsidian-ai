import type { ChatMessage, ContentPart } from "../types";
import type { ToolCall, ToolResult, ToolResultReference } from "../agent/types";

export interface PersistedToolResultMatch {
	message: ChatMessage;
	call: ToolCall;
	result: ToolResult;
}

/** Convert a persisted result into stable text for exact range retrieval. */
export function serializeToolResult(result: ToolResult): string {
	if (result.content !== undefined) return result.content;
	if (result.error !== undefined) return `Error: ${result.error}`;
	return JSON.stringify(result);
}

function contentPartCalls(message: ChatMessage): Array<{
	call: ToolCall;
	result?: ToolResult;
}> {
	return (message.contentParts ?? [])
		.filter(
			(part): part is Extract<ContentPart, { type: "tool_call" }> =>
				part.type === "tool_call",
		)
		.map((part) => ({ call: part.call, result: part.result }));
}

/**
 * Locate one completed persisted result without preferring a lossy replay
 * representation. Content parts are canonical; toolCalls is the legacy path.
 */
export function findPersistedToolResult(
	sessions: ReadonlyArray<{ id: string; messages: ChatMessage[] }>,
	sessionId: string,
	toolCallId: string,
): PersistedToolResultMatch | { error: string } {
	const session = sessions.find((candidate) => candidate.id === sessionId);
	if (!session) {
		return { error: "The requested chat session was not found." };
	}

	const matches: PersistedToolResultMatch[] = [];
	for (const message of session.messages) {
		const entries =
			message.contentParts && message.contentParts.length > 0
				? contentPartCalls(message)
				: (message.toolCalls ?? []);
		for (const entry of entries) {
			if (entry.call.toolCallId !== toolCallId || !entry.result) continue;
			matches.push({ message, call: entry.call, result: entry.result });
		}
	}

	if (matches.length === 0) {
		return {
			error: "The requested tool result was not found or has not been persisted yet.",
		};
	}
	if (matches.length > 1) {
		return {
			error: "The requested tool result ID is ambiguous in this session.",
		};
	}
	return matches[0];
}

function resultSource(call: ToolCall, result: ToolResult): string | undefined {
	const source =
		result.path ??
		(call.args.path as string | undefined) ??
		(call.args.source as string | undefined);
	return typeof source === "string" && source.length > 0 ? source : undefined;
}

export function createToolResultReference(
	sessionId: string,
	call: ToolCall,
	result: ToolResult,
	messageId?: string,
): ToolResultReference {
	const text = serializeToolResult(result);
	return {
		session_id: sessionId,
		tool_call_id: call.toolCallId,
		tool_name: call.toolName,
		...(messageId ? { message_id: messageId } : {}),
		...(resultSource(call, result)
			? { source: resultSource(call, result) }
			: {}),
		...(result.content_fingerprint
			? { content_fingerprint: result.content_fingerprint }
			: {}),
		content_length: text.length,
	};
}
