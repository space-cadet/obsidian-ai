import type { ToolResult } from "../../types";
import type { ChatSession } from "../../../types";
import { normalizeSessionTags } from "../../../lib/sessionTags";
import type { SessionStateOwner } from "../../../state/SessionStateOwner";
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

function sessionMessageCount(session: ChatSession): number {
	if (
		session.hydrated === false &&
		session.messages.length === 0 &&
		session.messageCount != null
	) {
		return session.messageCount;
	}
	return session.messages.length;
}

function displayTitle(session: ChatSession): string {
	return (
		session.title.trim() ||
		`Chat ${new Date(session.createdAt).toLocaleDateString()}`
	);
}

/** Search saved chat sessions without returning the active session. */
export class SessionHandlers extends ToolHandlerBase {
	constructor(context: ToolHandlerContext) {
		super(context);
	}

	private async getTagSession(sessionId: string): Promise<{
		owner: SessionStateOwner;
		session: ChatSession;
	} | null> {
		const owner = this.sessionTools?.state;
		if (!owner) return null;
		await owner.initialize();
		const session = owner
			.getSnapshot()
			.sessions.find((item) => item.id === sessionId);
		return session ? { owner, session } : null;
	}

	async listSessionTags(args: { session_id: string }): Promise<ToolResult> {
		const found = await this.getTagSession(args.session_id);
		if (!found)
			return { error: "Saved chat session not found or unavailable." };
		return {
			success: true,
			content: JSON.stringify({
				session_id: args.session_id,
				tags: normalizeSessionTags(found.session.tags),
			}),
		};
	}

	async addSessionTags(args: {
		session_id: string;
		tags: string[];
	}): Promise<ToolResult> {
		const found = await this.getTagSession(args.session_id);
		if (!found)
			return { error: "Saved chat session not found or unavailable." };
		const tags = normalizeSessionTags([
			...(found.session.tags ?? []),
			...args.tags,
		]);
		if (
			tags.length === (found.session.tags ?? []).length &&
			args.tags.every((tag) =>
				found.session.tags?.some(
					(old) =>
						old.toLocaleLowerCase() ===
						tag.trim().replace(/^#+/, "").toLocaleLowerCase(),
				),
			)
		) {
			return { success: true, content: JSON.stringify({ tags }) };
		}
		found.owner.updateMetadata(args.session_id, {
			tags,
			updatedAt: Date.now(),
		});
		await found.owner.flush();
		return { success: true, content: JSON.stringify({ tags }) };
	}

	async renameSessionTag(args: {
		session_id: string;
		old_tag: string;
		new_tag: string;
	}): Promise<ToolResult> {
		const found = await this.getTagSession(args.session_id);
		if (!found)
			return { error: "Saved chat session not found or unavailable." };
		const current = normalizeSessionTags(found.session.tags);
		const index = current.findIndex(
			(tag) =>
				tag.toLocaleLowerCase() ===
				args.old_tag.trim().replace(/^#+/, "").toLocaleLowerCase(),
		);
		if (index < 0) return { error: `Tag not found: ${args.old_tag}` };
		current[index] = args.new_tag;
		const tags = normalizeSessionTags(current);
		found.owner.updateMetadata(args.session_id, {
			tags,
			updatedAt: Date.now(),
		});
		await found.owner.flush();
		return { success: true, content: JSON.stringify({ tags }) };
	}

	async removeSessionTags(args: {
		session_id: string;
		tags: string[];
	}): Promise<ToolResult> {
		const found = await this.getTagSession(args.session_id);
		if (!found)
			return { error: "Saved chat session not found or unavailable." };
		const remove = new Set(
			args.tags.map((tag) =>
				tag.trim().replace(/^#+/, "").toLocaleLowerCase(),
			),
		);
		const tags = normalizeSessionTags(found.session.tags).filter(
			(tag) => !remove.has(tag.toLocaleLowerCase()),
		);
		found.owner.updateMetadata(args.session_id, {
			tags,
			updatedAt: Date.now(),
		});
		await found.owner.flush();
		return { success: true, content: JSON.stringify({ tags }) };
	}

	async listChatSessions(args: {
		limit?: number;
		cursor?: string;
	}): Promise<ToolResult> {
		const owner = this.sessionTools?.state;
		if (!owner) {
			return {
				error: "Saved chat sessions are not available in this context.",
			};
		}

		try {
			const snapshot = await owner.initialize();
			const sessions = snapshot.sessions
				.filter((session) => sessionMessageCount(session) > 0)
				.sort(
					(left, right) =>
						right.updatedAt - left.updatedAt ||
						left.id.localeCompare(right.id),
				)
				.map((session) => ({
					id: session.id,
					title: displayTitle(session),
					created_at: session.createdAt,
					updated_at: session.updatedAt,
					message_count: sessionMessageCount(session),
					is_group_chat: Boolean(session.isGroupChat),
				}));
			const page = this.continuations.page({
				toolName: "list_chat_sessions",
				fingerprint: requestFingerprint("list_chat_sessions", {}),
				items: args.cursor ? [] : sessions,
				limit: Math.min(args.limit ?? 10, 50),
				cursor: args.cursor,
			});
			if ("error" in page) return page;

			const content = page.items.length
				? page.items
						.map(
							(session, index) =>
								`${index + 1}. ${session.title} (session_id: ${session.id}; ${session.message_count} messages; updated ${new Date(session.updated_at).toLocaleString()}${session.is_group_chat ? "; group chat" : ""})`,
						)
						.join("\n")
				: "No saved chat sessions found.";
			return {
				success: true,
				count: page.items.length,
				total_count: page.total,
				has_more: page.hasMore,
				next_cursor: page.nextCursor,
				content:
					content +
					(page.hasMore ? "\nMore sessions are available." : ""),
			};
		} catch (error) {
			return {
				error: `Could not list saved chat sessions: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	async readChatSession(args: {
		session_id: string;
		start_message_index?: number;
		start_char?: number;
		message_limit?: number;
		char_limit?: number;
	}): Promise<ToolResult> {
		const owner = this.sessionTools?.state;
		if (!owner) {
			return {
				error: "Saved chat sessions are not available in this context.",
			};
		}

		try {
			await owner.initialize();
			const indexed = owner
				.getSnapshot()
				.sessions.find((session) => session.id === args.session_id);
			if (!indexed || sessionMessageCount(indexed) === 0) {
				return {
					error: `Saved chat session not found: ${args.session_id}`,
				};
			}
			const session = await owner.ensureLoaded(args.session_id);
			if (!session || session.hydrated === false) {
				return {
					error: `Could not load messages for chat session ${args.session_id}.`,
				};
			}

			const startIndex = Math.floor(args.start_message_index ?? 0);
			const startChar = Math.floor(args.start_char ?? 0);
			const messageLimit = Math.min(
				Math.floor(args.message_limit ?? 10),
				20,
			);
			const charLimit = Math.min(
				Math.floor(args.char_limit ?? 6000),
				12000,
			);
			if (startIndex > session.messages.length) {
				return {
					error: `start_message_index must be between 0 and ${session.messages.length}.`,
				};
			}
			if (startChar < 0 || messageLimit < 1 || charLimit < 1) {
				return {
					error: "Message and character ranges must be positive, and offsets cannot be negative.",
				};
			}
			const firstContentLength =
				session.messages[startIndex]?.content.length ?? 0;
			if (startChar > firstContentLength) {
				return {
					error: `start_char must be between 0 and ${firstContentLength} for the first message.`,
				};
			}

			let remainingChars = charLimit;
			let nextMessageIndex = startIndex;
			let nextCharOffset = startChar;
			const messages: Array<{
				id: string;
				role: "user" | "assistant";
				timestamp: number;
				content: string;
				agent_name?: string;
				attachments?: Array<{ name: string; type: string }>;
			}> = [];
			for (
				let index = startIndex;
				index < session.messages.length &&
				messages.length < messageLimit;
				index++
			) {
				if (remainingChars <= 0) break;
				const message = session.messages[index];
				const offset = index === startIndex ? startChar : 0;
				const content = message.content ?? "";
				const returnedContent = content.slice(
					offset,
					offset + remainingChars,
				);
				const contentEnd = offset + returnedContent.length;
				const contentTruncated = contentEnd < content.length;
				messages.push({
					id: message.id,
					role: message.role,
					timestamp: message.timestamp,
					content: returnedContent,
					agent_name: message.agentName,
					attachments: message.attachments
						?.slice(0, 10)
						.map((attachment) => ({
							name: attachment.name,
							type: attachment.type,
						})),
				});
				remainingChars -= returnedContent.length;
				if (contentTruncated) {
					nextMessageIndex = index;
					nextCharOffset = contentEnd;
					break;
				}
				nextMessageIndex = index + 1;
				nextCharOffset = 0;
			}

			const hasMore = nextMessageIndex < session.messages.length;
			const content = messages
				.map((message, index) => {
					const timestamp = new Date(
						message.timestamp,
					).toLocaleString();
					const author = message.agent_name
						? ` · ${message.agent_name}`
						: "";
					const attachments = message.attachments?.length
						? `\nAttachments: ${message.attachments.map((item) => `${item.name} (${item.type})`).join(", ")}`
						: "";
					return `Message ${startIndex + index} · ${message.role}${author} · ${timestamp}\n${message.content || "(no text)"}${attachments}`;
				})
				.join("\n\n");
			const continuation = hasMore
				? `\n\nMore remains. Continue with start_message_index=${nextMessageIndex}, start_char=${nextCharOffset}, and the same message_limit/char_limit.`
				: "\n\nEnd of session.";
			return {
				success: true,
				session_id: session.id,
				session_title: displayTitle(session),
				total_messages: session.messages.length,
				start_message_index: startIndex,
				next_message_index: nextMessageIndex,
				next_char_offset: nextCharOffset,
				has_more: hasMore,
				content: `Session: ${displayTitle(session)} (${session.messages.length} messages)\n\n${content || "No messages in this range."}${continuation}`,
			};
		} catch (error) {
			return {
				error: `Could not read saved chat session: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	async renameChatSession(args: {
		session_id: string;
		title: string;
	}): Promise<ToolResult> {
		const owner = this.sessionTools?.state;
		if (!owner) {
			return {
				error: "Saved chat sessions are not available in this context.",
			};
		}
		await owner.initialize();
		const session = owner
			.getSnapshot()
			.sessions.find((item) => item.id === args.session_id);
		if (!session || sessionMessageCount(session) === 0) {
			return {
				error: `Saved chat session not found: ${args.session_id}`,
			};
		}
		const title = args.title.trim();
		if (!title || title.length > 120) {
			return {
				error: "The session title must contain between 1 and 120 characters.",
			};
		}
		if (!owner.updateMetadata(args.session_id, { title })) {
			return {
				error: `Could not rename chat session ${args.session_id}.`,
			};
		}
		await owner.flush();
		return {
			success: true,
			session_id: args.session_id,
			session_title: title,
			content: `Renamed chat session to "${title}".`,
		};
	}

	async openChatSession(args: {
		session_id: string;
		message_id?: string;
	}): Promise<ToolResult> {
		const owner = this.sessionTools?.state;
		const openSession = this.sessionTools?.openSession;
		if (!owner || !openSession) {
			return {
				error: "Opening saved chat sessions is not available in this context.",
			};
		}
		await owner.initialize();
		const session = await owner.ensureLoaded(args.session_id);
		if (!session || sessionMessageCount(session) === 0) {
			return {
				error: `Saved chat session not found: ${args.session_id}`,
			};
		}
		if (
			args.message_id &&
			!session.messages.some((message) => message.id === args.message_id)
		) {
			return {
				error: `Message ${args.message_id} was not found in chat session ${args.session_id}.`,
			};
		}
		await openSession(args.session_id, args.message_id);
		return {
			success: true,
			session_id: session.id,
			session_title: displayTitle(session),
			content: `Opened chat session "${displayTitle(session)}" in Chat Lab.`,
		};
	}

	async deleteChatSession(args: { session_id: string }): Promise<ToolResult> {
		const owner = this.sessionTools?.state;
		if (!owner) {
			return {
				error: "Saved chat sessions are not available in this context.",
			};
		}
		await owner.initialize();
		const session = owner
			.getSnapshot()
			.sessions.find((item) => item.id === args.session_id);
		if (!session) {
			return {
				success: true,
				content: `Chat session ${args.session_id} was already deleted.`,
			};
		}
		if (sessionMessageCount(session) === 0) {
			return {
				error: `Saved chat session not found: ${args.session_id}`,
			};
		}
		if (
			owner.isSessionActive(args.session_id) ||
			this.sessionTools?.getActiveSessionId?.() === args.session_id ||
			this.getActiveSessionId?.() === args.session_id
		) {
			return {
				error: "The active chat cannot be deleted by an agent tool. Open another chat first, then retry.",
			};
		}
		if (this.sessionTools?.isSessionBusy?.(args.session_id)) {
			return {
				error: "This chat is currently generating a response and cannot be deleted yet.",
			};
		}

		owner.markDeleted(args.session_id);
		await owner.flush();
		if (typeof window !== "undefined") {
			window.dispatchEvent(
				new CustomEvent("obsidian-ai:session-deleted", {
					detail: { sessionId: args.session_id, ownerUpdated: true },
				}),
			);
		}
		return {
			success: true,
			session_id: args.session_id,
			session_title: displayTitle(session),
			content: `Deleted chat session "${displayTitle(session)}".`,
		};
	}

	async searchPastSessions(args: {
		query: string;
		scope?: "all" | "title" | "content";
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
			const scope = args.scope ?? "all";
			const results = args.cursor
				? []
				: (
						await this.searchIndex.search(
							args.query,
							undefined,
							scope,
						)
					).filter((result) => result.sessionId !== activeSessionId);
			const page = this.continuations.page({
				toolName: "search_past_sessions",
				fingerprint: requestFingerprint("search_past_sessions", {
					query: args.query,
					scope,
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
					content:
						scope === "title"
							? "No past sessions found with a matching title."
							: scope === "content"
								? "No past sessions found with matching message content."
								: "No past sessions found matching your query.",
				};
			}

			const formatted = page.items
				.map((r, i) => {
					const date = new Date(r.timestamp).toLocaleDateString();
					const title = r.sessionTitle
						? `**${r.sessionTitle}**`
						: `Session ${r.sessionId}`;
					const matchType = r.isTitleMatch
						? "title match"
						: "message match";
					return `${i + 1}. ${title} (${date}, ${matchType}): ${r.snippet.slice(0, 150)}...`;
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
		let sessions = this.getSessions?.();
		const owner = this.sessionTools?.state;
		if (owner) {
			await owner.initialize();
			const session = await owner.ensureLoaded(args.session_id);
			if (!session) {
				return {
					error: `Saved chat session not found: ${args.session_id}`,
				};
			}
			sessions = [session];
		}
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
