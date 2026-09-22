import { describe, it, expect } from "vitest";
import { SyncEngine } from "./SyncEngine";
import { estimateSessionBytes } from "./StorageAdapter";
import type { SyncEngineProgressEvent as ProgressEvent } from "./SyncProgress";
import { checksum } from "./EncryptionLayer";

const REMOTE_PLAINTEXT = JSON.stringify({
	id: "c",
	title: "C",
	messages: [],
	createdAt: 2,
	updatedAt: 2,
	contextItems: [],
});

function makeEngine(
	localSessions: any[],
	remoteMetas: any[],
	events: ProgressEvent[] = [],
	options: { onSessionsDownloaded?: (sessions: any[]) => Promise<void> } = {},
) {
	const cache = {
		getAllSessions: async () => localSessions,
		putSession: async () => {},
		markSynced: async () => {},
		setLastSyncTime: async () => {},
		close: async () => {},
	};
	const adapter = {
		name: "fake",
		initialize: async () => {},
		disconnect: async () => {},
		listSessions: async () => remoteMetas,
		getSession: async (id: string) => {
			if (!remoteMetas.some((remote) => remote.id === id)) return null;
			const plaintext = JSON.stringify({
				...JSON.parse(REMOTE_PLAINTEXT),
				id,
				title: id.toUpperCase(),
			});
			return {
				id,
				ciphertext: plaintext,
				checksum: await checksum(plaintext),
				modifiedAt: 2,
				version: 1,
			};
		},
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
		progress: (e) => events.push(e),
		onSessionsDownloaded: options.onSessionsDownloaded,
	});
	return engine;
}

describe("SyncEngine plan bytes (T42g)", () => {
	it("computeSyncPlan sums upload payload bytes and remote sizes", async () => {
		const local: any[] = [
			{
				id: "a",
				title: "A",
				messages: [{ content: "x".repeat(100) }],
				createdAt: 1,
				updatedAt: 1,
				contextItems: [],
			},
			{
				id: "b",
				title: "B",
				messages: [],
				createdAt: 1,
				updatedAt: 1,
				contextItems: [],
			},
		];
		const remote = [
			{ id: "c", modifiedAt: 2, size: 512 },
			{ id: "d", modifiedAt: 2 },
		];
		const engine = makeEngine(local, remote);
		const plan = await engine.computeSyncPlan(null);
		expect(plan.upload.map((s) => s.id)).toEqual(["a", "b"]);
		expect(plan.download.map((m) => m.id)).toEqual(["c", "d"]);
		expect(plan.uploadBytes).toBe(
			local.reduce((n, s) => n + estimateSessionBytes(s), 0),
		);
		expect(plan.downloadBytes).toBe(512);
	});

	it("sync() emits planBytes on the plan stage and bytes on session done", async () => {
		const local: any[] = [
			{
				id: "a",
				title: "A",
				messages: [{ content: "hello" }],
				createdAt: 1,
				updatedAt: 1,
				contextItems: [],
			},
		];
		const remote = [{ id: "c", modifiedAt: 2, size: 256 }];
		const events: ProgressEvent[] = [];
		const engine = makeEngine(local, remote, events);
		const result = await engine.sync();

		expect(result.uploaded).toBe(1);
		expect(result.downloaded).toBe(1);

		const planStage = events.find(
			(e) =>
				e.type === "stage" &&
				e.id === "sync:plan" &&
				e.status === "done",
		);
		expect(planStage?.planBytes).toBeDefined();
		expect(planStage?.planBytes?.upload).toBe(
			estimateSessionBytes(local[0]),
		);
		expect(planStage?.planBytes?.download).toBe(256);

		const doneEvents = events.filter(
			(e) => e.type === "session" && e.status === "done",
		);
		expect(doneEvents.length).toBe(2);
		// Upload done carries actual transferred payload bytes (encrypted
		// wrapper included), which exceeds the raw-session plan estimate.
		const uploadDone = doneEvents.find((e) => e.direction === "upload");
		expect(uploadDone?.bytes).toBeGreaterThan(
			estimateSessionBytes(local[0]),
		);
		expect(doneEvents.find((e) => e.direction === "download")?.bytes).toBe(
			256,
		);
		expect(
			events.some(
				(e) =>
					e.type === "stage" &&
					e.id === "sync:persist-downloads" &&
					e.status === "start" &&
					e.indeterminate === true,
			),
		).toBe(true);
		expect(
			events.some(
				(e) =>
					e.type === "stage" &&
					e.id === "sync:persist-downloads" &&
					e.status === "done" &&
					e.stage === "Downloaded sessions saved",
			),
		).toBe(true);
	});

	it("persists normal downloads as one batch", async () => {
		const batches: any[][] = [];
		const engine = makeEngine(
			[
				{
					id: "a",
					title: "A",
					messages: [{ content: "hello" }],
					createdAt: 1,
					updatedAt: 1,
					contextItems: [],
				},
			],
			[
				{ id: "c", modifiedAt: 2, size: 256 },
				{ id: "d", modifiedAt: 2, size: 256 },
			],
			[],
			{
				onSessionsDownloaded: async (sessions) => {
					batches.push(sessions);
				},
			},
		);

		const result = await engine.sync("download");

		expect(result.downloaded).toBe(2);
		expect(batches).toHaveLength(1);
		expect(batches[0].map((session) => session.id).sort()).toEqual([
			"c",
			"d",
		]);
	});

	it("direction filter recomputes planned bytes", async () => {
		const local: any[] = [
			{
				id: "a",
				title: "A",
				messages: [{ content: "hello" }],
				createdAt: 1,
				updatedAt: 1,
				contextItems: [],
			},
		];
		const remote = [{ id: "c", modifiedAt: 2, size: 256 }];
		const events: ProgressEvent[] = [];
		const engine = makeEngine(local, remote, events);
		await engine.sync("upload");

		const planStage = events.find(
			(e) =>
				e.type === "stage" &&
				e.id === "sync:plan" &&
				e.status === "done",
		);
		expect(planStage?.planBytes?.upload).toBe(
			estimateSessionBytes(local[0]),
		);
		expect(planStage?.planBytes?.download).toBe(0);
	});
});
