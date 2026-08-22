import type { ChatSession } from "../types";

export interface LlmUsageStats {
	totalEstimatedTokens: number;
	inputEstimatedTokens: number;
	outputEstimatedTokens: number;
	/** Tokens reported by providers; unavailable for older saved messages. */
	providerReportedTokens: number;
	/** Tokens calculated from local estimates, including legacy sessions. */
	locallyEstimatedTokens: number;
	usageSource: "provider" | "estimated" | "mixed";
	completedResponses: number;
	averageResponseTimeMs: number | null;
	modelEstimatedTokens: Array<{ model: string; tokens: number }>;
}

/** Summarize provider usage, falling back to request-aware local estimates. */
export function summarizeLlmUsage(sessions: ChatSession[]): LlmUsageStats {
	let inputEstimatedTokens = 0;
	let outputEstimatedTokens = 0;
	let providerReportedTokens = 0;
	let locallyEstimatedTokens = 0;
	let providerResponseCount = 0;
	let estimatedResponseCount = 0;
	let completedResponses = 0;
	let responseTimeTotal = 0;
	let measuredResponseCount = 0;
	const modelTokens = new Map<string, number>();

	for (const session of sessions) {
		let pendingUserTokens = 0;
		for (const message of session.messages) {
			const tokens = Math.max(0, message.estimatedTokens ?? 0);
			if (message.role === "user") {
				pendingUserTokens += tokens;
				continue;
			}
			if (message.role !== "assistant") continue;

			const usage = message.providerUsage;
			const hasProviderUsage =
				usage &&
				[usage.inputTokens, usage.outputTokens, usage.totalTokens].some(
					(value) => Number.isFinite(value),
				);
			const requestTokens = Math.max(
				0,
				message.requestTokenEstimate ?? 0,
			);
			const legacyInputTokens = pendingUserTokens;

			if (hasProviderUsage) {
				const inputTokens = Math.max(
					0,
					usage.inputTokens ?? requestTokens,
				);
				const outputTokens = Math.max(0, usage.outputTokens ?? tokens);
				const totalTokens = Math.max(
					0,
					usage.totalTokens ?? inputTokens + outputTokens,
				);
				inputEstimatedTokens += inputTokens;
				outputEstimatedTokens += outputTokens;
				providerReportedTokens += totalTokens;
				providerResponseCount += 1;
				pendingUserTokens = 0;
			} else if (requestTokens > 0) {
				inputEstimatedTokens += requestTokens;
				outputEstimatedTokens += tokens;
				locallyEstimatedTokens += requestTokens + tokens;
				estimatedResponseCount += 1;
				pendingUserTokens = 0;
			} else {
				// Legacy messages predate requestTokenEstimate. Pair their
				// assistant output with the pending user message estimate.
				inputEstimatedTokens += pendingUserTokens;
				outputEstimatedTokens += tokens;
				locallyEstimatedTokens += pendingUserTokens + tokens;
				estimatedResponseCount += 1;
				pendingUserTokens = 0;
			}

			const model = message.modelName || "Unknown model";
			const modelTotal = hasProviderUsage
				? Math.max(
						0,
						usage.totalTokens ??
							(usage.inputTokens ?? requestTokens) +
								(usage.outputTokens ?? tokens),
					)
				: requestTokens > 0
					? requestTokens + tokens
					: legacyInputTokens + tokens;
			modelTokens.set(model, (modelTokens.get(model) ?? 0) + modelTotal);
			if (!message.isError) completedResponses += 1;
			if (Number.isFinite(message.responseTimeMs)) {
				responseTimeTotal += message.responseTimeMs!;
				measuredResponseCount += 1;
			}
		}
		if (pendingUserTokens > 0) {
			inputEstimatedTokens += pendingUserTokens;
			locallyEstimatedTokens += pendingUserTokens;
		}
	}

	return {
		totalEstimatedTokens: inputEstimatedTokens + outputEstimatedTokens,
		inputEstimatedTokens,
		outputEstimatedTokens,
		providerReportedTokens,
		locallyEstimatedTokens,
		usageSource:
			providerResponseCount === 0
				? "estimated"
				: estimatedResponseCount === 0
					? "provider"
					: "mixed",
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
