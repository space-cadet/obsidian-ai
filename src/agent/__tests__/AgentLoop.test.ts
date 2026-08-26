import { describe, expect, it, vi } from "vitest";
import { AgentLoop } from "../AgentLoop";

describe("AgentLoop", () => {
	it("preserves Gemini tool-call metadata for the next tool step", async () => {
		const streamChatWithTools = vi
			.fn()
			.mockImplementationOnce(async function* () {
				yield {
					type: "tool-call",
					call: {
						toolCallId: "call-1",
						toolName: "read_note",
						args: { path: "Vocabulary" },
						providerMetadata: {
							google: { thoughtSignature: "opaque-signature" },
						},
					},
				};
			})
			.mockImplementationOnce(async function* () {
				yield { type: "text-delta", text: "Done" };
			});
		const execute = vi
			.fn()
			.mockResolvedValue({ success: true, content: "# Vocabulary" });
		const loop = new AgentLoop({
			chatApi: { streamChatWithTools } as any,
			toolExecutor: { execute } as any,
			maxSteps: 2,
			autoApprove: true,
			onTextDelta: vi.fn(),
			onToolCall: vi.fn(),
			requestApproval: vi.fn(),
		});

		await loop.run(
			[{ role: "user", content: "Read Vocabulary" }],
			{},
			new AbortController().signal,
		);

		const followUpMessages = streamChatWithTools.mock.calls[1][0];
		const assistantToolPart = followUpMessages[1].content[0];
		expect(assistantToolPart.providerMetadata).toEqual({
			google: { thoughtSignature: "opaque-signature" },
		});
	});

	it("bounds an oversized result in the immediate continuation", async () => {
		const streamChatWithTools = vi
			.fn()
			.mockImplementationOnce(async function* () {
				yield {
					type: "tool-call",
					call: {
						toolCallId: "call-large",
						toolName: "read_note",
						args: { path: "Large note" },
					},
				};
			})
			.mockImplementationOnce(async function* () {
				yield { type: "text-delta", text: "Done" };
			});
		const loop = new AgentLoop({
			chatApi: { streamChatWithTools } as any,
			toolExecutor: {
				execute: vi.fn().mockResolvedValue({
					success: true,
					content: "HEAD-" + "x".repeat(200) + "-TAIL",
				}),
			} as any,
			maxSteps: 2,
			autoApprove: true,
			maxToolResultTokens: 20,
			onTextDelta: vi.fn(),
			onToolCall: vi.fn(),
			requestApproval: vi.fn(),
		});

		await loop.run(
			[{ role: "user", content: "Read the large note" }],
			{},
			new AbortController().signal,
		);

		const followUpMessages = streamChatWithTools.mock.calls[1][0];
		const toolResult = followUpMessages[2].content[0].output.value;
		expect(toolResult).toContain("HEAD-");
		expect(toolResult).toContain("-TAIL");
		expect(toolResult).toContain("tool result truncated");
	});

	it("re-budgets the full history before each tool continuation", async () => {
		const streamChatWithTools = vi
			.fn()
			.mockImplementationOnce(async function* () {
				yield {
					type: "tool-call",
					call: {
						toolCallId: "call-1",
						toolName: "read_note",
						args: { path: "One" },
					},
				};
			})
			.mockImplementationOnce(async function* () {
				yield {
					type: "tool-call",
					call: {
						toolCallId: "call-2",
						toolName: "read_note",
						args: { path: "Two" },
					},
				};
			})
			.mockImplementationOnce(async function* () {
				yield { type: "text-delta", text: "Done" };
			});
		const loop = new AgentLoop({
			chatApi: { streamChatWithTools } as any,
			toolExecutor: {
				execute: vi.fn().mockResolvedValue({
					success: true,
					content: "result-" + "x".repeat(200),
				}),
			} as any,
			maxSteps: 3,
			autoApprove: true,
			maxToolResultTokens: 20,
			maxRequestTokens: 80,
			maxContextMessages: 10,
			preserveRecentMessages: 1,
			requestResponseReserveTokens: 0,
			onTextDelta: vi.fn(),
			onToolCall: vi.fn(),
			requestApproval: vi.fn(),
		});

		await expect(
			loop.run(
				[
					{ role: "system", content: "system" },
					{ role: "user", content: "Read both notes" },
				],
				{},
				new AbortController().signal,
			),
		).rejects.toThrow("tool continuation exceeds");
		expect(streamChatWithTools).toHaveBeenCalledTimes(1);
	});

	it("captures one diagnostic record for each provider step", async () => {
		const streamChatWithTools = vi
			.fn()
			.mockImplementationOnce(async function* () {
				yield {
					type: "tool-call",
					call: {
						toolCallId: "call-1",
						toolName: "read_note",
						args: { path: "Large note" },
					},
				};
				yield {
					type: "finish",
					reason: "tool-calls",
					providerUsage: {
						inputTokens: 100,
						outputTokens: 10,
						totalTokens: 110,
					},
				};
			})
			.mockImplementationOnce(async function* () {
				yield { type: "text-delta", text: "Done" };
				yield {
					type: "finish",
					reason: "stop",
					providerUsage: {
						inputTokens: 120,
						outputTokens: 4,
						totalTokens: 124,
					},
				};
			});
		const loop = new AgentLoop({
			chatApi: { streamChatWithTools } as any,
			toolExecutor: {
				execute: vi.fn().mockResolvedValue({
					success: true,
					content: "x".repeat(200),
				}),
			} as any,
			maxSteps: 2,
			autoApprove: true,
			maxToolResultTokens: 20,
			captureDiagnostics: true,
			onTextDelta: vi.fn(),
			onToolCall: vi.fn(),
			requestApproval: vi.fn(),
		});

		const result = await loop.run(
			[{ role: "user", content: "Read the large note" }],
			{ read_note: { description: "Read a note" } },
			new AbortController().signal,
		);

		expect(result.diagnosticSteps).toHaveLength(2);
		expect(result.diagnosticSteps?.[0].request.payload).toEqual(
			expect.objectContaining({
				messages: [{ role: "user", content: "Read the large note" }],
			}),
		);
		expect(result.diagnosticSteps?.[0].providerUsage).toEqual({
			inputTokens: 100,
			outputTokens: 10,
			totalTokens: 110,
		});
		expect(result.diagnosticSteps?.[0].toolExchanges?.[0].truncated).toBe(
			true,
		);
		expect(result.diagnosticSteps?.[1].continuation).toBe("tool");
		expect(result.diagnosticSteps?.[1].providerUsage?.inputTokens).toBe(
			120,
		);
	});
});
