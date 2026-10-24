import { describe, expect, it, vi } from "vitest";
import type { ChatApiManager } from "../../api";
import type { ProviderProfile } from "../../settings";
import type { ChatMessage } from "../../types";
import { generateSessionTags } from "../sessionTags";

describe("generateSessionTags", () => {
	it("passes an optional abort signal through to the provider call", async () => {
		const callApi = vi.fn().mockResolvedValue('["project planning"]');
		const chatApi = { callApi } as unknown as ChatApiManager;
		const profile = {} as ProviderProfile;
		const messages = [
			{ role: "user", content: "Plan the project" },
		] as ChatMessage[];
		const signal = new AbortController().signal;

		await expect(
			generateSessionTags(messages, profile, chatApi, signal),
		).resolves.toEqual(["project planning"]);
		expect(callApi).toHaveBeenCalledWith(
			expect.any(String),
			expect.stringContaining("Plan the project"),
			profile,
			signal,
		);
	});
});
