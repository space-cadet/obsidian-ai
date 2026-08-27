import type { ContextItem, ChatMessage } from "../types";
import type { MessageContentPart } from "../api";
import type { PersonaLoader } from "../intelligence/PersonaLoader";
import type { SlashCommand } from "../lib/slashCommand";
import { buildBudgetedHistory } from "../context/contextBudget";
import { estimateTokens } from "../context/tokenEstimator";
import { buildHistoryWithTools } from "../lib/historyBuilder";
import { buildSystemPrompt } from "../lib/systemPrompt";
import type { ToolDefinition } from "./toolRegistry";

export interface ChatTurnRequestOptions {
	contextItems: ContextItem[];
	personaLoader: PersonaLoader | null;
	slashCommand?: SlashCommand;
	useTools: boolean;
	toolDefinitions: ReadonlyArray<Pick<ToolDefinition, "id" | "description">>;
	compactionSummary?: string;
	sendText: string;
	resolvedContextString?: string;
	resolvedAttachmentParts: MessageContentPart[];
	history: ChatMessage[];
	maxContextMessages: number;
	maxToolResultTokens: number;
	toolHistoryMode: "elide" | "preserve";
	maxRequestTokens: number;
	preserveRecentMessages: number;
	responseReserveTokens: number;
	showFullRequestTokens: boolean;
	userTokenEstimate: number;
	toolRegistry: Record<string, Record<string, unknown>>;
}

export interface ChatTurnRequest {
	systemPrompt: string;
	chatMessages: Array<{
		role: "system" | "user" | "assistant" | "tool";
		content: string | MessageContentPart[];
	}>;
	userMessageContent: string | MessageContentPart[];
	fullPayloadTokenEstimate: number;
}

/** Build the model request without depending on React state or rendering. */
export async function buildChatTurnRequest(
	options: ChatTurnRequestOptions,
): Promise<ChatTurnRequest> {
	const {
		contextItems,
		personaLoader,
		slashCommand,
		useTools,
		toolDefinitions,
		compactionSummary,
		sendText,
		resolvedContextString,
		resolvedAttachmentParts,
		history,
		maxContextMessages,
		maxToolResultTokens,
		toolHistoryMode,
		maxRequestTokens,
		preserveRecentMessages,
		responseReserveTokens,
		showFullRequestTokens,
		userTokenEstimate,
		toolRegistry,
	} = options;

	const userContent = resolvedContextString
		? `${resolvedContextString}\n\n${sendText}`
		: sendText;
	const userMessageContent: string | MessageContentPart[] =
		resolvedAttachmentParts.length > 0
			? [{ type: "text", text: userContent }, ...resolvedAttachmentParts]
			: userContent;

	const legacyHistory = buildHistoryWithTools(
		history,
		maxContextMessages,
		maxToolResultTokens,
		toolHistoryMode,
	);
	let systemPrompt = await buildSystemPrompt(
		contextItems,
		personaLoader,
		slashCommand,
		useTools && !slashCommand,
		undefined,
		toolDefinitions,
	);
	if (compactionSummary) systemPrompt += `\n\n${compactionSummary}`;

	const budgetedHistory = buildBudgetedHistory({
		systemPrompt,
		currentMessage: userMessageContent,
		history: legacyHistory,
		options: {
			maxRequestTokens,
			maxMessages: maxContextMessages,
			preserveRecentMessages,
			responseReserveTokens,
			additionalTokens: useTools
				? estimateTokens(JSON.stringify(toolRegistry) ?? "")
				: 0,
		},
	});
	if (budgetedHistory.overBudget) {
		throw new Error(
			"The request exceeds the configured model context budget. Reduce the prompt or increase the request budget.",
		);
	}

	const chatMessages = [
		{ role: "system" as const, content: systemPrompt },
		...budgetedHistory.history,
		{ role: "user" as const, content: userMessageContent },
	];

	return {
		systemPrompt,
		chatMessages,
		userMessageContent,
		fullPayloadTokenEstimate: showFullRequestTokens
			? estimateTokens(JSON.stringify(chatMessages))
			: userTokenEstimate,
	};
}
