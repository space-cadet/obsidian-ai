import { describe, expect, it } from "vitest";
import { ChatMessage } from "../../types";
import {
	buildCompactionPrompt,
	compactionHysteresisReleased,
	formatCompactionSummary,
	parseCompactionSummary,
	planSemanticCompaction,
} from "../semanticCompaction";

const message = (role: "user" | "assistant", content: string): ChatMessage => ({
	id: `${role}-${content}`,
	role,
	content,
	timestamp: 0,
});

describe("semantic compaction", () => {
	it("plans a summary and preserves the exact recent tail", () => {
		const messages = [
			message("user", "decision: use JSON"),
			message("assistant", "done"),
			message("user", "next"),
			message("assistant", "answer"),
		];
		const plan = planSemanticCompaction(
			messages,
			{ triggerTokens: 1, releaseTokens: 1, keepRecentMessages: 2 },
			false,
		);
		expect(plan.shouldCompact).toBe(true);
		expect(plan.summarized).toHaveLength(2);
		expect(plan.recent).toEqual(messages.slice(2));
		expect(plan.prompt).toContain("decision: use JSON");
	});

	it("uses hysteresis to prevent immediate retriggering", () => {
		const messages = [message("user", "1234567890")];
		expect(
			planSemanticCompaction(
				messages,
				{ triggerTokens: 2, releaseTokens: 1, keepRecentMessages: 0 },
				true,
			).shouldCompact,
		).toBe(false);
		expect(
			compactionHysteresisReleased(messages, {
				triggerTokens: 2,
				releaseTokens: 2,
				keepRecentMessages: 0,
			}),
		).toBe(false);
	});

	it("formats a stable structured summary", () => {
		const formatted = formatCompactionSummary({
			keyDecisions: ["Use bounded replay"],
			toolResults: [],
			userIntent: ["Reduce request cost"],
		});
		expect(formatted).toContain("## Key Decisions");
		expect(formatted).toContain("- Use bounded replay");
		expect(formatted).toContain("## Open Questions");
		expect(formatted).toContain("Derived summary");
	});

	it("marks source messages and tool calls in the summary prompt", () => {
		const toolMessage: ChatMessage = {
			id: "assistant-tool-1",
			role: "assistant",
			content: "Done",
			timestamp: 0,
			toolCalls: [
				{
					call: {
						toolCallId: "call-1",
						toolName: "read_note",
						args: { path: "README.md" },
					},
					result: { content: "note text" },
				},
			],
		};
		const prompt = buildCompactionPrompt([toolMessage]);

		expect(prompt).toContain("Message assistant-tool-1");
		expect(prompt).toContain("read_note (call-1)");
		expect(prompt).toContain("message IDs below as source references");
	});

	it("rejects compaction output with missing or non-text fields", () => {
		expect(parseCompactionSummary({ keyDecisions: [] })).toBeNull();
		expect(
			parseCompactionSummary({
				keyDecisions: ["Use bounded replay"],
				toolResults: ["Read the note"],
				userIntent: ["Keep costs down"],
				openQuestions: ["Need provider testing"],
			}),
		).toEqual({
			keyDecisions: ["Use bounded replay"],
			toolResults: ["Read the note"],
			userIntent: ["Keep costs down"],
			openQuestions: ["Need provider testing"],
		});
	});
});
