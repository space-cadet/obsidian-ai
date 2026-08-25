import { describe, expect, it, vi } from "vitest";
import { AgentApiManager } from "../AgentApiManager";

describe("AgentApiManager", () => {
	it("serializes stateful continuation requests", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			body: new ReadableStream({
				start(controller) {
					controller.enqueue(
						new TextEncoder().encode(
							'event: response.completed\ndata: {"id":"response-2","usage":{}}\n\n',
						),
					);
					controller.close();
				},
			}),
		});
		vi.stubGlobal("fetch", fetchMock);

		const tools = [
			{
				type: "function" as const,
				function: { name: "read_note" },
			},
		];
		const manager = new AgentApiManager(
			{
				id: "agent",
				name: "Agent",
				provider: "agent",
				endpointUrl: "https://agent.example.com/v1/responses",
				agentId: "main",
				autoApprove: true,
				maxSteps: 3,
				model: "openclaw",
			},
			{} as any,
		);

		for await (const _event of manager.continueWithToolResult(
			"response-1",
			[
				{
					call_id: "call-1",
					output: '{"success":true}',
				},
			],
			tools,
		)) {
			// Consume the stream to execute the request.
		}

		const request = fetchMock.mock.calls[0][1] as RequestInit;
		const body = JSON.parse(request.body as string);
		expect(body.previous_response_id).toBe("response-1");
		expect(body.tools).toEqual(tools);
		expect(body.input).toEqual([
			{
				type: "function_call_output",
				call_id: "call-1",
				output: '{"success":true}',
			},
		]);
	});
});
