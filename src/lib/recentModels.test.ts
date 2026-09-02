import { describe, expect, it } from "vitest";
import { MAX_RECENT_MODELS, rememberRecentModel } from "./recentModels";

describe("rememberRecentModel", () => {
	it("keeps ten models newest first and removes duplicates", () => {
		let recent: Record<string, string[]> = {};
		for (let i = 0; i < MAX_RECENT_MODELS + 2; i++) {
			recent = rememberRecentModel(
				recent,
				"profile-1",
				"openai",
				`model-${i}`,
			);
		}

		recent = rememberRecentModel(recent, "profile-1", "openai", "model-3");

		expect(recent["profile-1"]).toHaveLength(MAX_RECENT_MODELS);
		expect(recent["profile-1"]?.[0]).toBe("model-3");
		expect(new Set(recent["profile-1"] ?? []).size).toBe(
			MAX_RECENT_MODELS,
		);
	});

	it("materializes legacy provider recents under the profile", () => {
		const recent = rememberRecentModel(
			{ openai: ["gpt-4o", "gpt-4o-mini"] },
			"profile-1",
			"openai",
			"gpt-4o-mini",
		);

		expect(recent["profile-1"]).toEqual(["gpt-4o-mini", "gpt-4o"]);
	});
});
