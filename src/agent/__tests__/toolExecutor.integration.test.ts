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
			{ toolCallId: "test-1b", toolName: "read_note", args: { path: "Projects/Ideas" } },
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

		expect(directResult.notes).toHaveLength(3);
		expect(directResult.count).toBe(3);

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
			args: { query: "quantum gravity" },
		});

		expect(result.success).toBe(true);
		expect(result.count).toBe(1);
		expect(result.content).toContain("Ideas");
		expect(result.content).toContain("Quantum gravity");
	});

	it("search_note_content uses AND semantics for multiple terms", async () => {
		const app = createMockApp(mockFiles);
		const executor = new ToolExecutor(app);

		// "coffee code" should match Daily note with both words
		const result = await executor.execute({
			toolCallId: "test-4",
			toolName: "search_note_content",
			args: { query: "coffee code" },
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
			args: { query: "gravity", folder: "Projects" },
		});

		expect(result.success).toBe(true);
		expect(result.count).toBe(1);
		expect(result.content).toContain("Ideas");
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
		const withAudit = resolveToolRegistry(
			createBuiltInToolDefinitions(),
			{ enableMemoryAuditTool: true },
		);
		const withoutAudit = resolveToolRegistry(
			createBuiltInToolDefinitions(),
			{ enableMemoryAuditTool: false },
		);

		expect(withAudit.byId.has("read_memory_audit")).toBe(true);
		expect(withoutAudit.byId.has("read_memory_audit")).toBe(false);
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
