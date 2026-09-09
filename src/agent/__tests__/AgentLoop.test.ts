import { describe, expect, it, vi } from "vitest";
import { AgentLoop } from "../AgentLoop";

describe("AgentLoop", () => {
	it("captures per-step request and provider telemetry when enabled", async () => {
		const streamChatWithTools = vi
			.fn()
			.mockImplementationOnce(async function* () {
				yield {
					type: "tool-call",
					call: {
						toolCallId: "call-telemetry",
						toolName: "read_note",
						args: { path: "Telemetry" },
					},
				};
				yield {
					type: "finish",
					providerUsage: {
						inputTokens: 120,
						outputTokens: 12,
						totalTokens: 132,
						cachedInputTokens: 40,
					},
				};
			})
			.mockImplementationOnce(async function* () {
				yield {
					type: "finish",
					providerUsage: {
						inputTokens: 140,
						outputTokens: 8,
						totalTokens: 148,
						cachedInputTokens: 60,
					},
				};
				yield { type: "text-delta", text: "Done" };
			});
		const loop = new AgentLoop({
			chatApi: { streamChatWithTools } as any,
			toolExecutor: {
				execute: vi
					.fn()
					.mockResolvedValue({ success: true, content: "result" }),
			} as any,
			maxSteps: 2,
			autoApprove: true,
			captureStepTelemetry: true,
			onTextDelta: vi.fn(),
			onToolCall: vi.fn(),
			requestApproval: vi.fn(),
		});

		const result = await loop.run(
			[{ role: "user", content: "Hello" }],
			{ read_note: { description: "Read a note" } },
			new AbortController().signal,
		);

		expect(result.stepTelemetry).toHaveLength(2);
		expect(result.stepTelemetry?.[0]).toMatchObject({
			step: 0,
			toolSchemaTokens: expect.any(Number),
			historyTokens: expect.any(Number),
			continuationTokens: 0,
			toolResultTokens: expect.any(Number),
			providerUsage: {
				inputTokens: 120,
				cachedInputTokens: 40,
			},
		});
		expect(result.stepTelemetry?.[1]).toMatchObject({
			step: 1,
			continuationTokens: expect.any(Number),
			toolResultTokens: 0,
			providerUsage: {
				inputTokens: 140,
				cachedInputTokens: 60,
			},
		});
		expect(result.providerUsage).toMatchObject({
			inputTokens: 260,
			cachedInputTokens: 100,
			totalTokens: 280,
		});
	});

	it("preserves and executes every tool call emitted in one step", async () => {
		const firstCall: import("../types").ToolCall = {
			toolCallId: "call-one",
			toolName: "read_note",
			args: { path: "One" },
		};
		const secondCall: import("../types").ToolCall = {
			toolCallId: "call-two",
			toolName: "read_note",
			args: { path: "Two" },
		};
		const streamChatWithTools = vi
			.fn()
			.mockImplementationOnce(async function* () {
				yield { type: "tool-call", call: firstCall };
				yield { type: "tool-call", call: secondCall };
			})
			.mockImplementationOnce(async function* () {
				yield { type: "text-delta", text: "Both notes read." };
			});
		const execute = vi
			.fn()
			.mockResolvedValueOnce({ success: true, content: "First note" })
			.mockResolvedValueOnce({ success: true, content: "Second note" });
		const onToolCall = vi.fn();
		const onToolResult = vi.fn();
		const loop = new AgentLoop({
			chatApi: { streamChatWithTools } as any,
			toolExecutor: { execute } as any,
			maxSteps: 2,
			autoApprove: true,
			onTextDelta: vi.fn(),
			onToolCall,
			onToolResult,
			requestApproval: vi.fn(),
		});

		await loop.run(
			[{ role: "user", content: "Read both notes" }],
			{},
			new AbortController().signal,
		);

		expect(onToolCall.mock.calls.map(([call]) => call.toolCallId)).toEqual([
			"call-one",
			"call-two",
		]);
		expect(execute.mock.calls.map(([call]) => call.toolCallId)).toEqual([
			"call-one",
			"call-two",
		]);
		expect(
			onToolResult.mock.calls.map(([call]) => call.toolCallId),
		).toEqual(["call-one", "call-two"]);

		const followUpMessages = streamChatWithTools.mock.calls[1][0];
		expect(
			followUpMessages[1].content.map(
				(part: { type: string; toolCallId: string }) => part.toolCallId,
			),
		).toEqual(["call-one", "call-two"]);
		expect(
			followUpMessages[2].content.map(
				(part: { type: string; toolCallId: string }) => part.toolCallId,
			),
		).toEqual(["call-one", "call-two"]);
	});

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
		const onToolResult = vi.fn();
		const loop = new AgentLoop({
			chatApi: { streamChatWithTools } as any,
			toolExecutor: {
				execute: vi.fn().mockResolvedValue({
					success: true,
					content: "HEAD-" + "x".repeat(1200) + "-TAIL",
				}),
			} as any,
			maxSteps: 2,
			autoApprove: true,
			sessionId: "session-1",
			maxToolResultTokens: 100,
			onTextDelta: vi.fn(),
			onToolCall: vi.fn(),
			onToolResult,
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
		expect(toolResult).toContain("read_tool_result");
		expect(onToolResult).toHaveBeenCalledWith(
			expect.objectContaining({ toolCallId: "call-large" }),
			expect.objectContaining({
				result_reference: expect.objectContaining({
					session_id: "session-1",
					tool_call_id: "call-large",
				}),
			}),
		);
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
});
