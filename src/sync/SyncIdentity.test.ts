import { describe, expect, it } from "vitest";
import { makeSyncIdentity } from "./SyncIdentity";

const base = {
	vaultId: "vault-a",
	backend: "webdav",
	server: "https://sync.example/",
	account: "alice",
	remotePath: "/chat-lab/",
	encryptionIdentity: "secret-a",
};

describe("makeSyncIdentity", () => {
	it("normalizes equivalent connection settings", () => {
		expect(makeSyncIdentity(base)).toBe(
			makeSyncIdentity({
				...base,
				server: " https://sync.example ",
				remotePath: "//chat-lab//",
				backend: "WEBDAV",
			}),
		);
	});

	it("changes when an isolation boundary changes", () => {
		expect(makeSyncIdentity(base)).not.toBe(
			makeSyncIdentity({ ...base, account: "bob" }),
		);
		expect(makeSyncIdentity(base)).not.toBe(
			makeSyncIdentity({ ...base, encryptionIdentity: "secret-b" }),
		);
	});
});
