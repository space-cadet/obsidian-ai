import { describe, expect, it } from "vitest";
import { ChatMessage } from "../../types";
import {
	buildCompactionPrompt,
	compactionHysteresisReleased,
	compactionMetadataMatchesTranscript,
	createCompactionMetadata,
	formatCompactionSummary,
	fingerprintTranscript,
	parseCompactionMetadata,
	parseCompactionResponse,
	parseCompactionResponseDetailed,
	parseCompactionSummary,
	planSemanticCompaction,
	transcriptStartsWith,
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
		expect(prompt).toContain("Message IDs are source references");
	});

	it("bounds compaction input and projects oversized tool results", () => {
		const toolMessage: ChatMessage = {
			id: "assistant-tool-large",
			role: "assistant",
			content: "Done",
			timestamp: 0,
			contentParts: [
				{
					type: "tool_call",
					call: {
						toolCallId: "call-large",
						toolName: "read_note",
						args: { path: "large.md" },
					},
					result: { content: "HEAD-" + "x".repeat(4000) + "-TAIL" },
				},
			],
		};
		const prompt = buildCompactionPrompt([toolMessage], {
			maxTokens: 200,
			maxToolResultTokens: 20,
			sessionId: "session-1",
		});

		expect(prompt).toContain("bounded projection");
		expect(prompt).toContain("assistant-tool-large");
		expect(prompt).toContain("tool result truncated");
		expect(prompt.length).toBeLessThanOrEqual(200 * 4);
	});

	it("creates and validates append-safe compaction provenance", () => {
		const source = [message("user", "decision: use JSON")];
		const fullTranscript = [...source, message("assistant", "done")];
		const summary = {
			keyDecisions: ["Use JSON"],
			toolResults: [],
			userIntent: ["Preserve fidelity"],
			openQuestions: [],
		};
		const metadata = createCompactionMetadata({
			sourceMessages: source,
			transcriptMessages: fullTranscript,
			summary,
			createdAt: 123,
			model: "test-model",
			telemetry: {
				requestTokenEstimate: 321,
				providerUsage: {
					inputTokens: 300,
					outputTokens: 21,
					totalTokens: 321,
				},
				responseTimeMs: 456,
			},
		});

		expect(metadata).toMatchObject({
			version: 1,
			sourceMessageIds: [source[0].id],
			summarizedThroughMessageId: source[0].id,
			sourceFingerprint: fingerprintTranscript(source),
			transcriptFingerprint: fingerprintTranscript(fullTranscript),
			createdAt: 123,
			model: "test-model",
			telemetry: {
				requestTokenEstimate: 321,
				providerUsage: {
					inputTokens: 300,
					outputTokens: 21,
					totalTokens: 321,
				},
				responseTimeMs: 456,
			},
		});
		expect(parseCompactionMetadata(metadata)).toEqual(metadata);
		expect(
			compactionMetadataMatchesTranscript(metadata, fullTranscript),
		).toBe(true);
		expect(transcriptStartsWith(fullTranscript, source)).toBe(true);
		expect(
			compactionMetadataMatchesTranscript(metadata, [
				message("user", "changed"),
				...fullTranscript.slice(1),
			]),
		).toBe(false);
		expect(parseCompactionMetadata({ ...metadata, version: 2 })).toBeNull();
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
		expect(
			parseCompactionSummary({
				keyDecisions: ["x".repeat(801)],
				toolResults: [],
				userIntent: [],
				openQuestions: [],
			}),
		).toBeNull();
	});

	it("accepts raw and fenced JSON compaction responses", () => {
		const summary = {
			keyDecisions: ["Use bounded replay"],
			toolResults: ["Read the note"],
			userIntent: ["Keep costs down"],
			openQuestions: [],
		};

		expect(parseCompactionResponse(JSON.stringify(summary))).toEqual(
			summary,
		);
		expect(
			parseCompactionResponse(
				["```json", JSON.stringify(summary), "```"].join("\n"),
			),
		).toEqual(summary);
		expect(parseCompactionResponse("```json\nnot JSON\n```")).toBeNull();
	});

	it("classifies provider errors without exposing response content", () => {
		const diagnostics = parseCompactionResponseDetailed(
			"⚠️ Failed to generate a response. Please try again later.",
		);

		expect(diagnostics).toMatchObject({
			failure: "provider-error",
			rawLength: expect.any(Number),
			fencedJson: false,
			parsedCandidateCount: 0,
		});
		expect(JSON.stringify(diagnostics)).not.toContain("try again later");
	});

	it("reports bounded schema diagnostics for valid JSON with wrong fields", () => {
		const diagnostics = parseCompactionResponseDetailed(
			JSON.stringify({ summary: "wrong shape" }),
		);

		expect(diagnostics.failure).toBe("invalid-schema");
		expect(diagnostics.schemaIssues).toEqual(
			expect.arrayContaining([
				"keyDecisions: missing",
				"toolResults: missing",
				"userIntent: missing",
				"openQuestions: missing",
			]),
		);
	});

	it("normalizes structured tool results into bounded summary text", () => {
		const diagnostics = parseCompactionResponseDetailed(
			JSON.stringify({
				keyDecisions: [],
				toolResults: [
					{
						toolCallId: "call-1",
						toolName: "read_note",
						result: "completed",
					},
				],
				userIntent: [],
				openQuestions: [],
			}),
		);

		expect(diagnostics.failure).toBeNull();
		expect(diagnostics.summary?.toolResults[0]).toContain(
			'"toolCallId":"call-1"',
		);
		expect(diagnostics.summary?.toolResults[0].length).toBeLessThanOrEqual(
			800,
		);
	});
});
