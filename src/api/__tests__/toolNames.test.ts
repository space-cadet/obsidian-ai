import { describe, expect, it } from "vitest";
import { prepareCodexTools } from "../toolNames";

describe("Codex tool name mapping", () => {
	it("keeps colliding integration tools distinct and restores dispatched names", () => {
		const tools = {
			"example.status": { description: "integration" },
			example_status: { description: "built-in" },
			"example:status": { description: "other integration" },
		};
		const prepared = prepareCodexTools(tools, []);
		expect(Object.keys(prepared.tools)).toHaveLength(3);
		for (const [name, definition] of Object.entries(prepared.tools)) {
			expect(name).toMatch(/^[a-zA-Z0-9_-]+$/);
			expect(
				tools[prepared.restoreName(name) as keyof typeof tools],
			).toBe(definition);
		}
		expect(prepared.tools.example_status).toBe(tools.example_status);
	});
	it("maps continuation calls and results without changing text or original history", () => {
		const messages = [
			{
				role: "assistant",
				content: [
					{
						type: "tool-call",
						toolCallId: "call-1",
						toolName: "example.status",
						input: {},
					},
				],
			},
			{
				role: "tool",
				content: [
					{
						type: "tool-result",
						toolCallId: "call-1",
						toolName: "example.status",
						output: { type: "text", value: "ok" },
					},
				],
			},
			{ role: "user", content: "example.status" },
		];
		const prepared = prepareCodexTools({ "example.status": {} }, messages);
		const alias = Object.keys(prepared.tools)[0];
		expect(prepared.messages[0].content[0].toolName).toBe(alias);
		expect(prepared.messages[1].content[0].toolName).toBe(alias);
		expect(prepared.messages[2]).toBe(messages[2]);
		expect((messages[0].content as any[])[0].toolName).toBe(
			"example.status",
		);
		expect(prepared.restoreName(alias)).toBe("example.status");
	});
});
