import { describe, expect, it } from "vitest";
import type { ProviderProfile } from "../settings";
import { resolveSessionProfile } from "./sessionProfile";

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
});
