import { App, Notice } from "obsidian";
import type { ToolResult } from "../../types";
import { ToolResolver, denyPath, isPathAllowed } from "../ToolResolver";

/** Operations that read or change note content. */
export class NoteHandlers {
	constructor(
		private readonly app: App,
		private readonly resolver: ToolResolver,
	) {}

	async readNote(args: { path: string }): Promise<ToolResult> {
		if (!isPathAllowed(args.path)) return denyPath(args.path);
		const file = this.resolver.resolveNote(args.path);
		if (!file) return { error: `Note not found: ${args.path}` };
		const content = await this.app.vault.read(file);
		const ambiguous = (file as any).__ambiguous as string[] | undefined;
		if (ambiguous && ambiguous.length > 1) {
			return {
				content,
				path: file.path,
				warning:
					`⚠️ Ambiguous name: ${ambiguous.length} notes share the basename "${file.basename}". ` +
					`Reading "${file.path}". Other matches: ${ambiguous.filter((path) => path !== file.path).join(", ")}. ` +
					`Use the full path (e.g. "Folder/${file.basename}") to target a specific note.`,
			};
		}
		return { content, path: file.path };
	}

	async editNote(args: {
		path: string;
		content: string;
	}): Promise<ToolResult> {
		if (!isPathAllowed(args.path)) return denyPath(args.path);
		const file = this.resolver.resolveNote(args.path);
		if (!file) return { error: `Note not found: ${args.path}` };
		await this.app.vault.modify(file, args.content);
		new Notice(`✓ Edited ${file.basename}`);
		return { success: true, path: file.path };
	}

	async appendToNote(args: {
		path: string;
		content: string;
	}): Promise<ToolResult> {
		if (!isPathAllowed(args.path)) return denyPath(args.path);
		const file = this.resolver.resolveNote(args.path);
		if (!file) return { error: `Note not found: ${args.path}` };
		const existing = await this.app.vault.read(file);
		await this.app.vault.modify(file, existing + "\n\n" + args.content);
		new Notice(`✓ Appended to ${file.basename}`);
		return { success: true, path: file.path };
	}

	async createNote(args: {
		path: string;
		content: string;
	}): Promise<ToolResult> {
		if (!isPathAllowed(args.path)) return denyPath(args.path);
		const fileName = args.path.endsWith(".md")
			? args.path
			: `${args.path}.md`;

		if (this.resolver.resolveNote(fileName)) {
			return { error: `Note already exists: ${fileName}` };
		}

		await this.app.vault.create(fileName, args.content);
		new Notice(`✓ Created ${fileName}`);
		return { success: true, path: fileName };
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

	async patchNote(args: {
		path: string;
		search: string;
		replace: string;
		replace_all?: boolean;
	}): Promise<ToolResult> {
		if (!isPathAllowed(args.path)) return denyPath(args.path);
		const file = this.resolver.resolveNote(args.path);
		if (!file) return { error: `Note not found: ${args.path}` };

		const content = await this.app.vault.read(file);
		if (!content.includes(args.search)) {
			return {
				error: "Search text not found in note. Consider read_note first to see exact content.",
			};
		}

		const newContent = args.replace_all
			? content.split(args.search).join(args.replace)
			: content.replace(args.search, args.replace);

		await this.app.vault.modify(file, newContent);
		const count = args.replace_all
			? content.split(args.search).length - 1
			: 1;
		new Notice(
			`✓ Patched ${file.basename} (${count} replacement${count > 1 ? "s" : ""})`,
		);
		return { success: true, path: file.path };
	}

	async editSection(args: {
		path: string;
		section_heading: string;
		new_content: string;
	}): Promise<ToolResult> {
		if (!isPathAllowed(args.path)) return denyPath(args.path);
		const file = this.resolver.resolveNote(args.path);
		if (!file) return { error: `Note not found: ${args.path}` };

		const content = await this.app.vault.read(file);
		const lines = content.split("\n");
		const targetText = args.section_heading.startsWith("#")
			? args.section_heading.replace(/^#+\s*/, "").trim()
			: args.section_heading.trim();

		let startIdx = -1;
		let startLevel = 1;
		for (let i = 0; i < lines.length; i++) {
			const match = lines[i].match(/^(#{1,6})\s+(.+)$/);
			if (match) {
				const level = match[1].length;
				const text = match[2].trim();
				if (text === targetText) {
					startIdx = i;
					startLevel = level;
					break;
				}
			}
		}

		if (startIdx === -1) {
			return {
				error: `Heading "${targetText}" not found in note. Use read_note to verify exact heading text.`,
			};
		}

		let endIdx = lines.length;
		for (let i = startIdx + 1; i < lines.length; i++) {
			const match = lines[i].match(/^(#{1,6})\s+/);
			if (match && match[1].length <= startLevel) {
				endIdx = i;
				break;
			}
		}

		const newLines = [
			...lines.slice(0, startIdx),
			...args.new_content.split("\n"),
			...lines.slice(endIdx),
		];

		await this.app.vault.modify(file, newLines.join("\n"));
		new Notice(`✓ Edited section "${targetText}" in ${file.basename}`);
		return { success: true, path: file.path };
	}
}
