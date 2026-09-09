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
import { buildToolResultCatalog } from "./toolResultCatalog";
import { listPersistedToolResults } from "./toolResultReference";
import { estimateTokens } from "./tokenEstimator";

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
	/** Session identity used for historical result references and catalogs. */
	sessionId?: string;
	/** Maximum derived catalog size in estimated tokens. */
	resultCatalogTokens?: number;
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
	toolResultCatalogEntries: number;
	toolResultCatalogTokens: number;
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
		{ sessionId: options.sessionId },
	);
	const pairing = validateToolHistoryPairing(replayHistory);
	if (!pairing.valid) {
		throw new Error(
			`Model history contains invalid tool pairing: ${pairing.errors.join(" ")}`,
		);
	}

	let systemPrompt = options.systemPrompt;
	let catalogItems: ReturnType<typeof buildToolResultCatalog>["items"] = [];
	let catalogPrompt = "";
	const allResultIds = new Set(
		listPersistedToolResults(options.history).map(
			({ call }) => call.toolCallId,
		),
	);
	let budgeted = buildBudgetedHistory({
		systemPrompt,
		currentMessage: options.currentMessage,
		history: replayHistory,
		options: options.budget,
	});

	// Adding a catalog consumes request budget, so rebuild until the selected
	// replay and its catalog stabilize. The bound prevents pathological history
	// from causing an unbounded planning loop.
	for (let pass = 0; pass < 3; pass++) {
		const selectedResultIds = new Set<string>();
		for (const entry of budgeted.history) {
			if (!Array.isArray(entry.content)) continue;
			if (entry.role !== "tool") continue;
			for (const part of entry.content) {
				if (
					part?.type === "tool-result" &&
					typeof part.toolCallId === "string"
				) {
					selectedResultIds.add(part.toolCallId);
				}
			}
		}
		const omittedResultIds = new Set(allResultIds);
		for (const id of selectedResultIds) omittedResultIds.delete(id);
		const catalog = buildToolResultCatalog({
			messages: options.history,
			omittedToolCallIds: omittedResultIds,
			sessionId: options.sessionId,
			maxTokens: options.resultCatalogTokens,
		});
		catalogItems = catalog.items;
		catalogPrompt = catalog.prompt;
		const nextPrompt =
			catalog.prompt && typeof options.systemPrompt === "string"
				? `${options.systemPrompt}\n\n${catalog.prompt}`
				: options.systemPrompt;
		if (nextPrompt === systemPrompt) break;
		systemPrompt = nextPrompt;
		budgeted = buildBudgetedHistory({
			systemPrompt,
			currentMessage: options.currentMessage,
			history: replayHistory,
			options: options.budget,
		});
	}
	const budgetedPairing = validateToolHistoryPairing(budgeted.history);
	if (!budgetedPairing.valid) {
		throw new Error(
			`Budgeted model history contains invalid tool pairing: ${budgetedPairing.errors.join(" ")}`,
		);
	}

	return {
		messages: [
			{ role: "system", content: systemPrompt },
			...budgeted.history,
			{ role: "user", content: options.currentMessage },
		],
		history: budgeted.history,
		toolHistoryMode,
		pairing: budgetedPairing,
		estimatedRequestTokens: budgeted.estimatedRequestTokens,
		droppedMessages: budgeted.droppedMessages,
		overBudget: budgeted.overBudget,
		toolResultCatalogEntries: catalogItems.length,
		toolResultCatalogTokens: catalogPrompt
			? estimateTokens(catalogPrompt)
			: 0,
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
