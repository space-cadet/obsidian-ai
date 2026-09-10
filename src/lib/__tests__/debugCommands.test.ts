import { describe, it, expect } from "vitest";
import { handleDebugCommand } from "../debugCommands";
import type { ChatSession, ChatMessage } from "../../types";
import type { ProviderProfile } from "../../settings";
import { createCompactionMetadata } from "../../context/semanticCompaction";

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
		expect(result.response).toContain("Built-in ! Commands");
		expect(result.response).toContain("!debug history");
		expect(result.response).toContain("!debug tokens");
		expect(result.response).toContain("!debug compact");
	});

	it("handles the short !help alias", () => {
		const result = handleDebugCommand(
			"!help",
			undefined,
			mockProfile,
			defaultSettings,
		);
		expect(result.handled).toBe(true);
		expect(result.response).toContain("Built-in ! Commands");
	});

	it("returns a compaction action without sending it to the model", () => {
		const result = handleDebugCommand(
			"!debug compact",
			makeSession(),
			mockProfile,
			defaultSettings,
		);
		expect(result.handled).toBe(true);
		expect(result.action).toBe("compact");
		expect(result.response).toBeUndefined();
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

	it("shows the compaction-aware history projection", () => {
		const source: ChatMessage[] = [
			{
				id: "old-1",
				role: "user",
				content: "OLD-ONE",
				timestamp: 1,
			},
			{
				id: "old-2",
				role: "assistant",
				content: "OLD-TWO",
				timestamp: 2,
			},
		];
		const recent: ChatMessage[] = [
			{
				id: "recent-1",
				role: "user",
				content: "RECENT-ONE",
				timestamp: 3,
			},
			{
				id: "recent-2",
				role: "assistant",
				content: "RECENT-TWO",
				timestamp: 4,
			},
			{
				id: "recent-3",
				role: "user",
				content: "RECENT-THREE",
				timestamp: 5,
			},
			{
				id: "recent-4",
				role: "assistant",
				content: "RECENT-FOUR",
				timestamp: 6,
			},
		];
		const session = makeSession([
			...source,
			...recent,
			{
				id: "debug-event",
				role: "assistant",
				content: "Context Compacted",
				timestamp: 7,
				isDebug: true,
			},
		]);
		session.compactionMetadata = createCompactionMetadata({
			sourceMessages: source,
			transcriptMessages: [...source, ...recent],
			summary: {
				keyDecisions: ["Summary retained"],
				toolResults: [],
				userIntent: ["Test projection"],
				openQuestions: [],
			},
		});

		const result = handleDebugCommand(
			"!debug history",
			session,
			mockProfile,
			{
				...defaultSettings,
				maxContextMessages: 100,
				preserveRecentMessages: 4,
			},
		);

		expect(result.response).toContain("**Compaction:** applied");
		expect(result.response).toContain("Summary retained");
		expect(result.response).toContain("RECENT-ONE");
		expect(result.response).toContain("RECENT-FOUR");
		expect(result.response).not.toContain("OLD-ONE");
		expect(result.response).not.toContain("OLD-TWO");
		expect(result.response).not.toContain("Context Compacted");
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
		expect(result.response).toContain("Built-in ! Commands");
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
