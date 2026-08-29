import type { ChatMessage } from "../types";
import {
	buildHistoryWithTools,
	validateToolHistoryPairing,
	type HistoryEntry,
	type ToolHistoryPairingCheck,
} from "../lib/historyBuilder";
import {
	buildBudgetedHistory,
	truncateTextForTokens,
	type BudgetedHistoryResult,
	type ContextBudgetOptions,
} from "./contextBudget";

export type ModelMessage = {
	role: "system" | "user" | "assistant" | "tool";
	content: unknown;
};

export interface ModelHistoryOptions {
	systemPrompt: unknown;
	currentMessage: unknown;
	history: ChatMessage[];
	maxMessages: number;
	maxToolResultTokens: number;
	toolHistoryMode: "elide" | "preserve";
	/** Agent turns preserve tool details automatically. */
	agentMode: boolean;
	budget: ContextBudgetOptions;
}

export interface ModelHistoryResult {
	messages: ModelMessage[];
	history: HistoryEntry[];
	toolHistoryMode: "elide" | "preserve";
	pairing: ToolHistoryPairingCheck;
	estimatedRequestTokens: number;
	droppedMessages: number;
	overBudget: boolean;
}

/**
 * Build the one model-facing history used by a chat turn.
 * The saved ChatMessage records are never changed.
 */
export function buildModelHistory(
	options: ModelHistoryOptions,
): ModelHistoryResult {
	const toolHistoryMode = options.agentMode
		? "preserve"
		: options.toolHistoryMode;
	const replayHistory = buildHistoryWithTools(
		options.history,
		options.maxMessages,
		options.maxToolResultTokens,
		toolHistoryMode,
	);
	const pairing = validateToolHistoryPairing(replayHistory);
	if (!pairing.valid) {
		throw new Error(
			`Model history contains invalid tool pairing: ${pairing.errors.join(" ")}`,
		);
	}

	const budgeted = buildBudgetedHistory({
		systemPrompt: options.systemPrompt,
		currentMessage: options.currentMessage,
		history: replayHistory,
		options: options.budget,
	});
	const budgetedPairing = validateToolHistoryPairing(budgeted.history);
	if (!budgetedPairing.valid) {
		throw new Error(
			`Budgeted model history contains invalid tool pairing: ${budgetedPairing.errors.join(" ")}`,
		);
	}

	return {
		messages: [
			{ role: "system", content: options.systemPrompt },
			...budgeted.history,
			{ role: "user", content: options.currentMessage },
		],
		history: budgeted.history,
		toolHistoryMode,
		pairing: budgetedPairing,
		estimatedRequestTokens: budgeted.estimatedRequestTokens,
		droppedMessages: budgeted.droppedMessages,
		overBudget: budgeted.overBudget,
	};
}

/** Apply the same request-budget rule to an in-progress tool continuation. */
export function buildBudgetedModelMessages<T>(args: {
	systemPrompt: unknown;
	currentMessage: unknown;
	history: T[];
	options: ContextBudgetOptions;
}): BudgetedHistoryResult<T> {
	return buildBudgetedHistory(args);
}

/** Apply the shared model-facing tool-result limit. */
export function truncateModelText(text: string, maxTokens: number): string {
	return truncateTextForTokens(text, maxTokens);
}
