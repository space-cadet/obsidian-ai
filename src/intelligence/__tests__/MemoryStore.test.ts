import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStore, MemoryEntry, MemoryCategory } from "../MemoryStore";

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
	} as any;
}

function createStore() {
	return new MemoryStore({
		app: createMockApp(),
		intelligenceDir: "/test/intelligence",
	});
}

describe("MemoryStore", () => {
	let store: MemoryStore;

	beforeEach(() => {
		store = createStore();
	});

	describe("create", () => {
		it("creates an entry with auto-generated ID and timestamp", async () => {
			const entry = await store.create("user_fact", "User likes tea");
			expect(entry.id).toBeDefined();
			expect(entry.id.length).toBeGreaterThan(0);
			expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(entry.category).toBe("user_fact");
			expect(entry.content).toBe("User likes tea");
			expect(entry.tags).toEqual([]);
		});

		it("normalizes tags to lowercase", async () => {
			const entry = await store.create("preference", "Dark mode", [
				"UI",
				"Design",
			]);
			expect(entry.tags).toEqual(["ui", "design"]);
		});

		it("trims content", async () => {
			const entry = await store.create("insight", "  Important idea  ");
			expect(entry.content).toBe("Important idea");
		});
	});

	describe("deduplication", () => {
		it("reaffirms an existing entry instead of creating a near-duplicate", async () => {
			const original = await store.create(
				"preference",
				"User prefers dark mode",
			);
			const duplicate = await store.create(
				"preference",
				"User prefers dark mode for the UI",
			);
			expect(duplicate.id).toBe(original.id); // Same entry returned
			const all = await store.list();
			expect(all).toHaveLength(1);
		});

		it("allows distinct entries with different content", async () => {
			await store.create("preference", "User prefers dark mode");
			await store.create("preference", "User prefers tea over coffee");
			const all = await store.list();
			expect(all).toHaveLength(2);
		});

		it("reaffirming bumps the timestamp", async () => {
			const original = await store.create(
				"user_fact",
				"User is a physicist",
			);
			const originalDate = original.timestamp;

			// Advance time by mocking Date
			const mockDate = new Date("2026-12-31T00:00:00Z");
			const realDate = Date;
			global.Date = class extends Date {
				constructor() {
					super(mockDate);
				}
				static now() {
					return mockDate.getTime();
				}
			} as any;

			const reaffirmed = await store.create(
				"user_fact",
				"User is a physicist who studies quantum gravity",
			);
			global.Date = realDate;

			expect(reaffirmed.id).toBe(original.id);
			expect(reaffirmed.timestamp).not.toBe(originalDate);
			expect(reaffirmed.timestamp).toBe("2026-12-31");
		});

		it("only deduplicates within the same category by default", async () => {
			await store.create("user_fact", "User is studying Chinese");
			await store.create(
				"project",
				"User is studying Chinese vocabulary",
			);
			const all = await store.list();
			expect(all).toHaveLength(2);
		});

		it("cross-category dedup when sameCategoryOnly is false", async () => {
			await store.create("user_fact", "User is studying Chinese");
			const dup = await store.create(
				"project",
				"User is studying Chinese",
				[],
				{
					sameCategoryOnly: false,
				},
			);
			const all = await store.list();
			expect(all).toHaveLength(1);
			expect(dup.category).toBe("user_fact"); // Original category preserved
		});

		it("respects custom threshold", async () => {
			await store.create(
				"preference",
				"User likes Julia for numerical work",
			);
			// Low threshold (0.99) should NOT match similar-but-different content
			const entry = await store.create(
				"preference",
				"User likes Python for scripting",
				[],
				{
					threshold: 0.99,
				},
			);
			expect(entry.content).toBe("User likes Python for scripting");
			const all = await store.list();
			expect(all).toHaveLength(2);
		});
	});

	describe("read", () => {
		it("returns the entry by ID", async () => {
			const created = await store.create("project", "QHE paper");
			const found = await store.read(created.id);
			expect(found).not.toBeNull();
			expect(found!.content).toBe("QHE paper");
		});

		it("returns null for unknown ID", async () => {
			const found = await store.read("nonexistent");
			expect(found).toBeNull();
		});
	});

	describe("update", () => {
		it("updates content and returns modified entry", async () => {
			const created = await store.create("user_fact", "Old fact");
			const updated = await store.update(created.id, {
				content: "New fact",
			});
			expect(updated).not.toBeNull();
			expect(updated!.content).toBe("New fact");
			expect(updated!.category).toBe("user_fact"); // unchanged
		});

		it("updates category", async () => {
			const created = await store.create("insight", "Some idea");
			const updated = await store.update(created.id, {
				category: "reference" as MemoryCategory,
			});
			expect(updated!.category).toBe("reference");
		});

		it("updates tags", async () => {
			const created = await store.create("project", "Test", ["old"]);
			const updated = await store.update(created.id, {
				tags: ["new", "tag"],
			});
			expect(updated!.tags).toEqual(["new", "tag"]);
		});

		it("returns null for unknown ID", async () => {
			const result = await store.update("nonexistent", { content: "x" });
			expect(result).toBeNull();
		});
	});

	describe("delete", () => {
		it("removes the entry and returns true", async () => {
			const created = await store.create("preference", "Setting");
			const deleted = await store.delete(created.id);
			expect(deleted).toBe(true);
			expect(await store.read(created.id)).toBeNull();
		});

		it("returns false for unknown ID", async () => {
			const result = await store.delete("nonexistent");
			expect(result).toBe(false);
		});
	});

	describe("list", () => {
		it("returns all entries by default", async () => {
			await store.create("user_fact", "A");
			await store.create("project", "B");
			const all = await store.list();
			expect(all).toHaveLength(2);
		});

		it("filters by category", async () => {
			await store.create("user_fact", "A");
			await store.create("project", "B");
			const facts = await store.list({ category: "user_fact" });
			expect(facts).toHaveLength(1);
			expect(facts[0].content).toBe("A");
		});

		it("filters by tag", async () => {
			await store.create("insight", "A", ["physics"]);
			await store.create("insight", "B", ["math"]);
			const physics = await store.list({ tag: "physics" });
			expect(physics).toHaveLength(1);
			expect(physics[0].content).toBe("A");
		});

		it("limits results", async () => {
			await store.create("reference", "A");
			await store.create("reference", "B");
			await store.create("reference", "C");
			const limited = await store.list({ limit: 2 });
			expect(limited).toHaveLength(2);
		});
	});

	describe("search", () => {
		it("finds by content keyword", async () => {
			await store.create("user_fact", "User prefers Julia");
			await store.create("preference", "Likes Python");
			const results = await store.search("Julia");
			expect(results).toHaveLength(1);
			expect(results[0].content).toBe("User prefers Julia");
		});

		it("finds by tag", async () => {
			await store.create("project", "Paper", ["qhe"]);
			await store.create("project", "Code", ["coding"]);
			const results = await store.search("qhe");
			expect(results).toHaveLength(1);
		});

		it("finds by category", async () => {
			await store.create("insight", "Idea A");
			await store.create("reference", "Book B");
			const results = await store.search("insight");
			expect(results).toHaveLength(1);
		});

		it("returns empty array for no match", async () => {
			await store.create("user_fact", "Fact");
			const results = await store.search("nonexistent");
			expect(results).toEqual([]);
		});
	});

	describe("audit log", () => {
		it("logs create operations", async () => {
			const entry = await store.create("user_fact", "Audit test");
			const audit = await store.readAudit(10);
			expect(audit.length).toBeGreaterThan(0);
			const last = audit[0];
			expect(last.operation).toBe("create");
			expect(last.entryId).toBe(entry.id);
			expect(last.content).toBe("Audit test");
		});

		it("logs update operations", async () => {
			const created = await store.create("project", "Before");
			await store.update(created.id, { content: "After" });
			const audit = await store.readAudit(10);
			const updateEntry = audit.find((a) => a.operation === "update");
			expect(updateEntry).toBeDefined();
			expect(updateEntry!.entryId).toBe(created.id);
		});

		it("logs delete operations", async () => {
			const created = await store.create("preference", "To delete");
			await store.delete(created.id);
			const audit = await store.readAudit(10);
			const deleteEntry = audit.find((a) => a.operation === "delete");
			expect(deleteEntry).toBeDefined();
			expect(deleteEntry!.entryId).toBe(created.id);
		});

		it("returns empty array when no audit exists", async () => {
			const audit = await store.readAudit(10);
			expect(audit).toEqual([]);
		});
	});

	describe("markdown generation", () => {
		it("regenerates memory.md on every write", async () => {
			await store.create("user_fact", "Test", ["tag1"]);
			const adapter = store["deps"].app.vault.adapter;
			const mdPath = "/test/intelligence/memory.md";
			const md = await adapter.read(mdPath);
			expect(md).toContain("Test");
			expect(md).toContain("#tag1");
			expect(md).toContain("## Entries");
		});
	});

	describe("migration", () => {
		it("migrates legacy markdown entries", async () => {
			const adapter = store["deps"].app.vault.adapter;
			const legacyMd = `# AI Memory

## Entries

- [2026-08-01] **user_fact**: User likes tea #beverage
- [2026-08-02] **project**: Working on QHE paper #physics
`;
			await adapter.write("/test/intelligence/memory.md", legacyMd);
			const migrated = await store.migrateFromMarkdown();
			expect(migrated).toBe(2);

			const entries = await store.list();
			expect(entries).toHaveLength(2);
			expect(entries[0].content).toBe("User likes tea");
			expect(entries[0].tags).toContain("beverage");
			expect(entries[1].category).toBe("project");
		});

		it("skips migration if json already exists", async () => {
			const adapter = store["deps"].app.vault.adapter;
			await adapter.write("/test/intelligence/memory.json", "[]");
			await adapter.write(
				"/test/intelligence/memory.md",
				"- [2026-01-01] **user_fact**: Test",
			);
			const migrated = await store.migrateFromMarkdown();
			expect(migrated).toBe(0);
		});
	});

	describe("pruneDuplicates", () => {
		it("removes exact duplicates", async () => {
			// Inject raw duplicates directly (simulating pre-dedup data)
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
						content: "User likes tea",
						tags: [],
					},
				]),
			);
			const result = await store.pruneDuplicates(0.7);
			expect(result.removed).toBe(2);
			expect(result.kept).toBe(1);
			expect(result.groups).toBe(1);
			const all = await store.list();
			expect(all).toHaveLength(1);
		});

		it("removes near-duplicates within category", async () => {
			const adapter = store["deps"].app.vault.adapter;
			await adapter.write(
				"/test/intelligence/memory.json",
				JSON.stringify([
					{
						id: "b1",
						timestamp: "2026-08-01",
						category: "project",
						content:
							"The user is working on a quantum hall effect paper for publication",
						tags: [],
					},
					{
						id: "b2",
						timestamp: "2026-08-02",
						category: "project",
						content:
							"The user is working on a quantum hall effect paper revision",
						tags: [],
					},
					{
						id: "b3",
						timestamp: "2026-08-03",
						category: "project",
						content:
							"Completely different topic about machine learning",
						tags: [],
					},
				]),
			);
			const result = await store.pruneDuplicates(0.7);
			expect(result.removed).toBe(1);
			expect(result.kept).toBe(2);
			expect(result.groups).toBe(1);
		});

		it("keeps distinct entries across categories", async () => {
			const adapter = store["deps"].app.vault.adapter;
			await adapter.write(
				"/test/intelligence/memory.json",
				JSON.stringify([
					{
						id: "c1",
						timestamp: "2026-08-01",
						category: "user_fact",
						content: "User is a physicist",
						tags: [],
					},
					{
						id: "c2",
						timestamp: "2026-08-02",
						category: "preference",
						content: "User is a physicist",
						tags: [],
					},
				]),
			);
			const result = await store.pruneDuplicates(0.7);
			expect(result.removed).toBe(0);
			expect(result.kept).toBe(2);
		});

		it("keeps the longest/most detailed entry in a group", async () => {
			const adapter = store["deps"].app.vault.adapter;
			await adapter.write(
				"/test/intelligence/memory.json",
				JSON.stringify([
					{
						id: "d1",
						timestamp: "2026-08-01",
						category: "insight",
						content: "Dataview renders in preview mode only",
						tags: [],
					},
					{
						id: "d2",
						timestamp: "2026-08-02",
						category: "insight",
						content:
							"Dataview renders in preview mode only, not edit mode, because rows are generated live",
						tags: [],
					},
				]),
			);
			const result = await store.pruneDuplicates(0.7);
			expect(result.removed).toBe(1);
			const all = await store.list();
			expect(all[0].content.length).toBeGreaterThan(50); // The longer one
		});

		it("reports byte savings", async () => {
			const adapter = store["deps"].app.vault.adapter;
			await adapter.write(
				"/test/intelligence/memory.json",
				JSON.stringify([
					{
						id: "e1",
						timestamp: "2026-08-01",
						category: "reference",
						content: "Test content for size measurement",
						tags: [],
					},
					{
						id: "e2",
						timestamp: "2026-08-02",
						category: "reference",
						content: "Test content for size measurement duplicate",
						tags: [],
					},
				]),
			);
			const result = await store.pruneDuplicates(0.7);
			expect(result.bytesBefore).toBeGreaterThan(result.bytesAfter);
			expect(result.bytesBefore - result.bytesAfter).toBeGreaterThan(0);
		});

		it("logs a prune audit entry", async () => {
			const adapter = store["deps"].app.vault.adapter;
			await adapter.write(
				"/test/intelligence/memory.json",
				JSON.stringify([
					{
						id: "f1",
						timestamp: "2026-08-01",
						category: "preference",
						content: "User prefers dark mode for the interface",
						tags: [],
					},
					{
						id: "f2",
						timestamp: "2026-08-02",
						category: "preference",
						content:
							"User prefers dark mode for the user interface",
						tags: [],
					},
				]),
			);
			await store.pruneDuplicates(0.7);
			const audit = await store.readAudit(10);
			const pruneEntry = audit.find(
				(a) =>
					a.operation === "delete" && a.entryId.startsWith("prune-"),
			);
			expect(pruneEntry).toBeDefined();
			expect(pruneEntry!.content).toContain("Pruned 1 duplicates");
		});
	});

	describe("getStats", () => {
		it("returns entry count and size", async () => {
			await store.create("user_fact", "Fact A");
			await store.create("project", "Project B");
			const stats = await store.getStats();
			expect(stats.entries).toBe(2);
			expect(stats.size).toBeGreaterThan(0);
			expect(stats.categories).toEqual({ user_fact: 1, project: 1 });
		});

		it("returns zeros for empty store", async () => {
			const stats = await store.getStats();
			expect(stats.entries).toBe(0);
			expect(stats.size).toBe(2); // "[]"
			expect(stats.categories).toEqual({});
		});
	});
});
