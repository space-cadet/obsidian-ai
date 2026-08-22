import { describe, expect, it } from "vitest";
import { EncryptionLayer } from "./EncryptionLayer";
import {
	PluginFileSyncManager,
	type PluginFileSyncRemote,
	type PluginFileSyncTarget,
	type PluginFileEnvelope,
} from "./PluginFileSyncManager";

class FakeRemote implements PluginFileSyncRemote {
	files = new Map<string, string>();
	atomicWrites: Array<{
		path: string;
		content: string;
		contentType?: string;
	}> = [];

	async readText(path: string): Promise<string | null> {
		return this.files.get(path) ?? null;
	}

	async writeTextAtomic(
		path: string,
		content: string,
		contentType?: string,
	): Promise<{ etag?: string; modifiedAt?: number }> {
		this.atomicWrites.push({ path, content, contentType });
		this.files.set(path, content);
		return { etag: `etag-${this.atomicWrites.length}`, modifiedAt: 1000 };
	}
}

function makeTarget(initial: string | null = "local value") {
	let local = initial;
	const target: PluginFileSyncTarget = {
		id: "memory",
		remotePath: "intelligence/memory.json",
		readLocal: async () => local,
		writeLocal: async (content) => {
			local = content;
		},
	};
	return { target, getLocal: () => local };
}

describe("PluginFileSyncManager", () => {
	it("uploads a versioned, checksummed envelope through the atomic writer", async () => {
		const remote = new FakeRemote();
		const crypto = new EncryptionLayer();
		crypto.setPassphrase("");
		const manager = new PluginFileSyncManager({
			remote,
			crypto,
			now: () => 1234,
		});

		const result = await manager.sync([makeTarget().target], "upload");
		const envelope = JSON.parse(
			remote.files.get("intelligence/memory.json")!,
		) as PluginFileEnvelope;

		expect(result.uploaded).toBe(1);
		expect(result.failed).toBe(0);
		expect(result.items[0].status).toBe("uploaded");
		expect(envelope.format).toBe("obsidian-ai-plugin-file");
		expect(envelope.schemaVersion).toBe(1);
		expect(envelope.fileVersion).toBe(1);
		expect(envelope.modifiedAt).toBe(1234);
		expect(envelope.checksum).toMatch(/^[a-f0-9]{64}$/);
		expect(remote.atomicWrites[0].contentType).toBe("application/json");
	});

	it("encrypts and verifies plugin data across separate encryption instances", async () => {
		const remote = new FakeRemote();
		const uploaderCrypto = new EncryptionLayer();
		uploaderCrypto.setPassphrase("correct horse battery staple");
		const uploader = new PluginFileSyncManager({
			remote,
			crypto: uploaderCrypto,
			now: () => 2000,
		});
		await uploader.sync([makeTarget("private memory").target], "upload");

		const receiver = makeTarget(null);
		const receiverCrypto = new EncryptionLayer();
		receiverCrypto.setPassphrase("correct horse battery staple");
		const downloader = new PluginFileSyncManager({
			remote,
			crypto: receiverCrypto,
		});
		const result = await downloader.sync([receiver.target], "download");

		expect(result.downloaded).toBe(1);
		expect(result.failed).toBe(0);
		expect(receiver.getLocal()).toBe("private memory");
		const envelope = JSON.parse(
			remote.files.get("intelligence/memory.json")!,
		) as PluginFileEnvelope;
		expect(envelope.payload.unencrypted).toBeUndefined();
	});

	it("rejects damaged remote data without changing the local value", async () => {
		const remote = new FakeRemote();
		remote.files.set(
			"intelligence/memory.json",
			JSON.stringify({
				format: "obsidian-ai-plugin-file",
				schemaVersion: 1,
				fileVersion: 1,
				itemId: "memory",
				modifiedAt: 3000,
				checksum: "0".repeat(64),
				payload: { ciphertext: "changed", unencrypted: true },
			}),
		);
		const local = makeTarget("keep this");
		const manager = new PluginFileSyncManager({
			remote,
			crypto: new EncryptionLayer(),
		});

		const result = await manager.sync([local.target], "download");

		expect(result.downloaded).toBe(0);
		expect(result.failed).toBe(1);
		expect(result.errors[0]).toContain("memory");
		expect(local.getLocal()).toBe("keep this");
	});

	it("keeps upload-only targets from applying remote data", async () => {
		const remote = new FakeRemote();
		const local = makeTarget("local stats");
		remote.files.set("usage-stats.json", "not used");
		local.target.id = "usage-stats";
		local.target.remotePath = "usage-stats.json";
		local.target.allowDownload = false;
		const manager = new PluginFileSyncManager({
			remote,
			crypto: new EncryptionLayer(),
		});

		const result = await manager.sync([local.target], "both");

		expect(result.uploaded).toBe(1);
		expect(result.downloaded).toBe(0);
		expect(local.getLocal()).toBe("local stats");
	});

	it("reports a two-way conflict without overwriting either side", async () => {
		const remote = new FakeRemote();
		const uploader = new PluginFileSyncManager({
			remote,
			crypto: new EncryptionLayer(),
		});
		await uploader.sync([makeTarget("remote value").target], "upload");

		const local = makeTarget("local value");
		const manager = new PluginFileSyncManager({
			remote,
			crypto: new EncryptionLayer(),
		});
		const result = await manager.sync([local.target], "both");

		expect(result.conflicts).toBe(1);
		expect(result.failed).toBe(0);
		expect(result.items[0].status).toBe("conflict");
		expect(local.getLocal()).toBe("local value");
	});
});
