import { TFile } from "obsidian";
import type { ToolResult } from "../../types";
import {
	ToolHandlerBase,
	type ToolHandlerContext,
} from "../ToolHandlerContext";
import { requestFingerprint } from "../../pagination";
import { isPathAllowed } from "../ToolResolver";
import { mapWithConcurrency } from "../../boundedConcurrency";

const MAX_READ_CONCURRENCY = 8;

/** Search, list, count, and inspect notes in the vault. */
export class DiscoveryHandlers extends ToolHandlerBase {
	constructor(context: ToolHandlerContext) {
		super(context);
	}

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

		const matches = await mapWithConcurrency(
			files,
			MAX_READ_CONCURRENCY,
			async (f) => ({
				path: f.path,
				basename: f.basename,
				modified: f.stat.mtime,
				created: f.stat.ctime,
				size: f.stat.size,
			}),
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

		const notes = await mapWithConcurrency(
			files,
			MAX_READ_CONCURRENCY,
			async (f) => ({
				path: f.path,
				basename: f.basename,
				modified: f.stat.mtime,
				created: f.stat.ctime,
				size: f.stat.size,
			}),
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

		const results = await mapWithConcurrency(
			args.paths,
			MAX_READ_CONCURRENCY,
			async (path) => {
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
			},
		);

		const found = results.filter((r) => r.exists).length;
		return {
			success: true,
			results,
			summary: `${found}/${results.length} paths exist`,
		};
	}
}
