import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ProfileIndicator from "./ProfileIndicator";
import type { ProviderProfile } from "../../settings";

const profile: ProviderProfile = {
	id: "profile-1",
	name: "OpenRouter",
	provider: "openrouter",
	model: "openai/gpt-oss-120b",
	createdAt: 0,
	updatedAt: 0,
};

describe("ProfileIndicator", () => {
	it("shows the active model in the chip", () => {
		render(<ProfileIndicator profile={profile} />);

		expect(screen.getByText(profile.model)).toBeTruthy();
		expect(screen.getByText(profile.provider)).toBeTruthy();
		expect(document.querySelector(".chat-profile-chip-icon")).toBeNull();
		expect(
			screen.getByTitle(/OpenRouter.*openai\/gpt-oss-120b/),
		).toBeTruthy();
	});
});
