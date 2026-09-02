import { describe, expect, it } from "vitest";
import {
	getRecentModels,
	MAX_RECENT_MODELS,
	migrateRecentModelsToProviders,
	rememberRecentModel,
} from "./recentModels";

describe("rememberRecentModel", () => {
	it("keeps ten models newest first and removes duplicates", () => {
		let recent: Record<string, string[]> = {};
		for (let i = 0; i < MAX_RECENT_MODELS + 2; i++) {
			recent = rememberRecentModel(recent, "openai", `model-${i}`);
		}

		recent = rememberRecentModel(recent, "openai", "model-3");

		expect(recent.openai).toHaveLength(MAX_RECENT_MODELS);
		expect(recent.openai?.[0]).toBe("model-3");
		expect(new Set(recent.openai ?? []).size).toBe(MAX_RECENT_MODELS);
	});

	it("shares one recent list across profiles using the same provider", () => {
		let recent = rememberRecentModel({}, "openai", "gpt-4o");
		recent = rememberRecentModel(recent, "openai", "gpt-4o-mini");

		expect(getRecentModels(recent, "openai")).toEqual([
			"gpt-4o-mini",
			"gpt-4o",
		]);
		expect(Object.keys(recent)).toEqual(["openai"]);
	});

	it("migrates legacy profile recents into the provider list", () => {
		const recent = migrateRecentModelsToProviders(
			{
				openai: ["provider-model"],
				"profile-1": ["profile-one-model", "provider-model"],
				"profile-2": ["profile-two-model"],
			},
			[
				{ id: "profile-1", provider: "openai" },
				{ id: "profile-2", provider: "openai" },
			],
		);

		expect(recent).toEqual({
			openai: [
				"provider-model",
				"profile-one-model",
				"profile-two-model",
			],
		});
	});
});
