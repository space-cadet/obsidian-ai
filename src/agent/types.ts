export interface ToolCall {
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
}

export interface ToolResult {
	success?: boolean;
	content?: string;
	error?: string;
	warning?: string;
	path?: string;
	oldPath?: string;
	matches?: Array<{ path: string; basename: string; modified?: number; created?: number; size?: number }>;
	count?: number;
	totalCount?: number;
	markdownCount?: number;
	directCount?: number;
	directMarkdownCount?: number;
	subfolderCount?: number;
	subfolders?: string[];
	query?: string;
	folder?: string;
	notes?: Array<{ path: string; basename: string; modified?: number; created?: number; size?: number }>;
	folders?: string[];
	parent?: string;
	basename?: string;
	wordCount?: number;
	created?: number;
	modified?: number;
	size?: number;
}

export type StreamEvent =
	| { type: "text-delta"; text: string }
	| { type: "tool-call"; call: ToolCall }
	| { type: "tool-result"; callId: string; result: unknown }
	| { type: "tool-error"; callId: string; error: string }
	| { type: "finish"; reason: string }
	| { type: "error"; message: string };
