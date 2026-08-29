import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../../types";
import { buildModelHistory } from "../modelHistory";

const toolMessage = (content: string): ChatMessage => ({
	id: "assistant-1",
	role: "assistant",
	content: "I read the note.",
	timestamp: 0,
	contentParts: [
		{ type: "text", content: "I read the note." },
		{
			type: "tool_call",
			call: {
				toolCallId: "call-1",
				toolName: "read_note",
				args: { path: "plan.md" },
			},
			result: { content },
		},
	],
});

const options = (
	overrides: Partial<Parameters<typeof buildModelHistory>[0]> = {},
) => ({
	systemPrompt: "system",
	currentMessage: "continue",
	history: [toolMessage("The plan contains the important details.")],
	maxMessages: 10,
	maxToolResultTokens: 4000,
	toolHistoryMode: "elide" as const,
	agentMode: false,
	budget: {
		maxRequestTokens: 0,
		maxMessages: 10,
		preserveRecentMessages: 4,
		responseReserveTokens: 0,
	},
	...overrides,
});

describe("buildModelHistory", () => {
	it("preserves tool details automatically for agent mode", () => {
		const historyMessage = toolMessage(
			"The plan contains the important details.",
		);
		const result = buildModelHistory(
			options({ agentMode: true, history: [historyMessage] }),
		);

		expect(result.toolHistoryMode).toBe("preserve");
		expect(result.history[0].content[1].input).toEqual({ path: "plan.md" });
		expect(result.history[1].content[0].output.value).toBe(
			"The plan contains the important details.",
		);
		expect(historyMessage.contentParts?.[1]).toMatchObject({
			type: "tool_call",
			result: { content: "The plan contains the important details." },
		});
	});

	it("keeps normal chat on the configured history mode", () => {
		const result = buildModelHistory(options());

		expect(result.toolHistoryMode).toBe("elide");
		expect(result.history[0].content[1].input).toBe("[elided]");
		expect(result.history[1].content[0].output.value).toBe(
			"[40 chars, elided]",
		);
	});

	it("returns a system message, valid history, and current user message", () => {
		const result = buildModelHistory(options({ agentMode: true }));

		expect(result.messages.map((message) => message.role)).toEqual([
			"system",
			"assistant",
			"tool",
			"user",
		]);
		expect(result.pairing.valid).toBe(true);
		expect(result.messages[3].content).toBe("continue");
	});
});
