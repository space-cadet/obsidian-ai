import { describe, expect, it } from "vitest";
import { summarizeLlmUsage } from "../usageStats";
import { getSessionTotalTokens } from "../sessionUtils";

describe("summarizeLlmUsage", () => {
	it("separates estimated input/output totals and groups assistant usage by model", () => {
		const stats = summarizeLlmUsage([
			{
				id: "one",
				title: "",
				createdAt: 1,
				updatedAt: 1,
				contextItems: [],
				messages: [
					{
						id: "u",
						role: "user",
						content: "Hi",
						timestamp: 1,
						estimatedTokens: 12,
					},
					{
						id: "a",
						role: "assistant",
						content: "Hello",
						timestamp: 2,
						estimatedTokens: 34,
						modelName: "gpt-test",
						responseTimeMs: 1500,
					},
				],
			},
		]);

		expect(stats).toMatchObject({
			totalEstimatedTokens: 46,
			inputEstimatedTokens: 12,
			outputEstimatedTokens: 34,
			completedResponses: 1,
			averageResponseTimeMs: 1500,
			modelEstimatedTokens: [{ model: "gpt-test", tokens: 46 }],
		});
	});

	it("uses provider usage and does not double-count the saved user estimate", () => {
		const stats = summarizeLlmUsage([
			{
				id: "one",
				title: "",
				createdAt: 1,
				updatedAt: 1,
				contextItems: [],
				messages: [
					{
						id: "u",
						role: "user",
						content: "Hi",
						timestamp: 1,
						estimatedTokens: 12,
					},
					{
						id: "a",
						role: "assistant",
						content: "Hello",
						timestamp: 2,
						estimatedTokens: 34,
						modelName: "openrouter/test",
						providerUsage: {
							inputTokens: 1_000,
							outputTokens: 200,
							totalTokens: 1_200,
						},
					},
				],
			},
		]);

		expect(stats).toMatchObject({
			totalEstimatedTokens: 1_200,
			inputEstimatedTokens: 1_000,
			outputEstimatedTokens: 200,
			providerReportedTokens: 1_200,
			locallyEstimatedTokens: 0,
			usageSource: "provider",
			modelEstimatedTokens: [{ model: "openrouter/test", tokens: 1_200 }],
		});
	});

	it("includes compaction request usage separately from chat messages", () => {
		const stats = summarizeLlmUsage([
			{
				id: "one",
				title: "",
				createdAt: 1,
				updatedAt: 1,
				contextItems: [],
				messages: [],
				compactionMetadata: {
					version: 1,
					sourceMessageIds: ["old"],
					sourceToolCallIds: [],
					summarizedThroughMessageId: "old",
					sourceFingerprint: "fnv1a:11111111",
					transcriptFingerprint: "fnv1a:22222222",
					summary: {
						keyDecisions: [],
						toolResults: [],
						userIntent: [],
						openQuestions: [],
					},
					createdAt: 2,
					model: "compaction-model",
					telemetry: {
						requestTokenEstimate: 950,
						providerUsage: {
							inputTokens: 800,
							outputTokens: 150,
							totalTokens: 950,
						},
						responseTimeMs: 200,
					},
				},
			},
		]);

		expect(stats).toMatchObject({
			totalEstimatedTokens: 950,
			inputEstimatedTokens: 800,
			outputEstimatedTokens: 150,
			providerReportedTokens: 950,
			modelEstimatedTokens: [{ model: "compaction-model", tokens: 950 }],
			averageResponseTimeMs: 200,
		});
		expect(
			getSessionTotalTokens({
				id: "one",
				title: "",
				createdAt: 1,
				updatedAt: 1,
				contextItems: [],
				messages: [],
				compactionMetadata: {
					version: 1,
					sourceMessageIds: ["old"],
					sourceToolCallIds: [],
					summarizedThroughMessageId: "old",
					sourceFingerprint: "fnv1a:11111111",
					transcriptFingerprint: "fnv1a:22222222",
					summary: {
						keyDecisions: [],
						toolResults: [],
						userIntent: [],
						openQuestions: [],
					},
					createdAt: 2,
					telemetry: {
						requestTokenEstimate: 950,
						providerUsage: { totalTokens: 950 },
					},
				},
			}),
		).toBe(950);
	});
});
