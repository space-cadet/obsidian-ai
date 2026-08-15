import type { ChatSession } from "../types";

export interface LlmUsageStats {
	totalEstimatedTokens: number;
	inputEstimatedTokens: number;
	outputEstimatedTokens: number;
	completedResponses: number;
	averageResponseTimeMs: number | null;
	modelEstimatedTokens: Array<{ model: string; tokens: number }>;
}

/** Summarize locally saved, estimated usage; provider billing is not available. */
export function summarizeLlmUsage(sessions: ChatSession[]): LlmUsageStats {
	let inputEstimatedTokens = 0;
	let outputEstimatedTokens = 0;
	let completedResponses = 0;
	let responseTimeTotal = 0;
	let measuredResponseCount = 0;
	const modelTokens = new Map<string, number>();

	for (const session of sessions) {
		for (const message of session.messages) {
			const tokens = Math.max(0, message.estimatedTokens ?? 0);
			if (message.role === "user") {
				inputEstimatedTokens += tokens;
				continue;
			}
			if (message.role !== "assistant") continue;

			outputEstimatedTokens += tokens;
			const model = message.modelName || "Unknown model";
			modelTokens.set(model, (modelTokens.get(model) ?? 0) + tokens);
			if (!message.isError) completedResponses += 1;
			if (Number.isFinite(message.responseTimeMs)) {
				responseTimeTotal += message.responseTimeMs!;
				measuredResponseCount += 1;
			}
		}
	}

	return {
		totalEstimatedTokens: inputEstimatedTokens + outputEstimatedTokens,
		inputEstimatedTokens,
		outputEstimatedTokens,
		completedResponses,
		averageResponseTimeMs:
			measuredResponseCount > 0
				? Math.round(responseTimeTotal / measuredResponseCount)
				: null,
		modelEstimatedTokens: Array.from(modelTokens, ([model, tokens]) => ({
			model,
			tokens,
		})).sort((a, b) => b.tokens - a.tokens),
	};
}
