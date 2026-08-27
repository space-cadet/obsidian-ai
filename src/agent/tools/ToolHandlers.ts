import { App, Notice, TFile, requestUrl } from "obsidian";
import type { ToolResult } from "../types";
import type { ObsidianAISettings, WebSearchProvider } from "../../settings";
import type { PersonaLoader } from "../../intelligence/PersonaLoader";
import { SearchIndex } from "../../search/index";
import type { ProviderRegistry } from "../../integrations/ProviderRegistry";
import { ContinuationStore, requestFingerprint } from "../pagination";
import {
	sanitizeSettings,
	validateSettingUpdate,
} from "../../lib/selfSettingsTools";
import { ToolResolver, denyPath, isPathAllowed } from "./ToolResolver";

export class ToolHandlers {
	constructor(
		private readonly app: App,
		private readonly resolver: ToolResolver,
		private readonly settings?: ObsidianAISettings,
		private readonly personaLoader?: PersonaLoader,
		private readonly searchIndex?: SearchIndex,
		private readonly getActiveSessionId?: () => string | null,
		private readonly integrationRegistry?: ProviderRegistry,
		private readonly saveSettings?: () => Promise<void>,
		private readonly continuations = new ContinuationStore(),
	) {}
	async searchNotes(args: {
		query: string;
		sort_by?: string;
		limit?: number;
		folder?: string;
		cursor?: string;
	}): Promise<ToolResult> {
		const query = args.query?.toLowerCase() ?? "";
		const sortBy = args.sort_by ?? "name";
		const limit = Math.min(args.limit ?? 20, 50);
		const folder = args.folder;

		// Validate and resolve folder
		let folderFilter = folder;
		if (folder) {
			const resolved = this.resolver.resolveFolderPath(folder);
			if (resolved.path) {
				folderFilter = resolved.path;
			} else {
				return {
					error: `Folder not found: "${folder}". ${resolved.suggestions.length > 0 ? `Did you mean: ${resolved.suggestions.join(", ")}?` : "No similar folders found."}`,
				};
			}
		}

		let files = this.app.vault.getFiles();

		// Folder filter
		if (folderFilter) {
			files = files.filter(
				(f) =>
					f.path.startsWith(folderFilter + "/") ||
					f.parent?.path === folderFilter,
			);
		}

		// Query filter (empty query = list all)
		if (query) {
			files = files.filter((f) => {
				const nameMatch =
					f.path.toLowerCase().includes(query) ||
					f.basename.toLowerCase().includes(query);
				return nameMatch;
			});
		}

		// Sort
		files = this.resolver.sortFiles(files, sortBy);

		const matches = await Promise.all(
			files.map(async (f) => ({
				path: f.path,
				basename: f.basename,
				modified: f.stat.mtime,
				created: f.stat.ctime,
				size: f.stat.size,
			})),
		);
		const page = this.continuations.page({
			toolName: "search_notes",
			fingerprint: requestFingerprint("search_notes", {
				query,
				sort_by: sortBy,
				folder: folderFilter ?? null,
			}),
			items: matches,
			limit,
			cursor: args.cursor,
		});
		if ("error" in page) return page;
		const compactMatches =
			page.total > 20
				? page.items.map(({ path, basename, modified }) => ({
						path,
						basename,
						modified,
					}))
				: page.items;

		return {
			success: true,
			matches: compactMatches,
			query: args.query ?? "",
			count: compactMatches.length,
			total_matches: page.total,
			has_more: page.hasMore,
			next_cursor: page.nextCursor,
		};
	}

	async searchNoteContent(args: {
		query: string;
		folder?: string;
		sort_by?: string;
		limit?: number;
		cursor?: string;
		context_lines?: number;
		match_mode?: string;
		include_filename?: boolean;
		include_snippets?: boolean;
	}): Promise<ToolResult> {
		const query = args.query?.toLowerCase() ?? "";
		const sortBy = args.sort_by ?? "relevance";
		const limit = Math.min(args.limit ?? 20, 50);
		const folder = args.folder;
		const contextLines = Math.min(args.context_lines ?? 2, 5);
		const matchMode = args.match_mode ?? "phrase";
		const includeFilename = args.include_filename ?? false;
		const includeSnippets = args.include_snippets ?? false;

		if (!query) {
			return { error: "Query is required for content search." };
		}

		// Normalize query for Unicode support
		const normalizedQuery = query.normalize("NFC");

		// Parse terms based on match mode
		let terms: string[];
		if (matchMode === "phrase") {
			terms = [normalizedQuery];
		} else {
			terms = normalizedQuery.split(/\s+/).filter((t) => t.length > 0);
		}
		if (terms.length === 0) {
			return { error: "Query contains no searchable terms." };
		}

		// Validate folder if provided
		let folderFilter = folder;
		if (folder) {
			const resolved = this.resolver.resolveFolderPath(folder);
			if (resolved.path) {
				folderFilter = resolved.path;
			} else {
				return {
					error: `Folder not found: "${folder}". ${resolved.suggestions.length > 0 ? `Did you mean: ${resolved.suggestions.join(", ")}?` : "No similar folders found."}`,
				};
			}
		}

		let files = this.app.vault.getMarkdownFiles();

		// Folder filter
		if (folderFilter) {
			files = files.filter(
				(f) =>
					f.path.startsWith(folderFilter + "/") ||
					f.parent?.path === folderFilter,
			);
		}

		interface MatchResult {
			file: TFile;
			matchCount: number;
			excerpts: string[];
		}

		const results: MatchResult[] = [];

		for (const file of files) {
			let content: string;
			try {
				content = await this.app.vault.read(file);
			} catch {
				continue;
			}

			const normalizedContent = content.normalize("NFC").toLowerCase();
			const basenameLower = file.basename.toLowerCase();

			// Check content match
			let contentMatch = false;
			let contentMatchCount = 0;

			if (matchMode === "any") {
				contentMatch = terms.some((term) =>
					normalizedContent.includes(term),
				);
				for (const term of terms) {
					let idx = normalizedContent.indexOf(term);
					while (idx !== -1) {
						contentMatchCount++;
						idx = normalizedContent.indexOf(term, idx + 1);
					}
				}
			} else {
				// "and" or "phrase"
				contentMatch = terms.every((term) =>
					normalizedContent.includes(term),
				);
				for (const term of terms) {
					let idx = normalizedContent.indexOf(term);
					while (idx !== -1) {
						contentMatchCount++;
						idx = normalizedContent.indexOf(term, idx + 1);
					}
				}
			}

			// Check filename match if requested
			let filenameMatch = false;
			if (includeFilename) {
				if (matchMode === "any") {
					filenameMatch = terms.some((term) =>
						basenameLower.includes(term),
					);
				} else {
					filenameMatch = terms.every((term) =>
						basenameLower.includes(term),
					);
				}
			}

			if (!contentMatch && !filenameMatch) continue;

			const totalMatchCount = contentMatchCount + (filenameMatch ? 1 : 0);

			// Build excerpts only if requested
			const excerpts: string[] = [];
			if (includeSnippets && contentMatch) {
				const lines = content.split("\n");
				const lowerLines = lines.map((l) =>
					l.toLowerCase().normalize("NFC"),
				);
				const matchedLineIndices = new Set<number>();

				for (let i = 0; i < lines.length; i++) {
					if (matchMode === "any") {
						if (
							terms.some((term) => lowerLines[i].includes(term))
						) {
							matchedLineIndices.add(i);
						}
					} else {
						if (
							terms.every((term) => lowerLines[i].includes(term))
						) {
							matchedLineIndices.add(i);
						}
					}
				}

				const usedRanges = new Set<string>();
				for (const lineIdx of matchedLineIndices) {
					const start = Math.max(0, lineIdx - contextLines);
					const end = Math.min(
						lines.length,
						lineIdx + contextLines + 1,
					);
					const rangeKey = `${start}-${end}`;
					if (usedRanges.has(rangeKey)) continue;
					usedRanges.add(rangeKey);

					const excerptLines = lines.slice(start, end);
					excerpts.push(excerptLines.join("\n"));
				}
			}

			results.push({ file, matchCount: totalMatchCount, excerpts });
		}

		// Sort
		results.sort((a, b) => {
			const primary = (() => {
				switch (sortBy) {
					case "relevance":
						return b.matchCount - a.matchCount;
					case "modified":
						return b.file.stat.mtime - a.file.stat.mtime;
					case "created":
						return b.file.stat.ctime - a.file.stat.ctime;
					case "name":
					default:
						return a.file.basename.localeCompare(b.file.basename);
				}
			})();
			return primary || a.file.path.localeCompare(b.file.path);
		});

		const resultItems = results.map((result) => ({
			path: result.file.path,
			basename: result.file.basename,
			matchCount: result.matchCount,
			excerpts: result.excerpts,
		}));
		const page = this.continuations.page({
			toolName: "search_note_content",
			fingerprint: requestFingerprint("search_note_content", {
				query: normalizedQuery,
				folder: folderFilter ?? null,
				sort_by: sortBy,
				context_lines: contextLines,
				match_mode: matchMode,
				include_filename: includeFilename,
				include_snippets: includeSnippets,
			}),
			items: resultItems,
			limit,
			cursor: args.cursor,
		});
		if ("error" in page) return page;
		const limited = page.items;
		const totalMatches = page.total;
		const truncated = page.hasMore;

		if (limited.length === 0) {
			return {
				success: true,
				content: `No notes found matching "${args.query}"${folderFilter ? ` in folder "${folderFilter}"` : ""}.`,
				count: 0,
				total_matches: 0,
				truncated: false,
				has_more: false,
				paths: [],
			};
		}

		// Format results
		if (!includeSnippets) {
			// Counts-only mode: just list paths
			const paths = limited.map((r) => r.path);
			return {
				success: true,
				paths,
				count: limited.length,
				total_matches: totalMatches,
				truncated,
				has_more: page.hasMore,
				next_cursor: page.nextCursor,
			};
		}

		const formatted = limited
			.map((r, i) => {
				const excerptText =
					r.excerpts.length > 0
						? "\n" +
							r.excerpts
								.map((ex) =>
									ex
										.split("\n")
										.map((l) => "    " + l)
										.join("\n"),
								)
								.join("\n    ...\n")
						: "";
				return `${i + 1}. **${r.basename}** — ${r.path} (${r.matchCount} matches)${excerptText}`;
			})
			.join("\n\n");

		return {
			success: true,
			content: `Found ${limited.length} note(s) matching "${args.query}"${folderFilter ? ` in folder "${folderFilter}"` : ""}:\n\n${formatted}`,
			count: limited.length,
			total_matches: totalMatches,
			truncated,
			has_more: page.hasMore,
			next_cursor: page.nextCursor,
			paths: limited.map((r) => r.path),
		};
	}

	async listNotes(args: {
		folder?: string;
		sort_by?: string;
		limit?: number;
		include_subfolders?: boolean;
		depth?: number;
		cursor?: string;
	}): Promise<ToolResult> {
		const sortBy = args.sort_by ?? "name";
		const limit = Math.min(args.limit ?? 30, 100);
		const folder = args.folder;
		const includeSubfolders = args.include_subfolders ?? true;
		const depth = Math.min(args.depth ?? 1, 3);

		// Validate and resolve folder
		let folderFilter = folder;
		if (folder) {
			const resolved = this.resolver.resolveFolderPath(folder);
			if (resolved.path) {
				folderFilter = resolved.path;
			} else {
				return {
					error: `Folder not found: "${folder}". ${resolved.suggestions.length > 0 ? `Did you mean: ${resolved.suggestions.join(", ")}?` : "No similar folders found."}`,
				};
			}
		}

		let files = this.app.vault.getFiles();

		if (folderFilter) {
			files = files.filter(
				(f) =>
					f.path.startsWith(folderFilter + "/") ||
					f.parent?.path === folderFilter,
			);
		}

		files = this.resolver.sortFiles(files, sortBy);

		const notes = await Promise.all(
			files.map(async (f) => ({
				path: f.path,
				basename: f.basename,
				modified: f.stat.mtime,
				created: f.stat.ctime,
				size: f.stat.size,
			})),
		);
		const page = this.continuations.page({
			toolName: "list_notes",
			fingerprint: requestFingerprint("list_notes", {
				folder: folderFilter ?? null,
				sort_by: sortBy,
				include_subfolders: includeSubfolders,
				depth,
			}),
			items: notes,
			limit,
			cursor: args.cursor,
		});
		if ("error" in page) return page;

		// Collect subfolders
		let subfolders: string[] | undefined;
		if (includeSubfolders) {
			const allLoaded = this.app.vault.getAllLoadedFiles();
			const folderSet = new Set<string>();
			for (const f of allLoaded) {
				if (f.path === "/") continue;
				const parts = f.path.split("/");
				if (parts.length <= 1) continue;
				if (folderFilter) {
					if (f.path.startsWith(folderFilter + "/")) {
						const relativePath = f.path.slice(
							folderFilter.length + 1,
						);
						const relativeParts = relativePath.split("/");
						if (relativeParts.length >= 2) {
							const subPath =
								folderFilter + "/" + relativeParts[0];
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
			notes: page.items,
			folder: folderFilter ?? "(all vault)",
			count: page.items.length,
			total_count: page.total,
			has_more: page.hasMore,
			next_cursor: page.nextCursor,
			subfolders,
			subfolderCount: subfolders?.length,
		};
	}

	async countNotes(args: { folder?: string }): Promise<ToolResult> {
		const folder = args.folder;

		// Validate and resolve folder
		let folderFilter = folder;
		if (folder) {
			const resolved = this.resolver.resolveFolderPath(folder);
			if (resolved.path) {
				folderFilter = resolved.path;
			} else {
				return {
					error: `Folder not found: "${folder}". ${resolved.suggestions.length > 0 ? `Did you mean: ${resolved.suggestions.join(", ")}?` : "No similar folders found."}`,
				};
			}
		}

		let allFiles = this.app.vault.getFiles();
		let markdownFiles = this.app.vault.getMarkdownFiles();

		if (folderFilter) {
			allFiles = allFiles.filter(
				(f) =>
					f.path.startsWith(folderFilter + "/") ||
					f.parent?.path === folderFilter,
			);
			markdownFiles = markdownFiles.filter(
				(f) =>
					f.path.startsWith(folderFilter + "/") ||
					f.parent?.path === folderFilter,
			);
		}

		const totalCount = allFiles.length;
		const markdownCount = markdownFiles.length;

		// Count direct files (not in subfolders)
		const directAllFiles = allFiles.filter((f) => {
			const relativePath = folderFilter
				? f.path.slice(folderFilter.length + 1)
				: f.path;
			return !relativePath.includes("/");
		});
		const directMarkdownFiles = markdownFiles.filter((f) => {
			const relativePath = folderFilter
				? f.path.slice(folderFilter.length + 1)
				: f.path;
			return !relativePath.includes("/");
		});

		// Count subfolders
		const allLoaded = this.app.vault.getAllLoadedFiles();
		const folderSet = new Set<string>();
		for (const f of allLoaded) {
			if (f.path === "/") continue;
			const parts = f.path.split("/");
			if (parts.length <= 1) continue;
			if (folderFilter) {
				if (f.path.startsWith(folderFilter + "/")) {
					const relativePath = f.path.slice(folderFilter.length + 1);
					const relativeParts = relativePath.split("/");
					if (relativeParts.length >= 2) {
						folderSet.add(folderFilter + "/" + relativeParts[0]);
					}
				}
			} else {
				folderSet.add(parts[0]);
			}
		}
		const subfolderCount = folderSet.size;

		return {
			success: true,
			folder: folderFilter ?? "(entire vault)",
			totalCount,
			markdownCount,
			directCount: directAllFiles.length,
			directMarkdownCount: directMarkdownFiles.length,
			subfolderCount,
			content:
				`${folderFilter ?? "Vault"}: ${totalCount} total files (${markdownCount} markdown, ${totalCount - markdownCount} non-markdown). ` +
				`${directAllFiles.length} directly in folder, ${totalCount - directAllFiles.length} in ${subfolderCount} subfolder${subfolderCount !== 1 ? "s" : ""}.`,
		};
	}

	async getNoteMetadata(args: { path: string }): Promise<ToolResult> {
		const file = this.resolver.resolveNote(args.path);
		if (!file) return { error: `Note not found: ${args.path}` };

		const content = await this.app.vault.read(file);
		const wordCount = content
			.split(/\s+/)
			.filter((w) => w.length > 0).length;

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

	/**
	 * Check whether multiple note paths exist in the vault.
	 * Returns existence status, canonical path, and metadata for each.
	 */
	async checkPaths(args: { paths: string[] }): Promise<ToolResult> {
		if (!Array.isArray(args.paths) || args.paths.length === 0) {
			return { error: "paths must be a non-empty array of strings." };
		}
		if (args.paths.length > 100) {
			return { error: "Maximum 100 paths per check_paths call." };
		}

		const results = await Promise.all(
			args.paths.map(async (path) => {
				if (!isPathAllowed(path)) {
					return {
						path,
						exists: false,
						error: "Access denied: path is outside the allowed vault area.",
					};
				}

				const file = this.resolver.resolveNote(path);
				if (!file) {
					return {
						path,
						exists: false,
						canonical_path: null,
						word_count: null,
						modified: null,
					};
				}

				const content = await this.app.vault.read(file);
				const wordCount = content
					.split(/\s+/)
					.filter((w) => w.length > 0).length;

				return {
					path,
					exists: true,
					canonical_path: file.path,
					word_count: wordCount,
					modified: file.stat.mtime,
				};
			}),
		);

		const found = results.filter((r) => r.exists).length;
		return {
			success: true,
			results,
			summary: `${found}/${results.length} paths exist`,
		};
	}

	async createFolder(args: { path: string }): Promise<ToolResult> {
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

	async moveNote(args: {
		path: string;
		new_path: string;
	}): Promise<ToolResult> {
		if (!isPathAllowed(args.path) || !isPathAllowed(args.new_path)) {
			return denyPath(
				!isPathAllowed(args.path) ? args.path : args.new_path,
			);
		}
		const file = this.resolver.resolveNote(args.path);
		if (!file) return { error: `Note not found: ${args.path}` };

		// Normalize destination
		let destPath = args.new_path.replace(/\\+/g, "/").replace(/^\/+/, "");
		if (!destPath.endsWith(".md")) {
			destPath += ".md";
		}

		// Ensure parent folder exists
		const destFolder = destPath.substring(0, destPath.lastIndexOf("/"));
		if (destFolder) {
			const folderExists =
				this.app.vault.getAbstractFileByPath(destFolder);
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

	async deleteNote(args: { path: string }): Promise<ToolResult> {
		if (!isPathAllowed(args.path)) return denyPath(args.path);
		const file = this.resolver.resolveNote(args.path);
		if (!file) return { error: `Note not found: ${args.path}` };

		await this.app.vault.trash(file, false); // system trash
		new Notice(`✓ Deleted ${file.basename}`);
		return { success: true, path: file.path };
	}

	async listFolders(args: { path?: string }): Promise<ToolResult> {
		const parentPath =
			args.path?.replace(/\\+/g, "/").replace(/\/$/, "") ?? "";

		// Validate and resolve parent folder
		let resolvedParent = parentPath;
		if (parentPath) {
			const resolved = this.resolver.resolveFolderPath(parentPath);
			if (resolved.path) {
				resolvedParent = resolved.path;
			} else {
				return {
					error: `Folder not found: "${parentPath}". ${resolved.suggestions.length > 0 ? `Did you mean: ${resolved.suggestions.join(", ")}?` : "No similar folders found."}`,
				};
			}
		}

		const allFiles = this.app.vault.getAllLoadedFiles();
		const folderSet = new Set<string>();

		for (const f of allFiles) {
			if (f.path === "/") continue;
			const parts = f.path.split("/");
			if (parts.length <= 1) continue; // root-level file, no folder

			if (resolvedParent) {
				// List immediate subfolders of resolvedParent (depth 1)
				// For file "Research/Papers/2026/Jan.md" with resolvedParent "Research/Papers":
				// → include "Research/Papers/2026" (one level below parent)
				// → exclude "Research/Papers/2026/Jan" (deeper)
				if (f.path.startsWith(resolvedParent + "/")) {
					const relativePath = f.path.slice(
						resolvedParent.length + 1,
					);
					const relativeParts = relativePath.split("/");
					if (relativeParts.length >= 2) {
						// At least one folder below the file name
						const immediateSub =
							resolvedParent + "/" + relativeParts[0];
						folderSet.add(immediateSub);
					}
				}
			} else {
				// No resolvedParent: list top-level folders only (depth 1)
				folderSet.add(parts[0]);
			}
		}

		const folders = Array.from(folderSet).sort();
		return {
			success: true,
			folders,
			count: folders.length,
			parent: resolvedParent || "(root)",
		};
	}

	/* ───────────────────────────────────────────────────────────
	 * Web Search
	 * ─────────────────────────────────────────────────────────── */

	async searchWeb(args: {
		query: string;
		limit?: number;
		cursor?: string;
	}): Promise<ToolResult> {
		const provider = this.settings?.webSearchProvider ?? "duckduckgo";
		const limit = Math.min(args.limit ?? 5, 20);

		try {
			let results: Array<{
				title: string;
				url: string;
				snippet: string;
			}> = [];

			if (!args.cursor) {
				const snapshotLimit = 20;
				if (provider === "brave") {
					results = await this.searchBrave(args.query, snapshotLimit);
				} else if (provider === "duckduckgo") {
					results = await this.searchDuckDuckGo(
						args.query,
						snapshotLimit,
					);
				} else if (provider === "searxng") {
					results = await this.searchSearXNG(
						args.query,
						snapshotLimit,
					);
				} else if (provider === "tavily") {
					results = await this.searchTavily(
						args.query,
						snapshotLimit,
					);
				} else if (provider === "exa") {
					results = await this.searchExa(args.query, snapshotLimit);
				}
			}

			const page = this.continuations.page({
				toolName: "search_web",
				fingerprint: requestFingerprint("search_web", {
					query: args.query,
					provider,
				}),
				items: results,
				limit,
				cursor: args.cursor,
			});
			if ("error" in page) return page;
			if (page.items.length === 0) {
				return { error: "No search results found." };
			}

			// Format as markdown for the LLM
			const formatted = page.items
				.map(
					(r, i) =>
						`${i + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.snippet}`,
				)
				.join("\n\n");

			return {
				success: true,
				content: formatted,
				query: args.query,
				count: page.items.length,
				total_count: page.total,
				has_more: page.hasMore,
				next_cursor: page.nextCursor,
			};
		} catch (e: any) {
			return {
				error: `Web search failed (${provider}): ${e.message || String(e)}`,
			};
		}
	}

	async readPdf(args: {
		source: string;
		max_pages?: number;
		start_page?: number;
	}): Promise<ToolResult> {
		const { extractPdfFromUrl, extractPdfFromBuffer } =
			await import("../../utils/PdfExtractor");

		const maxPages = Math.min(Math.max(args.max_pages ?? 50, 1), 50);
		const startPage = Math.max(Math.floor(args.start_page ?? 1), 1);
		const source = args.source;

		try {
			let result;

			if (source.startsWith("http://") || source.startsWith("https://")) {
				// Online PDF
				result = await extractPdfFromUrl(source, {
					maxPages,
					startPage,
					method:
						(this.settings as any)?.pdfExtractionMethod || "auto",
					serverUrl: (this.settings as any)?.pdfExtractionServerUrl,
				});
			} else {
				// Vault file path
				const file = this.app.vault.getAbstractFileByPath(source);
				if (!file || !(file instanceof TFile)) {
					return { error: `PDF not found in vault: ${source}` };
				}
				const buffer = await this.app.vault.readBinary(file);
				result = await extractPdfFromBuffer(buffer, {
					maxPages,
					startPage,
				});
			}

			if (!result.success) {
				return { error: result.error || "PDF extraction failed" };
			}

			// Format as markdown for the LLM
			const meta = result.metadata;
			let header = `## PDF: ${source}\n\n`;
			if (meta?.title) header += `**Title:** ${meta.title}\n`;
			if (meta?.author) header += `**Author:** ${meta.author}\n`;
			const extractedPages = meta?.extractedPages ?? 0;
			const pageEnd =
				extractedPages > 0
					? startPage + extractedPages - 1
					: startPage - 1;
			const totalPages = meta?.totalPages ?? 0;
			if (totalPages) {
				header += `**Pages:** ${startPage}–${pageEnd} of ${totalPages} extracted\n`;
			}
			header += `**Word count:** ~${result.totalWordCount ?? "?"}\n\n---\n\n`;

			const body = result.fullText || "(No text extracted)";

			return {
				content: header + body,
				page_start: startPage,
				page_end: pageEnd,
				total_pages: totalPages || undefined,
				has_more: totalPages > 0 && pageEnd < totalPages,
				next_page:
					totalPages > 0 && pageEnd < totalPages
						? pageEnd + 1
						: undefined,
			};
		} catch (e: any) {
			return {
				error: `PDF read failed: ${e.message || String(e)}`,
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

		const res = await requestUrl({
			url: url.toString(),
			method: "GET",
			headers: {
				"X-Subscription-Token": apiKey,
				Accept: "application/json",
			},
		});

		if (res.status < 200 || res.status >= 300) {
			const text = res.text || "";
			throw new Error(`Brave API ${res.status}: ${text}`);
		}

		const data = JSON.parse(res.text);
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

		const res = await requestUrl({
			url: url.toString(),
			method: "GET",
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0",
			},
		});

		if (res.status < 200 || res.status >= 300) {
			throw new Error(`DuckDuckGo ${res.status}`);
		}

		const html = res.text;
		const results: Array<{ title: string; url: string; snippet: string }> =
			[];

		// Parse using DOMParser instead of regex to avoid ReDoS
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, "text/html");

		// Find all result containers
		const resultDivs = doc.querySelectorAll(
			".result, .result__a, .result__snippet",
		);

		// Collect links and snippets
		const linkElements = doc.querySelectorAll("a.result__a");
		const snippetElements = doc.querySelectorAll("a.result__snippet");

		for (
			let i = 0;
			i < linkElements.length && results.length < limit;
			i++
		) {
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

		const res = await requestUrl({ url: url.toString(), method: "GET" });
		if (res.status < 200 || res.status >= 300) {
			throw new Error(`SearXNG ${res.status}`);
		}

		const data = JSON.parse(res.text);
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

		const res = await requestUrl({
			url: "https://api.tavily.com/search",
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

		if (res.status < 200 || res.status >= 300) {
			const text = res.text || "";
			throw new Error(`Tavily API ${res.status}: ${text}`);
		}

		const data = JSON.parse(res.text);
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

		const res = await requestUrl({
			url: "https://api.exa.ai/search",
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

		if (res.status < 200 || res.status >= 300) {
			const text = res.text || "";
			throw new Error(`Exa API ${res.status}: ${text}`);
		}

		const data = JSON.parse(res.text);
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

	async createMemory(args: {
		category: string;
		content: string;
		tags?: string[];
	}): Promise<ToolResult> {
		if (!this.personaLoader) {
			return {
				error: "Memory creation is disabled. Enable the intelligence layer in Settings → AI Intelligence Layer.",
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

	async updateMemory(args: {
		id: string;
		category?: string;
		content?: string;
		tags?: string[];
	}): Promise<ToolResult> {
		if (!this.personaLoader) {
			return {
				error: "Memory update is disabled. Enable the intelligence layer in Settings.",
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

	async deleteMemory(args: { id: string }): Promise<ToolResult> {
		if (!this.personaLoader) {
			return {
				error: "Memory deletion is disabled. Enable the intelligence layer in Settings.",
			};
		}

		try {
			const deleted = await this.personaLoader.memoryStore.delete(
				args.id,
			);
			if (!deleted) {
				return { error: `Memory not found: ${args.id}` };
			}
			return { success: true, id: args.id };
		} catch (e: any) {
			return { error: `Failed to delete memory: ${e.message}` };
		}
	}

	async listMemories(args: {
		category?: string;
		tag?: string;
		limit?: number;
		cursor?: string;
	}): Promise<ToolResult> {
		if (!this.personaLoader) {
			return {
				error: "Memory listing is disabled. Enable the intelligence layer in Settings.",
			};
		}

		try {
			const entries = await this.personaLoader.memoryStore.list({
				category: args.category as any,
				tag: args.tag,
			});
			const page = this.continuations.page({
				toolName: "list_memories",
				fingerprint: requestFingerprint("list_memories", {
					category: args.category ?? null,
					tag: args.tag ?? null,
				}),
				items: [...entries].reverse(),
				limit: Math.min(args.limit ?? 20, 50),
				cursor: args.cursor,
			});
			if ("error" in page) return page;
			if (page.items.length === 0) {
				return { success: true, content: "No memories found." };
			}
			const lines = page.items.map(
				(e) =>
					`- [${e.timestamp}] **${e.category}**: ${e.content}${e.tags.length ? " " + e.tags.map((t) => `#${t}`).join(" ") : ""} [id:${e.id}]`,
			);
			return {
				success: true,
				content: lines.join("\n"),
				count: page.items.length,
				total_count: page.total,
				has_more: page.hasMore,
				next_cursor: page.nextCursor,
			};
		} catch (e: any) {
			return { error: `Failed to list memories: ${e.message}` };
		}
	}

	async searchMemories(args: {
		query: string;
		limit?: number;
		cursor?: string;
	}): Promise<ToolResult> {
		if (!this.personaLoader) {
			return {
				error: "Memory search is disabled. Enable the intelligence layer in Settings.",
			};
		}

		try {
			const entries = args.cursor
				? []
				: await this.personaLoader.memoryStore.search(args.query);
			const page = this.continuations.page({
				toolName: "search_memories",
				fingerprint: requestFingerprint("search_memories", {
					query: args.query,
				}),
				items: entries,
				limit: Math.min(args.limit ?? 10, 50),
				cursor: args.cursor,
			});
			if ("error" in page) return page;

			if (page.items.length === 0) {
				return {
					success: true,
					content: "No memories match your query.",
				};
			}

			const lines = page.items.map(
				(e) =>
					`- [${e.timestamp}] **${e.category}**: ${e.content}${e.tags.length ? " " + e.tags.map((t) => `#${t}`).join(" ") : ""} [id:${e.id}]`,
			);
			return {
				success: true,
				content: lines.join("\n"),
				count: page.items.length,
				total_count: page.total,
				has_more: page.hasMore,
				next_cursor: page.nextCursor,
			};
		} catch (e: any) {
			return { error: `Failed to search memories: ${e.message}` };
		}
	}

	async readMemoryAudit(args: {
		limit?: number;
		cursor?: string;
	}): Promise<ToolResult> {
		if (!this.personaLoader) {
			return {
				error: "Memory audit is disabled. Enable the intelligence layer in Settings.",
			};
		}

		if (!this.settings?.intelligence.enableMemoryAuditTool) {
			return {
				error: "Memory audit tool is disabled. Enable it in Settings → AI Intelligence Layer.",
			};
		}

		try {
			const entries = args.cursor
				? []
				: await this.personaLoader.memoryStore.readAudit();
			const page = this.continuations.page({
				toolName: "read_memory_audit",
				fingerprint: requestFingerprint("read_memory_audit", {}),
				items: entries,
				limit: Math.min(args.limit ?? 20, 50),
				cursor: args.cursor,
			});
			if ("error" in page) return page;
			if (page.items.length === 0) {
				return { success: true, content: "No audit entries found." };
			}

			const lines = page.items.map((e) => {
				const time = new Date(e.timestamp).toLocaleString();
				const icon =
					e.operation === "create"
						? "+"
						: e.operation === "update"
							? "✎"
							: "−";
				const preview = e.content
					? `"${e.content.slice(0, 60)}${e.content.length > 60 ? "…" : ""}"`
					: "";
				return `${time} ${icon} ${e.operation} [${e.entryId}] ${preview}`;
			});
			return {
				success: true,
				content: lines.join("\n"),
				count: page.items.length,
				total_count: page.total,
				has_more: page.hasMore,
				next_cursor: page.nextCursor,
			};
		} catch (e: any) {
			return { error: `Failed to read memory audit: ${e.message}` };
		}
	}

	async searchPastSessions(args: {
		query: string;
		limit?: number;
		cursor?: string;
	}): Promise<ToolResult> {
		if (!this.searchIndex) {
			return {
				error: "Session search is not available. The search index has not been initialized.",
			};
		}

		try {
			const activeSessionId = this.getActiveSessionId?.();
			const results = args.cursor
				? []
				: (await this.searchIndex.search(args.query)).filter(
						(result) => result.sessionId !== activeSessionId,
					);
			const page = this.continuations.page({
				toolName: "search_past_sessions",
				fingerprint: requestFingerprint("search_past_sessions", {
					query: args.query,
					active_session_id: activeSessionId ?? null,
				}),
				items: results,
				limit: Math.min(args.limit ?? 5, 20),
				cursor: args.cursor,
			});
			if ("error" in page) return page;

			if (page.items.length === 0) {
				return {
					success: true,
					content: "No past sessions found matching your query.",
				};
			}

			const formatted = page.items
				.map((r, i) => {
					const date = new Date(r.timestamp).toLocaleDateString();
					return `${i + 1}. **Session ${r.sessionId}** (${date}): ${r.snippet.slice(0, 150)}...`;
				})
				.join("\n");

			return {
				success: true,
				sessionResults: page.items,
				count: page.items.length,
				total_count: page.total,
				has_more: page.hasMore,
				next_cursor: page.nextCursor,
				content: `Found ${page.items.length} result(s):\n\n${formatted}`,
			};
		} catch (e: any) {
			return { error: `Search failed: ${e.message || String(e)}` };
		}
	}

	/* ───────────────────────────────────────────────────────────
	 * Self-Settings Tools (T61)
	 * ─────────────────────────────────────────────────────────── */

	async readSettings(): Promise<ToolResult> {
		if (!this.settings) {
			return { error: "Settings are not available." };
		}
		return {
			success: true,
			settings: sanitizeSettings(this.settings),
		};
	}

	async updateSetting(args: {
		key: string;
		value: unknown;
	}): Promise<ToolResult> {
		if (!this.settings) {
			return { error: "Settings are not available." };
		}

		// Server-side developerMode gate (T61 security requirement)
		if (!this.settings.developerMode) {
			return {
				error: "Developer mode is disabled. Enable it in Settings → Advanced to allow the AI to modify settings.",
			};
		}

		const validation = validateSettingUpdate(args.key, args.value);
		if (!validation.ok) {
			return { error: validation.error };
		}

		// Apply the update
		(this.settings as unknown as Record<string, unknown>)[validation.key] =
			validation.value;

		// Persist
		if (this.saveSettings) {
			try {
				await this.saveSettings();
			} catch (e: any) {
				return {
					error: `Failed to save settings: ${e.message || String(e)}`,
				};
			}
		}

		// Audit log
		await this._auditSettingChange(validation.key, validation.value);

		return {
			success: true,
			key: validation.key,
			value: validation.value,
		};
	}

	private async _auditSettingChange(
		key: string,
		value: unknown,
	): Promise<void> {
		const adapter = this.app.vault.adapter;
		const auditPath = `${this.app.vault.configDir}/plugins/obsidian-ai/settings-audit.jsonl`;
		const entry = {
			timestamp: new Date().toISOString(),
			operation: "update_setting",
			key,
			value:
				typeof value === "boolean" || typeof value === "number"
					? value
					: String(value),
		};
		const line = JSON.stringify(entry) + "\n";
		try {
			if (await adapter.exists(auditPath)) {
				const existing = await adapter.read(auditPath);
				await adapter.write(auditPath, existing + line);
			} else {
				await adapter.write(auditPath, line);
			}
		} catch {
			// Silently fail audit logging — it's non-critical
		}
	}
}
