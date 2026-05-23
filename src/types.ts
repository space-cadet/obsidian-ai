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
	/** Model name that generated this message (e.g. "gpt-4o", "gemini-1.5-pro") */
	modelName?: string;
	/** Response time in milliseconds */
	responseTimeMs?: number;
	/** Tool calls made during this message's generation */
	toolCalls?: Array<{
		call: ToolCall;
		result?: ToolResult;
	}>;
	/** Ordered content parts for inline rendering of tool calls */
	contentParts?: ContentPart[];
	/** Agent ID that generated this message (for group chat) */
	agentId?: string;
	/** Agent name for display (for group chat) */
	agentName?: string;
	/** Agent color for display (for group chat) */
	agentColor?: string;
}

/** Participant in a group chat session */
export interface GroupChatParticipant {
	id: string;
	name: string;
	profileId: string;
	color: string;
	icon?: string;
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
	/** The profile used for this session. Defaults to active profile if not set. */
	profileId?: string;
	/** Group chat mode flag */
	isGroupChat?: boolean;
	/** Participants in a group chat (empty for 1:1) */
	participants?: GroupChatParticipant[];
	/** IDs of profiles selected in the multi-select toolbar */
	selectedProfileIds?: string[];
}

export interface StoredChatData {
	sessions: ChatSession[];
	activeSessionId: string | null;
}
