import { describe, expect, it } from "vitest";
import { summarizeLlmUsage } from "../usageStats";

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
});
