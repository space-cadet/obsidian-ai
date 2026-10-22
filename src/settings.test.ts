import { describe, expect, it } from "vitest";
import {
	DEFAULT_MAX_PARALLEL_CHAT_SESSIONS,
	DEFAULT_SETTINGS,
	normalizeSettings,
} from "./settings";

describe("parallel chat session setting", () => {
	it("defaults to five sessions", () => {
		expect(DEFAULT_SETTINGS.maxParallelChatSessions).toBe(
			DEFAULT_MAX_PARALLEL_CHAT_SESSIONS,
		);
		expect(normalizeSettings(undefined).maxParallelChatSessions).toBe(5);
	});

	it("normalizes configured values to the supported range", () => {
		expect(
			normalizeSettings({ maxParallelChatSessions: 0 })
				.maxParallelChatSessions,
		).toBe(1);
		expect(
			normalizeSettings({ maxParallelChatSessions: 7.8 })
				.maxParallelChatSessions,
		).toBe(8);
		expect(
			normalizeSettings({ maxParallelChatSessions: 50 })
				.maxParallelChatSessions,
		).toBe(10);
	});
});
