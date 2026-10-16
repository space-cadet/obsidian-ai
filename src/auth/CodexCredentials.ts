import type { App, SecretStorage } from "obsidian";
import {
	CodexMobileCompatibilityProbe,
	type CodexProbeCredential,
} from "./CodexMobileCompatibilityProbe";

const SECRET_PREFIX = "chat-lab-codex-";
const REFRESH_MARGIN_MS = 30_000;
const refreshes = new Map<string, Promise<CodexProbeCredential>>();

const secretStorageFor = (app: App): SecretStorage | null => {
	const storage = (app as App & { secretStorage?: SecretStorage })
		.secretStorage;
	return storage && typeof storage.getSecret === "function" ? storage : null;
};

export const hasCodexSecretStorage = (app: App): boolean =>
	secretStorageFor(app) !== null;

export const getCodexCredentialSecretId = (profileId: string): string => {
	const suffix = profileId
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	return `${SECRET_PREFIX}${suffix || "default"}`;
};

export const getCodexCredential = (
	app: App,
	profileId: string,
): CodexProbeCredential | null => {
	const storage = secretStorageFor(app);
	if (!storage) return null;
	const value = storage.getSecret(getCodexCredentialSecretId(profileId));
	if (!value) return null;
	try {
		const parsed: unknown = JSON.parse(value);
		if (typeof parsed !== "object" || parsed === null) return null;
		const credential = parsed as Partial<CodexProbeCredential>;
		if (
			typeof credential.accessToken !== "string" ||
			!credential.accessToken ||
			typeof credential.refreshToken !== "string" ||
			!credential.refreshToken
		) {
			return null;
		}
		return {
			accessToken: credential.accessToken,
			refreshToken: credential.refreshToken,
			accountId:
				typeof credential.accountId === "string"
					? credential.accountId
					: undefined,
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

export const saveCodexCredential = (
	app: App,
	profileId: string,
	credential: CodexProbeCredential,
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
	credential: CodexProbeCredential,
): Promise<CodexProbeCredential> => {
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

	const request = new CodexMobileCompatibilityProbe()
		.refreshCredential(credential)
		.then((updated) => {
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
): Promise<CodexProbeCredential> => {
	const credential = getCodexCredential(app, profileId);
	if (!credential) {
		throw new Error(
			"Sign in to your Codex account before using this profile.",
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
