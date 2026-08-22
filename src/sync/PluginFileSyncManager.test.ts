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

	async deleteText(path: string): Promise<void> {
		this.files.delete(path);
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

class FakeStateStore {
	state: any = null;

	async load() {
		return this.state;
	}

	async save(state: any) {
		this.state = structuredClone(state);
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

function makeStateTarget(initial: string | null = "local value") {
	let local = initial;
	const backups: Array<{ content: string; reason: string }> = [];
	const conflictCopies: string[] = [];
	const target: PluginFileSyncTarget = {
		id: "memory",
		remotePath: "intelligence/memory.json",
		readLocal: async () => local,
		writeLocal: async (content) => {
			local = content;
		},
		backupLocal: async (content, reason) => {
			backups.push({ content, reason });
		},
		deleteLocal: async () => {
			local = null;
		},
		writeConflictCopy: async (content) => {
			conflictCopies.push(content);
		},
	};
	return {
		target,
		getLocal: () => local,
		backups,
		conflictCopies,
	};
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

	it("plans plugin data without writing remote, local, or shared state", async () => {
		const remote = new FakeRemote();
		const state = new FakeStateStore();
		const local = makeStateTarget("dry-run value");
		const manager = new PluginFileSyncManager({
			remote,
			crypto: new EncryptionLayer(),
			stateStore: state,
		});

		const result = await manager.plan([local.target], "upload");

		expect(result.uploaded).toBe(1);
		expect(result.failed).toBe(0);
		expect(remote.atomicWrites).toHaveLength(0);
		expect(state.state).toBeNull();
		expect(local.getLocal()).toBe("dry-run value");
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

	it("downloads remote-only data on a new device and records shared state", async () => {
		const remote = new FakeRemote();
		const uploader = new PluginFileSyncManager({
			remote,
			crypto: new EncryptionLayer(),
			stateStore: new FakeStateStore(),
		});
		await uploader.sync([makeStateTarget("shared value").target], "both");

		const receiver = makeStateTarget(null);
		const result = await new PluginFileSyncManager({
			remote,
			crypto: new EncryptionLayer(),
			stateStore: new FakeStateStore(),
		}).sync([receiver.target], "both");

		expect(result.downloaded).toBe(1);
		expect(receiver.getLocal()).toBe("shared value");
	});

	it("backs up before applying a remote-only replacement", async () => {
		const remote = new FakeRemote();
		const state = new FakeStateStore();
		const manager = new PluginFileSyncManager({
			remote,
			crypto: new EncryptionLayer(),
			stateStore: state,
		});
		const first = makeStateTarget("base");
		await manager.sync([first.target], "both");

		const remoteWriter = new PluginFileSyncManager({
			remote,
			crypto: new EncryptionLayer(),
			stateStore: new FakeStateStore(),
		});
		await remoteWriter.sync([makeStateTarget("remote").target], "upload");

		const local = makeStateTarget("base");
		const result = await new PluginFileSyncManager({
			remote,
			crypto: new EncryptionLayer(),
			stateStore: state,
		}).sync([local.target], "both");

		expect(result.downloaded).toBe(1);
		expect(local.getLocal()).toBe("remote");
		expect(local.backups).toEqual([
			{ content: "base", reason: "replacement" },
		]);
	});

	it.each(["local", "remote", "both", "cancel"] as const)(
		"honors the %s conflict choice",
		async (choice) => {
			const remote = new FakeRemote();
			const stateA = new FakeStateStore();
			const seed = new PluginFileSyncManager({
				remote,
				crypto: new EncryptionLayer(),
				stateStore: stateA,
			});
			await seed.sync([makeStateTarget("base").target], "both");

			const remoteWriter = new PluginFileSyncManager({
				remote,
				crypto: new EncryptionLayer(),
				stateStore: new FakeStateStore(),
			});
			await remoteWriter.sync(
				[makeStateTarget("remote").target],
				"upload",
			);

			const local = makeStateTarget("local");
			const result = await new PluginFileSyncManager({
				remote,
				crypto: new EncryptionLayer(),
				stateStore: stateA,
				resolveConflict: async () => choice,
			}).sync([local.target], "both");

			if (choice === "local") {
				expect(local.getLocal()).toBe("local");
				expect(result.uploaded).toBe(1);
			} else if (choice === "remote") {
				expect(local.getLocal()).toBe("remote");
				expect(result.downloaded).toBe(1);
				expect(local.backups[0].content).toBe("local");
			} else {
				expect(local.getLocal()).toBe("local");
				expect(result.conflicts).toBe(1);
				if (choice === "both")
					expect(local.conflictCopies).toEqual(["remote"]);
			}
		},
	);

	it("propagates a known deletion but stops on an unexplained disappearance", async () => {
		const remote = new FakeRemote();
		const state = new FakeStateStore();
		const manager = new PluginFileSyncManager({
			remote,
			crypto: new EncryptionLayer(),
			stateStore: state,
		});
		await manager.sync([makeStateTarget("base").target], "both");
		const receiverState = new FakeStateStore();
		receiverState.state = structuredClone(state.state);

		const deleted = makeStateTarget(null);
		const deletion = await new PluginFileSyncManager({
			remote,
			crypto: new EncryptionLayer(),
			stateStore: state,
		}).sync([deleted.target], "both");
		expect(deletion.uploaded).toBe(1);
		expect(remote.files.has("intelligence/memory.json")).toBe(false);

		const receiver = makeStateTarget("base");
		const received = await new PluginFileSyncManager({
			remote,
			crypto: new EncryptionLayer(),
			stateStore: receiverState,
		}).sync([receiver.target], "both");
		expect(received.downloaded).toBe(1);
		expect(receiver.getLocal()).toBe(null);
		expect(receiver.backups[0].content).toBe("base");

		const unknown = makeStateTarget("should stay");
		const unknownState = new FakeStateStore();
		unknownState.state = {
			schemaVersion: 1,
			entries: {
				memory: {
					exists: true,
					checksum: "0".repeat(64),
					lastSharedAt: 1,
				},
			},
			deletions: [],
		};
		const unknownResult = await new PluginFileSyncManager({
			remote,
			crypto: new EncryptionLayer(),
			stateStore: unknownState,
		}).sync([unknown.target], "both");
		expect(unknownResult.conflicts).toBe(1);
		expect(unknown.getLocal()).toBe("should stay");
	});
});
