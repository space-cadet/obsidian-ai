const CURSOR_TTL_MS = 10 * 60 * 1000;
const MAX_CURSOR_STATES = 256;

interface ContinuationState<T> {
	toolName: string;
	fingerprint: string;
	items: T[];
	offset: number;
	expiresAt: number;
}

export interface Page<T> {
	items: T[];
	hasMore: boolean;
	nextCursor?: string;
	total: number;
}

/**
 * Keeps bounded result snapshots local to one ToolExecutor instance.
 * Cursors are opaque, expire quickly, and are only valid for the original
 * tool and query/filter combination.
 */
export class ContinuationStore {
	private readonly states = new Map<string, ContinuationState<unknown>>();

	page<T>(options: {
		toolName: string;
		fingerprint: string;
		items: T[];
		limit: number;
		cursor?: string;
	}): Page<T> | { error: string } {
		this.pruneExpired();

		let offset = 0;
		let items = options.items;
		if (options.cursor) {
			const state = this.states.get(options.cursor) as
				| ContinuationState<T>
				| undefined;
			if (!state) {
				return {
					error: "Invalid or expired continuation cursor. Start the search again.",
				};
			}
			if (
				state.toolName !== options.toolName ||
				state.fingerprint !== options.fingerprint
			) {
				return {
					error: "Continuation cursor does not match this tool request. Start the search again with the original filters.",
				};
			}
			offset = state.offset;
			items = state.items;
		}

		const safeLimit = Math.max(1, Math.floor(options.limit));
		const pageItems = items.slice(offset, offset + safeLimit);
		const nextOffset = offset + pageItems.length;
		const hasMore = nextOffset < items.length;
		const nextCursor = hasMore
			? this.createState({
					toolName: options.toolName,
					fingerprint: options.fingerprint,
					items,
					offset: nextOffset,
				})
			: undefined;

		return {
			items: pageItems,
			hasMore,
			nextCursor,
			total: items.length,
		};
	}

	private createState<T>(
		state: Omit<ContinuationState<T>, "expiresAt">,
	): string {
		if (this.states.size >= MAX_CURSOR_STATES) {
			const oldest = this.states.keys().next().value;
			if (oldest) this.states.delete(oldest);
		}
		const token =
			globalThis.crypto?.randomUUID?.() ??
			`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
		this.states.set(token, {
			...state,
			expiresAt: Date.now() + CURSOR_TTL_MS,
		});
		return token;
	}

	private pruneExpired(): void {
		const now = Date.now();
		for (const [token, state] of this.states) {
			if (state.expiresAt <= now) this.states.delete(token);
		}
	}
}

export function requestFingerprint(
	toolName: string,
	args: Record<string, unknown>,
): string {
	return `${toolName}:${JSON.stringify(sortObject(args))}`;
}

function sortObject(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortObject);
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.filter(([key]) => key !== "limit" && key !== "cursor")
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => [key, sortObject(item)]),
	);
}
