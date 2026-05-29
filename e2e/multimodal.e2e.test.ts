import { describe, expect, it } from "vitest";
import { ChatApiManager } from "../src/api";
import type { SdkMessage } from "../src/api";
import {
  buildTestProfile,
  buildTestSettings,
  createMockApp,
  describeIfProvider,
} from "./setup";

const TEST_IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("E2E: Multimodal (Image)", () => {
  describeIfProvider("gemini", "Gemini", () => {
    it("streams a response that references image content", async () => {
      const profile = buildTestProfile("gemini");
      const settings = buildTestSettings(profile);
      const api = new ChatApiManager(settings, createMockApp());
      const messages: SdkMessage[] = [
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this image in one word." },
            { type: "image", image: TEST_IMAGE_BASE64 },
          ],
        },
      ];
      let text = "";
      for await (const chunk of api.streamChat(messages, undefined, profile)) {
        text += chunk;
      }
      expect(text.length).toBeGreaterThan(0);
      expect(text.toLowerCase()).toMatch(/red|square|pixel|image|color/);
    });
  });

  describeIfProvider("openai", "OpenAI", () => {
    it("streams a response that references image content (GPT-4o vision)", async () => {
      const profile = buildTestProfile("openai", { model: "gpt-4o-mini" });
      const settings = buildTestSettings(profile);
      const api = new ChatApiManager(settings, createMockApp());
      const messages: SdkMessage[] = [
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this image in one word." },
            { type: "image", image: TEST_IMAGE_BASE64 },
          ],
        },
      ];
      let text = "";
      for await (const chunk of api.streamChat(messages, undefined, profile)) {
        text += chunk;
      }
      expect(text.length).toBeGreaterThan(0);
    });
  });

  describeIfProvider("anthropic", "Anthropic", () => {
    it("streams a response that references image content (Claude vision)", async () => {
      const profile = buildTestProfile("anthropic", {
        model: "claude-3-5-haiku-latest",
      });
      const settings = buildTestSettings(profile);
      const api = new ChatApiManager(settings, createMockApp());
      const messages: SdkMessage[] = [
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this image in one word." },
            { type: "image", image: TEST_IMAGE_BASE64 },
          ],
        },
      ];
      let text = "";
      for await (const chunk of api.streamChat(messages, undefined, profile)) {
        text += chunk;
      }
      expect(text.length).toBeGreaterThan(0);
    });
  });

  describeIfProvider("openrouter", "OpenRouter", () => {
    it("streams a response that references image content via OpenRouter (Gemini)", async () => {
      const profile = buildTestProfile("openrouter", {
        model: "google/gemini-2.0-flash-001",
      });
      const settings = buildTestSettings(profile);
      const api = new ChatApiManager(settings, createMockApp());
      const messages: SdkMessage[] = [
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this image in one word." },
            { type: "image", image: TEST_IMAGE_BASE64 },
          ],
        },
      ];
      let text = "";
      for await (const chunk of api.streamChat(messages, undefined, profile)) {
        text += chunk;
      }
      expect(text.length).toBeGreaterThan(0);
      expect(text.toLowerCase()).toMatch(/red|square|pixel|image|color/);
    });
  });
});

// PDF tests require a real PDF file on disk. Place a test PDF at:
// e2e/fixtures/test.pdf
// Then uncomment and run the tests below.
describe("E2E: Multimodal (PDF) — SKIPPED", () => {
  it.skip("requires a real PDF file at e2e/fixtures/test.pdf", () => {});
});
