import type { ToolResult } from "../../types";
import {
	ToolHandlerBase,
	type ToolHandlerContext,
} from "../ToolHandlerContext";
import { requestFingerprint } from "../../pagination";

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
}
