import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ActionBar from "../presentational/ActionBar";

const profile = {
	id: "profile-1",
	name: "OpenAI",
	provider: "openai" as const,
	model: "gpt-4o",
	createdAt: 0,
	updatedAt: 0,
};

const baseProps = {
	onNewChat: vi.fn(),
	onLoadChat: vi.fn(),
	onExportChat: vi.fn(),
	canLoad: true,
	plugin: { app: {}, manifest: { id: "chat-lab" } } as any,
	autoApprove: false,
	onToggleAutoApprove: vi.fn(),
	autoNameSessions: false,
	onToggleAutoName: vi.fn(),
	onManualRename: vi.fn(),
	profile,
	onToggleParticipantDropdown: vi.fn(),
	onToggleRemoteUserDropdown: vi.fn(),
	onToggleRelay: vi.fn(),
	connectedUsers: [],
};

describe("ActionBar participant badges", () => {
	it.each([0, 1, 2])(
		"shows %i selected models in the model-selection badge",
		(participantCount) => {
			const { container } = render(
				<ActionBar
					{...baseProps}
					participantCount={participantCount}
				/>,
			);

			expect(
				container.querySelector(".chat-council-badge")?.textContent,
			).toBe(String(participantCount));
		},
	);

	it("keeps remote-user count separate from the model-selection badge", () => {
		const { container } = render(
			<ActionBar
				{...baseProps}
				participantCount={1}
				remoteUserCount={2}
			/>,
		);

		expect(
			container.querySelector(".chat-council-badge")?.textContent,
		).toBe("1");
		expect(
			container.querySelector(".chat-remote-users-badge")?.textContent,
		).toBe("2");
	});
});
