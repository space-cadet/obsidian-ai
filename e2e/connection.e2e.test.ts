import { describe, expect } from "vitest";
import { ChatApiManager } from "../src/api";
import {
	buildTestProfile,
	buildTestSettings,
	createMockApp,
	describeIfProvider,
} from "./setup";

describe("E2E: API Connection", () => {
	describeIfProvider("openai", "OpenAI", () => {
		it("connects and responds to a lightweight test call", async () => {
			const profile = buildTestProfile("openai");
			const settings = buildTestSettings(profile);
			const api = new ChatApiManager(settings, createMockApp());
			const result = await api.testApiConnection();
			expect(result.ok).toBe(true);
			expect(result.message).toContain("connected");
		});
	});

	describeIfProvider("anthropic", "Anthropic", () => {
		it("connects and responds to a lightweight test call", async () => {
			const profile = buildTestProfile("anthropic");
			const settings = buildTestSettings(profile);
			const api = new ChatApiManager(settings, createMockApp());
			const result = await api.testApiConnection();
			expect(result.ok).toBe(true);
			expect(result.message).toContain("connected");
		});
	});

	describeIfProvider("gemini", "Gemini", () => {
		it("connects and responds to a lightweight test call", async () => {
			const profile = buildTestProfile("gemini");
			const settings = buildTestSettings(profile);
			const api = new ChatApiManager(settings, createMockApp());
			const result = await api.testApiConnection();
			expect(result.ok).toBe(true);
			expect(result.message).toContain("connected");
		});
	});

	describeIfProvider("deepseek", "DeepSeek", () => {
		it("connects and responds to a lightweight test call", async () => {
			const profile = buildTestProfile("deepseek");
			const settings = buildTestSettings(profile);
			const api = new ChatApiManager(settings, createMockApp());
			const result = await api.testApiConnection();
			expect(result.ok).toBe(true);
			expect(result.message).toContain("connected");
		});
	});

	describeIfProvider("kimi", "Kimi", () => {
		it("connects and responds to a lightweight test call", async () => {
			const profile = buildTestProfile("kimi");
			const settings = buildTestSettings(profile);
			const api = new ChatApiManager(settings, createMockApp());
			const result = await api.testApiConnection();
			expect(result.ok).toBe(true);
			expect(result.message).toContain("connected");
		});
	});

	describeIfProvider("openrouter", "OpenRouter", () => {
		it("connects and responds to a lightweight test call", async () => {
			const profile = buildTestProfile("openrouter");
			const settings = buildTestSettings(profile);
			const api = new ChatApiManager(settings, createMockApp());
			const result = await api.testApiConnection();
			expect(result.ok).toBe(true);
			expect(result.message).toContain("connected");
		});
	});
});
