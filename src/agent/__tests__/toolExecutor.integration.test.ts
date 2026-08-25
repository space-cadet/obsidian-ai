import { describe, it, expect, vi } from "vitest";
import { TFile } from "obsidian";

// Mock Obsidian classes so instanceof checks work in ToolExecutor
vi.mock("obsidian", async (importOriginal) => {
	const actual = await importOriginal<typeof import("obsidian")>();
	class MockTFile {
		path!: string;
		basename!: string;
		stat: any;
		extension!: string;
		parent?: { path: string };
		constructor(data: any) {
			Object.assign(this, data);
		}
	}
	return {
		...actual,
		TFile: MockTFile as any,
		Notice: class MockNotice {
			constructor(msg: string) {}
		},
	};
});

import { ToolExecutor } from "../ToolExecutor";
import {
	createBuiltInToolDefinitions,
	resolveToolRegistry,
} from "../toolRegistry";

/**
 * Build a minimal mock Obsidian App with just enough vault surface for
 * built-in read-only tools.
 */
function createMockApp(files: Record<string, string> = {}): any {
	const fileMap = new Map<string, { content: string; stat: any }>();
	for (const [path, content] of Object.entries(files)) {
		fileMap.set(path, {
			content,
			stat: { mtime: 1_000_000, ctime: 1_000_000, size: content.length },
		});
	}

	const allFiles = Array.from(fileMap.entries()).map(([path, data]) => ({
		path,
		basename: path.split("/").pop()?.replace(/\.md$/, "") ?? path,
		stat: data.stat,
	}));

	function makeTFile(path: string) {
		return new (TFile as any)({
			path,
			basename: path.split("/").pop()?.replace(/\.md$/, "") ?? path,
			stat: fileMap.get(path)?.stat ?? { mtime: 0, ctime: 0, size: 0 },
			extension: path.split(".").pop() ?? "md",
		});
	}

	return {
		vault: {
			getFiles: () => allFiles,
			getMarkdownFiles: () =>
				allFiles.filter((f: any) => f.path.endsWith(".md")),
			getAllLoadedFiles: () =>
				allFiles.map((f: any) => ({
					path: f.path,
					parent: {
						path: f.path.split("/").slice(0, -1).join("/") || "/",
					},
				})),
			getAbstractFileByPath: (path: string) => {
				if (!fileMap.has(path)) return null;
				return makeTFile(path);
			},
			read: async (file: any) => fileMap.get(file.path)?.content ?? "",
		},
		metadataCache: {
			getFirstLinkpathDest: (path: string) => {
				const match = allFiles.find(
					(f: any) =>
						f.basename === path ||
						f.path === path ||
						f.path === path + ".md",
				);
				if (!match) return null;
				return makeTFile(match.path);
			},
		},
		fileManager: {
			renameFile: vi.fn(),
		},
	};
}

describe("ToolExecutor registry integration", () => {
	const mockFiles: Record<string, string> = {
		"Projects/Ideas.md": "# Ideas\n\n- Quantum gravity",
		"Daily/2026-08-25.md": "## Morning\n\nCoffee and code.",
		"Learning Chinese/vocabulary/右边.md": "右边 = right side",
		"Learning Chinese/grammar/there-is.md": "There is a book.",
		"Untagged.txt": "plain text file",
	};

	it("registry execute produces same result as direct ToolExecutor for read_note", async () => {
		const app = createMockApp(mockFiles);
		const executor = new ToolExecutor(app);

		// Direct executor path
		const directResult = await executor.execute({
			toolCallId: "test-1",
			toolName: "read_note",
			args: { path: "Projects/Ideas" },
		});

		expect(directResult.content).toBe("# Ideas\n\n- Quantum gravity");
		expect(directResult.path).toBe("Projects/Ideas.md");

		// Registry path: ToolExecutor now builds a registry with execute handlers.
		// Access the private registry to prove the contract.
		const registry = (executor as any).builtInRegistry;
		const readNoteDef = registry.byId.get("read_note");
		expect(readNoteDef?.execute).toBeDefined();

		const registryResult = await readNoteDef.execute(
			{
				toolCallId: "test-1b",
				toolName: "read_note",
				args: { path: "Projects/Ideas" },
			},
			{ enableMemoryAuditTool: false },
		);
		expect(registryResult).toEqual(directResult);
	});

	it("registry execute produces same result as direct ToolExecutor for list_notes", async () => {
		const app = createMockApp(mockFiles);
		const executor = new ToolExecutor(app);

		const directResult = await executor.execute({
			toolCallId: "test-2",
			toolName: "list_notes",
			args: {},
		});

		const expectedPaths = Object.keys(mockFiles);
		expect(directResult.notes?.map((note) => note.path)).toHaveLength(
			expectedPaths.length,
		);
		expect(new Set(directResult.notes?.map((note) => note.path))).toEqual(
			new Set(expectedPaths),
		);
		expect(directResult.count).toBe(expectedPaths.length);

		// Registry path also works
		const registry = (executor as any).builtInRegistry;
		const listNotesDef = registry.byId.get("list_notes");
		expect(listNotesDef?.execute).toBeDefined();

		const registryResult = await listNotesDef.execute(
			{ toolCallId: "test-2b", toolName: "list_notes", args: {} },
			{},
		);
		expect(registryResult).toEqual(directResult);
	});

	it("search_note_content finds notes by body content", async () => {
		const app = createMockApp(mockFiles);
		const executor = new ToolExecutor(app);

		const result = await executor.execute({
			toolCallId: "test-3",
			toolName: "search_note_content",
			args: { query: "quantum gravity", include_snippets: true },
		});

		expect(result.success).toBe(true);
		expect(result.count).toBe(1);
		expect(result.content).toContain("Ideas");
		expect(result.content).toContain("Quantum gravity");
		expect(result.paths).toEqual(["Projects/Ideas.md"]);
	});

	it("search_note_content uses AND semantics for multiple terms", async () => {
		const app = createMockApp(mockFiles);
		const executor = new ToolExecutor(app);

		// "coffee code" should match Daily note with both words
		const result = await executor.execute({
			toolCallId: "test-4",
			toolName: "search_note_content",
			args: {
				query: "coffee code",
				match_mode: "and",
				include_snippets: true,
			},
		});

		expect(result.success).toBe(true);
		expect(result.count).toBe(1);
		expect(result.content).toContain("2026-08-25");

		// "quantum coffee" should match nothing (different notes)
		const noMatch = await executor.execute({
			toolCallId: "test-5",
			toolName: "search_note_content",
			args: { query: "quantum coffee" },
		});

		expect(noMatch.success).toBe(true);
		expect(noMatch.count).toBe(0);
	});

	it("search_note_content respects folder filter", async () => {
		const app = createMockApp(mockFiles);
		const executor = new ToolExecutor(app);

		const result = await executor.execute({
			toolCallId: "test-6",
			toolName: "search_note_content",
			args: {
				query: "gravity",
				folder: "projects/",
				include_snippets: true,
			},
		});

		expect(result.success).toBe(true);
		expect(result.count).toBe(1);
		expect(result.content).toContain("Ideas");
	});

	it("resolves short folder aliases and returns canonical paths", async () => {
		const app = createMockApp(mockFiles);
		const executor = new ToolExecutor(app);

		const result = await executor.execute({
			toolCallId: "test-8",
			toolName: "search_notes",
			args: { query: "右边", folder: "VOCABULARY/" },
		});

		expect(result.success).toBe(true);
		expect(result.matches?.map((match) => match.path)).toEqual([
			"Learning Chinese/vocabulary/右边.md",
		]);
	});

	it("supports compact content coverage checks", async () => {
		const app = createMockApp(mockFiles);
		const executor = new ToolExecutor(app);

		const result = await executor.execute({
			toolCallId: "test-9",
			toolName: "search_note_content",
			args: {
				query: "there is",
				folder: "grammar",
				include_snippets: false,
			},
		});

		expect(result.success).toBe(true);
		expect(result.paths).toEqual(["Learning Chinese/grammar/there-is.md"]);
		expect(result.content).toBeUndefined();
	});

	it("supports explicit any matching", async () => {
		const app = createMockApp(mockFiles);
		const executor = new ToolExecutor(app);

		const result = await executor.execute({
			toolCallId: "test-10",
			toolName: "search_note_content",
			args: {
				query: "right coffee",
				match_mode: "any",
				include_snippets: false,
			},
		});

		expect(result.success).toBe(true);
		expect(result.paths).toEqual([
			"Daily/2026-08-25.md",
			"Learning Chinese/vocabulary/右边.md",
		]);
	});

	it("checks atomic note paths in a batch", async () => {
		const app = createMockApp(mockFiles);
		const executor = new ToolExecutor(app);

		const result = await executor.execute({
			toolCallId: "test-11",
			toolName: "check_paths",
			args: {
				paths: [
					"右边",
					"Learning Chinese/grammar/there-is",
					"missing-note",
				],
			},
		});

		expect(result.success).toBe(true);
		expect(result.results).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					path: "右边",
					exists: true,
					canonical_path: "Learning Chinese/vocabulary/右边.md",
				}),
				expect.objectContaining({
					path: "missing-note",
					exists: false,
				}),
			]),
		);
	});

	it("search_note_content returns empty when no match", async () => {
		const app = createMockApp(mockFiles);
		const executor = new ToolExecutor(app);

		const result = await executor.execute({
			toolCallId: "test-7",
			toolName: "search_note_content",
			args: { query: "nonexistent topic" },
		});

		expect(result.success).toBe(true);
		expect(result.count).toBe(0);
	});

	it("registry omits unavailable tools (read_memory_audit when disabled)", () => {
		const withAudit = resolveToolRegistry(createBuiltInToolDefinitions(), {
			enableMemoryAuditTool: true,
		});
		const withoutAudit = resolveToolRegistry(
			createBuiltInToolDefinitions(),
			{ enableMemoryAuditTool: false },
		);

		expect(withAudit.byId.has("read_memory_audit")).toBe(true);
		expect(withoutAudit.byId.has("read_memory_audit")).toBe(false);
	});

	it("rejects invalid arguments before a tool handler runs", async () => {
		const executor = new ToolExecutor(createMockApp(mockFiles));
		const result = await executor.execute({
			toolCallId: "invalid-read",
			toolName: "read_note",
			args: {},
		});

		expect(result.error).toContain("Invalid arguments for read_note");
	});

	it("caps search_notes at 50 and trims metadata for large result sets", async () => {
		const files = Object.fromEntries(
			Array.from({ length: 60 }, (_, index) => [
				`Searchable/${String(index).padStart(2, "0")}-note.md`,
				`# Note ${index}`,
			]),
		);
		const executor = new ToolExecutor(createMockApp(files));
		const result = await executor.execute({
			toolCallId: "large-search",
			toolName: "search_notes",
			args: { query: "note", limit: 100 },
		});

		expect(result.count).toBe(50);
		expect(result.matches).toHaveLength(50);
		expect(result.matches?.[0]).toEqual(
			expect.objectContaining({
				path: expect.any(String),
				modified: expect.any(Number),
			}),
		);
		expect(result.matches?.[0]).not.toHaveProperty("created");
		expect(result.matches?.[0]).not.toHaveProperty("size");
	});

	it("every built-in tool has a defined risk class", () => {
		const definitions = createBuiltInToolDefinitions();
		for (const def of definitions) {
			expect(def.risk, `${def.id} should have a risk class`).toBeTruthy();
			expect(
				[
					"read",
					"local-create",
					"local-write",
					"remote-read",
					"remote-write",
					"destructive",
				],
				`${def.id} risk should be a valid HostToolRisk`,
			).toContain(def.risk);
		}
	});
});
