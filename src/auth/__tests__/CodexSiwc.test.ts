import { describe, expect, it, vi } from "vitest";

const { requestUrlMock } = vi.hoisted(() => ({
	requestUrlMock: vi.fn(),
}));

vi.mock("obsidian", () => ({ requestUrl: requestUrlMock }));

import { requestUrl } from "obsidian";
import {
	completeCodexAuthorization,
	createCodexAuthorizationAttempt,
	type CodexAccountCredential,
} from "../CodexSiwc";

const fakeCrypto = (): Crypto => {
	let counter = 0;
	return {
		getRandomValues: ((target: Uint8Array) => {
			for (let index = 0; index < target.length; index++) {
				target[index] = (counter + index + 1) % 255;
			}
			counter += 13;
			return target;
		}) as Crypto["getRandomValues"],
		subtle: {
			digest: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
			importKey: vi.fn(async () => ({}) as CryptoKey),
			verify: vi.fn(async () => true),
		} as unknown as SubtleCrypto,
	} as unknown as Crypto;
};

const jwt = (header: unknown, claims: unknown): string => {
	const encode = (value: unknown) =>
		btoa(JSON.stringify(value))
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/g, "");
	return `${encode(header)}.${encode(claims)}.c2ln`;
};

const jsonResponse = (value: unknown) => ({
	status: 200,
	text: JSON.stringify(value),
});

describe("Codex Sign in with ChatGPT", () => {
	it("requests plan-use permission and validates the returned authorization", async () => {
		const crypto = fakeCrypto();
		const attempt = await createCodexAuthorizationAttempt({
			extAgentHostId: "urn:uuid:host-123",
			redirectUri: "http://127.0.0.1:1455/auth/callback",
			crypto,
		});
		const authorize = new URL(attempt.authorizationUrl);
		expect(authorize.searchParams.get("client_id")).toBe(
			"dynamic_agent_client",
		);
		expect(authorize.searchParams.get("agent_name_hint")).toBe(
			"Chat Lab AI",
		);
		expect(authorize.searchParams.get("ext_agent_host_id")).toBe(
			"urn:uuid:host-123",
		);
		expect(authorize.searchParams.get("scope")).toContain(
			"chatgpt.tokens.use.direct",
		);
		expect(authorize.searchParams.get("scope")).toContain(
			"resource.invoke",
		);
		expect(authorize.searchParams.get("code_challenge_method")).toBe(
			"S256",
		);

		const idToken = jwt(
			{ alg: "RS256", kid: "test-key" },
			{
				iss: "https://auth.openai.com",
				aud: "oaiapp_registered-client",
				exp: 2_000_000_000,
				nonce: attempt.nonce,
				sub: "account-subject",
			},
		);
		const http = vi
			.fn()
			.mockResolvedValueOnce(
				jsonResponse({
					access_token: "access-token",
					refresh_token: "refresh-token",
					id_token: idToken,
					expires_in: 3600,
					scope: "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
				}),
			)
			.mockResolvedValueOnce(
				jsonResponse({
					issuer: "https://auth.openai.com",
					jwks_uri: "https://auth.openai.com/.well-known/jwks.json",
				}),
			)
			.mockResolvedValueOnce(
				jsonResponse({
					keys: [
						{ kid: "test-key", kty: "RSA", n: "AQAB", e: "AQAB" },
					],
				}),
			);
		const callbackUrl =
			`${attempt.redirectUri}?code=auth-code&state=${encodeURIComponent(attempt.state)}` +
			"&client_id=oaiapp_registered-client";

		const credential = await completeCodexAuthorization(
			callbackUrl,
			attempt,
			{
				extAgentHostId: "urn:uuid:host-123",
				request: http as unknown as typeof requestUrl,
				crypto,
				now: () => 1_900_000_000_000,
			},
		);

		expect(credential).toMatchObject({
			accessToken: "access-token",
			refreshToken: "refresh-token",
			clientId: "oaiapp_registered-client",
			subject: "account-subject",
			extAgentHostId: "urn:uuid:host-123",
		});
		expect(credential.scopes).toContain("chatgpt.tokens.use.direct");
		expect(http).toHaveBeenCalledTimes(3);
		const tokenRequest = http.mock.calls[0][0] as {
			url: string;
			body: string;
		};
		expect(tokenRequest.url).toBe(
			"https://auth.openai.com/api/accounts/oauth/token",
		);
		const form = new URLSearchParams(tokenRequest.body);
		expect(form.get("client_id")).toBe("oaiapp_registered-client");
		expect(form.get("code_verifier")).toBe(attempt.codeVerifier);
		expect(form.get("resource")).toBe("https://api.openai.com/v1");
	});

	it("retains a valid sign-in when ChatGPT plan use is declined", async () => {
		const crypto = fakeCrypto();
		const attempt = await createCodexAuthorizationAttempt({
			extAgentHostId: "urn:uuid:host-123",
			redirectUri: "http://127.0.0.1:1455/auth/callback",
			crypto,
		});
		const idToken = jwt(
			{ alg: "RS256", kid: "test-key" },
			{
				iss: "https://auth.openai.com",
				aud: "oaiapp_registered-client",
				exp: 2_000_000_000,
				nonce: attempt.nonce,
				sub: "account-subject",
			},
		);
		const http = vi
			.fn()
			.mockResolvedValueOnce(
				jsonResponse({
					access_token: "access-token",
					refresh_token: "refresh-token",
					id_token: idToken,
					scope: "openid profile email offline_access",
				}),
			)
			.mockResolvedValueOnce(
				jsonResponse({
					issuer: "https://auth.openai.com",
					jwks_uri: "https://auth.openai.com/.well-known/jwks.json",
				}),
			)
			.mockResolvedValueOnce(
				jsonResponse({
					keys: [
						{ kid: "test-key", kty: "RSA", n: "AQAB", e: "AQAB" },
					],
				}),
			);
		const callbackUrl =
			`${attempt.redirectUri}?code=auth-code&state=${encodeURIComponent(attempt.state)}` +
			"&client_id=oaiapp_registered-client";

		const credential = await completeCodexAuthorization(
			callbackUrl,
			attempt,
			{
				extAgentHostId: "urn:uuid:host-123",
				request: http as unknown as typeof requestUrl,
				crypto,
				now: () => 1_900_000_000_000,
			},
		);

		expect(credential.subject).toBe("account-subject");
		expect(credential.scopes).not.toContain("chatgpt.tokens.use.direct");
		expect(http).toHaveBeenCalledTimes(3);
	});

	it("reuses a saved client ID and ID-token hint for later sign-in", async () => {
		const existing: CodexAccountCredential = {
			accessToken: "old-access",
			refreshToken: "old-refresh",
			clientId: "oaiapp_registered-client",
			idToken: "saved-id-token",
			subject: "account-subject",
			extAgentHostId: "urn:uuid:host-123",
			scopes: ["openid", "profile", "resource.invoke"],
		};
		const attempt = await createCodexAuthorizationAttempt({
			extAgentHostId: "urn:uuid:host-123",
			redirectUri: "http://127.0.0.1:1455/auth/callback",
			existingCredential: existing,
			crypto: fakeCrypto(),
		});
		const authorize = new URL(attempt.authorizationUrl);

		expect(attempt.isNewRegistration).toBe(false);
		expect(authorize.searchParams.get("client_id")).toBe(existing.clientId);
		expect(authorize.searchParams.get("id_token_hint")).toBe(
			existing.idToken,
		);
		expect(authorize.searchParams.get("prompt")).toBe("consent");
		expect(authorize.searchParams.has("agent_name_hint")).toBe(false);
	});
});
