import { ChatMessage } from "../types";
import { estimateTokens } from "./tokenEstimator";

export interface SemanticCompactionOptions {
	/** Start compaction when the model-facing history reaches this size. */
	triggerTokens: number;
	/** Do not compact again until the history grows back above this size. */
	releaseTokens: number;
	/** Keep this many newest user/assistant turns exact. */
	keepRecentMessages: number;
}

export interface CompactionSummary {
	keyDecisions: string[];
	toolResults: string[];
	userIntent: string[];
	openQuestions: string[];
}

export interface CompactionProjection {
	shouldCompact: boolean;
	summarized: ChatMessage[];
	recent: ChatMessage[];
	prompt: string;
}

const emptySummary: CompactionSummary = {
	keyDecisions: [],
	toolResults: [],
	userIntent: [],
	openQuestions: [],
};

function textOf(message: ChatMessage): string {
	const tools = (message.contentParts ?? [])
		.filter((part) => part.type === "tool_call")
		.map((part) => {
			const result =
				part.result?.error ?? part.result?.content ?? "pending";
			return `${part.call.toolName}: ${result}`;
		});
	return [message.content, ...tools].filter(Boolean).join("\n");
}

export function buildCompactionPrompt(messages: ChatMessage[]): string {
	const transcript = messages
		.map((message) => `${message.role}: ${textOf(message)}`)
		.join("\n\n");
	return `Summarize this conversation for a future model turn. Preserve concrete decisions, tool outcomes, user goals, unresolved questions, names, paths, and constraints. Do not invent facts. Return JSON only with arrays named keyDecisions, toolResults, userIntent, and openQuestions.\n\n${transcript}`;
}

export function formatCompactionSummary(
	summary: Partial<CompactionSummary>,
): string {
	const value = { ...emptySummary, ...summary };
	const section = (title: string, items: string[]) =>
		`## ${title}\n${items.length ? items.map((item) => `- ${item}`).join("\n") : "- None recorded"}`;
	return [
		"[Prior conversation summary]",
		section("Key Decisions", value.keyDecisions),
		section("Tool Results", value.toolResults),
		section("User Intent", value.userIntent),
		section("Open Questions", value.openQuestions),
	].join("\n\n");
}

/** Build a non-destructive model-history projection. The persisted transcript is untouched. */
export function planSemanticCompaction(
	messages: ChatMessage[],
	options: SemanticCompactionOptions,
	wasCompacted: boolean,
): CompactionProjection {
	const tokens = estimateTokens(messages.map(textOf).join("\n"));
	const shouldCompact =
		!wasCompacted &&
		options.triggerTokens > 0 &&
		tokens >= options.triggerTokens &&
		messages.length > options.keepRecentMessages;
	const split = Math.max(0, messages.length - options.keepRecentMessages);
	const summarized = shouldCompact ? messages.slice(0, split) : [];
	return {
		shouldCompact,
		summarized,
		recent: shouldCompact ? messages.slice(split) : messages,
		prompt: shouldCompact ? buildCompactionPrompt(summarized) : "",
	};
}

export function compactionHysteresisReleased(
	messages: ChatMessage[],
	options: SemanticCompactionOptions,
): boolean {
	return (
		estimateTokens(messages.map(textOf).join("\n")) <=
		Math.max(0, options.releaseTokens)
	);
}
