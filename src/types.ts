import type { ToolCall, ToolResult } from "./agent/types";

/** A segment of message content — either text or an inline tool call */
export type ContentPart =
	| { type: "text"; content: string }
	| { type: "tool_call"; call: ToolCall; result?: ToolResult };

export interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp: number;
	isError?: boolean;
	command?: {
		type: "edit" | "create" | "append";
		target: string;
	};
	/** Context items attached when this message was sent */
	contextItems?: ContextItem[];
	/** Estimated token count for this message (including context for user messages) */
	estimatedTokens?: number;
	/** Tool calls made during this message's generation */
	toolCalls?: Array<{
		call: ToolCall;
		result?: ToolResult;
	}>;
	/** Ordered content parts for inline rendering of tool calls */
	contentParts?: ContentPart[];
}

export interface ContextItemBase {
	id: string;
}

export type ContextItem =
	| (ContextItemBase & { type: "note"; path: string; name: string })
	| (ContextItemBase & { type: "folder"; path: string; name: string })
	| (ContextItemBase & { type: "tag"; tag: string })
	| (ContextItemBase & { type: "active-note" });

export interface ChatSession {
	id: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	messages: ChatMessage[];
	contextItems: ContextItem[];
}

export interface StoredChatData {
	sessions: ChatSession[];
	activeSessionId: string | null;
}
