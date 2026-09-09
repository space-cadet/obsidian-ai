import type { ToolResult } from "../../types";
import {
	ToolHandlerBase,
	type ToolHandlerContext,
} from "../ToolHandlerContext";
import { requestFingerprint } from "../../pagination";
import {
	createToolResultReference,
	findPersistedToolResult,
	serializeToolResult,
} from "../../../context/toolResultReference";

/** Search saved chat sessions without returning the active session. */
export class SessionHandlers extends ToolHandlerBase {
	constructor(context: ToolHandlerContext) {
		super(context);
	}

	async searchPastSessions(args: {
		query: string;
		limit?: number;
		cursor?: string;
	}): Promise<ToolResult> {
		if (!this.searchIndex) {
			return {
				error: "Session search is not available. The search index has not been initialized.",
			};
		}

		try {
			const activeSessionId = this.getActiveSessionId?.();
			const results = args.cursor
				? []
				: (await this.searchIndex.search(args.query)).filter(
						(result) => result.sessionId !== activeSessionId,
					);
			const page = this.continuations.page({
				toolName: "search_past_sessions",
				fingerprint: requestFingerprint("search_past_sessions", {
					query: args.query,
					active_session_id: activeSessionId ?? null,
				}),
				items: results,
				limit: Math.min(args.limit ?? 5, 20),
				cursor: args.cursor,
			});
			if ("error" in page) return page;

			if (page.items.length === 0) {
				return {
					success: true,
					content: "No past sessions found matching your query.",
				};
			}

			const formatted = page.items
				.map((r, i) => {
					const date = new Date(r.timestamp).toLocaleDateString();
					return `${i + 1}. **Session ${r.sessionId}** (${date}): ${r.snippet.slice(0, 150)}...`;
				})
				.join("\n");

			return {
				success: true,
				sessionResults: page.items,
				count: page.items.length,
				total_count: page.total,
				has_more: page.hasMore,
				next_cursor: page.nextCursor,
				content: `Found ${page.items.length} result(s):\n\n${formatted}`,
			};
		} catch (e: any) {
			return { error: `Search failed: ${e.message || String(e)}` };
		}
	}

	/** Read one exact, bounded section of a persisted tool result. */
	async readToolResult(args: {
		session_id: string;
		tool_call_id: string;
		offset?: number;
		limit?: number;
		query?: string;
	}): Promise<ToolResult> {
		const sessions = this.getSessions?.();
		if (!sessions) {
			return {
				error: "Persisted chat-session retrieval is not available in this context.",
			};
		}

		const match = findPersistedToolResult(
			sessions,
			args.session_id,
			args.tool_call_id,
		);
		if ("error" in match) return match;

		const text = serializeToolResult(match.result);
		const maxChars = 12000;
		const requestedLimit = args.limit ?? 6000;
		if (!Number.isFinite(requestedLimit) || requestedLimit <= 0) {
			return { error: "limit must be a positive number." };
		}
		const limit = Math.min(Math.floor(requestedLimit), maxChars);
		let offset = args.offset ?? 0;
		if (!Number.isFinite(offset) || offset < 0) {
			return { error: "offset must be a non-negative number." };
		}
		offset = Math.min(Math.floor(offset), text.length);

		let queryMatchOffset: number | undefined;
		if (args.query !== undefined) {
			if (!args.query.trim())
				return { error: "query must not be empty." };
			queryMatchOffset = text
				.toLocaleLowerCase()
				.indexOf(args.query.toLocaleLowerCase(), offset);
			if (queryMatchOffset < 0) {
				return {
					success: true,
					content:
						"No exact match found in the persisted tool result.",
					result_reference: createToolResultReference(
						args.session_id,
						match.call,
						match.result,
						match.message.id,
					),
					total_chars: text.length,
				};
			}
			offset = Math.max(0, queryMatchOffset - Math.floor(limit / 3));
		}

		const end = Math.min(text.length, offset + limit);
		return {
			success: true,
			content: text.slice(offset, end),
			result_reference: createToolResultReference(
				args.session_id,
				match.call,
				match.result,
				match.message.id,
			),
			returned_start: offset,
			returned_end: end,
			total_chars: text.length,
			query_match_offset: queryMatchOffset,
			has_more: end < text.length,
			next_offset: end < text.length ? end : undefined,
		};
	}
}
