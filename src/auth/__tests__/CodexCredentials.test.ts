import { beforeEach, describe, expect, it, vi } from "vitest";

const { refreshCredentialMock } = vi.hoisted(() => ({
	refreshCredentialMock: vi.fn(),
}));

vi.mock("../CodexMobileCompatibilityProbe", () => ({
	CodexMobileCompatibilityProbe: class {
		refreshCredential = refreshCredentialMock;
	},
}));

import {
	clearCodexCredential,
	getCodexCredential,
	refreshCodexCredential,
	saveCodexCredential,
} from "../CodexCredentials";
import type { CodexProbeCredential } from "../CodexMobileCompatibilityProbe";

const profileId = "refresh-race-profile";

const originalCredential: CodexProbeCredential = {
	accessToken: "old-access-token",
	refreshToken: "old-refresh-token",
	accountId: "account-old",
	expiresAt: 1000,
};

const refreshedCredential: CodexProbeCredential = {
	accessToken: "refreshed-access-token",
	refreshToken: "refreshed-refresh-token",
	accountId: "account-old",
	expiresAt: 2000,
};

const replacementCredential: CodexProbeCredential = {
	accessToken: "new-account-access-token",
	refreshToken: "new-account-refresh-token",
	accountId: "account-new",
	expiresAt: 3000,
};

const deferred = <T>() => {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
};

const makeApp = () => {
	const secrets = new Map<string, string>();
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

describe("Codex credential refresh races", () => {
	beforeEach(() => {
		refreshCredentialMock.mockReset();
	});

	it("does not restore a credential cleared while refresh is in flight", async () => {
		const { app } = makeApp();
		const pending = deferred<CodexProbeCredential>();
		refreshCredentialMock.mockReturnValue(pending.promise);
		saveCodexCredential(app, profileId, originalCredential);

		const refresh = refreshCodexCredential(
			app,
			profileId,
			originalCredential,
		);
		clearCodexCredential(app, profileId);
		pending.resolve(refreshedCredential);

		await expect(refresh).rejects.toThrow(
			"Codex credentials changed during token refresh",
		);
		expect(getCodexCredential(app, profileId)).toBeNull();
	});

	it("does not overwrite a replacement account with an old refresh result", async () => {
		const { app } = makeApp();
		const pending = deferred<CodexProbeCredential>();
		refreshCredentialMock.mockReturnValue(pending.promise);
		saveCodexCredential(app, profileId, originalCredential);

		const refresh = refreshCodexCredential(
			app,
			profileId,
			originalCredential,
		);
		saveCodexCredential(app, profileId, replacementCredential);
		pending.resolve(refreshedCredential);

		await expect(refresh).rejects.toThrow(
			"Codex credentials changed during token refresh",
		);
		expect(getCodexCredential(app, profileId)).toEqual(
			replacementCredential,
		);
	});

	it("allows a replacement account to start its own refresh", async () => {
		const { app } = makeApp();
		const oldPending = deferred<CodexProbeCredential>();
		const newPending = deferred<CodexProbeCredential>();
		refreshCredentialMock
			.mockReturnValueOnce(oldPending.promise)
			.mockReturnValueOnce(newPending.promise);
		saveCodexCredential(app, profileId, originalCredential);

		const oldRefresh = refreshCodexCredential(
			app,
			profileId,
			originalCredential,
		);
		saveCodexCredential(app, profileId, replacementCredential);
		const newRefresh = refreshCodexCredential(
			app,
			profileId,
			replacementCredential,
		);

		oldPending.resolve(refreshedCredential);
		await expect(oldRefresh).rejects.toThrow(
			"Codex credentials changed during token refresh",
		);
		expect(refreshCredentialMock).toHaveBeenCalledTimes(2);

		newPending.resolve({
			...replacementCredential,
			accessToken: "new-refreshed-access-token",
			refreshToken: "new-refreshed-refresh-token",
		});
		await expect(newRefresh).resolves.toMatchObject({
			accountId: "account-new",
			accessToken: "new-refreshed-access-token",
		});
	});
});
