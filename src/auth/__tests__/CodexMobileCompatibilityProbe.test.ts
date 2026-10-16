import { describe, expect, it, vi } from "vitest";
import { requestUrl } from "obsidian";
import {
	CodexMobileCompatibilityProbe,
	type CodexProbeCredential,
} from "../CodexMobileCompatibilityProbe";

interface TestResponse {
	status: number;
	text: string;
	headers: Record<string, string>;
}

const response = (status: number, value: unknown): TestResponse => ({
	status,
	text: typeof value === "string" ? value : JSON.stringify(value),
	headers: {},
});

const makeProbe = (
	responses: TestResponse[],
	options: {
		wait?: (milliseconds: number) => Promise<void>;
		now?: () => number;
	} = {},
) => {
	const http = vi.fn(async (_request: unknown) => {
		return responses.shift() ?? response(500, {});
	});
	const probe = new CodexMobileCompatibilityProbe({
		request: http as unknown as typeof requestUrl,
		wait: options.wait ?? (async () => undefined),
		now: options.now,
		pluginVersion: "1.6.0-test",
	});
	return { http, probe };
};

describe("Codex mobile compatibility probe", () => {
	it("completes device authorization and exchanges tokens without exposing them", async () => {
		const secret = "access-token-secret";
		const { http, probe } = makeProbe([
			response(200, {
				device_auth_id: "device-id",
				user_code: "ABCD-EFGH",
				interval: "1",
			}),
			response(403, { detail: "pending" }),
			response(200, {
				authorization_code: "auth-code",
				code_verifier: "pkce-verifier",
			}),
			response(200, {
				access_token: secret,
				refresh_token: "refresh-token-secret",
			}),
		]);

		const authorization = await probe.beginDeviceAuthorization();
		const credential =
			await probe.completeDeviceAuthorization(authorization);

		expect(authorization.userCode).toBe("ABCD-EFGH");
		expect(credential.accessToken).toBe(secret);
		expect(http).toHaveBeenCalledTimes(4);
		expect(JSON.stringify(http.mock.calls)).not.toContain(secret);
	});

	it("stops polling after cancellation", async () => {
		let probe!: CodexMobileCompatibilityProbe;
		const { http, probe: createdProbe } = makeProbe(
			[
				response(200, {
					device_auth_id: "device-id",
					user_code: "ABCD-EFGH",
					interval: "1",
				}),
				response(403, {}),
			],
			{
				wait: async () => probe.cancel(),
			},
		);
		probe = createdProbe;
		const authorization = await probe.beginDeviceAuthorization();

		await expect(
			probe.completeDeviceAuthorization(authorization),
		).rejects.toThrow("cancelled");
		expect(http).toHaveBeenCalledTimes(2);
	});

	it("sends one stateless streamed request and parses its response", async () => {
		const credential: CodexProbeCredential = {
			accessToken: "access-token-secret",
			refreshToken: "refresh-token-secret",
			accountId: "account-id",
		};
		const stream = [
			"event: response.output_text.delta",
			"data: " +
				JSON.stringify({
					type: "response.output_text.delta",
					delta: "Chat Lab mobile probe OK.",
				}),
			"event: response.completed",
			"data: " +
				JSON.stringify({
					type: "response.completed",
					response: { id: "response-id", output: [] },
				}),
			"",
		].join("\n");
		const { http, probe } = makeProbe([response(200, stream)]);

		const result = await probe.sendTestResponse(credential, "gpt-5-codex");
		const request = http.mock.calls[0][0] as {
			url: string;
			headers: Record<string, string>;
			body: string;
		};
		const body = JSON.parse(request.body);

		expect(result).toBe("Chat Lab mobile probe OK.");
		expect(request.url).toContain("/backend-api/codex/responses");
		expect(request.headers.Authorization).toBe(
			"Bearer access-token-secret",
		);
		expect(request.headers.originator).toBe("chat-lab");
		expect(body.store).toBe(false);
		expect(body.stream).toBe(true);
		expect(body.model).toBe("gpt-5-codex");
		expect(body.input).toHaveLength(1);
	});

	it("refreshes tokens and preserves the previous refresh token if omitted", async () => {
		const credential: CodexProbeCredential = {
			accessToken: "old-access-token",
			refreshToken: "old-refresh-token",
			accountId: "account-id",
		};
		const { http, probe } = makeProbe([
			response(200, { access_token: "new-access-token" }),
		]);

		const refreshed = await probe.refreshCredential(credential);
		const request = http.mock.calls[0][0] as { body: string };

		expect(request.body).toContain("grant_type=refresh_token");
		expect(request.body).toContain("old-refresh-token");
		expect(refreshed.accessToken).toBe("new-access-token");
		expect(refreshed.refreshToken).toBe("old-refresh-token");
		expect(refreshed.accountId).toBe("account-id");
	});

	it("does not include raw provider errors in diagnostics", async () => {
		const { probe } = makeProbe([
			response(500, { detail: "refresh-token-secret must not appear" }),
		]);
		const credential: CodexProbeCredential = {
			accessToken: "access-token-secret",
			refreshToken: "refresh-token-secret",
		};

		const error = await probe
			.refreshCredential(credential)
			.catch((value: unknown) => value);
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toContain("HTTP 500");
		expect((error as Error).message).not.toContain("refresh-token-secret");
	});
});
