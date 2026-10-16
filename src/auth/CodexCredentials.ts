import type { App, SecretStorage } from "obsidian";
import {
	refreshCodexOAuthCredential,
	type CodexAccountCredential,
} from "./CodexSiwc";

const SECRET_PREFIX = "chat-lab-codex-";
const HOST_ID_SECRET = "chat-lab-codex-host-id";
const REFRESH_MARGIN_MS = 30_000;
const refreshes = new Map<string, Promise<CodexAccountCredential>>();

const secretStorageFor = (app: App): SecretStorage | null => {
	const storage = (app as App & { secretStorage?: SecretStorage })
		.secretStorage;
	return storage && typeof storage.getSecret === "function" ? storage : null;
};

export const hasCodexSecretStorage = (app: App): boolean =>
	secretStorageFor(app) !== null;

const createHostId = (): string => {
	const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
	return `urn:uuid:${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
};

export const getOrCreateCodexHostId = (app: App): string => {
	const storage = secretStorageFor(app);
	if (!storage) {
		throw new Error(
			"Secure account storage requires Obsidian 1.11.4 or newer.",
		);
	}
	const stored = storage.getSecret(HOST_ID_SECRET);
	if (stored?.startsWith("urn:uuid:")) return stored;
	const hostId = createHostId();
	storage.setSecret(HOST_ID_SECRET, hostId);
	return hostId;
};

export const getCodexCredentialSecretId = (profileId: string): string => {
	const suffix = profileId
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	return `${SECRET_PREFIX}${suffix || "default"}`;
};

export const getCodexRegistrationCredential = (
	app: App,
	profileId: string,
): CodexAccountCredential | null => {
	const storage = secretStorageFor(app);
	if (!storage) return null;
	const value = storage.getSecret(getCodexCredentialSecretId(profileId));
	if (!value) return null;
	try {
		const parsed: unknown = JSON.parse(value);
		if (typeof parsed !== "object" || parsed === null) return null;
		const credential = parsed as Partial<CodexAccountCredential>;
		if (
			typeof credential.accessToken !== "string" ||
			!credential.accessToken ||
			typeof credential.refreshToken !== "string" ||
			!credential.refreshToken ||
			typeof credential.clientId !== "string" ||
			!credential.clientId ||
			typeof credential.idToken !== "string" ||
			!credential.idToken ||
			typeof credential.subject !== "string" ||
			!credential.subject ||
			typeof credential.extAgentHostId !== "string" ||
			!credential.extAgentHostId ||
			!Array.isArray(credential.scopes) ||
			!credential.scopes.every((scope) => typeof scope === "string")
		) {
			return null;
		}
		return {
			accessToken: credential.accessToken,
			refreshToken: credential.refreshToken,
			clientId: credential.clientId,
			idToken: credential.idToken,
			subject: credential.subject,
			extAgentHostId: credential.extAgentHostId,
			scopes: credential.scopes as string[],
			expiresAt:
				typeof credential.expiresAt === "number" &&
				Number.isFinite(credential.expiresAt)
					? credential.expiresAt
					: undefined,
		};
	} catch {
		return null;
	}
};

export const getCodexCredential = (
	app: App,
	profileId: string,
): CodexAccountCredential | null => {
	const credential = getCodexRegistrationCredential(app, profileId);
	return credential?.scopes.includes("chatgpt.tokens.use.direct") &&
		credential.scopes.includes("resource.invoke")
		? credential
		: null;
};

export const saveCodexCredential = (
	app: App,
	profileId: string,
	credential: CodexAccountCredential,
): void => {
	const storage = secretStorageFor(app);
	if (!storage) {
		throw new Error(
			"Secure account storage requires Obsidian 1.11.4 or newer.",
		);
	}
	storage.setSecret(
		getCodexCredentialSecretId(profileId),
		JSON.stringify(credential),
	);
};

export const clearCodexCredential = (app: App, profileId: string): void => {
	const storage = secretStorageFor(app);
	if (!storage) return;
	// SecretStorage currently exposes set/get/list but no delete operation.
	storage.setSecret(getCodexCredentialSecretId(profileId), "");
};

export const refreshCodexCredential = async (
	app: App,
	profileId: string,
	credential: CodexAccountCredential,
): Promise<CodexAccountCredential> => {
	const secretId = getCodexCredentialSecretId(profileId);
	const stored = getCodexCredential(app, profileId);
	if (
		stored &&
		(stored.accessToken !== credential.accessToken ||
			stored.refreshToken !== credential.refreshToken)
	) {
		return stored;
	}
	const pending = refreshes.get(secretId);
	if (pending) return pending;

	const request = refreshCodexOAuthCredential(credential).then((updated) => {
		saveCodexCredential(app, profileId, updated);
		return updated;
	});
	refreshes.set(secretId, request);
	try {
		return await request;
	} finally {
		if (refreshes.get(secretId) === request) refreshes.delete(secretId);
	}
};

export const getFreshCodexCredential = async (
	app: App,
	profileId: string,
): Promise<CodexAccountCredential> => {
	const credential = getCodexCredential(app, profileId);
	if (!credential) {
		throw new Error(
			"Sign in with ChatGPT and approve ChatGPT plan use before using this profile.",
		);
	}
	if (
		credential.expiresAt !== undefined &&
		credential.expiresAt <= Date.now() + REFRESH_MARGIN_MS
	) {
		return refreshCodexCredential(app, profileId, credential);
	}
	return credential;
};
