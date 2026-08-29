import { describe, it, expect, beforeEach } from "vitest";
import {
	ThreeTierMemoryStore,
	DEFAULT_TIER_CONFIG,
	CORE_SIZE_LIMITS,
	type ScoredMemoryEntry,
} from "../ThreeTierMemoryStore";

// Minimal mock for Obsidian App / adapter
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
	};
}

function makeEntry(overrides?: Partial<ScoredMemoryEntry>): ScoredMemoryEntry {
	const now = new Date().toISOString();
	return {
		id: "test-" + Math.random().toString(36).slice(2, 7),
		timestamp: now.split("T")[0],
		createdAt: now,
		lastAccessed: now,
		category: "user_fact",
		content: "Test memory content",
		tags: [],
		score: 0,
		accessCount: 0,
		...overrides,
	};
}

describe("ThreeTierMemoryStore", () => {
	let store: ThreeTierMemoryStore;
	let mockApp: ReturnType<typeof createMockApp>;
	let intelligenceDir: string;

	beforeEach(() => {
		mockApp = createMockApp();
		intelligenceDir = "/test/intelligence";
		store = new ThreeTierMemoryStore({
			app: mockApp as any,
			intelligenceDir,
			config: DEFAULT_TIER_CONFIG,
		});
	});

	describe("scoring", () => {
		it("staged score decreases with age", () => {
			const fresh = makeEntry({ createdAt: new Date().toISOString() });
			const old = makeEntry({
				createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
			});

			const freshScore = store.calculateStagedScore(fresh);
			const oldScore = store.calculateStagedScore(old);

			expect(freshScore).toBeGreaterThan(oldScore);
		});

		it("core score decreases with time since last access", () => {
			const recentlyAccessed = makeEntry({
				lastAccessed: new Date().toISOString(),
			});
			const stale = makeEntry({
				lastAccessed: new Date(
					Date.now() - 60 * 86400000,
				).toISOString(),
			});

			const recentScore = store.calculateCoreScore(recentlyAccessed);
			const staleScore = store.calculateCoreScore(stale);

			expect(recentScore).toBeGreaterThan(staleScore);
		});

		it("importance score increases with content length and tags", () => {
			const shortNoTags = makeEntry({ content: "Short", tags: [] });
			const longWithTags = makeEntry({
				content: "A".repeat(1000),
				tags: ["important", "project", "reference", "user", "test"],
			});

			const shortScore = (store as any)._importanceScore(shortNoTags);
			const longScore = (store as any)._importanceScore(longWithTags);

			expect(longScore).toBeGreaterThan(shortScore);
		});
	});

	describe("CRUD", () => {
		it("creates entries in staged tier", async () => {
			const entry = await store.create("user_fact", "Test content", [
				"test",
			]);

			const staged = await store.loadStaged();
			expect(staged).toHaveLength(1);
			expect(staged[0].id).toBe(entry.id);
			expect(staged[0].content).toBe("Test content");

			const core = await store.loadCore();
			expect(core).toHaveLength(0);
		});

		it("reads from correct tier and increments access", async () => {
			const entry = await store.create("user_fact", "Test content");
			const beforeAccess = entry.lastAccessed;

			// Small delay to ensure time difference
			await new Promise((r) => setTimeout(r, 10));

			const found = await store.read(entry.id);

			expect(found).not.toBeNull();
			expect(found!.accessCount).toBe(1);
			expect(new Date(found!.lastAccessed).getTime()).toBeGreaterThanOrEqual(
				new Date(beforeAccess).getTime(),
			);
		});

		it("deletes from any tier", async () => {
			const entry = await store.create("user_fact", "Test content");
			await store.delete(entry.id);

			const all = await store.listAll();
			expect(all).toHaveLength(0);
		});

		it("searches across all tiers", async () => {
			await store.create("user_fact", "apple pie recipe", ["food"]);
			await store.create("project", "build apple app", ["coding"]);
			await store.create("preference", "i like bananas", []);

			const results = await store.search("apple");
			expect(results).toHaveLength(2);
		});
	});

	describe("promotion", () => {
		it("promotes high-scoring staged entries to core", async () => {
			// Create a very fresh, important entry
			const entry = await store.create(
				"user_fact",
				"A".repeat(1000),
				["critical"],
			);

			// Bump its score by accessing it
			await store.read(entry.id);
			await store.read(entry.id);
			await store.read(entry.id);

			const result = await store.evaluateStaged();
			expect(result.promoted).toBeGreaterThan(0);

			const core = await store.loadCore();
			expect(core.length).toBeGreaterThan(0);
		});

		it("respects core size limits", async () => {
			const limit = CORE_SIZE_LIMITS.medium;

			// Fill staged with many entries
			for (let i = 0; i < limit + 10; i++) {
				await store.create("user_fact", `Entry ${i}`, ["test"]);
			}

			// Evaluate all
			await store.evaluateStaged();

			const core = await store.loadCore();
			expect(core.length).toBeLessThanOrEqual(limit);
		});
	});

	describe("system prompt context", () => {
		it("formats core entries for system prompt", async () => {
			await store.create("user_fact", "User likes dark mode", [
				"preference",
			]);

			// Manually add to core for testing
			const core = await store.loadCore();
			core.push({
				...makeEntry({
					content: "User likes dark mode",
					category: "preference",
					tags: ["ui"],
				}),
			});
			await store.saveCore(core);

			const context = await store.getSystemPromptContext();
			expect(context).toContain("Long-term memory");
			expect(context).toContain("dark mode");
			expect(context).toContain("Tags: ui");
		});

		it("respects maxTokens limit", async () => {
			// Add many entries to core
			const core = await store.loadCore();
			for (let i = 0; i < 50; i++) {
				core.push(
					makeEntry({
						content: `Memory ${i}: ${"A".repeat(100)}`,
					}),
				);
			}
			await store.saveCore(core);

			const context = await store.getSystemPromptContext(100);
			const estimatedTokens = context.length / 4;
			expect(estimatedTokens).toBeLessThanOrEqual(120); // Allow margin for headers
		});
	});

	describe("migration", () => {
		it("migrates legacy entries to tiers", async () => {
			const legacy = [
				{
					id: "legacy-1",
					timestamp: "2026-08-01",
					category: "user_fact" as const,
					content: "Important fact",
					tags: ["critical"],
				},
				{
					id: "legacy-2",
					timestamp: "2026-08-15",
					category: "project" as const,
					content: "Project note",
					tags: [],
				},
			];

			const result = await store.migrateFromLegacy(legacy);
			expect(result.core + result.staged + result.archive).toBe(2);
			expect(result.core).toBeGreaterThan(0);
		});
	});
});
