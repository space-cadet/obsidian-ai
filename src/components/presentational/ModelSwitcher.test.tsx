import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ModelSwitcher from "./ModelSwitcher";
import type { ProviderProfile } from "../../settings";

const makeProfile = (
	overrides: Partial<ProviderProfile> = {},
): ProviderProfile => ({
	id: "profile-1",
	name: "OpenAI",
	provider: "openrouter",
	model: "openai/gpt-oss-120b",
	modelCache: {
		models: ["openai/gpt-oss-120b", "gpt-4o", "z-ai/glm-5.3-flash"],
		fetchedAt: 1,
	},
	createdAt: 0,
	updatedAt: 0,
	...overrides,
});

const makePlugin = (profiles: ProviderProfile[], recentModels = {}) => ({
	app: {},
	manifest: { id: "chat-lab" },
	settings: {
		providerProfiles: profiles,
		recentModels,
	},
	chatapi: { updateSettings: vi.fn() },
	saveSettings: vi.fn().mockResolvedValue(undefined),
});

describe("ModelSwitcher", () => {
	it("keeps the toolbar trigger compact and separates recent models from all models", () => {
		const profile = makeProfile();
		const plugin = makePlugin([profile], {
			openrouter: ["z-ai/glm-5.3-flash"],
		});

		render(
			<ModelSwitcher
				profile={profile}
				plugin={plugin as any}
				selectedProfileIds={new Set([profile.id])}
			/>,
		);

		const trigger = screen.getByRole("button", { name: /gpt-oss-120b/ });
		expect(trigger.textContent).not.toContain("openai/");
		expect(trigger.getAttribute("aria-expanded")).toBe("false");

		fireEvent.click(trigger);
		expect(screen.getByPlaceholderText("Search models...")).toBeTruthy();
		expect(screen.getByText("Recently used")).toBeTruthy();
		expect(screen.getByText("All models")).toBeTruthy();
		expect(screen.getAllByText("z-ai/glm-5.3-flash")).toHaveLength(1);
	});

	it("updates the trigger immediately and persists a selected model", async () => {
		const profile = makeProfile();
		const plugin = makePlugin([profile]);

		render(
			<ModelSwitcher
				profile={profile}
				plugin={plugin as any}
				selectedProfileIds={new Set([profile.id])}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /gpt-oss-120b/ }));
		fireEvent.click(screen.getByRole("button", { name: "gpt-4o" }));

		await waitFor(() => {
			expect(plugin.saveSettings).toHaveBeenCalledOnce();
			expect(plugin.settings.providerProfiles[0].model).toBe("gpt-4o");
		});
		expect(screen.getByRole("button", { name: /gpt-4o/ })).toBeTruthy();
	});

	it("keeps model caches isolated for profiles using the same provider", () => {
		const first = makeProfile({
			id: "profile-1",
			name: "First",
			model: "first-model",
			modelCache: { models: ["first-model"], fetchedAt: 1 },
		});
		const second = makeProfile({
			id: "profile-2",
			name: "Second",
			model: "second-model",
			modelCache: { models: ["second-model"], fetchedAt: 1 },
		});
		const plugin = makePlugin([first, second]);

		render(
			<ModelSwitcher
				profile={first}
				plugin={plugin as any}
				selectedProfileIds={new Set([first.id, second.id])}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /2 agents/ }));
		fireEvent.click(screen.getByRole("button", { name: /Second/ }));

		expect(screen.getByText("second-model")).toBeTruthy();
		expect(screen.queryByText("first-model")).toBeNull();
	});
});
