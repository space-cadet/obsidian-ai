import { describe, expect, it } from "vitest";
import type { ChatSession } from "../../types";
import { DEFAULT_SETTINGS } from "../../settings";
import { serializeChatExport, serializeToJSON } from "../exportChat";

const session: ChatSession = {
	id: "session-1",
	title: "Debug export",
	createdAt: 1,
	updatedAt: 2,
	contextItems: [
		{
			type: "note",
			path: "Notes/example.md",
			name: "example",
			id: "context-1",
		},
	],
	messages: [
		{
			id: "message-1",
			role: "assistant",
			content: "Done",
			timestamp: 2,
			estimatedTokens: 12,
			requestTokenEstimate: 34,
			providerUsage: {
				inputTokens: 30,
				outputTokens: 4,
				totalTokens: 34,
			},
			modelName: "test-model",
			responseTimeMs: 120,
			agentStepTelemetry: [
				{
					step: 0,
					requestTokenEstimate: 100,
					toolSchemaTokens: 30,
					historyTokens: 20,
					continuationTokens: 0,
					toolResultTokens: 8,
					providerUsage: {
						inputTokens: 90,
						outputTokens: 10,
						totalTokens: 100,
					},
				},
			],
			contextItems: [
				{
					type: "note",
					path: "Notes/example.md",
					name: "example",
					id: "context-1",
				},
			],
			contentParts: [
				{
					type: "tool_call",
					call: {
						toolCallId: "call-1",
						toolName: "read_note",
						args: { path: "Notes/example.md" },
					},
					result: { content: "abc" },
				},
			],
		},
	],
};

describe("chat debug telemetry export", () => {
	it("does not add telemetry when debug mode is disabled", () => {
		const exported = JSON.parse(
			serializeToJSON([session], "single", {
				debugMode: false,
				debugTelemetry: DEFAULT_SETTINGS.debugTelemetry,
			}),
		);

		expect(exported._debugTelemetry).toBeUndefined();
	});

	it("includes only the selected telemetry fields", () => {
		const exported = JSON.parse(
			serializeToJSON([session], "single", {
				debugMode: true,
				debugTelemetry: {
					...DEFAULT_SETTINGS.debugTelemetry,
					includeProviderUsage: false,
					includeRequestEstimates: true,
					includeRequestBreakdown: false,
					includeToolDetails: false,
					includeContextMetadata: true,
					includeModelTiming: false,
				},
			}),
		);

		const message = exported._debugTelemetry.sessions[0].messages[0];
		expect(message.providerUsage).toBeUndefined();
		expect(message.requestTokenEstimate).toBe(34);
		expect(message.contextItems).toHaveLength(1);
		expect(message.toolCalls).toBeUndefined();
		expect(message.modelName).toBeUndefined();
		expect(message.agentSteps).toBeUndefined();
	});

	it("includes per-step request breakdown when selected", () => {
		const exported = JSON.parse(
			serializeToJSON([session], "single", {
				debugMode: true,
				debugTelemetry: {
					...DEFAULT_SETTINGS.debugTelemetry,
					includeRequestBreakdown: true,
				},
			}),
		);

		const step =
			exported._debugTelemetry.sessions[0].messages[0].agentSteps[0];
		expect(step).toMatchObject({
			step: 0,
			requestTokenEstimate: 100,
			toolSchemaTokens: 30,
			historyTokens: 20,
			continuationTokens: 0,
			toolResultTokens: 8,
			providerUsage: {
				inputTokens: 90,
				outputTokens: 10,
				totalTokens: 100,
			},
		});
	});

	it("exports compaction accounting separately from message telemetry", () => {
		const compactedSession: ChatSession = {
			...session,
			compactionMetadata: {
				version: 1,
				sourceMessageIds: ["old-message"],
				sourceToolCallIds: ["old-call"],
				summarizedThroughMessageId: "old-message",
				sourceFingerprint: "fnv1a:11111111",
				transcriptFingerprint: "fnv1a:22222222",
				summary: {
					keyDecisions: [],
					toolResults: [],
					userIntent: [],
					openQuestions: [],
				},
				createdAt: 3,
				model: "compaction-model",
				telemetry: {
					requestTokenEstimate: 950,
					providerUsage: {
						inputTokens: 800,
						outputTokens: 150,
						totalTokens: 950,
					},
					responseTimeMs: 200,
				},
			},
		};
		const exported = JSON.parse(
			serializeToJSON([compactedSession], "single", {
				debugMode: true,
				debugTelemetry: DEFAULT_SETTINGS.debugTelemetry,
			}),
		);

		expect(exported._debugTelemetry.sessions[0].compaction).toMatchObject({
			sourceMessageCount: 1,
			sourceToolCallCount: 1,
			requestTokenEstimate: 950,
			providerUsage: { totalTokens: 950 },
			model: "compaction-model",
			responseTimeMs: 200,
		});
	});

	it("uses one serializer entry point for session and selected-message copy", () => {
		const sessionExport = serializeChatExport({
			kind: "sessions",
			sessions: [session],
			scope: "single",
			format: "json",
		});
		const selectedMessages = serializeChatExport({
			kind: "messages",
			messages: session.messages,
			format: "md",
		});

		expect(JSON.parse(sessionExport).id).toBe(session.id);
		expect(selectedMessages).toContain("🤖 Assistant");
	});
});
