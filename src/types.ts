import type { ToolCall, ToolResult } from "./agent/types";

/** Attachment to a chat message — vault file or external file the LLM should consume */
export interface Attachment {
	id: string;
	/** For vault files: "markdown" | "image" | "pdf". For external files: "image" | "pdf" | "file". */
	type: "markdown" | "image" | "pdf" | "file";
	/** Vault path (for vault files) or original filename (for external files) */
	path: string;
	name: string;
	/** Optional inline base64 data for external files (bypasses vault read) */
	data?: string;
	/** Optional MIME type for external files */
	mimeType?: string;
}

/** Persisted multimodal payload for replaying prior message attachments. */
export type ResolvedMessagePart =
	| { type: "text"; text: string }
	| { type: "image"; image: string }
	| { type: "file"; data: string; mimeType: string };

/** A segment of message content — either text or an inline tool call */
export type ContentPart =
	| { type: "text"; content: string }
	| { type: "tool_call"; call: ToolCall; result?: ToolResult };

/** Token usage reported by the language-model provider for one response. */
export interface ProviderTokenUsage {
	inputTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
	cachedInputTokens?: number;
	reasoningTokens?: number;
}

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
	/** Files attached to this message for the LLM to consume */
	attachments?: Attachment[];
	/** Resolved multimodal parts captured at send time for history replay */
	resolvedParts?: ResolvedMessagePart[];
	/** Estimated token count for this message (including context for user messages) */
	estimatedTokens?: number;
	/** Full request estimate captured when this response was sent. */
	requestTokenEstimate?: number;
	/** Provider-reported usage for this response, when available. */
	providerUsage?: ProviderTokenUsage;
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
	/** True if this message came from a remote user via relay */
	remote?: boolean;
	/** User ID of the remote sender (when remote is true) */
	fromUserId?: string;
	/** True if this is a local debug/system message (not sent to model) */
	isDebug?: boolean;
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
	/** IDs of remote users explicitly added to this chat */
	selectedRemoteUserIds?: string[];
	/** Whether thinking/reasoning is enabled for this session */
	thinkingEnabled?: boolean;
	/** Unsent composer text saved for recovery across restarts and tab switches */
	draft?: string;
	/** Whether this session is connected to a relay server for multi-user sync */
	relayEnabled?: boolean;
	/** IDs of remote users participating in this session (relay user IDs) */
	remoteUsers?: string[];
	/** Vertical message-list offset captured for restoring this tab after reload. */
	scrollPosition?: number;
}

export interface StoredChatData {
	sessions: ChatSession[];
	activeSessionId: string | null;
	/** Ordered internal tabs to restore. Drafts are deliberately excluded. */
	openSessionIds?: string[];
}
