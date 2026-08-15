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
				write: async (path: string, data: string) =>
					files.set(path, data),
				stat: async (path: string) => ({
					size: files.get(path)?.length ?? 0,
				}),
			},
		},
	} as any;
}

function createMockChatApi(
	response: string,
	onCall?: (signal?: AbortSignal) => void,
) {
	return {
		callApi: async (
			_system: string,
			_message: string,
			_profile?: unknown,
			signal?: AbortSignal,
		) => {
			onCall?.(signal);
			return response;
		},
	} as any;
}

describe("MemoryOptimizer", () => {
	let store: MemoryStore;
	let optimizer: MemoryOptimizer;

	beforeEach(() => {
		store = new MemoryStore({
			app: createMockApp(),
			intelligenceDir: "/test/intelligence",
		});
	});

	it("removes exact duplicates via AI clustering", async () => {
		const adapter = store["deps"].app.vault.adapter;
		await adapter.write(
			"/test/intelligence/memory.json",
			JSON.stringify([
				{
					id: "a1",
					timestamp: "2026-08-01",
					category: "preference",
					content: "User likes tea",
					tags: [],
				},
				{
					id: "a2",
					timestamp: "2026-08-02",
					category: "preference",
					content: "User likes tea",
					tags: [],
				},
				{
					id: "a3",
					timestamp: "2026-08-03",
					category: "preference",
					content: "User likes coffee",
					tags: [],
				},
			]),
		);

		optimizer = new MemoryOptimizer({
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
		await adapter.write(
			"/test/intelligence/memory.json",
			JSON.stringify([
				{
					id: "b1",
					timestamp: "2026-08-01",
					category: "insight",
					content: "Short",
					tags: [],
				},
				{
					id: "b2",
					timestamp: "2026-08-02",
					category: "insight",
					content:
						"A much longer and more detailed version of the same insight with extra context",
					tags: [],
				},
			]),
		);

		optimizer = new MemoryOptimizer({
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
		await adapter.write(
			"/test/intelligence/memory.json",
			JSON.stringify([
				{
					id: "c1",
					timestamp: "2026-08-01",
					category: "project",
					content: "Fact A",
					tags: [],
				},
				{
					id: "c2",
					timestamp: "2026-08-02",
					category: "project",
					content: "Fact A again",
					tags: [],
				},
			]),
		);

		optimizer = new MemoryOptimizer({
			memoryStore: store,
			chatApi: createMockChatApi(
				'Here is the result:\n\n```json\n{"clusters":[[0,1]]}\n```',
			),
		});

		const result = await optimizer.aiPrune();
		expect(result.removed).toBe(1);
	});

	it("falls back to no pruning on invalid AI response", async () => {
		const adapter = store["deps"].app.vault.adapter;
		await adapter.write(
			"/test/intelligence/memory.json",
			JSON.stringify([
				{
					id: "d1",
					timestamp: "2026-08-01",
					category: "reference",
					content: "Ref 1",
					tags: [],
				},
				{
					id: "d2",
					timestamp: "2026-08-02",
					category: "reference",
					content: "Ref 2",
					tags: [],
				},
			]),
		);

		optimizer = new MemoryOptimizer({
			memoryStore: store,
			chatApi: createMockChatApi("invalid response with no json"),
		});

		const result = await optimizer.aiPrune();
		expect(result.removed).toBe(0);
		expect(result.kept).toBe(2);
	});

	it("handles empty memory store", async () => {
		optimizer = new MemoryOptimizer({
			memoryStore: store,
			chatApi: createMockChatApi('{"clusters":[]}'),
		});

		const result = await optimizer.aiPrune();
		expect(result.removed).toBe(0);
		expect(result.kept).toBe(0);
	});

	it("reports byte savings", async () => {
		const adapter = store["deps"].app.vault.adapter;
		await adapter.write(
			"/test/intelligence/memory.json",
			JSON.stringify([
				{
					id: "e1",
					timestamp: "2026-08-01",
					category: "user_fact",
					content:
						"User is a physicist who works on quantum gravity and black holes",
					tags: ["physics"],
				},
				{
					id: "e2",
					timestamp: "2026-08-02",
					category: "user_fact",
					content: "User is a physicist who works on quantum gravity",
					tags: ["physics"],
				},
			]),
		);

		optimizer = new MemoryOptimizer({
			memoryStore: store,
			chatApi: createMockChatApi('{"clusters":[[0,1]]}'),
		});

		const result = await optimizer.aiPrune();
		expect(result.bytesBefore).toBeGreaterThan(result.bytesAfter);
	});

	it("passes its abort signal to the AI request and stops when cancelled", async () => {
		const adapter = store["deps"].app.vault.adapter;
		await adapter.write(
			"/test/intelligence/memory.json",
			JSON.stringify([
				{
					id: "f1",
					timestamp: "2026-08-01",
					category: "project",
					content: "Fact A",
					tags: [],
				},
				{
					id: "f2",
					timestamp: "2026-08-02",
					category: "project",
					content: "Fact B",
					tags: [],
				},
			]),
		);

		let signal: AbortSignal | undefined;
		let resolveCall!: () => void;
		const callStarted = new Promise<void>((resolve) => {
			resolveCall = resolve;
		});
		const callApi = async (
			_system: string,
			_message: string,
			_profile?: unknown,
			requestSignal?: AbortSignal,
		) => {
			signal = requestSignal;
			resolveCall();
			await new Promise<void>((resolve) =>
				requestSignal?.addEventListener("abort", () => resolve(), {
					once: true,
				}),
			);
			throw new DOMException("The operation was aborted.", "AbortError");
		};
		optimizer = new MemoryOptimizer({
			memoryStore: store,
			chatApi: { callApi } as any,
		});

		const prune = optimizer.aiPrune();
		await callStarted;
		optimizer.cancel();

		await expect(prune).rejects.toThrow("Cancelled by user");
		expect(signal?.aborted).toBe(true);
	});
});
