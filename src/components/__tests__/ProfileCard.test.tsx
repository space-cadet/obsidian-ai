import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProfileList } from "../ProfileCard";
import type { ProviderProfile } from "../../settings";

const mockPlugin = {
	settings: {
		providerProfiles: [
			{
				id: "profile-1",
				name: "OpenAI Default",
				provider: "openai" as const,
				model: "gpt-4o",
				apiKey: "sk-test1234",
				endpointUrl: "",
				customURL: "",
				azureEndpoint: "",
				azureApiVersion: "",
				agentId: "",
				sessionKey: "",
				autoApprove: false,
				maxSteps: 10,
				modelCache: undefined,
				updatedAt: Date.now(),
			},
			{
				id: "profile-2",
				name: "Gemini",
				provider: "gemini" as const,
				model: "gemini-3-flash",
				apiKey: "AIza-test",
				endpointUrl: "",
				customURL: "",
				azureEndpoint: "",
				azureApiVersion: "",
				agentId: "",
				sessionKey: "",
				autoApprove: false,
				maxSteps: 10,
				modelCache: undefined,
				updatedAt: Date.now(),
			},
		] as ProviderProfile[],
		activeProviderProfileId: "profile-1",
	},
	saveSettings: vi.fn().mockResolvedValue(undefined),
	chatapi: {
		updateSettings: vi.fn(),
	},
	app: {} as any,
};

describe("ProfileList", () => {
	it("does not render 'Provider Profiles' heading inside the component", () => {
		render(<ProfileList plugin={mockPlugin as any} />);

		// The heading should NOT appear inside ProfileList — it's rendered by the section header
		const headings = screen.queryAllByText("Provider Profiles");
		expect(headings).toHaveLength(0);
	});

	it("renders all profile names", () => {
		render(<ProfileList plugin={mockPlugin as any} />);

		expect(screen.getByText("OpenAI Default")).toBeTruthy();
		// Use profile-name class to get all profile names
		const names = Array.from(
			document.querySelectorAll(".obsidian-ai-profile-name"),
		).map((el) => el.textContent);
		expect(names).toContain("Gemini");
	});

	it("marks active profile with default badge", () => {
		render(<ProfileList plugin={mockPlugin as any} />);

		// The active profile should show the "Default" badge
		const badge = screen.getByText("Default");
		expect(badge).toBeTruthy();
	});

	it("shows + New Profile button", () => {
		render(<ProfileList plugin={mockPlugin as any} />);

		expect(
			screen.getByRole("button", { name: /New Profile/i }),
		).toBeTruthy();
	});
});
