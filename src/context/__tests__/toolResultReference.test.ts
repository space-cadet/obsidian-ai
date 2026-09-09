import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../../types";
import type { ToolCall, ToolResult } from "../../agent/types";
import {
	createToolResultReference,
	findPersistedToolResult,
	serializeToolResult,
} from "../toolResultReference";

const call: ToolCall = {
	toolCallId: "call-1",
	toolName: "read_note",
	args: { path: "Notes/plan.md" },
};

const result: ToolResult = {
	success: true,
	content: "first line\nimportant detail\nlast line",
	content_fingerprint: "fnv1a:12345678",
};

describe("tool result references", () => {
	it("uses canonical content parts and preserves a stable address", () => {
		const message: ChatMessage = {
			id: "message-1",
			role: "assistant",
			content: "I read the note.",
			timestamp: 1,
			contentParts: [{ type: "tool_call", call, result }],
		};

		const match = findPersistedToolResult(
			[{ id: "session-1", messages: [message] }],
			"session-1",
			"call-1",
		);

		expect(match).toMatchObject({ message, call, result });
		if ("error" in match) throw new Error(match.error);
		expect(
			createToolResultReference("session-1", call, result, message.id),
		).toEqual({
			session_id: "session-1",
			tool_call_id: "call-1",
			tool_name: "read_note",
			message_id: "message-1",
			source: "Notes/plan.md",
			content_fingerprint: "fnv1a:12345678",
			content_length: result.content!.length,
		});
	});

	it("falls back to legacy toolCalls records", () => {
		const message: ChatMessage = {
			id: "legacy-message",
			role: "assistant",
			content: "legacy",
			timestamp: 1,
			toolCalls: [{ call, result }],
		};

		const match = findPersistedToolResult(
			[{ id: "session-1", messages: [message] }],
			"session-1",
			"call-1",
		);

		expect(match).toMatchObject({ message, call, result });
	});

	it("returns errors instead of guessing for missing or ambiguous results", () => {
		const message: ChatMessage = {
			id: "message-1",
			role: "assistant",
			content: "one",
			timestamp: 1,
			contentParts: [{ type: "tool_call", call, result }],
		};
		const sessions = [{ id: "session-1", messages: [message, message] }];

		expect(findPersistedToolResult(sessions, "missing", "call-1")).toEqual({
			error: "The requested chat session was not found.",
		});
		expect(
			findPersistedToolResult(sessions, "session-1", "call-1"),
		).toEqual({
			error: "The requested tool result ID is ambiguous in this session.",
		});
	});

	it("uses content as the exact retrieval representation and JSON otherwise", () => {
		expect(serializeToolResult(result)).toBe(result.content);
		expect(serializeToolResult({ success: true, count: 2 })).toBe(
			JSON.stringify({ success: true, count: 2 }),
		);
	});
});
