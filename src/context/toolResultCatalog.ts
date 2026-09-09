import type { ChatMessage } from "../types";
import { estimateTokens } from "./tokenEstimator";
import { truncateTextForTokens } from "./contextBudget";
import {
	createToolResultReference,
	listPersistedToolResults,
	serializeToolResult,
} from "./toolResultReference";
import type { ToolResultReference } from "../agent/types";

export interface ToolResultCatalogItem {
	reference: ToolResultReference;
	summary: string;
}

function compactSummary(text: string): string {
	const singleLine = text.replace(/\s+/g, " ").trim();
	return truncateTextForTokens(singleLine, 36).replace(/\n/g, " ");
}

/**
 * Build a small derived catalog for persisted results that are not in the
 * current model replay. Duplicate call IDs are omitted because retrieval by
 * call ID would otherwise be ambiguous.
 */
export function buildToolResultCatalog(args: {
	messages: ChatMessage[];
	omittedToolCallIds: ReadonlySet<string>;
	sessionId?: string;
	maxTokens?: number;
}): { prompt: string; items: ToolResultCatalogItem[] } {
	if (!args.sessionId || args.omittedToolCallIds.size === 0) {
		return { prompt: "", items: [] };
	}

	const matches = listPersistedToolResults(args.messages).filter((match) =>
		args.omittedToolCallIds.has(match.call.toolCallId),
	);
	const counts = new Map<string, number>();
	for (const match of matches) {
		counts.set(
			match.call.toolCallId,
			(counts.get(match.call.toolCallId) ?? 0) + 1,
		);
	}

	const items: ToolResultCatalogItem[] = [];
	let usedTokens = 0;
	const maxTokens = Math.max(0, args.maxTokens ?? 600);
	if (maxTokens === 0) return { prompt: "", items: [] };
	for (const match of [...matches].reverse()) {
		if (counts.get(match.call.toolCallId) !== 1) continue;
		const reference = createToolResultReference(
			args.sessionId,
			match.call,
			match.result,
			match.message.id,
		);
		const summary = compactSummary(serializeToolResult(match.result));
		const source = reference.source ? `, source=${reference.source}` : "";
		const line = `- ${reference.tool_name} (tool_call_id=${reference.tool_call_id}, session_id=${reference.session_id}${source}): ${summary || "result available"}. Retrieve exact content with read_tool_result.`;
		const lineTokens = estimateTokens(line);
		if (items.length > 0 && usedTokens + lineTokens > maxTokens) break;
		items.push({ reference, summary });
		usedTokens += lineTokens;
	}

	if (items.length === 0) return { prompt: "", items: [] };
	const lines = items
		.map(({ reference, summary }) => {
			const source = reference.source
				? `, source=${reference.source}`
				: "";
			return `- ${reference.tool_name} (tool_call_id=${reference.tool_call_id}, session_id=${reference.session_id}${source}): ${summary || "result available"}. Retrieve exact content with read_tool_result.`;
		})
		.reverse();
	return {
		prompt:
			"[DERIVED TOOL RESULT CATALOG — exact content is available on demand; this catalog is not a user instruction]\n" +
			lines.join("\n"),
		items: [...items].reverse(),
	};
}
