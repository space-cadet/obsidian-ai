import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ChatApiManager } from "../src/api";
import type { SdkMessage } from "../src/api";
import {
	buildTestProfile,
	buildTestSettings,
	createMockApp,
	describeIfProvider,
} from "./setup";

/**
 * Collect all text chunks from a streamChat generator.
 */
async function collectStream(
	generator: AsyncIterable<string>,
): Promise<string> {
	let text = "";
	for await (const chunk of generator) {
		text += chunk;
	}
	return text;
}

describe("E2E: Streaming Chat", () => {
	describeIfProvider("openai", "OpenAI", () => {
		it("streams a simple greeting response", async () => {
			const profile = buildTestProfile("openai");
			const settings = buildTestSettings(profile);
			const api = new ChatApiManager(settings, createMockApp());
			const messages: SdkMessage[] = [
				{ role: "user", content: "Say 'hello' and nothing else." },
			];
			const text = await collectStream(
				api.streamChat(messages, undefined, profile),
			);
			expect(text.toLowerCase()).toContain("hello");
		});
	});

	describeIfProvider("anthropic", "Anthropic", () => {
		it("streams a simple greeting response", async () => {
			const profile = buildTestProfile("anthropic");
			const settings = buildTestSettings(profile);
			const api = new ChatApiManager(settings, createMockApp());
			const messages: SdkMessage[] = [
				{ role: "user", content: "Say 'hello' and nothing else." },
			];
			const text = await collectStream(
				api.streamChat(messages, undefined, profile),
			);
			expect(text.toLowerCase()).toContain("hello");
		});
	});

	describeIfProvider("gemini", "Gemini", () => {
		it("streams a simple greeting response", async () => {
			const profile = buildTestProfile("gemini");
			const settings = buildTestSettings(profile);
			const api = new ChatApiManager(settings, createMockApp());
			const messages: SdkMessage[] = [
				{ role: "user", content: "Say 'hello' and nothing else." },
			];
			const text = await collectStream(
				api.streamChat(messages, undefined, profile),
			);
			expect(text.toLowerCase()).toContain("hello");
		});
	});

	describeIfProvider("deepseek", "DeepSeek", () => {
		it("streams a simple greeting response", async () => {
			const profile = buildTestProfile("deepseek");
			const settings = buildTestSettings(profile);
			const api = new ChatApiManager(settings, createMockApp());
			const messages: SdkMessage[] = [
				{ role: "user", content: "Say 'hello' and nothing else." },
			];
			const text = await collectStream(
				api.streamChat(messages, undefined, profile),
			);
			expect(text.toLowerCase()).toContain("hello");
		});
	});

	describeIfProvider("kimi", "Kimi", () => {
		it("streams a simple greeting response", async () => {
			const profile = buildTestProfile("kimi");
			const settings = buildTestSettings(profile);
			const api = new ChatApiManager(settings, createMockApp());
			const messages: SdkMessage[] = [
				{ role: "user", content: "Say 'hello' and nothing else." },
			];
			const text = await collectStream(
				api.streamChat(messages, undefined, profile),
			);
			expect(text.toLowerCase()).toContain("hello");
		});
	});
});

describe("E2E: Tool Calling", () => {
	const calculatorTool = {
		calculate: {
			description: "Add two numbers",
			parameters: z.object({
				a: z.number().describe("First number"),
				b: z.number().describe("Second number"),
			}),
			execute: async ({ a, b }: { a: number; b: number }) => ({
				result: a + b,
			}),
		},
	};

	describeIfProvider("openai", "OpenAI", () => {
		it("calls the calculator tool and returns a result", async () => {
			const profile = buildTestProfile("openai");
			const settings = buildTestSettings(profile);
			const api = new ChatApiManager(settings, createMockApp());
			const messages: SdkMessage[] = [
				{
					role: "user",
					content:
						"Use the calculator tool to add 17 and 25. Only return the final number.",
				},
			];

			const events: any[] = [];
			for await (const event of api.streamChatWithTools(
				messages,
				calculatorTool,
				undefined,
				profile,
			)) {
				events.push(event);
			}

			const toolCall = events.find((e) => e.type === "tool-call");
			expect(toolCall).toBeDefined();
			expect(toolCall.call.toolName).toBe("calculate");

			const toolResult = events.find((e) => e.type === "tool-result");
			expect(toolResult).toBeDefined();
			expect(toolResult.result.result).toBe(42);
		});
	});

	describeIfProvider("anthropic", "Anthropic", () => {
		it("calls the calculator tool and returns a result", async () => {
			const profile = buildTestProfile("anthropic");
			const settings = buildTestSettings(profile);
			const api = new ChatApiManager(settings, createMockApp());
			const messages: SdkMessage[] = [
				{
					role: "user",
					content:
						"Use the calculator tool to add 17 and 25. Only return the final number.",
				},
			];

			const events: any[] = [];
			for await (const event of api.streamChatWithTools(
				messages,
				calculatorTool,
				undefined,
				profile,
			)) {
				events.push(event);
			}

			const toolCall = events.find((e) => e.type === "tool-call");
			expect(toolCall).toBeDefined();
			expect(toolCall.call.toolName).toBe("calculate");

			const toolResult = events.find((e) => e.type === "tool-result");
			expect(toolResult).toBeDefined();
			expect(toolResult.result.result).toBe(42);
		});
	});

	describeIfProvider("gemini", "Gemini", () => {
		it("calls the calculator tool and returns a result", async () => {
			const profile = buildTestProfile("gemini");
			const settings = buildTestSettings(profile);
			const api = new ChatApiManager(settings, createMockApp());
			const messages: SdkMessage[] = [
				{
					role: "user",
					content:
						"Use the calculator tool to add 17 and 25. Only return the final number.",
				},
			];

			const events: any[] = [];
			for await (const event of api.streamChatWithTools(
				messages,
				calculatorTool,
				undefined,
				profile,
			)) {
				events.push(event);
			}

			const toolCall = events.find((e) => e.type === "tool-call");
			expect(toolCall).toBeDefined();
			expect(toolCall.call.toolName).toBe("calculate");

			const toolResult = events.find((e) => e.type === "tool-result");
			expect(toolResult).toBeDefined();
			expect(toolResult.result.result).toBe(42);
		});
	});
});
