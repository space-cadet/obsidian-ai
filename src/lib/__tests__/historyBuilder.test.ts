import { describe, it, expect } from "vitest";
import {
	buildHistoryWithTools,
	validateToolHistoryPairing,
} from "../historyBuilder";
import type { ChatMessage } from "../../types";

describe("buildHistoryWithTools", () => {
	const createToolMessage = (content: string): ChatMessage => ({
		id: "msg-1",
		role: "assistant",
		content: "I'll search for that",
		timestamp: Date.now(),
		contentParts: [
			{ type: "text", content: "I'll search for that" },
			{
				type: "tool_call",
				call: {
					toolCallId: "call-1",
					toolName: "search_notes",
					args: { query: "quantum gravity" },
				},
				result: {
					content,
				},
			},
		],
	});

	it("elides tool call args and result in elide mode", () => {
		const longResult = "a".repeat(5000);
		const message = createToolMessage(longResult);
		const history = buildHistoryWithTools([message], 10, 4000, "elide");

		expect(history).toHaveLength(2);

		// Assistant message
		const assistantMsg = history[0];
		expect(assistantMsg.role).toBe("assistant");
		expect(assistantMsg.content).toEqual([
			{ type: "text", text: "I'll search for that" },
			{
				type: "tool-call",
				toolCallId: "call-1",
				toolName: "search_notes",
				input: "[elided]",
			},
		]);

		// Tool result message
		const toolMsg = history[1];
		expect(toolMsg.role).toBe("tool");
		expect(toolMsg.content).toEqual([
			{
				type: "tool-result",
				toolCallId: "call-1",
				toolName: "search_notes",
				output: {
					type: "text",
					value: "[5000 chars, elided]",
				},
			},
		]);
	});

	it("preserves full tool call args and result in preserve mode", () => {
		const longResult = "a".repeat(5000);
		const message = createToolMessage(longResult);
		const history = buildHistoryWithTools([message], 10, 4000, "preserve");

		expect(history).toHaveLength(2);

		// Assistant message
		const assistantMsg = history[0];
		expect(assistantMsg.role).toBe("assistant");
		expect(assistantMsg.content).toEqual([
			{ type: "text", text: "I'll search for that" },
			{
				type: "tool-call",
				toolCallId: "call-1",
				toolName: "search_notes",
				input: { query: "quantum gravity" },
			},
		]);

		// Tool result message — should be truncated to maxToolResultTokens
		const toolMsg = history[1];
		expect(toolMsg.role).toBe("tool");
		expect(toolMsg.content[0].type).toBe("tool-result");
		expect(toolMsg.content[0].output.value.length).toBeLessThanOrEqual(
			4000 * 4,
		); // rough char limit
	});

	it("defaults to elide mode when mode not specified", () => {
		const message = createToolMessage("some result");
		const history = buildHistoryWithTools([message], 10, 4000);

		const assistantMsg = history[0];
		expect(assistantMsg.content[1].input).toBe("[elided]");
	});

	it("handles error results in elide mode", () => {
		const message: ChatMessage = {
			id: "msg-1",
			role: "assistant",
			content: "Let me try",
			timestamp: Date.now(),
			contentParts: [
				{ type: "text", content: "Let me try" },
				{
					type: "tool_call",
					call: {
						toolCallId: "call-2",
						toolName: "read_note",
						args: { path: "missing.md" },
					},
					result: {
						error: "File not found",
					},
				},
			],
		};

		const history = buildHistoryWithTools([message], 10, 4000, "elide");
		const toolMsg = history[1];
		expect(toolMsg.content[0].output.value).toBe("[21 chars, elided]");
	});

	it("handles plain text messages without tool calls", () => {
		const message: ChatMessage = {
			id: "msg-1",
			role: "assistant",
			content: "Hello there",
			timestamp: Date.now(),
		};

		const history = buildHistoryWithTools([message], 10, 4000, "elide");
		expect(history).toHaveLength(1);
		expect(history[0]).toEqual({
			role: "assistant",
			content: "Hello there",
		});
	});

	it("handles user messages", () => {
		const message: ChatMessage = {
			id: "msg-1",
			role: "user",
			content: "Search my notes",
			timestamp: Date.now(),
		};

		const history = buildHistoryWithTools([message], 10, 4000, "elide");
		expect(history).toHaveLength(1);
		expect(history[0].role).toBe("user");
		expect(history[0].content).toBe("Search my notes");
	});

	it("respects maxMessages limit", () => {
		const messages: ChatMessage[] = [
			{ id: "1", role: "user", content: "First", timestamp: Date.now() },
			{ id: "2", role: "user", content: "Second", timestamp: Date.now() },
			{ id: "3", role: "user", content: "Third", timestamp: Date.now() },
		];

		const history = buildHistoryWithTools(messages, 2, 4000, "elide");
		expect(history).toHaveLength(2);
		expect(history[0].content).toBe("Second");
		expect(history[1].content).toBe("Third");
	});

	it("handles legacy toolCalls format (pre-contentParts)", () => {
		const message: ChatMessage = {
			id: "msg-1",
			role: "assistant",
			content: "Found it",
			timestamp: Date.now(),
			toolCalls: [
				{
					call: {
						toolCallId: "call-3",
						toolName: "read_note",
						args: { path: "test.md" },
					},
					result: {
						content: "Note content here",
					},
				},
			],
		};

		const history = buildHistoryWithTools([message], 10, 4000, "elide");
		expect(history).toHaveLength(2);

		const assistantMsg = history[0];
		expect(assistantMsg.content[1].input).toBe("[elided]");

		const toolMsg = history[1];
		expect(toolMsg.content[0].output.value).toBe("[17 chars, elided]");
	});

	it("handles legacy toolCalls format in preserve mode", () => {
		const message: ChatMessage = {
			id: "msg-1",
			role: "assistant",
			content: "Found it",
			timestamp: Date.now(),
			toolCalls: [
				{
					call: {
						toolCallId: "call-3",
						toolName: "read_note",
						args: { path: "test.md" },
					},
					result: {
						content: "Note content here",
					},
				},
			],
		};

		const history = buildHistoryWithTools([message], 10, 4000, "preserve");
		expect(history[0].content[1].input).toEqual({ path: "test.md" });
		expect(history[1].content[0].output.value).toBe("Note content here");
	});

	it("keeps several tool calls and results matched", () => {
		const message: ChatMessage = {
			id: "msg-many",
			role: "assistant",
			content: "I found both results",
			timestamp: Date.now(),
			contentParts: [
				{ type: "text", content: "I found both results" },
				{
					type: "tool_call",
					call: {
						toolCallId: "call-a",
						toolName: "search_notes",
						args: { query: "first" },
					},
					result: { content: "first result" },
				},
				{
					type: "tool_call",
					call: {
						toolCallId: "call-b",
						toolName: "search_notes",
						args: { query: "second" },
					},
					result: { content: "second result" },
				},
			],
		};

		const history = buildHistoryWithTools([message], 10, 4000, "preserve");
		const calls = history[0].content.filter(
			(part: { type?: string }) => part.type === "tool-call",
		);
		const results = history[1].content.filter(
			(part: { type?: string }) => part.type === "tool-result",
		);

		expect(
			calls.map((part: { toolCallId: string }) => part.toolCallId),
		).toEqual(["call-a", "call-b"]);
		expect(
			results.map((part: { toolCallId: string }) => part.toolCallId),
		).toEqual(["call-a", "call-b"]);
		expect(validateToolHistoryPairing(history)).toEqual({
			valid: true,
			errors: [],
		});
	});

	it("detects a result that lost its matching call", () => {
		expect(
			validateToolHistoryPairing([
				{
					role: "tool",
					content: [
						{
							type: "tool-result",
							toolCallId: "missing",
						},
					],
				},
			]),
		).toEqual({
			valid: false,
			errors: ["Tool result has no preceding call: missing"],
		});
	});
});
