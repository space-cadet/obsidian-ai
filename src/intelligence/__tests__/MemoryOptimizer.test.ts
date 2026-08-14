import { describe, it, expect, beforeEach } from "vitest";
import { MemoryOptimizer } from "../MemoryOptimizer";
import { MemoryStore } from "../MemoryStore";

function createMockApp() {
	const files = new Map<string, string>();
	return {
		vault: {
			adapter: {
				exists: async (path: string) => files.has(path),
				read: async (path: string) => {
					if (!files.has(path)) throw new Error("File not found");
					return files.get(path)!;
				},
				write: async (path: string, data: string) => files.set(path, data),
				stat: async (path: string) => ({ size: files.get(path)?.length ?? 0 }),
			},
		},
	} as any;
}

function createMockChatApi(response: string) {
	return {
		callApi: async () => response,
	} as any;
}

describe("MemoryOptimizer", () => {
	let store: MemoryStore;

	beforeEach(() => {
		store = new MemoryStore({
			app: createMockApp(),
			intelligenceDir: "/test/intelligence",
		});
	});

	it("removes exact duplicates via single-prompt AI clustering", async () => {
		const adapter = store["deps"].app.vault.adapter;
		await adapter.write("/test/intelligence/memory.json", JSON.stringify([
			{ id: "a1", timestamp: "2026-08-01", category: "preference", content: "User likes tea", tags: [] },
			{ id: "a2", timestamp: "2026-08-02", category: "preference", content: "User likes tea", tags: [] },
			{ id: "a3", timestamp: "2026-08-03", category: "preference", content: "User likes coffee", tags: [] },
		]));

		const optimizer = new MemoryOptimizer({
			memoryStore: store,
			chatApi: createMockChatApi('{"clusters":[[0,1],[2]]}'),
		});

		const result = await optimizer.aiPrune();
		expect(result.removed).toBe(1);
		expect(result.kept).toBe(2);
		expect(result.groups).toBe(1);
	});

	it("keeps the longest entry in a cluster", async () => {
		const adapter = store["deps"].app.vault.adapter;
		await adapter.write("/test/intelligence/memory.json", JSON.stringify([
			{ id: "b1", timestamp: "2026-08-01", category: "insight", content: "Short", tags: [] },
			{ id: "b2", timestamp: "2026-08-02", category: "insight", content: "A much longer and more detailed version of the same insight with extra context", tags: [] },
		]));

		const optimizer = new MemoryOptimizer({
			memoryStore: store,
			chatApi: createMockChatApi('{"clusters":[[0,1]]}'),
		});

		await optimizer.aiPrune();
		const all = await store.list();
		expect(all).toHaveLength(1);
		expect(all[0].content.length).toBeGreaterThan(50);
	});

	it("handles AI response with extra markdown", async () => {
		const adapter = store["deps"].app.vault.adapter;
		await adapter.write("/test/intelligence/memory.json", JSON.stringify([
			{ id: "c1", timestamp: "2026-08-01", category: "project", content: "Fact A", tags: [] },
			{ id: "c2", timestamp: "2026-08-02", category: "project", content: "Fact A again", tags: [] },
		]));

		const optimizer = new MemoryOptimizer({
			memoryStore: store,
			chatApi: createMockChatApi('Here is the result:\n\n```json\n{"clusters":[[0,1]]}\n```'),
		});

		const result = await optimizer.aiPrune();
		expect(result.removed).toBe(1);
	});

	it("falls back to no pruning on invalid AI response", async () => {
		const adapter = store["deps"].app.vault.adapter;
		await adapter.write("/test/intelligence/memory.json", JSON.stringify([
			{ id: "d1", timestamp: "2026-08-01", category: "reference", content: "Ref 1", tags: [] },
			{ id: "d2", timestamp: "2026-08-02", category: "reference", content: "Ref 2", tags: [] },
		]));

		const optimizer = new MemoryOptimizer({
			memoryStore: store,
			chatApi: createMockChatApi("invalid response with no json"),
		});

		const result = await optimizer.aiPrune();
		expect(result.removed).toBe(0);
		expect(result.kept).toBe(2);
	});

	it("handles empty memory store", async () => {
		const optimizer = new MemoryOptimizer({
			memoryStore: store,
			chatApi: createMockChatApi('{"clusters":[]}'),
		});

		const result = await optimizer.aiPrune();
		expect(result.removed).toBe(0);
		expect(result.kept).toBe(0);
	});

	it("reports byte savings", async () => {
		const adapter = store["deps"].app.vault.adapter;
		await adapter.write("/test/intelligence/memory.json", JSON.stringify([
			{ id: "e1", timestamp: "2026-08-01", category: "user_fact", content: "User is a physicist who works on quantum gravity and black holes", tags: ["physics"] },
			{ id: "e2", timestamp: "2026-08-02", category: "user_fact", content: "User is a physicist who works on quantum gravity", tags: ["physics"] },
		]));

		const optimizer = new MemoryOptimizer({
			memoryStore: store,
			chatApi: createMockChatApi('{"clusters":[[0,1]]}'),
		});

		const result = await optimizer.aiPrune();
		expect(result.bytesBefore).toBeGreaterThan(result.bytesAfter);
	});

	it("supports cancellation via AbortController", async () => {
		const adapter = store["deps"].app.vault.adapter;
		await adapter.write("/test/intelligence/memory.json", JSON.stringify([
			{ id: "f1", timestamp: "2026-08-01", category: "test", content: "Test entry", tags: [] },
		]));

		const optimizer = new MemoryOptimizer({
			memoryStore: store,
			chatApi: createMockChatApi('{"clusters":[[0]]}'),
		});

		const promise = optimizer.aiPrune();
		optimizer.cancel();

		await expect(promise).rejects.toThrow("Cancelled by user");
	});
});
