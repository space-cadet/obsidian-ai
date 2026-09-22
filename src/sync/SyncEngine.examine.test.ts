// src/sync/SyncEngine.examine.test.ts
// T46: SyncEngine.examine — read-only store comparison feeding the sync
// panel's examine step. Counts and lists must match what sync() would
// transfer (same index load, same direction filter).
import { describe, it, expect } from "vitest";
import { SyncEngine } from "./SyncEngine";
import { checksum } from "./EncryptionLayer";

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

function makeEngine(opts: { locals: any[]; remotes: any[] }) {
	const cache = {
		getAllSessions: async () => opts.locals,
		getSession: async (id: string) =>
			opts.locals.find((l: any) => l.id === id) ?? null,
		putSession: async () => {},
		deleteSession: async () => {},
		markSynced: async () => {},
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
	return new SyncEngine({
		adapter: adapter as any,
		cache: cache as any,
		crypto: crypto as any,
		passphrase: "",
	});
}

function verifiedLocal(id: string, etag: string) {
	return {
		id,
		title: id.toUpperCase(),
		messages: [
			{ id: `${id}-m`, role: "user", content: "local", timestamp: 1 },
		],
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

function remoteMeta(id: string, etag: string, size = 10) {
	return { id, modifiedAt: 7, etag, size };
}

function pendingChangedLocal(id: string, etag: string) {
	return {
		...verifiedLocal(id, etag),
		_syncStatus: "pending",
		updatedAt: 9,
	};
}

describe("SyncEngine.examine (T46)", () => {
	it("reports store counts and pending transfers for both directions", async () => {
		const engine = makeEngine({
			locals: [
				pendingChangedLocal("s0", "e0"),
				verifiedLocal("s1", "etag-1"),
				unverifiedLocal("s2", "etag-2"),
			],
			remotes: [
				remoteMeta("s0", "e0"),
				remoteMeta("s1", "etag-1"),
				remoteMeta("s2", "etag-2"),
				{ id: "sess-r3", modifiedAt: 3, size: 500 },
			],
		});
		const exam = await engine.examine("both");
		expect(exam.localCount).toBe(3);
		expect(exam.remoteCount).toBe(4);
		// Verified pending local uploads; unverified local re-downloads;
		// verified unchanged is skipped; remote-only downloads.
		expect(exam.upload.map((s) => s.id)).toEqual(["s0"]);
		expect(exam.download.map((s) => s.id).sort()).toEqual([
			"s2",
			"sess-r3",
		]);
		expect(exam.conflicts).toEqual([]);
		expect(exam.unchanged).toBe(1);
		// Titles: local title when cached, short id otherwise.
		expect(exam.upload[0].title).toBe("S0");
		expect(exam.download.find((s) => s.id === "s2")!.title).toBe("S2");
		expect(exam.download.find((s) => s.id === "sess-r3")!.title).toBe(
			"sess-r3",
		);
		expect(exam.downloadBytes).toBe(510);
		expect(exam.uploadBytes).toBeGreaterThan(0);
	});

	it("applies the upload direction filter like sync()", async () => {
		const engine = makeEngine({
			locals: [
				pendingChangedLocal("s0", "e0"),
				unverifiedLocal("s2", "etag-2"),
			],
			remotes: [remoteMeta("s0", "e0"), remoteMeta("s2", "etag-2")],
		});
		const exam = await engine.examine("upload");
		expect(exam.upload.map((s) => s.id)).toEqual(["s0"]);
		expect(exam.download).toEqual([]);
		expect(exam.conflicts).toEqual([]);
	});

	it("applies the download direction filter like sync()", async () => {
		const engine = makeEngine({
			locals: [
				pendingChangedLocal("s0", "e0"),
				unverifiedLocal("s2", "etag-2"),
			],
			remotes: [remoteMeta("s0", "e0"), remoteMeta("s2", "etag-2")],
		});
		const exam = await engine.examine("download");
		expect(exam.upload).toEqual([]);
		expect(exam.conflicts).toEqual([]);
		expect(exam.download.map((s) => s.id)).toEqual(["s2"]);
	});

	it("plans deletion of a previously synced remote session when local storage removed it", () => {
		const engine = makeEngine({
			locals: [],
			remotes: [remoteMeta("s1", "etag-1")],
		});
		const plan = (engine as any).computeSyncPlanFromState(
			[],
			[remoteMeta("s1", "etag-1")],
			{ entries: { s1: {} } },
		);
		expect(plan.deleteRemote.map((s: any) => s.id)).toEqual(["s1"]);
		expect(plan.download).toEqual([]);
	});

	it("plans local removal when a remote deletion tombstone is present", () => {
		const local = verifiedLocal("s1", "etag-1");
		const engine = makeEngine({ locals: [local], remotes: [] });
		const plan = (engine as any).computeSyncPlanFromState(
			[local],
			[],
			null,
			new Set(["s1"]),
		);
		expect(plan.deleteLocal).toEqual(["s1"]);
		expect(plan.upload).toEqual([]);
	});

	it("throws while a sync is running", async () => {
		const engine = makeEngine({ locals: [], remotes: [] });
		(engine as any).state = "syncing";
		await expect(engine.examine("both")).rejects.toThrow(
			/Sync in progress/,
		);
	});
});
