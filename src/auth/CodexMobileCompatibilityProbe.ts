import { requestUrl } from "obsidian";

const AUTH_BASE_URL = "https://auth.openai.com";
const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const DEVICE_REDIRECT_URI = AUTH_BASE_URL + "/deviceauth/callback";
const CODEX_RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses";
const DEVICE_AUTH_TIMEOUT_MS = 15 * 60 * 1000;
const TEST_PROMPT = "Reply with exactly: Chat Lab mobile probe OK.";

export interface CodexDeviceAuthorization {
	deviceAuthId: string;
	userCode: string;
	verificationUri: string;
	intervalMs: number;
}

export interface CodexProbeCredential {
	accessToken: string;
	refreshToken: string;
	accountId?: string;
	expiresAt?: number;
}

export class CodexMobileProbeError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CodexMobileProbeError";
	}
}

interface ProbeOptions {
	request?: typeof requestUrl;
	now?: () => number;
	wait?: (milliseconds: number) => Promise<void>;
	pluginVersion?: string;
}

interface JsonRecord {
	[key: string]: unknown;
}

interface TokenResponse {
	access_token?: unknown;
	refresh_token?: unknown;
	id_token?: unknown;
	expires_in?: unknown;
}

const isRecord = (value: unknown): value is JsonRecord =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const readJson = (text: string, failureMessage: string): JsonRecord => {
	try {
		const value: unknown = JSON.parse(text);
		if (isRecord(value)) return value;
	} catch {
		// Keep provider response bodies out of user-facing diagnostics.
	}
	throw new CodexMobileProbeError(failureMessage);
};

const asNonEmptyString = (value: unknown): string | undefined =>
	typeof value === "string" && value.length > 0 ? value : undefined;

const extractAccountId = (token: string): string | undefined => {
	try {
		const encodedPayload = token.split(".")[1];
		if (!encodedPayload) return undefined;
		const normalized = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
		const padded = normalized.padEnd(
			normalized.length + ((4 - (normalized.length % 4)) % 4),
			"=",
		);
		const binary = atob(padded);
		const bytes = Uint8Array.from(binary, (character) =>
			character.charCodeAt(0),
		);
		const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
		if (!isRecord(claims)) return undefined;
		const auth = claims["https://api.openai.com/auth"];
		if (isRecord(auth)) {
			const accountId = asNonEmptyString(auth.chatgpt_account_id);
			if (accountId) return accountId;
		}
		const direct = asNonEmptyString(claims.chatgpt_account_id);
		if (direct) return direct;
		const organizations = claims.organizations;
		if (Array.isArray(organizations) && isRecord(organizations[0])) {
			return asNonEmptyString(organizations[0].id);
		}
	} catch {
		// Account claims are optional for this compatibility request.
	}
	return undefined;
};

const extractOutputText = (value: unknown): string => {
	if (!isRecord(value)) return "";
	if (typeof value.output_text === "string") return value.output_text;
	if (!Array.isArray(value.output)) return "";
	return value.output
		.filter(isRecord)
		.flatMap((item) => (Array.isArray(item.content) ? item.content : []))
		.filter(isRecord)
		.map((item) =>
			typeof item.text === "string"
				? item.text
				: typeof item.value === "string"
					? item.value
					: "",
		)
		.filter(Boolean)
		.join("");
};

const extractSseOutput = (text: string): string => {
	let completed = false;
	let deltaText = "";
	const items = new Map<number, unknown>();

	for (const line of text.split(/\r?\n/)) {
		if (!line.startsWith("data:")) continue;
		const eventText = line.slice(5).trim();
		if (!eventText || eventText === "[DONE]") continue;

		let event: JsonRecord;
		try {
			const parsed: unknown = JSON.parse(eventText);
			if (!isRecord(parsed)) continue;
			event = parsed;
		} catch {
			throw new CodexMobileProbeError(
				"The Codex response stream could not be read.",
			);
		}

		if (event.type === "response.output_text.delta") {
			if (typeof event.delta === "string") deltaText += event.delta;
		} else if (
			event.type === "response.output_item.done" &&
			typeof event.output_index === "number"
		) {
			items.set(event.output_index, event.item);
		} else if (event.type === "response.completed") {
			completed = true;
			const response = event.response;
			const finalText = extractOutputText(response);
			if (finalText) return finalText;
		} else if (event.type === "response.failed" || event.type === "error") {
			throw new CodexMobileProbeError(
				"The Codex response request was rejected.",
			);
		}
	}

	if (!completed) {
		throw new CodexMobileProbeError(
			"The Codex response stream ended before completion.",
		);
	}

	const itemText = [...items.entries()]
		.sort(([left], [right]) => left - right)
		.map(([, item]) => extractOutputText({ output: [item] }))
		.join("");
	const result = itemText || deltaText;
	if (!result) {
		throw new CodexMobileProbeError(
			"The Codex response completed without text.",
		);
	}
	return result;
};

const parseTokenResponse = (
	response: TokenResponse,
	fallbackRefreshToken?: string,
	now = Date.now(),
): CodexProbeCredential => {
	const accessToken = asNonEmptyString(response.access_token);
	const refreshToken =
		asNonEmptyString(response.refresh_token) ?? fallbackRefreshToken;
	if (!accessToken || !refreshToken) {
		throw new CodexMobileProbeError(
			"The sign-in response did not include the tokens required for this probe.",
		);
	}
	const idToken = asNonEmptyString(response.id_token);
	const expiresIn = Number(response.expires_in);
	return {
		accessToken,
		refreshToken,
		expiresAt:
			Number.isFinite(expiresIn) && expiresIn > 0
				? now + expiresIn * 1000
				: undefined,
		accountId:
			(idToken ? extractAccountId(idToken) : undefined) ??
			extractAccountId(accessToken),
	};
};

export class CodexMobileCompatibilityProbe {
	private readonly http: typeof requestUrl;
	private readonly now: () => number;
	private readonly wait: (milliseconds: number) => Promise<void>;
	private readonly pluginVersion: string;
	private cancelled = false;
	private cancelWaiter: (() => void) | null = null;

	constructor(options: ProbeOptions = {}) {
		this.http = options.request ?? requestUrl;
		this.now = options.now ?? Date.now;
		this.wait =
			options.wait ??
			((milliseconds) =>
				new Promise((resolve) =>
					window.setTimeout(resolve, milliseconds),
				));
		this.pluginVersion = options.pluginVersion ?? "unknown";
	}

	cancel(): void {
		this.cancelled = true;
		this.cancelWaiter?.();
	}

	async beginDeviceAuthorization(): Promise<CodexDeviceAuthorization> {
		const response = await this.postJson(
			AUTH_BASE_URL + "/api/accounts/deviceauth/usercode",
			{ client_id: CODEX_CLIENT_ID },
		);
		if (response.status < 200 || response.status >= 300) {
			throw new CodexMobileProbeError(
				"Device sign-in could not be started (HTTP " +
					response.status +
					").",
			);
		}
		const data = readJson(
			response.text,
			"The device sign-in response could not be read.",
		);
		const deviceAuthId = asNonEmptyString(data.device_auth_id);
		const userCode = asNonEmptyString(data.user_code);
		if (!deviceAuthId || !userCode) {
			throw new CodexMobileProbeError(
				"The device sign-in response was incomplete.",
			);
		}
		const interval = Number(data.interval ?? 5);
		const intervalSeconds =
			Number.isFinite(interval) && interval > 0 ? interval : 5;
		return {
			deviceAuthId,
			userCode,
			verificationUri: AUTH_BASE_URL + "/codex/device",
			intervalMs: intervalSeconds * 1000,
		};
	}

	async completeDeviceAuthorization(
		authorization: CodexDeviceAuthorization,
	): Promise<CodexProbeCredential> {
		this.cancelled = false;
		const deadline = this.now() + DEVICE_AUTH_TIMEOUT_MS;
		while (this.now() < deadline) {
			if (this.cancelled) {
				throw new CodexMobileProbeError(
					"Device sign-in was cancelled.",
				);
			}

			let response: Awaited<ReturnType<typeof requestUrl>>;
			try {
				response = await this.postJson(
					AUTH_BASE_URL + "/api/accounts/deviceauth/token",
					{
						device_auth_id: authorization.deviceAuthId,
						user_code: authorization.userCode,
					},
				);
			} catch (error) {
				if (
					this.cancelled ||
					!(error instanceof CodexMobileProbeError) ||
					!error.message.startsWith("Network request failed")
				) {
					throw error;
				}
				await this.waitForNextPoll(authorization, deadline);
				continue;
			}

			if (this.cancelled) {
				throw new CodexMobileProbeError(
					"Device sign-in was cancelled.",
				);
			}
			if (response.status >= 200 && response.status < 300) {
				const data = readJson(
					response.text,
					"The device sign-in response could not be read.",
				);
				const code = asNonEmptyString(data.authorization_code);
				const verifier = asNonEmptyString(data.code_verifier);
				if (!code || !verifier) {
					throw new CodexMobileProbeError(
						"The device sign-in response was incomplete.",
					);
				}
				const credential = await this.exchangeAuthorizationCode(
					code,
					verifier,
				);
				if (this.cancelled) {
					throw new CodexMobileProbeError(
						"Device sign-in was cancelled.",
					);
				}
				return credential;
			}

			if (response.status !== 403 && response.status !== 404) {
				throw new CodexMobileProbeError(
					"Device sign-in polling failed (HTTP " +
						response.status +
						").",
				);
			}
			await this.waitForNextPoll(authorization, deadline);
		}
		throw new CodexMobileProbeError(
			"The device code expired before sign-in completed.",
		);
	}

	async refreshCredential(
		credential: CodexProbeCredential,
	): Promise<CodexProbeCredential> {
		const response = await this.postForm(AUTH_BASE_URL + "/oauth/token", {
			grant_type: "refresh_token",
			refresh_token: credential.refreshToken,
			client_id: CODEX_CLIENT_ID,
		});
		if (response.status < 200 || response.status >= 300) {
			throw new CodexMobileProbeError(
				"Token refresh failed (HTTP " + response.status + ").",
			);
		}
		const data = readJson(
			response.text,
			"The token refresh response could not be read.",
		);
		const renewed = parseTokenResponse(
			data,
			credential.refreshToken,
			this.now(),
		);
		return {
			...renewed,
			accountId: credential.accountId ?? renewed.accountId,
		};
	}

	async sendTestResponse(
		credential: CodexProbeCredential,
		model: string,
	): Promise<string> {
		const headers: Record<string, string> = {
			Authorization: "Bearer " + credential.accessToken,
			"Content-Type": "application/json",
			Accept: "text/event-stream, application/json",
			originator: "chat-lab",
			"User-Agent": "Chat Lab AI/" + this.pluginVersion,
		};
		if (credential.accountId) {
			headers["ChatGPT-Account-Id"] = credential.accountId;
		}
		let response: Awaited<ReturnType<typeof requestUrl>>;
		try {
			response = await this.http({
				url: CODEX_RESPONSES_URL,
				method: "POST",
				headers,
				body: JSON.stringify({
					model,
					input: [
						{
							role: "user",
							content: [
								{ type: "input_text", text: TEST_PROMPT },
							],
						},
					],
					instructions:
						"This is a connectivity test. Reply with exactly: Chat Lab mobile probe OK.",
					store: false,
					stream: true,
				}),
				throw: false,
			});
		} catch {
			throw new CodexMobileProbeError(
				"The Codex response request could not reach the service.",
			);
		}
		if (response.status < 200 || response.status >= 300) {
			throw new CodexMobileProbeError(
				"The Codex response request failed (HTTP " +
					response.status +
					"). The account or compatibility endpoint may reject this probe.",
			);
		}
		const body = response.text.trim();
		if (!body) {
			throw new CodexMobileProbeError("The Codex response was empty.");
		}
		if (body.startsWith("{")) {
			const result = readJson(
				body,
				"The Codex response could not be read.",
			);
			const text = extractOutputText(result);
			if (text) return text;
			throw new CodexMobileProbeError(
				"The Codex response completed without text.",
			);
		}
		return extractSseOutput(body);
	}

	private async exchangeAuthorizationCode(
		code: string,
		codeVerifier: string,
	): Promise<CodexProbeCredential> {
		const response = await this.postForm(AUTH_BASE_URL + "/oauth/token", {
			grant_type: "authorization_code",
			code,
			redirect_uri: DEVICE_REDIRECT_URI,
			client_id: CODEX_CLIENT_ID,
			code_verifier: codeVerifier,
		});
		if (response.status < 200 || response.status >= 300) {
			throw new CodexMobileProbeError(
				"Device sign-in token exchange failed (HTTP " +
					response.status +
					").",
			);
		}
		const data = readJson(
			response.text,
			"The sign-in token response could not be read.",
		);
		return parseTokenResponse(data, undefined, this.now());
	}

	private async waitForNextPoll(
		authorization: CodexDeviceAuthorization,
		deadline: number,
	): Promise<void> {
		if (this.cancelled) {
			throw new CodexMobileProbeError("Device sign-in was cancelled.");
		}
		const remaining = deadline - this.now();
		if (remaining <= 0) return;
		await Promise.race([
			this.wait(Math.min(authorization.intervalMs, remaining)),
			new Promise<void>((resolve) => {
				this.cancelWaiter = resolve;
			}),
		]);
		this.cancelWaiter = null;
		if (this.cancelled) {
			throw new CodexMobileProbeError("Device sign-in was cancelled.");
		}
	}

	private async postJson(
		url: string,
		body: JsonRecord,
	): Promise<Awaited<ReturnType<typeof requestUrl>>> {
		try {
			return await this.http({
				url,
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
				throw: false,
			});
		} catch {
			throw new CodexMobileProbeError(
				"Network request failed while contacting OpenAI authentication.",
			);
		}
	}

	private async postForm(
		url: string,
		fields: Record<string, string>,
	): Promise<Awaited<ReturnType<typeof requestUrl>>> {
		try {
			return await this.http({
				url,
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams(fields).toString(),
				throw: false,
			});
		} catch {
			throw new CodexMobileProbeError(
				"Network request failed while contacting OpenAI authentication.",
			);
		}
	}
}
