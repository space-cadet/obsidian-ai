import { describe, it, expect } from "vitest";
import { handleDebugCommand } from "../debugCommands";
import type { ChatSession, ChatMessage } from "../../types";
import type { ProviderProfile } from "../../settings";

function makeSession(messages: ChatMessage[] = []): ChatSession {
	return {
		id: "test-session",
		title: "Test",
		messages,
		contextItems: [],
		createdAt: Date.now(),
		updatedAt: Date.now(),
	};
}

const mockProfile: ProviderProfile = {
	id: "p1",
	name: "Test",
	provider: "openai",
	model: "gpt-4",
	createdAt: Date.now(),
	updatedAt: Date.now(),
};

const defaultSettings = {
	toolHistoryMode: "elide" as const,
	maxRequestTokens: 32000,
};

describe("handleDebugCommand", () => {
	it("ignores non-debug messages", () => {
		const result = handleDebugCommand(
			"Hello world",
			undefined,
			mockProfile,
			defaultSettings,
		);
		expect(result.handled).toBe(false);
		expect(result.response).toBeUndefined();
	});

	it("handles !debug help", () => {
		const result = handleDebugCommand(
			"!debug help",
			undefined,
			mockProfile,
			defaultSettings,
		);
		expect(result.handled).toBe(true);
		expect(result.response).toContain("Debug Commands");
		expect(result.response).toContain("!debug history");
		expect(result.response).toContain("!debug tokens");
	});

	it("handles !debug history with empty session", () => {
		const result = handleDebugCommand(
			"!debug history",
			makeSession(),
			mockProfile,
			defaultSettings,
		);
		expect(result.handled).toBe(true);
		expect(result.response).toContain("No messages");
	});

	it("handles !debug history with messages", () => {
		const session = makeSession([
			{
				id: "1",
				role: "user",
				content: "Hello",
				timestamp: Date.now(),
			},
			{
				id: "2",
				role: "assistant",
				content: "Hi there",
				timestamp: Date.now(),
			},
		]);
		const result = handleDebugCommand(
			"!debug history",
			session,
			mockProfile,
			defaultSettings,
		);
		expect(result.handled).toBe(true);
		expect(result.response).toContain("History Debug");
		expect(result.response).toContain("user");
		expect(result.response).toContain("assistant");
	});

	it("handles !debug tokens with empty session", () => {
		const result = handleDebugCommand(
			"!debug tokens",
			makeSession(),
			mockProfile,
			defaultSettings,
		);
		expect(result.handled).toBe(true);
		expect(result.response).toContain("No messages");
	});

	it("handles !debug tokens with messages", () => {
		const session = makeSession([
			{
				id: "1",
				role: "user",
				content: "Hello world this is a test message",
				timestamp: Date.now(),
			},
		]);
		const result = handleDebugCommand(
			"!debug tokens",
			session,
			mockProfile,
			defaultSettings,
		);
		expect(result.handled).toBe(true);
		expect(result.response).toContain("Token Debug");
		expect(result.response).toContain("gpt-4");
		expect(result.response).toContain("32,000");
	});

	it("handles !debug context with no session", () => {
		const result = handleDebugCommand(
			"!debug context",
			undefined,
			mockProfile,
			defaultSettings,
		);
		expect(result.handled).toBe(true);
		expect(result.response).toContain("No active session");
	});

	it("handles unknown debug command", () => {
		const result = handleDebugCommand(
			"!debug foobar",
			undefined,
			mockProfile,
			defaultSettings,
		);
		expect(result.handled).toBe(true);
		expect(result.response).toContain("Unknown debug command");
	});

	it("is case-insensitive for command names", () => {
		const result = handleDebugCommand(
			"!DEBUG HELP",
			undefined,
			mockProfile,
			defaultSettings,
		);
		expect(result.handled).toBe(true);
		expect(result.response).toContain("Debug Commands");
	});

	it("counts tool calls in token debug", () => {
		const session = makeSession([
			{
				id: "1",
				role: "assistant",
				content: "Result",
				timestamp: Date.now(),
				contentParts: [
					{ type: "text", content: "Result" },
					{
						type: "tool_call",
						call: {
							toolCallId: "c1",
							toolName: "read_note",
							args: { path: "test.md" },
						},
						result: {
							content: "Note content",
						},
					},
				],
			},
		]);
		const result = handleDebugCommand(
			"!debug tokens",
			session,
			mockProfile,
			defaultSettings,
		);
		expect(result.response).toContain("Tool calls");
		expect(result.response).toContain("1");
	});
});
