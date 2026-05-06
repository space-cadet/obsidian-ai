export interface ToolCall {
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
}

export interface ToolResult {
	success?: boolean;
	content?: string;
	error?: string;
	path?: string;
}

export type StreamEvent =
	| { type: "text-delta"; text: string }
	| { type: "tool-call"; call: ToolCall }
	| { type: "tool-result"; callId: string; result: unknown }
	| { type: "tool-error"; callId: string; error: string }
	| { type: "finish"; reason: string }
	| { type: "error"; message: string };
