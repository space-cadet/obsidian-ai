import { Notice } from "obsidian";
import type { ToolResult } from "../../types";
import { denyPath, isPathAllowed } from "../ToolResolver";
import {
	ToolHandlerBase,
	type ToolHandlerContext,
} from "../ToolHandlerContext";

/** Create several notes while reporting duplicates and partial results. */
export class BulkHandlers extends ToolHandlerBase {
	constructor(context: ToolHandlerContext) {
		super(context);
	}

	async createNotes(args: {
		notes: Array<{ path: string; content: string }>;
	}): Promise<ToolResult> {
		if (
			!Array.isArray(args.notes) ||
			args.notes.length < 2 ||
			args.notes.length > 100
		) {
			return { error: "create_notes requires between 2 and 100 notes." };
		}

		const normalizedNotes = args.notes.map((note) => ({
			...note,
			path: note.path.endsWith(".md") ? note.path : `${note.path}.md`,
		}));
		const paths = new Set<string>();
		for (const note of normalizedNotes) {
			if (!note.path || !isPathAllowed(note.path)) {
				return denyPath(note.path);
			}
			if (paths.has(note.path)) {
				return { error: `Duplicate note path in batch: ${note.path}` };
			}
			paths.add(note.path);
		}

		const created: string[] = [];
		const skippedPaths: string[] = [];
		for (const note of normalizedNotes) {
			if (this.resolver.resolveNote(note.path)) {
				skippedPaths.push(note.path);
				continue;
			}
			try {
				await this.app.vault.create(note.path, note.content);
				created.push(note.path);
			} catch (error: any) {
				if (this.resolver.resolveNote(note.path)) {
					skippedPaths.push(note.path);
					continue;
				}
				return {
					error: `Batch creation stopped after ${created.length} new note${created.length === 1 ? "" : "s"}: ${error.message || String(error)}`,
					createdPaths: created,
					skippedPaths,
				};
			}
		}

		const summary = `✓ Created ${created.length} new note${created.length === 1 ? "" : "s"}${skippedPaths.length ? `; skipped ${skippedPaths.length} existing` : ""}`;
		new Notice(summary);
		return {
			success: true,
			count: created.length,
			createdPaths: created,
			skippedPaths,
		};
	}
}
