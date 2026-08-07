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
				write: async (path: string, data: string) => files.set(path, data),
				stat: async (path: string) => ({ size: files.get(path)?.length ?? 0 }),
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
			const entry = await store.create("preference", "Dark mode", ["UI", "Design"]);
			expect(entry.tags).toEqual(["ui", "design"]);
		});

		it("trims content", async () => {
			const entry = await store.create("insight", "  Important idea  ");
			expect(entry.content).toBe("Important idea");
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
			const updated = await store.update(created.id, { content: "New fact" });
			expect(updated).not.toBeNull();
			expect(updated!.content).toBe("New fact");
			expect(updated!.category).toBe("user_fact"); // unchanged
		});

		it("updates category", async () => {
			const created = await store.create("insight", "Some idea");
			const updated = await store.update(created.id, { category: "reference" as MemoryCategory });
			expect(updated!.category).toBe("reference");
		});

		it("updates tags", async () => {
			const created = await store.create("project", "Test", ["old"]);
			const updated = await store.update(created.id, { tags: ["new", "tag"] });
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
			await adapter.write("/test/intelligence/memory.md", "- [2026-01-01] **user_fact**: Test");
			const migrated = await store.migrateFromMarkdown();
			expect(migrated).toBe(0);
		});
	});
});
