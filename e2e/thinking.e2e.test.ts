import { describe, expect } from "vitest";
import { ChatApiManager } from "../src/api";
import type { SdkMessage } from "../src/api";
import {
  buildTestProfile,
  buildTestSettings,
  createMockApp,
  describeIfProvider,
} from "./setup";

async function collectStream(
  generator: AsyncIterable<string>
): Promise<string> {
  let text = "";
  for await (const chunk of generator) {
    text += chunk;
  }
  return text;
}

describe("E2E: Thinking / Reasoning Mode", () => {
  describeIfProvider("deepseek", "DeepSeek", () => {
    it("streams with reasoning enabled (deepseek-chat)", async () => {
      const profile = buildTestProfile("deepseek");
      const settings = buildTestSettings(profile);
      const api = new ChatApiManager(settings, createMockApp());
      const messages: SdkMessage[] = [
        { role: "user", content: "What is 2 + 2?" },
      ];
      const text = await collectStream(
        api.streamChat(messages, undefined, profile, true)
      );
      expect(text.toLowerCase()).toContain("4");
    });
  });

  describeIfProvider("anthropic", "Anthropic", () => {
    it("streams with extended thinking enabled (Claude 3.7)", async () => {
      const profile = buildTestProfile("anthropic", {
        model: "claude-3-7-sonnet-latest",
      });
      const settings = buildTestSettings(profile);
      const api = new ChatApiManager(settings, createMockApp());
      const messages: SdkMessage[] = [
        { role: "user", content: "What is 2 + 2?" },
      ];
      const text = await collectStream(
        api.streamChat(messages, undefined, profile, true)
      );
      expect(text.toLowerCase()).toContain("4");
    });
  });
});
