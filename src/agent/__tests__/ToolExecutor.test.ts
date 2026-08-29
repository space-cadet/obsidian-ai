import { describe, expect, it, vi } from "vitest";

const notices = vi.hoisted(() => vi.fn());

vi.mock("obsidian", () => {
	class TFile {
		path: string;
		basename: string;
		constructor(path = "") {
			this.path = path;
			this.basename = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
		}
	}
	return {
		App: class {},
		TFile,
		Notice: class {
			constructor(message: string) {
				notices(message);
			}
		},
		normalizePath: (path: string) => path.replace(/\\/g, "/"),
	};
});

import { TFile } from "obsidian";
import { ToolExecutor } from "../ToolExecutor";

const makeFile = (path: string): TFile =>
	Object.assign(new TFile(), {
		path,
		basename: path.split("/").pop()?.replace(/\.md$/, "") ?? path,
	});

describe("ToolExecutor create_notes", () => {
	it("skips existing notes and creates the remaining batch", async () => {
		const files = new Map<string, TFile>([
			[
				"Learning Chinese/Verbs/chi.md",
				makeFile("Learning Chinese/Verbs/chi.md"),
			],
		]);
		const create = vi.fn(async (path: string) => {
			files.set(path, makeFile(path));
		});
		const app = {
			vault: {
				getAbstractFileByPath: (path: string) =>
					files.get(path) ?? null,
				create,
			},
			metadataCache: { getFirstLinkpathDest: () => null },
		} as any;
		const executor = new ToolExecutor(app);

		const result = await executor.execute({
			toolCallId: "batch-1",
			toolName: "create_notes",
			args: {
				notes: [
					{ path: "Learning Chinese/Verbs/chi", content: "existing" },
					{ path: "Learning Chinese/Verbs/he", content: "new" },
				],
			},
		});

		expect(result).toMatchObject({
			success: true,
			count: 1,
			createdPaths: ["Learning Chinese/Verbs/he.md"],
			skippedPaths: ["Learning Chinese/Verbs/chi.md"],
		});
		expect(create).toHaveBeenCalledTimes(1);
		expect(files.has("Learning Chinese/Verbs/he.md")).toBe(true);
	});
});

describe("ToolExecutor note safety", () => {
	function makeNoteApp(initialContent: string) {
		const file = makeFile("Notes/plan.md");
		let content = initialContent;
		const read = vi.fn(async () => content);
		const modify = vi.fn(async (_file: TFile, next: string) => {
			content = next;
		});
		return {
			app: {
				vault: {
					getFiles: () => [file],
					getAbstractFileByPath: (path: string) =>
						path === file.path ? file : null,
					read,
					modify,
				},
				metadataCache: {
					getFirstLinkpathDest: () => file,
				},
			} as any,
			read,
			modify,
			getContent: () => content,
		};
	}

	it("returns a content fingerprint and rejects stale edits", async () => {
		const fixture = makeNoteApp("first version");
		const executor = new ToolExecutor(fixture.app);
		const readResult = await executor.execute({
			toolCallId: "read-1",
			toolName: "read_note",
			args: { path: "Notes/plan" },
		});

		expect(readResult.content_fingerprint).toMatch(/^(sha256|fnv1a):/);
		fixture.app.vault.modify = vi.fn(async () => undefined);
		fixture.app.vault.read = vi.fn(async () => "changed version");

		const result = await executor.execute({
			toolCallId: "edit-1",
			toolName: "edit_note",
			args: {
				path: "Notes/plan",
				content: "overwrite",
				expected_content_fingerprint: readResult.content_fingerprint,
			},
		});

		expect(result.error).toContain("changed since it was read");
	});

	it("serializes two writes that target the same note", async () => {
		const fixture = makeNoteApp("base");
		let releaseFirstWrite!: () => void;
		const firstWrite = new Promise<void>((resolve) => {
			releaseFirstWrite = resolve;
		});
		let writeCount = 0;
		fixture.modify.mockImplementation(
			async (_file: TFile, next: string) => {
				writeCount++;
				(fixture as any).getContent = () => next;
				if (writeCount === 1) await firstWrite;
			},
		);
		fixture.app.vault.modify = fixture.modify;
		fixture.app.vault.read = vi.fn(async () => fixture.getContent());

		const first = new ToolExecutor(fixture.app).execute({
			toolCallId: "append-1",
			toolName: "append_to_note",
			args: { path: "Notes/plan", content: "one" },
		});
		await vi.waitFor(() => expect(fixture.modify).toHaveBeenCalledTimes(1));
		const second = new ToolExecutor(fixture.app).execute({
			toolCallId: "append-2",
			toolName: "append_to_note",
			args: { path: "Notes/plan", content: "two" },
		});

		await Promise.resolve();
		expect(fixture.modify).toHaveBeenCalledTimes(1);
		releaseFirstWrite();
		await Promise.all([first, second]);
		expect(fixture.modify).toHaveBeenCalledTimes(2);
	});
});
