import { describe, expect, it, vi } from "vitest";
import { AgentLoop } from "../AgentLoop";

describe("AgentLoop", () => {
	it("preserves Gemini tool-call metadata for the next tool step", async () => {
		const streamChatWithTools = vi.fn()
			.mockImplementationOnce(async function* () {
				yield {
					type: "tool-call",
					call: {
						toolCallId: "call-1",
						toolName: "read_note",
						args: { path: "Vocabulary" },
						providerMetadata: { google: { thoughtSignature: "opaque-signature" } },
					},
				};
			})
			.mockImplementationOnce(async function* () {
				yield { type: "text-delta", text: "Done" };
			});
		const execute = vi.fn().mockResolvedValue({ success: true, content: "# Vocabulary" });
		const loop = new AgentLoop({
			chatApi: { streamChatWithTools } as any,
			toolExecutor: { execute } as any,
			maxSteps: 2,
			autoApprove: true,
			onTextDelta: vi.fn(),
			onToolCall: vi.fn(),
			requestApproval: vi.fn(),
		});

		await loop.run([{ role: "user", content: "Read Vocabulary" }], {}, new AbortController().signal);

		const followUpMessages = streamChatWithTools.mock.calls[1][0];
		const assistantToolPart = followUpMessages[1].content[0];
		expect(assistantToolPart.providerMetadata).toEqual({ google: { thoughtSignature: "opaque-signature" } });
	});
});
