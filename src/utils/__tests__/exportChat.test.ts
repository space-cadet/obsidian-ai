import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../../types";
import type { ChatDiagnostics } from "../../diagnostics";
import {
	serializeMessagesToMarkdown,
	serializeToJSON,
	serializeToJSONL,
} from "../exportChat";

const diagnostics: ChatDiagnostics = {
	version: 1,
	enabled: true,
	transport: "ai-sdk",
	startedAt: 1,
	completedAt: 2,
	profile: { id: "p1", name: "Test", provider: "openai", model: "test" },
	settings: {},
	steps: [
		{
			step: 1,
			continuation: "initial",
			startedAt: 1,
			completedAt: 2,
			request: {
				payload: { messages: [{ role: "user", content: "hello" }] },
				providerProjection: {
					messages: [{ role: "user", content: "hello" }],
				},
				components: {
					fullPayload: {
						characters: 1,
						bytes: 1,
						estimatedTokens: 1,
					},
				},
			},
			providerUsage: {
				inputTokens: 12,
				outputTokens: 3,
				totalTokens: 15,
			},
		},
	],
};

const message: ChatMessage = {
	id: "m1",
	role: "assistant",
	content: "hello",
	timestamp: 1,
	diagnostics,
};

describe("chat diagnostic exports", () => {
	it("includes diagnostics in every export format", () => {
		const session = {
			id: "s1",
			title: "Test",
			createdAt: 1,
			updatedAt: 2,
			messages: [message],
			contextItems: [],
		};

		expect(serializeMessagesToMarkdown([message])).toContain(
			"Diagnostic trace",
		);
		expect(serializeMessagesToMarkdown([message])).toContain(
			'"inputTokens": 12',
		);
		expect(serializeToJSON([session], "single")).toContain('"diagnostics"');
		expect(serializeToJSONL([session], "single")).toContain(
			'"diagnostics"',
		);
	});
});
