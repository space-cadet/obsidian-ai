import { describe, expect, it, vi } from "vitest";
import { OpenResponsesLoop } from "../OpenResponsesLoop";
import { estimateTokens } from "../../context/tokenEstimator";

describe("OpenResponsesLoop", () => {
	it("bounds an oversized result in the immediate continuation", async () => {
		let continuationOutputs: Array<{
			call_id: string;
			output: string;
		}> = [];
		const agentApi = {
			streamAgentResponse: vi
				.fn()
				.mockImplementationOnce(async function* () {
					yield {
						type: "function_call_done",
						call_id: "call-large",
						name: "read_note",
						arguments: JSON.stringify({ path: "Large note" }),
					};
					yield { type: "finish", response_id: "response-1" };
				})
				.mockImplementationOnce(async function* () {
					yield { type: "text-delta", delta: "Done" };
					yield { type: "finish", response_id: "response-2" };
				}),
			continueWithToolResult: vi.fn().mockImplementation(async function* (
				_responseId: string,
				outputs: Array<{ call_id: string; output: string }>,
			) {
				continuationOutputs = outputs;
				yield { type: "text-delta", delta: "Done" };
				yield { type: "finish", response_id: "response-2" };
			}),
		};
		const loop = new OpenResponsesLoop({
			agentApi: agentApi as any,
			toolExecutor: {
				execute: vi.fn().mockResolvedValue({
					success: true,
					content: "HEAD-" + "x".repeat(200) + "-TAIL",
				}),
			} as any,
			maxSteps: 2,
			autoApprove: true,
			maxToolResultTokens: 30,
		});

		await loop.run([], [], new AbortController().signal);

		expect(continuationOutputs).toHaveLength(1);
		expect(continuationOutputs[0].output).toContain("-TAIL");
		expect(continuationOutputs[0].output).toContain(
			"tool result truncated",
		);
	});

	it("shares the continuation budget across parallel tool results", async () => {
		let continuationOutputs: Array<{
			call_id: string;
			output: string;
		}> = [];
		const agentApi = {
			streamAgentResponse: vi
				.fn()
				.mockImplementationOnce(async function* () {
					yield {
						type: "function_call_done",
						call_id: "call-one",
						name: "read_note",
						arguments: JSON.stringify({ path: "One" }),
					};
					yield {
						type: "function_call_done",
						call_id: "call-two",
						name: "read_note",
						arguments: JSON.stringify({ path: "Two" }),
					};
					yield { type: "finish", response_id: "response-1" };
				})
				.mockImplementationOnce(async function* () {
					yield { type: "text-delta", delta: "Done" };
					yield { type: "finish", response_id: "response-2" };
				}),
			continueWithToolResult: vi.fn().mockImplementation(async function* (
				_responseId: string,
				outputs: Array<{ call_id: string; output: string }>,
			) {
				continuationOutputs = outputs;
				yield { type: "text-delta", delta: "Done" };
				yield { type: "finish", response_id: "response-2" };
			}),
		};
		const loop = new OpenResponsesLoop({
			agentApi: agentApi as any,
			toolExecutor: {
				execute: vi.fn().mockResolvedValue({
					success: true,
					content: "result-" + "x".repeat(200),
				}),
			} as any,
			maxSteps: 2,
			autoApprove: true,
			maxToolResultTokens: 30,
			requestResponseReserveTokens: 40,
		});

		await loop.run([], [], new AbortController().signal);

		expect(continuationOutputs).toHaveLength(2);
		expect(
			continuationOutputs.reduce(
				(sum, output) => sum + estimateTokens(output.output),
				0,
			),
		).toBeLessThanOrEqual(40);
	});

	it("uses stateful continuations for multi-round tool calls", async () => {
		const tools = [
			{
				type: "function" as const,
				function: { name: "read_note" },
			},
		];
		const signal = new AbortController().signal;
		const streamAgentResponse = vi
			.fn()
			.mockImplementation(async function* () {
				yield {
					type: "function_call_done",
					call_id: "call-one",
					name: "read_note",
					arguments: JSON.stringify({ path: "One" }),
				};
				yield { type: "finish", response_id: "response-1" };
			});
		const continueWithToolResult = vi
			.fn()
			.mockImplementationOnce(async function* () {
				yield {
					type: "function_call_done",
					call_id: "call-two",
					name: "read_note",
					arguments: JSON.stringify({ path: "Two" }),
				};
				yield { type: "finish", response_id: "response-2" };
			})
			.mockImplementationOnce(async function* () {
				yield { type: "text-delta", delta: "Done" };
				yield { type: "finish", response_id: "response-3" };
			});
		const toolExecutor = {
			execute: vi.fn().mockResolvedValue({
				success: true,
				content: "note content",
			}),
		};
		const loop = new OpenResponsesLoop({
			agentApi: {
				streamAgentResponse,
				continueWithToolResult,
			} as any,
			toolExecutor: toolExecutor as any,
			maxSteps: 3,
			autoApprove: true,
		});

		await expect(
			loop.run(
				[{ role: "user", content: "original request" }],
				tools,
				signal,
			),
		).resolves.toBe("Done");

		expect(streamAgentResponse).toHaveBeenCalledTimes(1);
		expect(continueWithToolResult).toHaveBeenCalledTimes(2);
		expect(continueWithToolResult).toHaveBeenNthCalledWith(
			1,
			"response-1",
			expect.arrayContaining([
				expect.objectContaining({ call_id: "call-one" }),
			]),
			tools,
			signal,
		);
		expect(continueWithToolResult).toHaveBeenNthCalledWith(
			2,
			"response-2",
			expect.arrayContaining([
				expect.objectContaining({ call_id: "call-two" }),
			]),
			tools,
			signal,
		);
		expect(toolExecutor.execute).toHaveBeenCalledTimes(2);
	});

	it("does not execute malformed JSON tool arguments", async () => {
		const execute = vi.fn();
		const loop = new OpenResponsesLoop({
			agentApi: {
				streamAgentResponse: vi
					.fn()
					.mockImplementation(async function* () {
						yield {
							type: "function_call_done",
							call_id: "bad-call",
							name: "read_note",
							arguments: "{not-json}",
						};
						yield { type: "finish", response_id: "response-1" };
					}),
				continueWithToolResult: vi
					.fn()
					.mockImplementation(async function* () {
						yield { type: "text-delta", delta: "Handled" };
						yield { type: "finish", response_id: "response-2" };
					}),
			} as any,
			toolExecutor: { execute } as any,
			maxSteps: 1,
			autoApprove: true,
		});

		await expect(
			loop.run([], [], new AbortController().signal),
		).resolves.toBe("Handled");
		expect(execute).not.toHaveBeenCalled();
	});

	it("surfaces cancellation instead of treating it as a completed response", async () => {
		const controller = new AbortController();
		const loop = new OpenResponsesLoop({
			agentApi: {
				streamAgentResponse: vi.fn(async function* () {
					yield { type: "text-delta", delta: "Partial" };
					controller.abort();
					yield { type: "finish", response_id: "response-1" };
				}),
				continueWithToolResult: vi.fn(),
			} as any,
			toolExecutor: { execute: vi.fn() } as any,
			maxSteps: 1,
			autoApprove: true,
		});

		await expect(loop.run([], [], controller.signal)).rejects.toMatchObject(
			{
				name: "AbortError",
			},
		);
	});
});
