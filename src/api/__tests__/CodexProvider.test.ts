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

import {
	createCodexFetch,
	fetchProviderModels,
	validateProfile,
} from "../providers";
import type { ProviderProfile } from "../../settings";
import { getDefaultEndpoint } from "../../settings";

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
	beforeEach(() => {
		requestUrlMock.mockReset();
	});

	it("loads only account-listed models from the Codex catalog", async () => {
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
			accountId: "chatgpt-account-id",
		});

		expect(getDefaultEndpoint("codex")).toBe(
			"https://chatgpt.com/backend-api/codex",
		);
		expect(validateProfile(profile, app)).toBeNull();
		await expect(fetchProviderModels(profile, app)).resolves.toEqual([
			"gpt-6-luna",
			"gpt-6-sol",
		]);
		expect(requestUrlMock).toHaveBeenCalledWith({
			url: "https://chatgpt.com/backend-api/codex/models?client_version=1.7.0",
			method: "GET",
			headers: {
				Authorization: "Bearer codex-access-token",
				"ChatGPT-Account-Id": "chatgpt-account-id",
				originator: "chat-lab",
				"User-Agent": "Chat Lab AI/1.7.0",
			},
			throw: false,
		});
	});

	it("sends Responses API calls to the Codex backend with account identity", async () => {
		const { app } = createApp({
			accessToken: "codex-access-token",
			refreshToken: "codex-refresh-token",
			accountId: "chatgpt-account-id",
		});
		const responseBody = [
			"event: response.output_text.delta",
			'data: {"type":"response.output_text.delta","delta":"Hello"}',
			"",
		].join("\n");
		requestUrlMock.mockResolvedValue({
			status: 200,
			headers: { "content-type": "text/event-stream" },
			text: responseBody,
		});

		const codexFetch = createCodexFetch(app, profile.id);
		const response = await codexFetch(
			"https://chatgpt.com/backend-api/codex/responses",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ model: profile.model, stream: true }),
			},
		);

		const request = requestUrlMock.mock.calls[0][0];
		expect(request).toMatchObject({
			url: "https://chatgpt.com/backend-api/codex/responses",
			method: "POST",
			body: JSON.stringify({ model: profile.model, stream: true }),
			throw: false,
		});
		const headers = new Headers(request.headers);
		expect(headers.get("Authorization")).toBe("Bearer codex-access-token");
		expect(headers.get("ChatGPT-Account-Id")).toBe("chatgpt-account-id");
		expect(headers.get("originator")).toBe("chat-lab");
		expect(headers.get("User-Agent")).toBe("Chat Lab AI/1.7.0");
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("text/event-stream");
		expect(await response.text()).toBe(responseBody);
	});

	it("stops waiting for a native request when the chat is aborted", async () => {
		const { app } = createApp({
			accessToken: "codex-access-token",
			refreshToken: "codex-refresh-token",
		});
		requestUrlMock.mockReturnValue(new Promise(() => {}));
		const controller = new AbortController();
		const pending = createCodexFetch(app, profile.id)(
			"https://chatgpt.com/backend-api/codex/responses",
			{
				method: "POST",
				signal: controller.signal,
				body: JSON.stringify({ model: profile.model, stream: true }),
			},
		);

		await vi.waitFor(() => expect(requestUrlMock).toHaveBeenCalledOnce());
		controller.abort();
		await expect(pending).rejects.toHaveProperty("name", "AbortError");
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

	it("shows the API reason when Codex model access is rejected", async () => {
		requestUrlMock.mockResolvedValue({
			status: 403,
			text: JSON.stringify({ detail: "Codex access is unavailable." }),
		});
		const { app } = createApp({
			accessToken: "codex-access-token",
			refreshToken: "codex-refresh-token",
		});

		await expect(fetchProviderModels(profile, app)).rejects.toThrow(
			"Codex model list request failed (HTTP 403): Codex access is unavailable.",
		);
	});
});
