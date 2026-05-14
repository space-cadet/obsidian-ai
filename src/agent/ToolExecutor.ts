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
				case "search_notes":
					return await this.searchNotes(
						call.args as { query: string; sort_by?: string; limit?: number; folder?: string; search_content?: boolean },
					);
				case "list_notes":
					return await this.listNotes(
						call.args as { folder?: string; sort_by?: string; limit?: number },
					);
				case "get_note_metadata":
					return await this.getNoteMetadata(
						call.args as { path: string },
					);
				case "list_folders":
					return await this.listFolders(
						call.args as { path?: string },
					);
				case "create_folder":
					return await this.createFolder(
						call.args as { path: string },
					);
				case "move_note":
					return await this.moveNote(
						call.args as { path: string; new_path: string },
					);
				case "delete_note":
					return await this.deleteNote(
						call.args as { path: string },
					);
				default:
					return { error: `Unknown tool: ${call.toolName}` };
			}
		} catch (e: any) {
			return { error: e.message || String(e) };
		}
	}

	private async searchNotes(args: { query: string; sort_by?: string; limit?: number; folder?: string; search_content?: boolean }): Promise<ToolResult> {
		const query = args.query?.toLowerCase() ?? "";
		const sortBy = args.sort_by ?? "name";
		const limit = Math.min(args.limit ?? 20, 100);
		const folder = args.folder;
		const searchContent = args.search_content ?? false;

		let files = this.app.vault.getFiles();

		// Folder filter
		if (folder) {
			files = files.filter(f => f.path.startsWith(folder + "/") || f.parent?.path === folder);
		}

		// Query filter (empty query = list all)
		if (query) {
			files = files.filter(f => {
				const nameMatch = f.path.toLowerCase().includes(query) || f.basename.toLowerCase().includes(query);
				if (nameMatch) return true;
				if (searchContent) {
					// Note: content search is expensive; we'll read and check
					// For now, skip content search to avoid I/O blocking
					return false;
				}
				return false;
			});
		}

		// Sort
		files = this.sortFiles(files, sortBy);

		// Limit
		files = files.slice(0, limit);

		const matches = await Promise.all(files.map(async f => ({
			path: f.path,
			basename: f.basename,
			modified: f.stat.mtime,
			created: f.stat.ctime,
			size: f.stat.size,
		})));

		return {
			success: true,
			matches,
			query: args.query ?? "",
			count: matches.length,
		};
	}

	private async listNotes(args: { folder?: string; sort_by?: string; limit?: number }): Promise<ToolResult> {
		const sortBy = args.sort_by ?? "name";
		const limit = Math.min(args.limit ?? 30, 100);
		const folder = args.folder;

		let files = this.app.vault.getFiles();

		if (folder) {
			files = files.filter(f => f.path.startsWith(folder + "/") || f.parent?.path === folder);
		}

		files = this.sortFiles(files, sortBy);
		files = files.slice(0, limit);

		const notes = await Promise.all(files.map(async f => ({
			path: f.path,
			basename: f.basename,
			modified: f.stat.mtime,
			created: f.stat.ctime,
			size: f.stat.size,
		})));

		return {
			success: true,
			notes,
			folder: folder ?? "(all vault)",
			count: notes.length,
		};
	}

	private async getNoteMetadata(args: { path: string }): Promise<ToolResult> {
		const file = this.resolveNote(args.path);
		if (!file) return { error: `Note not found: ${args.path}` };

		const content = await this.app.vault.read(file);
		const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;

		return {
			success: true,
			path: file.path,
			basename: file.basename,
			created: file.stat.ctime,
			modified: file.stat.mtime,
			size: file.stat.size,
			wordCount,
		};
	}

	private sortFiles(files: TFile[], sortBy: string): TFile[] {
		return [...files].sort((a, b) => {
			switch (sortBy) {
				case "modified":
					return b.stat.mtime - a.stat.mtime;
				case "created":
					return b.stat.ctime - a.stat.ctime;
				case "name":
				default:
					return a.basename.localeCompare(b.basename);
			}
		});
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

	private async createFolder(args: { path: string }): Promise<ToolResult> {
		// Normalize path
		const folderPath = args.path.replace(/\/+/g, "/").replace(/\/$/, "");
		if (!folderPath) {
			return { error: "Folder path cannot be empty" };
		}

		// Check if already exists
		const existing = this.app.vault.getAbstractFileByPath(folderPath);
		if (existing) {
			return { error: `Folder already exists: ${folderPath}` };
		}

		await this.app.vault.createFolder(folderPath);
		new Notice(`✓ Created folder: ${folderPath}`);
		return { success: true, path: folderPath };
	}

	private async moveNote(args: { path: string; new_path: string }): Promise<ToolResult> {
		const file = this.resolveNote(args.path);
		if (!file) return { error: `Note not found: ${args.path}` };

		// Normalize destination
		let destPath = args.new_path.replace(/\\+/g, "/").replace(/^\/+/, "");
		if (!destPath.endsWith(".md")) {
			destPath += ".md";
		}

		// Ensure parent folder exists
		const destFolder = destPath.substring(0, destPath.lastIndexOf("/"));
		if (destFolder) {
			const folderExists = this.app.vault.getAbstractFileByPath(destFolder);
			if (!folderExists) {
				await this.app.vault.createFolder(destFolder);
			}
		}

		// Check for collision at destination
		const destExists = this.app.vault.getAbstractFileByPath(destPath);
		if (destExists) {
			return { error: `Destination already exists: ${destPath}` };
		}

		await this.app.fileManager.renameFile(file, destPath);
		new Notice(`✓ Moved ${file.basename} → ${destPath}`);
		return { success: true, path: destPath, oldPath: file.path };
	}

	private async deleteNote(args: { path: string }): Promise<ToolResult> {
		const file = this.resolveNote(args.path);
		if (!file) return { error: `Note not found: ${args.path}` };

		await this.app.vault.trash(file, false); // system trash
		new Notice(`✓ Deleted ${file.basename}`);
		return { success: true, path: file.path };
	}

	private async listFolders(args: { path?: string }): Promise<ToolResult> {
		const parentPath = args.path?.replace(/\\+/g, "/").replace(/\/$/, "") ?? "";
		const allFiles = this.app.vault.getAllLoadedFiles();
		const folderSet = new Set<string>();

		for (const f of allFiles) {
			if (f.path === "/") continue;
			const parts = f.path.split("/");
			if (parts.length <= 1) continue; // root-level file, no folder

			// Collect all parent folders
			for (let i = 1; i < parts.length; i++) {
				const folderPath = parts.slice(0, i).join("/");
				if (parentPath) {
					// Only include subfolders of the parent
					if (folderPath === parentPath || folderPath.startsWith(parentPath + "/")) {
						folderSet.add(folderPath);
					}
				} else {
					// Top-level: only include immediate subfolders
					if (i === 1) {
						folderSet.add(folderPath);
					}
				}
			}
		}

		const folders = Array.from(folderSet).sort();
		return {
			success: true,
			folders,
			count: folders.length,
			parent: parentPath || "(root)",
		};
	}
}
