import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestUrlMock } = vi.hoisted(() => ({
	requestUrlMock: vi.fn(),
}));

vi.mock("obsidian", () => ({
	requestUrl: requestUrlMock,
	Notice: class Notice {
		constructor(_message: string) {}
	},
}));

import { fetchProviderModels, validateProfile } from "../providers";
import type { ProviderProfile } from "../../settings";

const profile: ProviderProfile = {
	id: "codex-profile",
	name: "Codex",
	provider: "codex",
	model: "gpt-6-luna",
	createdAt: Date.now(),
	updatedAt: Date.now(),
};

const createApp = (credential: Record<string, unknown>) => {
	const secrets = new Map<string, string>([
		["chat-lab-codex-codex-profile", JSON.stringify(credential)],
	]);
	return {
		secrets,
		app: {
			secretStorage: {
				getSecret: (key: string) => secrets.get(key) ?? null,
				setSecret: (key: string, value: string) =>
					secrets.set(key, value),
			},
		} as any,
	};
};

describe("Codex provider", () => {
	beforeEach(() => requestUrlMock.mockReset());

	it("loads only account-listed models from the public catalog", async () => {
		requestUrlMock.mockResolvedValue({
			status: 200,
			text: JSON.stringify({
				models: [
					{ slug: "gpt-6-luna", visibility: "list" },
					{ slug: "gpt-6-sol", visibility: "list" },
					{ slug: "internal-model", visibility: "hidden" },
					{ visibility: "list" },
				],
			}),
		});
		const { app } = createApp({
			accessToken: "codex-access-token",
			refreshToken: "codex-refresh-token",
		});

		expect(validateProfile(profile, app)).toBeNull();
		await expect(fetchProviderModels(profile, app)).resolves.toEqual([
			"gpt-6-luna",
			"gpt-6-sol",
		]);
		expect(requestUrlMock).toHaveBeenCalledWith({
			url: "https://api.openai.com/v1/models",
			method: "GET",
			headers: { Authorization: "Bearer codex-access-token" },
			throw: false,
		});
	});

	it("refreshes an expired API authorization and retries model discovery", async () => {
		requestUrlMock
			.mockResolvedValueOnce({ status: 401, text: "{}" })
			.mockResolvedValueOnce({
				status: 200,
				text: JSON.stringify({
					access_token: "renewed-access-token",
					refresh_token: "renewed-refresh-token",
					expires_in: 3600,
				}),
			})
			.mockResolvedValueOnce({
				status: 200,
				text: JSON.stringify({
					models: [{ slug: "gpt-6-luna", visibility: "list" }],
				}),
			});
		const { app, secrets } = createApp({
			accessToken: "expired-access-token",
			refreshToken: "old-refresh-token",
		});

		await expect(fetchProviderModels(profile, app)).resolves.toEqual([
			"gpt-6-luna",
		]);
		expect(requestUrlMock).toHaveBeenCalledTimes(3);
		expect(
			JSON.parse(secrets.get("chat-lab-codex-codex-profile")!),
		).toMatchObject({
			accessToken: "renewed-access-token",
			refreshToken: "renewed-refresh-token",
		});
	});
});
