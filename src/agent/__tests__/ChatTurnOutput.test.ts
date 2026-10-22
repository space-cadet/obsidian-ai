import { describe, expect, it } from "vitest";
import { ChatTurnOutput } from "../ChatTurnOutput";
import { buildHistoryWithTools } from "../../lib/historyBuilder";

const toolCall = {
	toolCallId: "call-1",
	toolName: "read_note",
	args: { path: "Notes/example.md" },
};

describe("ChatTurnOutput", () => {
	it("keeps text around tool calls in the right order", () => {
		const output = new ChatTurnOutput((text) =>
			text.replaceAll("[think]", ""),
		);

		output.setText("Before [think]");
		output.recordToolCall(toolCall);
		output.setText("Before [think] after");
		output.finishToolText();

		expect(output.snapshot().contentParts).toEqual([
			{ type: "text", content: "Before " },
			{ type: "tool_call", call: toolCall },
			{ type: "text", content: " after" },
		]);
	});

	it("stores a tool result in both projections", () => {
		const output = new ChatTurnOutput((text) => text);
		output.recordToolCall(toolCall);

		const result = { content: "Example note" };
		output.recordToolResult(toolCall, result);

		expect(output.snapshot()).toEqual({
			text: "",
			toolCalls: [{ call: toolCall, result }],
			contentParts: [{ type: "tool_call", call: toolCall, result }],
		});
	});

	it("completes unresolved calls after cancellation so history stays paired", () => {
		const output = new ChatTurnOutput((text) => text);
		const secondCall = {
			...toolCall,
			toolCallId: "call-2",
			args: { path: "Notes/another.md" },
		};
		output.recordToolCall(toolCall);
		output.recordToolCall(secondCall);
		output.recordToolResult(toolCall, { content: "Deleted" });
		output.completeUnresolvedToolCalls(() => ({
			success: false,
			content: "Cancelled by user. This action was not run.",
		}));

		const snapshot = output.snapshot();
		const history = buildHistoryWithTools(
			[
				{
					id: "assistant-1",
					role: "assistant",
					content: "",
					timestamp: 0,
					toolCalls: snapshot.toolCalls,
					contentParts: snapshot.contentParts,
				},
			],
			10,
			4000,
		);

		expect(snapshot.toolCalls).toEqual([
			{ call: toolCall, result: { content: "Deleted" } },
			{
				call: secondCall,
				result: {
					success: false,
					content: "Cancelled by user. This action was not run.",
				},
			},
		]);
		expect(
			history[0].content.map(
				(part: { toolCallId: string }) => part.toolCallId,
			),
		).toEqual(["call-1", "call-2"]);
		expect(
			history[1].content.map(
				(part: { toolCallId: string }) => part.toolCallId,
			),
		).toEqual(["call-1", "call-2"]);
	});
});
