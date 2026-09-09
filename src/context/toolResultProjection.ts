import type { ToolCall, ToolResult, ToolResultReference } from "../agent/types";
import { estimateTokens } from "./tokenEstimator";
import { truncateTextForTokens } from "./contextBudget";
import { createToolResultReference } from "./toolResultReference";

export interface ModelToolResultProjection {
	text: string;
	truncated: boolean;
	reference?: ToolResultReference;
}

/**
 * Bound one provider-facing result while retaining a route back to the full
 * persisted result. The caller may still save the unmodified ToolResult.
 */
export function projectToolResultForModel(args: {
	text: string;
	call: ToolCall;
	result: ToolResult;
	maxTokens: number;
	sessionId?: string;
}): ModelToolResultProjection {
	if (args.maxTokens <= 0 || estimateTokens(args.text) <= args.maxTokens) {
		return { text: args.text, truncated: false };
	}

	const reference = args.sessionId
		? createToolResultReference(args.sessionId, args.call, args.result)
		: undefined;
	const referenceText = reference
		? `\n\n[Exact tool result available via read_tool_result: session_id=${reference.session_id}, tool_call_id=${reference.tool_call_id}, content_length=${reference.content_length}]`
		: "";
	const referenceTokens = estimateTokens(referenceText);
	if (!reference || referenceTokens >= args.maxTokens) {
		return {
			text: truncateTextForTokens(args.text, args.maxTokens),
			truncated: true,
		};
	}
	const previewBudget = Math.max(1, args.maxTokens - referenceTokens);
	const preview = truncateTextForTokens(args.text, previewBudget);

	return {
		text: `${preview}${referenceText}`,
		truncated: true,
		reference,
	};
}
