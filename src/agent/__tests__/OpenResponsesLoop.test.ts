import { describe, expect, it, vi } from "vitest";
import { OpenResponsesLoop } from "../OpenResponsesLoop";

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
});
