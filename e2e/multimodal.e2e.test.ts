import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
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

// PDF tests — requires a real PDF file at e2e/fixtures/test.pdf
// NOTE: PDF support is currently only available for Gemini native provider.
// The Vercel AI SDK does not support `file` content parts natively.
// OpenRouter and other providers do not support PDF file content parts.
describe("E2E: Multimodal (PDF)", () => {
  const pdfPath = join(__dirname, "fixtures", "test.pdf");
  let pdfExists = false;

  try {
    readFileSync(pdfPath);
    pdfExists = true;
  } catch {
    // PDF file does not exist
  }

  const describeIfPdf = pdfExists ? describe : describe.skip;

  describeIfPdf("E2E: Multimodal (PDF)", () => {
    describeIfProvider("gemini", "Gemini", () => {
      it.skip("PDF support requires Vercel AI SDK file content part support (currently unsupported)", () => {});
    });
  });
});
