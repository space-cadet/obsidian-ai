import { estimateTokens } from "./tokenEstimator";

export interface ContextBudgetOptions {
	/** Total model request budget, including prompt and response reserve. */
	maxRequestTokens: number;
	/** Keep this as a hard safety ceiling even when the token budget is large. */
	maxMessages: number;
	/** Preserve the newest messages verbatim before considering older history. */
	preserveRecentMessages: number;
	/** Space reserved for the model response and tool-loop continuations. */
	responseReserveTokens: number;
	/** Tool/schema or other request overhead not represented in chat history. */
	additionalTokens?: number;
}

export interface BudgetedHistoryResult<T> {
	history: T[];
	estimatedRequestTokens: number;
	droppedMessages: number;
	overBudget: boolean;
}

function estimateValue(value: unknown): number {
	try {
		return estimateTokens(JSON.stringify(value) ?? "");
	} catch {
		// A tool registry or provider object may contain cycles/functions. It is
		// safer to under-count that opaque value than to block the request.
		return 0;
	}
}

function messageRole(value: unknown): string | undefined {
	return typeof value === "object" && value !== null && "role" in value
		? String((value as { role?: unknown }).role)
		: undefined;
}

/** Keep tool replay bounded while preserving both the beginning and conclusion. */
export function truncateTextForTokens(text: string, maxTokens: number): string {
	if (maxTokens <= 0 || estimateTokens(text) <= maxTokens) return text;
	const maxChars = Math.max(8, maxTokens * 4);
	const marker = "\n[…tool result truncated for model context…]\n";
	const available = Math.max(2, maxChars - marker.length);
	const headLength = Math.ceil(available * 0.7);
	return `${text.slice(0, headLength)}${marker}${text.slice(-Math.max(1, available - headLength))}`;
}

/**
 * Select model-facing history using a token budget rather than message count.
 * The persisted transcript is untouched; this only controls one request.
 */
export function buildBudgetedHistory<T>(args: {
	systemPrompt: unknown;
	currentMessage: unknown;
	history: T[];
	options: ContextBudgetOptions;
}): BudgetedHistoryResult<T> {
	const { history, options } = args;
	const maxMessages = Math.max(0, options.maxMessages);
	let boundedStart =
		maxMessages > 0
			? Math.max(0, history.length - maxMessages)
			: history.length;
	// The history is expanded after persistence, so a message ceiling can land
	// on a tool result even though its assistant tool call is the previous item.
	// Extend the slice by one message to preserve that provider-required pair.
	if (
		boundedStart > 0 &&
		messageRole(history[boundedStart]) === "tool" &&
		messageRole(history[boundedStart - 1]) === "assistant"
	) {
		boundedStart--;
	}
	const boundedHistory = history.slice(boundedStart);
	const baseTokens =
		estimateValue(args.systemPrompt) +
		estimateValue(args.currentMessage) +
		(options.additionalTokens ?? 0) +
		Math.max(0, options.responseReserveTokens);

	// A non-positive budget preserves the legacy message-count behavior.
	if (options.maxRequestTokens <= 0) {
		return {
			history: boundedHistory,
			estimatedRequestTokens:
				baseTokens +
				boundedHistory.reduce(
					(sum, message) => sum + estimateValue(message),
					0,
				),
			droppedMessages: history.length - boundedHistory.length,
			overBudget: false,
		};
	}

	const availableForHistory = Math.max(
		0,
		options.maxRequestTokens - baseTokens,
	);
	const selected = new Array<T>();
	let historyTokens = 0;
	const preserveCount = Math.min(
		boundedHistory.length,
		Math.max(0, options.preserveRecentMessages),
	);
	let preservedStart = boundedHistory.length - preserveCount;
	// A tool result is valid only with its immediately preceding assistant
	// tool-call message. Extend the preserved tail when it would otherwise cut
	// that pair in half.
	while (
		preservedStart > 0 &&
		messageRole(boundedHistory[preservedStart]) === "tool" &&
		messageRole(boundedHistory[preservedStart - 1]) === "assistant"
	) {
		preservedStart--;
	}

	// Retain the recent tail when it fits, but never let the quality safeguard
	// violate the total request ceiling. Consider newest tool-call/result units
	// first so a large unit can be skipped without orphaning its partner.
	for (let index = boundedHistory.length - 1; index >= preservedStart; ) {
		let groupStart = index;
		if (
			messageRole(boundedHistory[index]) === "tool" &&
			index > 0 &&
			messageRole(boundedHistory[index - 1]) === "assistant"
		) {
			groupStart = index - 1;
		}
		const group = boundedHistory.slice(groupStart, index + 1);
		const groupTokens = group.reduce(
			(sum, message) => sum + estimateValue(message),
			0,
		);
		if (historyTokens + groupTokens <= availableForHistory) {
			selected.unshift(...group);
			historyTokens += groupTokens;
		}
		index = groupStart - 1;
	}

	// Add older messages from newest to oldest while they fit. Reverse at the
	// end so the provider still receives chronological history.
	const older = new Array<T>();
	for (let index = preservedStart - 1; index >= 0; ) {
		let groupStart = index;
		if (
			messageRole(boundedHistory[index]) === "tool" &&
			index > 0 &&
			messageRole(boundedHistory[index - 1]) === "assistant"
		) {
			groupStart = index - 1;
		}
		const group = boundedHistory.slice(groupStart, index + 1);
		const groupTokens = group.reduce(
			(sum, message) => sum + estimateValue(message),
			0,
		);
		if (historyTokens + groupTokens > availableForHistory) break;
		older.push(...group.reverse());
		historyTokens += groupTokens;
		index = groupStart - 1;
	}

	const modelHistory = [...older.reverse(), ...selected];
	return {
		history: modelHistory,
		estimatedRequestTokens: baseTokens + historyTokens,
		droppedMessages: history.length - modelHistory.length,
		overBudget: baseTokens + historyTokens > options.maxRequestTokens,
	};
}
