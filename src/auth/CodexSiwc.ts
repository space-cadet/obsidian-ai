import { requestUrl } from "obsidian";

const AUTH_BASE_URL = "https://auth.openai.com";
const AUTHORIZE_URL = `${AUTH_BASE_URL}/api/accounts/authorize`;
const TOKEN_URL = `${AUTH_BASE_URL}/api/accounts/oauth/token`;
const DISCOVERY_URL = `${AUTH_BASE_URL}/.well-known/openid-configuration`;
const RESOURCE = "https://api.openai.com/v1";
const DYNAMIC_CLIENT_ID = "dynamic_agent_client";
const REQUIRED_SCOPES = [
	"openid",
	"profile",
	"email",
	"offline_access",
	"resource.invoke",
	"chatgpt.tokens.use.direct",
];

export interface CodexAccountCredential {
	accessToken: string;
	refreshToken: string;
	clientId: string;
	idToken: string;
	subject: string;
	extAgentHostId: string;
	scopes: string[];
	expiresAt?: number;
}

export interface CodexAuthorizationAttempt {
	state: string;
	nonce: string;
	codeVerifier: string;
	clientId: string;
	isNewRegistration: boolean;
	redirectUri: string;
	authorizationUrl: string;
}

interface JsonRecord {
	[key: string]: unknown;
}

interface OAuthOptions {
	request?: typeof requestUrl;
	crypto?: Crypto;
	now?: () => number;
}

const isRecord = (value: unknown): value is JsonRecord =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined =>
	typeof value === "string" && value.length > 0 ? value : undefined;

const base64Url = (bytes: Uint8Array): string => {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
};

const decodeBase64Url = (value: string): Uint8Array<ArrayBuffer> => {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const padded = normalized.padEnd(
		normalized.length + ((4 - (normalized.length % 4)) % 4),
		"=",
	);
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index++) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
};

const decodeJwtPart = (value: string): JsonRecord => {
	try {
		const parsed: unknown = JSON.parse(
			new TextDecoder().decode(decodeBase64Url(value)),
		);
		if (isRecord(parsed)) return parsed;
	} catch {
		// Do not include token contents in diagnostics.
	}
	throw new Error("ChatGPT sign-in returned an invalid identity token.");
};

const readJson = (text: string, message: string): JsonRecord => {
	try {
		const parsed: unknown = JSON.parse(text);
		if (isRecord(parsed)) return parsed;
	} catch {
		// Keep raw provider responses out of user-facing diagnostics.
	}
	throw new Error(message);
};

const requireScopes = (scopes: string[]): void => {
	if (!scopes.includes("chatgpt.tokens.use.direct")) {
		throw new Error(
			"ChatGPT plan access was not approved. Sign in again and allow ChatGPT plan use.",
		);
	}
	if (!scopes.includes("resource.invoke")) {
		throw new Error(
			"The sign-in did not grant Responses API access. Sign in again and approve the requested permissions.",
		);
	}
};

const postForm = async (
	request: typeof requestUrl,
	fields: Record<string, string>,
): Promise<JsonRecord> => {
	let response: Awaited<ReturnType<typeof requestUrl>>;
	try {
		response = await request({
			url: TOKEN_URL,
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Accept: "application/json",
			},
			body: new URLSearchParams(fields).toString(),
			throw: false,
		});
	} catch {
		throw new Error("Could not reach the ChatGPT sign-in service.");
	}

	if (response.status < 200 || response.status >= 300) {
		let data: JsonRecord = {};
		try {
			const parsed: unknown = JSON.parse(response.text);
			if (isRecord(parsed)) data = parsed;
		} catch {
			// Keep raw provider responses out of user-facing diagnostics.
		}
		const error = isRecord(data.error) ? data.error : undefined;
		const code = asString(data.error) ?? asString(error?.code);
		const description =
			asString(data.error_description) ??
			asString(data.detail) ??
			asString(error?.message);
		throw new Error(
			description
				? `${description} (HTTP ${response.status})${code ? `: ${code}` : ""}.`
				: `ChatGPT token exchange failed (HTTP ${response.status})${code ? `: ${code}` : ""}.`,
		);
	}
	return readJson(
		response.text,
		"The ChatGPT sign-in service returned an unreadable response.",
	);
};

export async function createCodexAuthorizationAttempt(options: {
	extAgentHostId: string;
	redirectUri: string;
	existingCredential?: CodexAccountCredential | null;
	crypto?: Crypto;
}): Promise<CodexAuthorizationAttempt> {
	const cryptoApi = options.crypto ?? globalThis.crypto;
	if (!cryptoApi?.subtle || !cryptoApi.getRandomValues) {
		throw new Error("Secure sign-in is unavailable in this environment.");
	}
	const randomString = (): string => {
		const bytes = cryptoApi.getRandomValues(new Uint8Array(32));
		return base64Url(bytes);
	};
	const state = randomString();
	const nonce = randomString();
	const codeVerifier = randomString();
	const challenge = new Uint8Array(
		await cryptoApi.subtle.digest(
			"SHA-256",
			new TextEncoder().encode(codeVerifier),
		),
	);
	const existing = options.existingCredential;
	const isNewRegistration = !existing?.clientId;
	const clientId = existing?.clientId ?? DYNAMIC_CLIENT_ID;
	const params = new URLSearchParams({
		client_id: clientId,
		response_type: "code",
		redirect_uri: options.redirectUri,
		scope: REQUIRED_SCOPES.join(" "),
		resource: RESOURCE,
		ext_agent_host_id: options.extAgentHostId,
		state,
		nonce,
		code_challenge_method: "S256",
		code_challenge: base64Url(challenge),
	});
	if (isNewRegistration) {
		params.set("agent_name_hint", "Chat Lab AI");
	} else if (existing?.idToken) {
		params.set("id_token_hint", existing.idToken);
		if (
			!existing.scopes.includes("chatgpt.tokens.use.direct") ||
			!existing.scopes.includes("resource.invoke")
		) {
			params.set("prompt", "consent");
		}
	}
	return {
		state,
		nonce,
		codeVerifier,
		clientId,
		isNewRegistration,
		redirectUri: options.redirectUri,
		authorizationUrl: `${AUTHORIZE_URL}?${params.toString()}`,
	};
}

const verifyIdentityToken = async (
	idToken: string,
	clientId: string,
	nonce: string,
	request: typeof requestUrl,
	cryptoApi: Crypto,
	now: number,
): Promise<{ subject: string }> => {
	const parts = idToken.split(".");
	if (parts.length !== 3) {
		throw new Error("ChatGPT sign-in returned an invalid identity token.");
	}
	const header = decodeJwtPart(parts[0]);
	const claims = decodeJwtPart(parts[1]);
	const kid = asString(header.kid);
	const algorithm = asString(header.alg);
	if (!kid || !algorithm) {
		throw new Error(
			"ChatGPT sign-in returned an unverifiable identity token.",
		);
	}

	let discovery: JsonRecord;
	try {
		const response = await request({
			url: DISCOVERY_URL,
			method: "GET",
			throw: false,
		});
		if (response.status < 200 || response.status >= 300) {
			throw new Error();
		}
		discovery = readJson(
			response.text,
			"OpenAI sign-in metadata could not be read.",
		);
	} catch {
		throw new Error("Could not verify the ChatGPT sign-in response.");
	}
	const issuer = asString(discovery.issuer);
	const jwksUri = asString(discovery.jwks_uri);
	if (!issuer || !jwksUri) {
		throw new Error("OpenAI sign-in metadata is incomplete.");
	}

	let jwks: JsonRecord;
	try {
		const response = await request({
			url: jwksUri,
			method: "GET",
			throw: false,
		});
		if (response.status < 200 || response.status >= 300) {
			throw new Error();
		}
		jwks = readJson(
			response.text,
			"OpenAI signing keys could not be read.",
		);
	} catch {
		throw new Error("Could not verify the ChatGPT sign-in response.");
	}
	const keys = Array.isArray(jwks.keys) ? jwks.keys : [];
	const key = keys.find(
		(candidate): candidate is JsonRecord =>
			isRecord(candidate) &&
			candidate.kid === kid &&
			(candidate.use === undefined || candidate.use === "sig"),
	);
	if (!key) {
		throw new Error(
			"The ChatGPT identity token used an unknown signing key.",
		);
	}

	let importAlgorithm:
		| AlgorithmIdentifier
		| RsaHashedImportParams
		| EcKeyImportParams;
	let verifyAlgorithm: AlgorithmIdentifier | RsaPssParams | EcdsaParams;
	if (algorithm === "RS256") {
		importAlgorithm = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
		verifyAlgorithm = { name: "RSASSA-PKCS1-v1_5" };
	} else if (algorithm === "ES256") {
		importAlgorithm = { name: "ECDSA", namedCurve: "P-256" };
		verifyAlgorithm = { name: "ECDSA", hash: "SHA-256" };
	} else {
		throw new Error("ChatGPT sign-in used an unsupported token signature.");
	}

	let signatureIsValid = false;
	try {
		const cryptoKey = await cryptoApi.subtle.importKey(
			"jwk",
			key as JsonWebKey,
			importAlgorithm,
			false,
			["verify"],
		);
		signatureIsValid = await cryptoApi.subtle.verify(
			verifyAlgorithm,
			cryptoKey,
			decodeBase64Url(parts[2]),
			new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
		);
	} catch {
		signatureIsValid = false;
	}
	if (!signatureIsValid) {
		throw new Error("The ChatGPT identity token signature is invalid.");
	}

	const audience = claims.aud;
	const audienceMatches =
		audience === clientId ||
		(Array.isArray(audience) && audience.includes(clientId));
	const expiresAt = Number(claims.exp) * 1000;
	const notBefore =
		claims.nbf === undefined ? undefined : Number(claims.nbf) * 1000;
	const subject = asString(claims.sub);
	if (
		claims.iss !== issuer ||
		!audienceMatches ||
		claims.nonce !== nonce ||
		!subject ||
		!Number.isFinite(expiresAt) ||
		expiresAt <= now ||
		(notBefore !== undefined &&
			(!Number.isFinite(notBefore) || notBefore > now))
	) {
		throw new Error(
			"The ChatGPT identity token did not match this sign-in.",
		);
	}
	if (
		Array.isArray(audience) &&
		audience.length > 1 &&
		claims.azp !== clientId
	) {
		throw new Error(
			"The ChatGPT identity token has an unexpected audience.",
		);
	}
	return { subject };
};

export async function completeCodexAuthorization(
	callbackUrl: string,
	attempt: CodexAuthorizationAttempt,
	options: OAuthOptions & {
		extAgentHostId: string;
		existingCredential?: CodexAccountCredential | null;
	},
): Promise<CodexAccountCredential> {
	let callback: URL;
	try {
		callback = new URL(callbackUrl);
	} catch {
		throw new Error("Paste the full URL from the sign-in browser.");
	}
	const expected = new URL(attempt.redirectUri);
	if (
		callback.origin !== expected.origin ||
		callback.pathname !== expected.pathname
	) {
		throw new Error("That URL is not the ChatGPT sign-in callback.");
	}
	if (callback.searchParams.get("state") !== attempt.state) {
		throw new Error(
			"The sign-in response did not match this attempt. Start again.",
		);
	}
	const authorizationError = callback.searchParams.get("error");
	if (authorizationError) {
		if (authorizationError === "access_denied") {
			throw new Error("ChatGPT plan access was not approved.");
		}
		throw new Error("ChatGPT sign-in was cancelled or rejected.");
	}
	const code = callback.searchParams.get("code");
	if (!code)
		throw new Error(
			"The sign-in callback did not contain an authorization code.",
		);
	const callbackClientId =
		callback.searchParams.get("client_id") ?? undefined;
	let clientId: string;
	if (attempt.isNewRegistration) {
		if (!callbackClientId || callbackClientId === DYNAMIC_CLIENT_ID) {
			throw new Error(
				"ChatGPT did not finish registering this app. Start again.",
			);
		}
		clientId = callbackClientId;
	} else {
		if (callbackClientId && callbackClientId !== attempt.clientId) {
			throw new Error(
				"ChatGPT returned a different account registration. Start again.",
			);
		}
		clientId = attempt.clientId;
	}

	const request = options.request ?? requestUrl;
	const token = await postForm(request, {
		grant_type: "authorization_code",
		client_id: clientId,
		code,
		code_verifier: attempt.codeVerifier,
		redirect_uri: attempt.redirectUri,
		resource: RESOURCE,
	});
	const accessToken = asString(token.access_token);
	const refreshToken = asString(token.refresh_token);
	const idToken = asString(token.id_token);
	const scopes = asString(token.scope)?.split(/\s+/).filter(Boolean) ?? [];
	if (!accessToken || !refreshToken || !idToken) {
		throw new Error(
			"ChatGPT sign-in did not return the required credentials.",
		);
	}
	const identity = await verifyIdentityToken(
		idToken,
		clientId,
		attempt.nonce,
		request,
		options.crypto ?? globalThis.crypto,
		(options.now ?? Date.now)(),
	);
	if (
		options.existingCredential?.subject &&
		options.existingCredential.subject !== identity.subject
	) {
		throw new Error(
			"This ChatGPT account differs from the one saved for this profile.",
		);
	}
	const expiresIn = Number(token.expires_in);
	return {
		accessToken,
		refreshToken,
		clientId,
		idToken,
		subject: identity.subject,
		extAgentHostId: options.extAgentHostId,
		scopes,
		expiresAt:
			Number.isFinite(expiresIn) && expiresIn > 0
				? (options.now ?? Date.now)() + expiresIn * 1000
				: undefined,
	};
}

export async function refreshCodexOAuthCredential(
	credential: CodexAccountCredential,
	options: OAuthOptions = {},
): Promise<CodexAccountCredential> {
	const request = options.request ?? requestUrl;
	const token = await postForm(request, {
		grant_type: "refresh_token",
		client_id: credential.clientId,
		refresh_token: credential.refreshToken,
		resource: RESOURCE,
	});
	const accessToken = asString(token.access_token);
	const refreshToken =
		asString(token.refresh_token) ?? credential.refreshToken;
	if (!accessToken) {
		throw new Error(
			"ChatGPT token refresh did not return an access token.",
		);
	}
	const scopes =
		asString(token.scope)?.split(/\s+/).filter(Boolean) ??
		credential.scopes;
	requireScopes(scopes);
	const expiresIn = Number(token.expires_in);
	return {
		...credential,
		accessToken,
		refreshToken,
		scopes,
		expiresAt:
			Number.isFinite(expiresIn) && expiresIn > 0
				? (options.now ?? Date.now)() + expiresIn * 1000
				: undefined,
	};
}
