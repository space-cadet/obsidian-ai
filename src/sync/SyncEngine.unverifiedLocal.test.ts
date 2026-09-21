import { describe, it, expect } from "vitest";
import { SyncEngine } from "./SyncEngine";
import { SyncIndexManager } from "./SyncIndexManager";
import { checksum } from "./EncryptionLayer";
import type { SyncIndex } from "./SyncIndex";

const REMOTE_PLAINTEXT = JSON.stringify({
	id: "s1",
	title: "S1",
	messages: [
		{ id: "m1", role: "user", content: "from remote", timestamp: 1 },
	],
	createdAt: 2,
	updatedAt: 2,
	contextItems: [],
});

function makeIndexEntry(etag: string) {
	return {
		localChecksum: "x",
		localMtime: 5,
		localSize: 10,
		remoteMtime: 7,
		etag,
	};
}

function makeEngine(opts: {
	locals: any[];
	remotes: any[];
	puts?: any[];
	deletes?: string[];
	synced?: string[];
}) {
	const puts = opts.puts ?? [];
	const deletes = opts.deletes ?? [];
	const synced = opts.synced ?? [];
	const cache = {
		getAllSessions: async () => opts.locals,
		getSession: async (id: string) =>
			opts.locals.find((l: any) => l.id === id) ?? null,
		putSession: async (s: any) => {
			puts.push(s);
		},
		deleteSession: async (id: string) => {
			deletes.push(id);
		},
		markSynced: async (id: string) => {
			synced.push(id);
		},
		setLastSyncTime: async () => {},
		close: async () => {},
	};
	const adapter = {
		name: "fake",
		initialize: async () => {},
		disconnect: async () => {},
		listSessions: async () => opts.remotes,
		getSession: async (id: string) =>
			id === "s1"
				? {
						id: "s1",
						ciphertext: REMOTE_PLAINTEXT,
						checksum: await checksum(REMOTE_PLAINTEXT),
						modifiedAt: 2,
						version: 1,
					}
				: null,
		putSession: async () => ({ etag: "etag-1", modifiedAt: 5 }),
		writeText: async () => {},
		writeTextAtomic: async () => ({ etag: "etag-1" }),
		readText: async () => null,
		deleteText: async () => {},
		deleteSession: async () => {},
		getLastSyncTime: async () => null,
		setLastSyncTime: async () => {},
	};
	const crypto = {
		encrypt: async (plaintext: string) => ({
			ciphertext: plaintext,
			unencrypted: true,
		}),
		decrypt: async (payload: any) => payload.ciphertext,
		setPassphrase: () => {},
		clear: () => {},
	};
	const engine = new SyncEngine({
		adapter: adapter as any,
		cache: cache as any,
		crypto: crypto as any,
		passphrase: "",
	});
	return { engine, puts, deletes, synced };
}

function verifiedLocal(id: string, etag: string) {
	return {
		id,
		title: id.toUpperCase(),
		messages: [{ id: `${id}-m`, role: "user", content: "local", timestamp: 1 }],
		createdAt: 1,
		updatedAt: 5,
		contextItems: [],
		_syncStatus: "synced",
		_etag: etag,
		_remoteModifiedAt: 7,
		hydrated: true,
	};
}

function unverifiedLocal(id: string, etag: string, syncStatus = "synced") {
	return {
		...verifiedLocal(id, etag),
		messages: [],
		_syncStatus: syncStatus,
		hydrated: false,
	};
}

function remoteMeta(id: string, etag: string) {
	return { id, modifiedAt: 7, etag, size: 10 };
}

describe("SyncIndexManager.isUnchanged — unverified local guard", () => {
	it("treats an unhydrated local as changed even with matching metadata", () => {
		const mgr = new SyncIndexManager(
			{ load: async () => null, save: async () => {} },
			"test-sync-index",
		);
		const index: SyncIndex = {
			lastSyncTime: 1000,
			serverSignature: "sig",
			entries: { s1: makeIndexEntry("etag-1") },
		};
		const remote = remoteMeta("s1", "etag-1");
		const verified = { ...verifiedLocal("s1", "etag-1"), _syncStatus: undefined } as any;
		const unverified = unverifiedLocal("s1", "etag-1");
		expect(mgr.isUnchanged(verified, remote, index)).toBe(true);
		expect(mgr.isUnchanged(unverified, remote, index)).toBe(false);
	});
});

describe("SyncEngine unverified-local plan", () => {
	it("skips verified-unchanged but re-downloads unverified locals (index fast path)", async () => {
		const { engine } = makeEngine({
			locals: [verifiedLocal("s1", "etag-1"), unverifiedLocal("s2", "etag-2")],
			remotes: [remoteMeta("s1", "etag-1"), remoteMeta("s2", "etag-2")],
		});
		const mgr = new SyncIndexManager(
			{ load: async () => null, save: async () => {} },
			"test-sync-index",
		);
		const index: SyncIndex = {
			lastSyncTime: 1000,
			serverSignature: "sig",
			entries: { s1: makeIndexEntry("etag-1"), s2: makeIndexEntry("etag-2") },
		};
		const plan = await engine.computeSyncPlan(index);
		expect(plan.download.map((m) => m.id)).toEqual(["s2"]);
		expect(plan.skipped).toBe(1);
		expect(plan.upload).toEqual([]);
	});

	it("re-downloads unverified locals even without the sync index (etag match)", async () => {
		const { engine } = makeEngine({
			locals: [verifiedLocal("s1", "etag-1"), unverifiedLocal("s2", "etag-2")],
			remotes: [remoteMeta("s1", "etag-1"), remoteMeta("s2", "etag-2")],
		});
		const plan = await engine.computeSyncPlan(null);
		expect(plan.download.map((m) => m.id)).toEqual(["s2"]);
		expect(plan.skipped).toBe(1);
	});

	it("never uploads an unverified local — pending+unhydrated downloads instead", async () => {
		const { engine } = makeEngine({
			locals: [
				verifiedLocal("s0", "e0"),
				unverifiedLocal("s1", "etag-1", "pending"),
			],
			remotes: [remoteMeta("s0", "e0"), remoteMeta("s1", "etag-1")],
		});
		// Make s0 a verified pending local (real in-memory edits hydrate).
		const locals = await (engine as any).cache.getAllSessions();
		locals[0]._syncStatus = "pending";
		locals[0].updatedAt = 9;
		const plan = await engine.computeSyncPlan(null);
		expect(plan.upload.map((s) => s.id)).toEqual(["s0"]);
		expect(plan.download.map((m) => m.id)).toEqual(["s1"]);
		expect(plan.conflicts).toEqual([]);
	});

	it("remote-wins rebuild re-downloads unverified locals and caches them hydrated", async () => {
		const puts: any[] = [];
		const synced: string[] = [];
		const { engine } = makeEngine({
			locals: [unverifiedLocal("s1", "etag-1")],
			remotes: [remoteMeta("s1", "etag-1")],
			puts,
			synced,
		});
		const result = await engine.rebuildIndex("remote");
		expect(result.downloaded).toBe(1);
		expect(result.errors).toEqual([]);
		expect(puts).toHaveLength(1);
		expect(puts[0].hydrated).toBe(true);
		expect(puts[0].messages).toHaveLength(1);
		expect(puts[0].messages[0].content).toBe("from remote");
		expect(synced).toEqual(["s1"]);
	});
});

describe("SyncEngine.populateCache — unverified sessions", () => {
	it("evicts unverified cache entries and never puts stubs", async () => {
		const puts: any[] = [];
		const deletes: string[] = [];
		const { engine } = makeEngine({
			locals: [
				{ ...unverifiedLocal("s1", "etag-1") },
				{ ...verifiedLocal("s2", "etag-2") },
			],
			remotes: [],
			puts,
			deletes,
		});
		await engine.populateCache([
			unverifiedLocal("s1", "etag-1"),
			verifiedLocal("s2", "etag-2"),
			{ ...verifiedLocal("s3", "etag-3"), _syncStatus: undefined, _etag: undefined, _remoteModifiedAt: undefined },
		] as any);
		expect(deletes).toEqual(["s1"]);
		expect(puts).toHaveLength(1);
		expect(puts[0].id).toBe("s3");
		// Real LocalCache.putSession stamps _syncStatus "pending" on put.
	});
});
