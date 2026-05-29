import { describe, expect } from "vitest";
import { ChatApiManager } from "../src/api";
import {
  buildTestProfile,
  buildTestSettings,
  createMockApp,
  describeIfProvider,
} from "./setup";

describe("E2E: Model Discovery", () => {
  describeIfProvider("openai", "OpenAI", () => {
    it("fetches a non-empty list of models", async () => {
      const profile = buildTestProfile("openai");
      const settings = buildTestSettings(profile);
      const api = new ChatApiManager(settings, createMockApp());
      const models = await api.fetchModels(profile);
      expect(models.length).toBeGreaterThan(0);
      expect(models.some((m) => m.includes("gpt"))).toBe(true);
    });
  });

  describeIfProvider("anthropic", "Anthropic", () => {
    it("returns the hardcoded Anthropic model list", async () => {
      const profile = buildTestProfile("anthropic");
      const settings = buildTestSettings(profile);
      const api = new ChatApiManager(settings, createMockApp());
      const models = await api.fetchModels(profile);
      expect(models.length).toBeGreaterThan(0);
      expect(models).toContain("claude-3-5-sonnet-latest");
    });
  });

  describeIfProvider("gemini", "Gemini", () => {
    it("fetches a non-empty list of Gemini models", async () => {
      const profile = buildTestProfile("gemini");
      const settings = buildTestSettings(profile);
      const api = new ChatApiManager(settings, createMockApp());
      const models = await api.fetchModels(profile);
      expect(models.length).toBeGreaterThan(0);
      expect(models.some((m) => m.startsWith("gemini"))).toBe(true);
    });
  });

  describeIfProvider("deepseek", "DeepSeek", () => {
    it("fetches a non-empty list of models", async () => {
      const profile = buildTestProfile("deepseek");
      const settings = buildTestSettings(profile);
      const api = new ChatApiManager(settings, createMockApp());
      const models = await api.fetchModels(profile);
      expect(models.length).toBeGreaterThan(0);
    });
  });

  describeIfProvider("kimi", "Kimi", () => {
    it("fetches a non-empty list of models", async () => {
      const profile = buildTestProfile("kimi");
      const settings = buildTestSettings(profile);
      const api = new ChatApiManager(settings, createMockApp());
      const models = await api.fetchModels(profile);
      expect(models.length).toBeGreaterThan(0);
      expect(models.some((m) => m.includes("kimi"))).toBe(true);
    });
  });

  describeIfProvider("openrouter", "OpenRouter", () => {
    it("fetches a non-empty list of models", async () => {
      const profile = buildTestProfile("openrouter");
      const settings = buildTestSettings(profile);
      const api = new ChatApiManager(settings, createMockApp());
      const models = await api.fetchModels(profile);
      expect(models.length).toBeGreaterThan(0);
    });
  });
});
