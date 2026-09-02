import { describe, expect, it } from "vitest";
import type { ProviderProfile } from "../settings";
import {
	resolveSessionProfile,
	resolveSessionProfileWithSource,
} from "./sessionProfile";

const profile: ProviderProfile = {
	id: "profile-1",
	name: "OpenRouter",
	provider: "openrouter",
	model: "openai/gpt-4o",
	createdAt: 0,
	updatedAt: 0,
};

describe("resolveSessionProfile", () => {
	it("overrides only the model for the requested chat session", () => {
		const resolved = resolveSessionProfile(profile, {
			[profile.id]: "openai/gpt-oss-120b",
		});

		expect(resolved.model).toBe("openai/gpt-oss-120b");
		expect(resolved.provider).toBe(profile.provider);
		expect(profile.model).toBe("openai/gpt-4o");
	});

	it("leaves a profile unchanged when the tab has no override", () => {
		expect(resolveSessionProfile(profile, {})).toBe(profile);
	});

	it("uses the latest assistant model for an older chat", () => {
		const resolved = resolveSessionProfileWithSource(profile, {
			messages: [
				{
					id: "assistant-1",
					role: "assistant",
					content: "Earlier",
					timestamp: 1,
					modelName: "older-model",
				},
				{
					id: "assistant-2",
					role: "assistant",
					content: "Latest",
					timestamp: 2,
					modelName: "latest-model",
				},
			],
		});

		expect(resolved.profile.model).toBe("latest-model");
		expect(resolved.modelSource).toBe("history");
	});

	it("keeps an explicit tab choice ahead of chat history", () => {
		const resolved = resolveSessionProfileWithSource(profile, {
			modelOverrides: { [profile.id]: "tab-model" },
			messages: [
				{
					id: "assistant-1",
					role: "assistant",
					content: "Latest",
					timestamp: 1,
					modelName: "historical-model",
				},
			],
		});

		expect(resolved.profile.model).toBe("tab-model");
		expect(resolved.modelSource).toBe("override");
	});

	it("does not use another agent's history", () => {
		const resolved = resolveSessionProfileWithSource(profile, {
			historyAgentId: "agent-a",
			messages: [
				{
					id: "assistant-1",
					role: "assistant",
					content: "Other agent",
					timestamp: 1,
					modelName: "other-model",
					agentId: "agent-b",
				},
			],
		});

		expect(resolved.profile).toBe(profile);
		expect(resolved.modelSource).toBe("profile-default");
	});
});
