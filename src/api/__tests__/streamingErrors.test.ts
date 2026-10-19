import { describe, expect, it, vi } from "vitest";
const { streamTextMock } = vi.hoisted(() => ({ streamTextMock: vi.fn() }));
vi.mock("ai", () => ({
	streamText: streamTextMock,
	isStepCount: () => () => true,
}));
vi.mock("../providers", () => ({
	createLanguageModel: () => ({}),
	getThinkingProviderOptions: () => undefined,
	normalizeProviderUsage: (usage: unknown) => usage,
}));
import { streamChatWithTools } from "../streaming";

describe("tool stream errors", () => {
	it("reports an actual SDK request failure without an unhandled no-output rejection", async () => {
		const actual = await vi.importActual<typeof import("ai")>("ai");
		streamTextMock.mockImplementation((options) =>
			actual.streamText({
				...options,
				maxRetries: 0,
				model: {
					specificationVersion: "v4",
					provider: "test",
					modelId: "test",
					supportedUrls: {},
					doStream: async () => {
						throw new Error("Invalid tool name");
					},
				} as any,
			}),
		);
		const events = [];
		for await (const event of streamChatWithTools(
			[{ role: "user", content: "Hello" }],
			{},
			undefined,
			{ provider: "codex" } as any,
			"provider-default",
		))
			events.push(event);
		expect(events).toContainEqual({
			type: "error",
			message: "Error: Invalid tool name",
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
	});

	it("settles the SDK stream before reporting the original API error", async () => {
		let settled = false;
		streamTextMock.mockReturnValue({
			stream: (async function* () {
				yield { type: "error", error: new Error("Invalid tool name") };
				settled = true;
			})(),
		});
		const stream = streamChatWithTools(
			[],
			{},
			undefined,
			{ provider: "codex" } as any,
			"provider-default",
		);
		const event = await stream[Symbol.asyncIterator]().next();
		expect(settled).toBe(true);
		expect(event.value).toEqual({
			type: "error",
			message: "Error: Invalid tool name",
		});
	});
});
