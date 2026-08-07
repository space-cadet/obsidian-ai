import { App, Notice, TFile, normalizePath } from "obsidian";
import type { ToolCall, ToolResult } from "./types";
import type { ObsidianAISettings, WebSearchProvider } from "../settings";
import type { PersonaLoader } from "../intelligence/PersonaLoader";
import { SearchIndex } from "../search/index";
import type { ProviderRegistry } from "../integrations/ProviderRegistry";

/* ── Security: forbidden path patterns ── */
const FORBIDDEN_PATH_PATTERNS = [
	/^\.obsidian\b/,           // plugin config / data
	/^\.trash\b/,              // Obsidian trash
	/^\.git\b/,                // git internals
	/^\.+\//,                  // leading ../ or ./
	/\.\.\//,                   // any ../ anywhere
];

function isPathAllowed(path: string): boolean {
	const normalized = normalizePath(path);
	return !FORBIDDEN_PATH_PATTERNS.some((re) => re.test(normalized));
}

function denyPath(path: string): ToolResult {
	return {
		error: `Access denied: "${path}" is outside the allowed vault area.`,
	};
}
export class ToolExecutor {
	constructor(
		private app: App,
		private settings?: ObsidianAISettings,
		private personaLoader?: PersonaLoader,
		private searchIndex?: SearchIndex,
		private getActiveSessionId?: () => string | null,
		private integrationRegistry?: ProviderRegistry,
	) {}

	async execute(call: ToolCall): Promise<ToolResult> {
		try {
			const providerResult = await this.integrationRegistry?.execute(call);
			if (providerResult) return providerResult;
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
				case "create_notes":
					return await this.createNotes(
						call.args as { notes: Array<{ path: string; content: string }> },
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
						call.args as { query: string; sort_by?: string; limit?: number; folder?: string },
					);
				case "list_notes":
					return await this.listNotes(
						call.args as { folder?: string; sort_by?: string; limit?: number; include_subfolders?: boolean; depth?: number },
					);
				case "count_notes":
					return await this.countNotes(
						call.args as { folder?: string },
					);
				case "get_note_metadata":
					return await this.getNoteMetadata(
						call.args as { path: string },
					);
				case "list_folders":
					return await this.listFolders(
						call.args as { path?: string },
					);
				case "search_web":
					return await this.searchWeb(
						call.args as { query: string; limit?: number },
					);
				case "create_memory":
					return await this.createMemory(
						call.args as { category: string; content: string; tags?: string[] },
					);
				case "update_memory":
					return await this.updateMemory(
						call.args as { id: string; category?: string; content?: string; tags?: string[] },
					);
				case "delete_memory":
					return await this.deleteMemory(
						call.args as { id: string },
					);
				case "list_memories":
					return await this.listMemories(
						call.args as { category?: string; tag?: string; limit?: number },
					);
				case "search_memories":
					return await this.searchMemories(
						call.args as { query: string; limit?: number },
					);
				case "read_memory_audit":
					return await this.readMemoryAudit(
						call.args as { limit?: number },
					);
				case "search_past_sessions":
					return await this.searchPastSessions(
						call.args as { query: string; limit?: number },
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

	private async searchNotes(args: { query: string; sort_by?: string; limit?: number; folder?: string }): Promise<ToolResult> {
		const query = args.query?.toLowerCase() ?? "";
		const sortBy = args.sort_by ?? "name";
		const limit = Math.min(args.limit ?? 20, 100);
		const folder = args.folder;

		let files = this.app.vault.getFiles();

		// Folder filter
		if (folder) {
			files = files.filter(f => f.path.startsWith(folder + "/") || f.parent?.path === folder);
		}

		// Query filter (empty query = list all)
		if (query) {
			files = files.filter(f => {
				const nameMatch = f.path.toLowerCase().includes(query) || f.basename.toLowerCase().includes(query);
				return nameMatch;
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

	private async listNotes(args: { folder?: string; sort_by?: string; limit?: number; include_subfolders?: boolean; depth?: number }): Promise<ToolResult> {
		const sortBy = args.sort_by ?? "name";
		const limit = Math.min(args.limit ?? 30, 100);
		const folder = args.folder;
		const includeSubfolders = args.include_subfolders ?? true;
		const depth = Math.min(args.depth ?? 1, 3);

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

		// Collect subfolders
		let subfolders: string[] | undefined;
		if (includeSubfolders) {
			const allLoaded = this.app.vault.getAllLoadedFiles();
			const folderSet = new Set<string>();
			for (const f of allLoaded) {
				if (f.path === "/") continue;
				const parts = f.path.split("/");
				if (parts.length <= 1) continue;
				if (folder) {
					if (f.path.startsWith(folder + "/")) {
						const relativePath = f.path.slice(folder.length + 1);
						const relativeParts = relativePath.split("/");
						if (relativeParts.length >= 2) {
							const subPath = folder + "/" + relativeParts[0];
							folderSet.add(subPath);
						}
					}
				} else {
					folderSet.add(parts[0]);
				}
			}
			subfolders = Array.from(folderSet).sort();
		}

		return {
			success: true,
			notes,
			folder: folder ?? "(all vault)",
			count: notes.length,
			subfolders,
			subfolderCount: subfolders?.length,
		};
	}

	private async countNotes(args: { folder?: string }): Promise<ToolResult> {
		const folder = args.folder;
		let allFiles = this.app.vault.getFiles();
		let markdownFiles = this.app.vault.getMarkdownFiles();

		if (folder) {
			allFiles = allFiles.filter(f => f.path.startsWith(folder + "/") || f.parent?.path === folder);
			markdownFiles = markdownFiles.filter(f => f.path.startsWith(folder + "/") || f.parent?.path === folder);
		}

		const totalCount = allFiles.length;
		const markdownCount = markdownFiles.length;

		// Count direct files (not in subfolders)
		const directAllFiles = allFiles.filter(f => {
			const relativePath = folder ? f.path.slice(folder.length + 1) : f.path;
			return !relativePath.includes("/");
		});
		const directMarkdownFiles = markdownFiles.filter(f => {
			const relativePath = folder ? f.path.slice(folder.length + 1) : f.path;
			return !relativePath.includes("/");
		});

		// Count subfolders
		const allLoaded = this.app.vault.getAllLoadedFiles();
		const folderSet = new Set<string>();
		for (const f of allLoaded) {
			if (f.path === "/") continue;
			const parts = f.path.split("/");
			if (parts.length <= 1) continue;
			if (folder) {
				if (f.path.startsWith(folder + "/")) {
					const relativePath = f.path.slice(folder.length + 1);
					const relativeParts = relativePath.split("/");
					if (relativeParts.length >= 2) {
						folderSet.add(folder + "/" + relativeParts[0]);
					}
				}
			} else {
				folderSet.add(parts[0]);
			}
		}
		const subfolderCount = folderSet.size;

		return {
			success: true,
			folder: folder ?? "(entire vault)",
			totalCount,
			markdownCount,
			directCount: directAllFiles.length,
			directMarkdownCount: directMarkdownFiles.length,
			subfolderCount,
			content: `${folder ?? "Vault"}: ${totalCount} total files (${markdownCount} markdown, ${totalCount - markdownCount} non-markdown). ` +
				`${directAllFiles.length} directly in folder, ${totalCount - directAllFiles.length} in ${subfolderCount} subfolder${subfolderCount !== 1 ? "s" : ""}.`,
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
	 *
	 * Security: blocks access to .obsidian/, .trash/, .git/, and any path
	 * containing "../".
	 */
	private resolveNote(path: string): TFile | null {
		if (!isPathAllowed(path)) return null;
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
		if (resolved instanceof TFile) {
			// Check for ambiguous basename (multiple notes with same name)
			const ambiguous = this.findAmbiguousMatches(path);
			if (ambiguous.length > 1) {
				// Don't block — return the first match, but caller can warn
				(resolved as any).__ambiguous = ambiguous;
			}
			return resolved;
		}

		return null;
	}

	/**
	 * Finds all notes that share the same basename as the given path.
	 * Used to detect ambiguous wiki-link resolution.
	 */
	private findAmbiguousMatches(path: string): string[] {
		const basename = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
		const allFiles = this.app.vault.getFiles();
		const matches: string[] = [];
		for (const f of allFiles) {
			if (f.basename === basename) {
				matches.push(f.path);
			}
		}
		return matches;
	}

	private async readNote(args: { path: string }): Promise<ToolResult> {
		if (!isPathAllowed(args.path)) return denyPath(args.path);
		const file = this.resolveNote(args.path);
		if (!file) return { error: `Note not found: ${args.path}` };
		const content = await this.app.vault.read(file);
		const ambiguous = (file as any).__ambiguous as string[] | undefined;
		if (ambiguous && ambiguous.length > 1) {
			return {
				content,
				path: file.path,
				warning: `⚠️ Ambiguous name: ${ambiguous.length} notes share the basename "${file.basename}". ` +
					`Reading "${file.path}". Other matches: ${ambiguous.filter(p => p !== file.path).join(", ")}. ` +
					`Use the full path (e.g. "Folder/${file.basename}") to target a specific note.`,
			};
		}
		return { content, path: file.path };
	}

	private async editNote(args: {
		path: string;
		content: string;
	}): Promise<ToolResult> {
		if (!isPathAllowed(args.path)) return denyPath(args.path);
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
		if (!isPathAllowed(args.path)) return denyPath(args.path);
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
		if (!isPathAllowed(args.path)) return denyPath(args.path);
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

	private async createNotes(args: {
		notes: Array<{ path: string; content: string }>;
	}): Promise<ToolResult> {
		if (!Array.isArray(args.notes) || args.notes.length < 2 || args.notes.length > 100) {
			return { error: "create_notes requires between 2 and 100 notes." };
		}

		const normalizedNotes = args.notes.map((note) => ({
			...note,
			path: note.path.endsWith(".md") ? note.path : `${note.path}.md`,
		}));
		const paths = new Set<string>();
		for (const note of normalizedNotes) {
			if (!note.path || !isPathAllowed(note.path)) return denyPath(note.path);
			if (paths.has(note.path)) return { error: `Duplicate note path in batch: ${note.path}` };
			paths.add(note.path);
		}

		const created: string[] = [];
		const skippedPaths: string[] = [];
		for (const note of normalizedNotes) {
			// Batch creation is intentionally idempotent: a rerun creates only the
			// missing notes and does not let an already-created path stop the batch.
			if (this.resolveNote(note.path)) {
				skippedPaths.push(note.path);
				continue;
			}
			try {
				await this.app.vault.create(note.path, note.content);
				created.push(note.path);
			} catch (error: any) {
				// A competing operation may have created this file after the check.
				// Treat that race exactly like a pre-existing path and continue.
				if (this.resolveNote(note.path)) {
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

	private async patchNote(args: {
		path: string;
		search: string;
		replace: string;
		replace_all?: boolean;
	}): Promise<ToolResult> {
		if (!isPathAllowed(args.path)) return denyPath(args.path);
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
		if (!isPathAllowed(args.path)) return denyPath(args.path);
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
		if (!isPathAllowed(args.path)) return denyPath(args.path);
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
		if (!isPathAllowed(args.path) || !isPathAllowed(args.new_path)) {
			return denyPath(!isPathAllowed(args.path) ? args.path : args.new_path);
		}
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
		if (!isPathAllowed(args.path)) return denyPath(args.path);
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

			if (parentPath) {
				// List immediate subfolders of parentPath (depth 1)
				// For file "Research/Papers/2026/Jan.md" with parentPath "Research/Papers":
				// → include "Research/Papers/2026" (one level below parent)
				// → exclude "Research/Papers/2026/Jan" (deeper)
				if (f.path.startsWith(parentPath + "/")) {
					const relativePath = f.path.slice(parentPath.length + 1);
					const relativeParts = relativePath.split("/");
					if (relativeParts.length >= 2) {
						// At least one folder below the file name
						const immediateSub = parentPath + "/" + relativeParts[0];
						folderSet.add(immediateSub);
					}
				}
			} else {
				// No parentPath: list top-level folders only (depth 1)
				folderSet.add(parts[0]);
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

	/* ───────────────────────────────────────────────────────────
	 * Web Search
	 * ─────────────────────────────────────────────────────────── */

	private async searchWeb(args: {
		query: string;
		limit?: number;
	}): Promise<ToolResult> {
		const provider = this.settings?.webSearchProvider ?? "duckduckgo";
		const limit = Math.min(args.limit ?? 5, 20);

		try {
			let results: Array<{ title: string; url: string; snippet: string }> = [];

			if (provider === "brave") {
				results = await this.searchBrave(args.query, limit);
			} else if (provider === "duckduckgo") {
				results = await this.searchDuckDuckGo(args.query, limit);
			} else if (provider === "searxng") {
				results = await this.searchSearXNG(args.query, limit);
			} else if (provider === "tavily") {
				results = await this.searchTavily(args.query, limit);
			} else if (provider === "exa") {
				results = await this.searchExa(args.query, limit);
			}

			if (results.length === 0) {
				return { error: "No search results found." };
			}

			// Format as markdown for the LLM
			const formatted = results
				.map(
					(r, i) =>
						`${i + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.snippet}`,
				)
				.join("\n\n");

			return {
				success: true,
				content: formatted,
				query: args.query,
				count: results.length,
			};
		} catch (e: any) {
			return {
				error: `Web search failed (${provider}): ${e.message || String(e)}`,
			};
		}
	}

	private async searchBrave(
		query: string,
		limit: number,
	): Promise<Array<{ title: string; url: string; snippet: string }>> {
		const apiKey = this.settings?.braveApiKey;
		if (!apiKey) {
			throw new Error(
				"Brave Search API key not configured. Add it in Settings → Web Search.",
			);
		}

		const url = new URL("https://api.search.brave.com/res/v1/web/search");
		url.searchParams.set("q", query);
		url.searchParams.set("count", String(limit));
		url.searchParams.set("offset", "0");

		const res = await fetch(url.toString(), {
			headers: {
				"X-Subscription-Token": apiKey,
				Accept: "application/json",
			},
		});

		if (!res.ok) {
			const text = await res.text().catch(() => "");
			throw new Error(`Brave API ${res.status}: ${text}`);
		}

		const data = await res.json();
		const results = data.web?.results ?? [];

		return results.slice(0, limit).map((r: any) => ({
			title: r.title ?? "Untitled",
			url: r.url ?? "",
			snippet: r.description ?? "",
		}));
	}

	private async searchDuckDuckGo(
		query: string,
		limit: number,
	): Promise<Array<{ title: string; url: string; snippet: string }>> {
		// DuckDuckGo HTML scraping — no API key needed
		const url = new URL("https://html.duckduckgo.com/html/");
		url.searchParams.set("q", query);
		url.searchParams.set("kl", "us-en"); // region

		const res = await fetch(url.toString(), {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0",
			},
		});

		if (!res.ok) {
			throw new Error(`DuckDuckGo ${res.status}`);
		}

		const html = await res.text();
		const results: Array<{ title: string; url: string; snippet: string }> = [];

		// Parse using DOMParser instead of regex to avoid ReDoS
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, "text/html");

		// Find all result containers
		const resultDivs = doc.querySelectorAll(".result, .result__a, .result__snippet");

		// Collect links and snippets
		const linkElements = doc.querySelectorAll("a.result__a");
		const snippetElements = doc.querySelectorAll("a.result__snippet");

		for (let i = 0; i < linkElements.length && results.length < limit; i++) {
			const linkEl = linkElements[i];
			const rawUrl = linkEl.getAttribute("href") ?? "";
			const title = this.stripHtml(linkEl.textContent ?? "");

			// Try to find matching snippet
			let snippet = "";
			if (snippetElements[i]) {
				snippet = this.stripHtml(snippetElements[i].textContent ?? "");
			}

			// DuckDuckGo redirects through their own URL — try to extract real URL
			let url = rawUrl;
			if (rawUrl.startsWith("//duckduckgo.com/l/")) {
				try {
					const u = new URL("https:" + rawUrl);
					url = u.searchParams.get("uddg") ?? rawUrl;
				} catch {
					// keep rawUrl
				}
			}

			if (title && url) {
				results.push({ title, url, snippet });
			}
		}

		return results;
	}

	private async searchSearXNG(
		query: string,
		limit: number,
	): Promise<Array<{ title: string; url: string; snippet: string }>> {
		const baseUrl = this.settings?.searxngUrl?.replace(/\/$/, "");
		if (!baseUrl) {
			throw new Error(
				"SearXNG URL not configured. Add it in Settings → Web Search.",
			);
		}

		const url = new URL(`${baseUrl}/search`);
		url.searchParams.set("q", query);
		url.searchParams.set("format", "json");
		url.searchParams.set("language", "en");

		const res = await fetch(url.toString());
		if (!res.ok) {
			throw new Error(`SearXNG ${res.status}`);
		}

		const data = await res.json();
		const results = data.results ?? [];

		return results.slice(0, limit).map((r: any) => ({
			title: r.title ?? "Untitled",
			url: r.url ?? "",
			snippet: r.content ?? r.abstract ?? "",
		}));
	}

	private async searchTavily(
		query: string,
		limit: number,
	): Promise<Array<{ title: string; url: string; snippet: string }>> {
		const apiKey = this.settings?.tavilyApiKey;
		if (!apiKey) {
			throw new Error(
				"Tavily API key not configured. Add it in Settings → Web Search.",
			);
		}

		const res = await fetch("https://api.tavily.com/search", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				api_key: apiKey,
				query,
				search_depth: "basic",
				max_results: limit,
				include_answer: false,
				include_images: false,
				include_raw_content: false,
			}),
		});

		if (!res.ok) {
			const text = await res.text().catch(() => "");
			throw new Error(`Tavily API ${res.status}: ${text}`);
		}

		const data = await res.json();
		const results = data.results ?? [];

		return results.slice(0, limit).map((r: any) => ({
			title: r.title ?? "Untitled",
			url: r.url ?? "",
			snippet: r.content ?? r.snippet ?? "",
		}));
	}

	private async searchExa(
		query: string,
		limit: number,
	): Promise<Array<{ title: string; url: string; snippet: string }>> {
		const apiKey = this.settings?.exaApiKey;
		if (!apiKey) {
			throw new Error(
				"Exa API key not configured. Add it in Settings → Web Search.",
			);
		}

		const res = await fetch("https://api.exa.ai/search", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				query,
				num_results: limit,
				use_autoprompt: false,
				contents: {
					text: { max_characters: 500 },
				},
			}),
		});

		if (!res.ok) {
			const text = await res.text().catch(() => "");
			throw new Error(`Exa API ${res.status}: ${text}`);
		}

		const data = await res.json();
		const results = data.results ?? [];

		return results.slice(0, limit).map((r: any) => ({
			title: r.title ?? r.author ?? "Untitled",
			url: r.url ?? "",
			snippet: r.text ?? r.highlight ?? "",
		}));
	}

	private stripHtml(html: string): string {
		return html
			.replace(/<[^>]+>/g, "")
			.replace(/&amp;/g, "&")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/&nbsp;/g, " ")
			.trim();
	}

	/* ───────────────────────────────────────────────────────────
	 * Memory (T26 Intelligence Layer)
	 * ─────────────────────────────────────────────────────────── */

	/* ───────────────────────────────────────────────────────────
	 * Memory CRUD (T26 Intelligence Layer)
	 * ─────────────────────────────────────────────────────────── */

	private async createMemory(args: {
		category: string;
		content: string;
		tags?: string[];
	}): Promise<ToolResult> {
		if (!this.personaLoader) {
			return {
				error:
					"Memory creation is disabled. Enable the intelligence layer in Settings → AI Intelligence Layer.",
			};
		}

		try {
			const entry = await this.personaLoader.memoryStore.create(
				args.category as any,
				args.content,
				args.tags,
			);
			return {
				success: true,
				entry: `[${entry.timestamp}] **${entry.category}**: ${entry.content}${entry.tags.length ? " " + entry.tags.map((t) => `#${t}`).join(" ") : ""}`,
				id: entry.id,
			};
		} catch (e: any) {
			return { error: `Failed to create memory: ${e.message}` };
		}
	}

	private async updateMemory(args: {
		id: string;
		category?: string;
		content?: string;
		tags?: string[];
	}): Promise<ToolResult> {
		if (!this.personaLoader) {
			return {
				error:
					"Memory update is disabled. Enable the intelligence layer in Settings.",
			};
		}

		try {
			const entry = await this.personaLoader.memoryStore.update(args.id, {
				category: args.category as any,
				content: args.content,
				tags: args.tags,
			});
			if (!entry) {
				return { error: `Memory not found: ${args.id}` };
			}
			return {
				success: true,
				entry: `[${entry.timestamp}] **${entry.category}**: ${entry.content}${entry.tags.length ? " " + entry.tags.map((t) => `#${t}`).join(" ") : ""}`,
				id: entry.id,
			};
		} catch (e: any) {
			return { error: `Failed to update memory: ${e.message}` };
		}
	}

	private async deleteMemory(args: { id: string }): Promise<ToolResult> {
		if (!this.personaLoader) {
			return {
				error:
					"Memory deletion is disabled. Enable the intelligence layer in Settings.",
			};
		}

		try {
			const deleted = await this.personaLoader.memoryStore.delete(args.id);
			if (!deleted) {
				return { error: `Memory not found: ${args.id}` };
			}
			return { success: true, id: args.id };
		} catch (e: any) {
			return { error: `Failed to delete memory: ${e.message}` };
		}
	}

	private async listMemories(args: {
		category?: string;
		tag?: string;
		limit?: number;
	}): Promise<ToolResult> {
		if (!this.personaLoader) {
			return {
				error:
					"Memory listing is disabled. Enable the intelligence layer in Settings.",
			};
		}

		try {
			const entries = await this.personaLoader.memoryStore.list({
				category: args.category as any,
				tag: args.tag,
				limit: args.limit,
			});
			if (entries.length === 0) {
				return { success: true, content: "No memories found." };
			}
			const lines = entries.map(
				(e) =>
					`- [${e.timestamp}] **${e.category}**: ${e.content}${e.tags.length ? " " + e.tags.map((t) => `#${t}`).join(" ") : ""} [id:${e.id}]`,
			);
			return {
				success: true,
				content: lines.join("\n"),
				count: entries.length,
			};
		} catch (e: any) {
			return { error: `Failed to list memories: ${e.message}` };
		}
	}

	private async searchMemories(args: {
		query: string;
		limit?: number;
	}): Promise<ToolResult> {
		if (!this.personaLoader) {
			return {
				error:
					"Memory search is disabled. Enable the intelligence layer in Settings.",
			};
		}

		try {
			const entries = await this.personaLoader.memoryStore.search(args.query);
			const limit = Math.min(args.limit ?? 10, 50);
			const limited = entries.slice(0, limit);

			if (limited.length === 0) {
				return { success: true, content: "No memories match your query." };
			}

			const lines = limited.map(
				(e) =>
					`- [${e.timestamp}] **${e.category}**: ${e.content}${e.tags.length ? " " + e.tags.map((t) => `#${t}`).join(" ") : ""} [id:${e.id}]`,
			);
			return {
				success: true,
				content: lines.join("\n"),
				count: limited.length,
			};
		} catch (e: any) {
			return { error: `Failed to search memories: ${e.message}` };
		}
	}

	private async readMemoryAudit(args: {
		limit?: number;
	}): Promise<ToolResult> {
		if (!this.personaLoader) {
			return {
				error:
					"Memory audit is disabled. Enable the intelligence layer in Settings.",
			};
		}

		if (!this.settings?.intelligence.enableMemoryAuditTool) {
			return {
				error:
					"Memory audit tool is disabled. Enable it in Settings → AI Intelligence Layer.",
			};
		}

		try {
			const entries = await this.personaLoader.memoryStore.readAudit(
				args.limit ?? 20,
			);
			if (entries.length === 0) {
				return { success: true, content: "No audit entries found." };
			}

			const lines = entries.map((e) => {
				const time = new Date(e.timestamp).toLocaleString();
				const icon = e.operation === "create" ? "+" : e.operation === "update" ? "✎" : "−";
				const preview = e.content
					? `"${e.content.slice(0, 60)}${e.content.length > 60 ? "…" : ""}"`
					: "";
				return `${time} ${icon} ${e.operation} [${e.entryId}] ${preview}`;
			});
			return {
				success: true,
				content: lines.join("\n"),
				count: entries.length,
			};
		} catch (e: any) {
			return { error: `Failed to read memory audit: ${e.message}` };
		}
	}

	private async searchPastSessions(args: {
		query: string;
		limit?: number;
	}): Promise<ToolResult> {
		if (!this.searchIndex) {
			return {
				error:
					"Session search is not available. The search index has not been initialized.",
			};
		}

		try {
			const activeSessionId = this.getActiveSessionId?.();
			const results = (await this.searchIndex.search(args.query))
				.filter((result) => result.sessionId !== activeSessionId);
			const limit = Math.min(args.limit ?? 5, 20);
			const limited = results.slice(0, limit);

			if (limited.length === 0) {
				return {
					success: true,
					content: "No past sessions found matching your query.",
				};
			}

			const formatted = limited
				.map((r, i) => {
					const date = new Date(r.timestamp).toLocaleDateString();
					return `${i + 1}. **Session ${r.sessionId}** (${date}): ${r.snippet.slice(0, 150)}...`;
				})
				.join("\n");

			return {
				success: true,
				sessionResults: limited,
				content: `Found ${limited.length} result(s):\n\n${formatted}`,
			};
		} catch (e: any) {
			return { error: `Search failed: ${e.message || String(e)}` };
		}
	}
}
