import { describe, expect, it } from "vitest";
import { DurableSyncRetryStore } from "./SyncRetryStore";

function makeStorage() {
	let data: Record<string, unknown> | null = null;
	return {
		storage: {
			load: async () => data,
			save: async (next: Record<string, unknown>) => {
				data = next;
			},
		},
		read: () => data,
	};
}

describe("DurableSyncRetryStore", () => {
	it("persists failures, increases backoff, and clears successes", async () => {
		const fixture = makeStorage();
		let now = 100;
		const store = new DurableSyncRetryStore(
			fixture.storage,
			"sync-v1-a",
			() => now,
		);

		const first = await store.record("plugin-data", "memory", "offline");
		now = 200;
		const second = await store.record(
			"plugin-data",
			"memory",
			"still offline",
		);
		expect(first.attempts).toBe(1);
		expect(second.attempts).toBe(2);
		expect(second.nextRetryAt).toBeGreaterThan(first.nextRetryAt);

		const restored = new DurableSyncRetryStore(
			fixture.storage,
			"sync-v1-a",
			() => now,
		);
		expect(await restored.list()).toHaveLength(1);
		await restored.clear("plugin-data", "memory");
		expect(await restored.list()).toEqual([]);
		expect(fixture.read()).toBeTruthy();
	});

	it("does not reuse records from another sync identity", async () => {
		const fixture = makeStorage();
		const first = new DurableSyncRetryStore(fixture.storage, "sync-v1-a");
		await first.record("chat-session", "session-1", "offline");
		const other = new DurableSyncRetryStore(fixture.storage, "sync-v1-b");
		expect(await other.list()).toEqual([]);
	});
});
