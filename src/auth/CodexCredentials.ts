import type { App, SecretStorage } from "obsidian";
import {
	CodexMobileCompatibilityProbe,
	type CodexProbeCredential,
} from "./CodexMobileCompatibilityProbe";

const SECRET_PREFIX = "chat-lab-codex-";
const REFRESH_MARGIN_MS = 30_000;
interface PendingRefresh {
	revision: number;
	credential: CodexProbeCredential;
	promise: Promise<CodexProbeCredential>;
}

const refreshes = new Map<string, PendingRefresh>();
const credentialRevisions = new Map<string, number>();

const getCredentialRevision = (secretId: string): number =>
	credentialRevisions.get(secretId) ?? 0;

const markCredentialChanged = (secretId: string): void => {
	credentialRevisions.set(secretId, getCredentialRevision(secretId) + 1);
	refreshes.delete(secretId);
};

const credentialsMatch = (
	left: CodexProbeCredential,
	right: CodexProbeCredential,
): boolean =>
	left.accessToken === right.accessToken &&
	left.refreshToken === right.refreshToken &&
	left.accountId === right.accountId &&
	left.expiresAt === right.expiresAt;

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
	markCredentialChanged(getCodexCredentialSecretId(profileId));
};

export const clearCodexCredential = (app: App, profileId: string): void => {
	const storage = secretStorageFor(app);
	if (!storage) return;
	// SecretStorage currently exposes set/get/list but no delete operation.
	const secretId = getCodexCredentialSecretId(profileId);
	storage.setSecret(secretId, "");
	markCredentialChanged(secretId);
};

export const refreshCodexCredential = async (
	app: App,
	profileId: string,
	credential: CodexProbeCredential,
): Promise<CodexProbeCredential> => {
	const secretId = getCodexCredentialSecretId(profileId);
	const stored = getCodexCredential(app, profileId);
	if (stored && !credentialsMatch(stored, credential)) {
		return stored;
	}
	if (!stored) {
		throw new Error(
			"Codex credentials were cleared before token refresh started.",
		);
	}
	const revision = getCredentialRevision(secretId);
	const pending = refreshes.get(secretId);
	if (
		pending?.revision === revision &&
		credentialsMatch(pending.credential, credential)
	) {
		return pending.promise;
	}

	const request = new CodexMobileCompatibilityProbe()
		.refreshCredential(credential)
		.then((updated) => {
			const current = getCodexCredential(app, profileId);
			if (
				getCredentialRevision(secretId) !== revision ||
				!current ||
				!credentialsMatch(current, credential)
			) {
				throw new Error(
					"Codex credentials changed during token refresh; sign in again before retrying.",
				);
			}
			saveCodexCredential(app, profileId, updated);
			return updated;
		});
	const pendingRefresh = { revision, credential, promise: request };
	refreshes.set(secretId, pendingRefresh);
	try {
		return await request;
	} finally {
		if (refreshes.get(secretId) === pendingRefresh)
			refreshes.delete(secretId);
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
