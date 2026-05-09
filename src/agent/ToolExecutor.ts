import { App, Notice, TFile } from "obsidian";
import type { ToolCall, ToolResult } from "./types";

export class ToolExecutor {
	constructor(private app: App) {}

	async execute(call: ToolCall): Promise<ToolResult> {
		try {
			switch (call.toolName) {
				case "read_note":
					return await this.readNote(call.args as { path: string });
				case "edit_note":
					return await this.editNote(
						call.args as { path: string; content: string },
					);
				case "append_to_note":
					return await this.appendToNote(
						call.args as { path: string; content: string },
					);
				case "create_note":
					return await this.createNote(
						call.args as { path: string; content: string },
					);
				case "patch_note":
					return await this.patchNote(
						call.args as {
							path: string;
							search: string;
							replace: string;
							replace_all?: boolean;
						},
					);
				case "edit_section":
					return await this.editSection(
						call.args as {
							path: string;
							section_heading: string;
							new_content: string;
						},
					);
				default:
					return { error: `Unknown tool: ${call.toolName}` };
			}
		} catch (e: any) {
			return { error: e.message || String(e) };
		}
	}

	/**
	 * Resolves a note path the same way Obsidian wiki-links do.
	 * Accepts basename ("Vocabulary Log"), full path ("Notes/Vocabulary Log.md"),
	 * or path without extension ("Notes/Vocabulary Log").
	 */
	private resolveNote(path: string): TFile | null {
		// 1. Exact path match
		let file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) return file;

		// 2. Try with .md appended
		if (!path.endsWith(".md")) {
			file = this.app.vault.getAbstractFileByPath(path + ".md");
			if (file instanceof TFile) return file;
		}

		// 3. Obsidian wiki-link resolution (handles basename → path)
		const resolved = this.app.metadataCache.getFirstLinkpathDest(path, "");
		if (resolved instanceof TFile) return resolved;

		return null;
	}

	private async readNote(args: { path: string }): Promise<ToolResult> {
		const file = this.resolveNote(args.path);
		if (!file) return { error: `Note not found: ${args.path}` };
		const content = await this.app.vault.read(file);
		return { content, path: file.path };
	}

	private async editNote(args: {
		path: string;
		content: string;
	}): Promise<ToolResult> {
		const file = this.resolveNote(args.path);
		if (!file) return { error: `Note not found: ${args.path}` };
		await this.app.vault.modify(file, args.content);
		new Notice(`✓ Edited ${file.basename}`);
		return { success: true, path: file.path };
	}

	private async appendToNote(args: {
		path: string;
		content: string;
	}): Promise<ToolResult> {
		const file = this.resolveNote(args.path);
		if (!file) return { error: `Note not found: ${args.path}` };
		const existing = await this.app.vault.read(file);
		await this.app.vault.modify(file, existing + "\n\n" + args.content);
		new Notice(`✓ Appended to ${file.basename}`);
		return { success: true, path: file.path };
	}

	private async createNote(args: {
		path: string;
		content: string;
	}): Promise<ToolResult> {
		// Normalize: ensure .md extension
		const fileName = args.path.endsWith(".md")
			? args.path
			: `${args.path}.md`;

		// Check existence using same resolution logic
		const existing = this.resolveNote(fileName);
		if (existing) return { error: `Note already exists: ${fileName}` };

		await this.app.vault.create(fileName, args.content);
		new Notice(`✓ Created ${fileName}`);
		return { success: true, path: fileName };
	}

	private async patchNote(args: {
		path: string;
		search: string;
		replace: string;
		replace_all?: boolean;
	}): Promise<ToolResult> {
		const file = this.resolveNote(args.path);
		if (!file) return { error: `Note not found: ${args.path}` };

		const content = await this.app.vault.read(file);
		if (!content.includes(args.search)) {
			return {
				error: `Search text not found in note. Consider read_note first to see exact content.`,
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

	private async editSection(args: {
		path: string;
		section_heading: string;
		new_content: string;
	}): Promise<ToolResult> {
		const file = this.resolveNote(args.path);
		if (!file) return { error: `Note not found: ${args.path}` };

		const content = await this.app.vault.read(file);
		const lines = content.split("\n");
		const targetText = args.section_heading.startsWith("#")
			? args.section_heading.replace(/^#+\s*/, "").trim()
			: args.section_heading.trim();

		// Find the heading
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

		// Find section end (next heading of same or higher level)
		let endIdx = lines.length;
		for (let i = startIdx + 1; i < lines.length; i++) {
			const match = lines[i].match(/^(#{1,6})\s+/);
			if (match) {
				const level = match[1].length;
				if (level <= startLevel) {
					endIdx = i;
					break;
				}
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
