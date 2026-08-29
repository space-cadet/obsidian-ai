import { describe, expect, it } from "vitest";
import { buildBudgetedHistory, truncateTextForTokens } from "../contextBudget";

describe("buildBudgetedHistory", () => {
	it("keeps the recent tail and drops older messages to fit the budget", () => {
		const result = buildBudgetedHistory({
			systemPrompt: "system",
			currentMessage: "current",
			history: ["old-1", "old-2", "recent-1", "recent-2"],
			options: {
				maxRequestTokens: 11,
				maxMessages: 10,
				preserveRecentMessages: 2,
				responseReserveTokens: 0,
			},
		});

		expect(result.history).toEqual(["recent-1", "recent-2"]);
		expect(result.droppedMessages).toBe(2);
		expect(result.overBudget).toBe(false);
	});

	it("preserves chronological order when older messages fit", () => {
		const result = buildBudgetedHistory({
			systemPrompt: "s",
			currentMessage: "c",
			history: ["a", "b", "c"],
			options: {
				maxRequestTokens: 100,
				maxMessages: 10,
				preserveRecentMessages: 1,
				responseReserveTokens: 0,
			},
		});

		expect(result.history).toEqual(["a", "b", "c"]);
	});

	it("keeps legacy message-count behavior when the budget is disabled", () => {
		const result = buildBudgetedHistory({
			systemPrompt: "system",
			currentMessage: "current",
			history: ["a", "b", "c"],
			options: {
				maxRequestTokens: 0,
				maxMessages: 2,
				preserveRecentMessages: 1,
				responseReserveTokens: 0,
			},
		});

		expect(result.history).toEqual(["b", "c"]);
		expect(result.droppedMessages).toBe(1);
	});

	it("truncates large tool results while keeping their head and tail", () => {
		const result = truncateTextForTokens(
			"head-" + "x".repeat(200) + "-tail",
			20,
		);

		expect(result).toContain("head-");
		expect(result).toContain("-tail");
		expect(result).toContain("tool result truncated");
	});

	it("does not split an assistant tool call from its tool result", () => {
		const assistant = { role: "assistant", content: "call" };
		const tool = { role: "tool", content: "result" };
		const result = buildBudgetedHistory({
			systemPrompt: "s",
			currentMessage: "c",
			history: [assistant, tool],
			options: {
				maxRequestTokens: 100,
				maxMessages: 10,
				preserveRecentMessages: 1,
				responseReserveTokens: 0,
			},
		});

		expect(result.history).toEqual([assistant, tool]);
	});

	it("extends a message ceiling when it would start with a tool result", () => {
		const assistant = { role: "assistant", content: "call" };
		const tool = { role: "tool", content: "result" };
		const result = buildBudgetedHistory({
			systemPrompt: "s",
			currentMessage: "c",
			history: [assistant, tool],
			options: {
				maxRequestTokens: 0,
				maxMessages: 1,
				preserveRecentMessages: 1,
				responseReserveTokens: 0,
			},
		});

		expect(result.history).toEqual([assistant, tool]);
		expect(result.droppedMessages).toBe(0);
	});

	it("returns no history when the message ceiling is zero", () => {
		const result = buildBudgetedHistory({
			systemPrompt: "s",
			currentMessage: "c",
			history: ["a", "b"],
			options: {
				maxRequestTokens: 0,
				maxMessages: 0,
				preserveRecentMessages: 1,
				responseReserveTokens: 0,
			},
		});

		expect(result.history).toEqual([]);
		expect(result.droppedMessages).toBe(2);
	});

	it("does not let the preserved tail exceed the request budget", () => {
		const result = buildBudgetedHistory({
			systemPrompt: "s",
			currentMessage: "c",
			history: [
				{ role: "assistant", content: "call" },
				{ role: "tool", content: "x".repeat(200) },
			],
			options: {
				maxRequestTokens: 20,
				maxMessages: 10,
				preserveRecentMessages: 2,
				responseReserveTokens: 0,
			},
		});

		expect(result.history).toHaveLength(2);
		expect(result.estimatedRequestTokens).toBeGreaterThan(20);
		expect(result.overBudget).toBe(true);
	});

	it("keeps multiple tool exchanges whole when older history is dropped", () => {
		const history = [
			{ role: "user", content: "old" },
			{ role: "assistant", content: "first call" },
			{ role: "tool", content: "first result" },
			{ role: "assistant", content: "second call" },
			{ role: "tool", content: "second result" },
		];
		const result = buildBudgetedHistory({
			systemPrompt: "s",
			currentMessage: "c",
			history,
			options: {
				maxRequestTokens: 100,
				maxMessages: 4,
				preserveRecentMessages: 3,
				responseReserveTokens: 0,
			},
		});

		expect(result.history).toEqual(history.slice(1));
		expect(
			result.history.filter((message) => message.role === "tool"),
		).toHaveLength(2);
	});

	it("keeps tiny truncations within their token limit", () => {
		const result = truncateTextForTokens("a very long result", 1);

		expect(result.length).toBeLessThanOrEqual(4);
	});
});
