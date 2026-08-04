import { describe, expect, it } from "vitest";
import { summarizeLlmUsage } from "../usageStats";

describe("summarizeLlmUsage", () => {
	it("separates estimated input/output totals and groups assistant usage by model", () => {
		const stats = summarizeLlmUsage([{
			id: "one", title: "", createdAt: 1, updatedAt: 1, contextItems: [], messages: [
				{ id: "u", role: "user", content: "Hi", timestamp: 1, estimatedTokens: 12 },
				{ id: "a", role: "assistant", content: "Hello", timestamp: 2, estimatedTokens: 34, modelName: "gpt-test", responseTimeMs: 1500 },
			],
		}]);

		expect(stats).toMatchObject({
			totalEstimatedTokens: 46,
			inputEstimatedTokens: 12,
			outputEstimatedTokens: 34,
			completedResponses: 1,
			averageResponseTimeMs: 1500,
			modelEstimatedTokens: [{ model: "gpt-test", tokens: 34 }],
		});
	});
});
