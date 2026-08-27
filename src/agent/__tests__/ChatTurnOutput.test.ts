import { describe, expect, it } from "vitest";
import { ChatTurnOutput } from "../ChatTurnOutput";

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
});
