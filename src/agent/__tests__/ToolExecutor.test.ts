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
