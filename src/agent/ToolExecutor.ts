import { App, Notice, TFile, normalizePath, requestUrl } from "obsidian";
import type { ToolCall, ToolResult } from "./types";
import type { ObsidianAISettings, WebSearchProvider } from "../settings";
import type { PersonaLoader } from "../intelligence/PersonaLoader";
import { SearchIndex } from "../search/index";
import type { ProviderRegistry } from "../integrations/ProviderRegistry";
import {
	createBuiltInToolDefinitionsWithExecutors,
	resolveToolRegistry,
	validateToolArguments,
} from "./toolRegistry";
import type { ResolvedToolRegistry, ToolDefinition } from "./toolRegistry";

/* ── Security: forbidden path patterns ── */
const FORBIDDEN_PATH_PATTERNS = [
	/^\.obsidian\b/, // plugin config / data
	/^\.trash\b/, // Obsidian trash
	/^\.git\b/, // git internals
	/^\.+\//, // leading ../ or ./
	/\.\.\//, // any ../ anywhere
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
	private builtInRegistry: ResolvedToolRegistry;

	constructor(
		private app: App,
		private settings?: ObsidianAISettings,
		private personaLoader?: PersonaLoader,
		private searchIndex?: SearchIndex,
		private getActiveSessionId?: () => string | null,
		private integrationRegistry?: ProviderRegistry,
	) {
		// Build the same descriptor registry used to expose tools to the model.
		// Built-in and provider execution both pass through this map.
		const builtInDefinitions = createBuiltInToolDefinitionsWithExecutors({
			read_note: (call) => this.readNote(call.args as { path: string }),
			edit_note: (call) =>
				this.editNote(call.args as { path: string; content: string }),
			append_to_note: (call) =>
				this.appendToNote(
					call.args as { path: string; content: string },
				),
			create_note: (call) =>
				this.createNote(call.args as { path: string; content: string }),
			create_notes: (call) =>
				this.createNotes(
					call.args as {
						notes: Array<{ path: string; content: string }>;
					},
				),
			patch_note: (call) =>
				this.patchNote(
					call.args as {
						path: string;
						search: string;
						replace: string;
						replace_all?: boolean;
					},
				),
			edit_section: (call) =>
				this.editSection(
					call.args as {
						path: string;
						section_heading: string;
						new_content: string;
					},
				),
			search_notes: (call) =>
				this.searchNotes(
					call.args as {
						query: string;
						sort_by?: string;
						limit?: number;
						folder?: string;
					},
				),
			search_note_content: (call) =>
				this.searchNoteContent(
					call.args as {
						query: string;
						folder?: string;
						sort_by?: string;
						limit?: number;
						context_lines?: number;
						match_mode?: string;
						include_filename?: boolean;
						include_snippets?: boolean;
					},
				),
			list_notes: (call) =>
				this.listNotes(
					call.args as {
						folder?: string;
						sort_by?: string;
						limit?: number;
						include_subfolders?: boolean;
						depth?: number;
					},
				),
			count_notes: (call) =>
				this.countNotes(call.args as { folder?: string }),
			get_note_metadata: (call) =>
				this.getNoteMetadata(call.args as { path: string }),
			list_folders: (call) =>
				this.listFolders(call.args as { path?: string }),
			check_paths: (call) =>
				this.checkPaths(call.args as { paths: string[] }),
			search_web: (call) =>
				this.searchWeb(call.args as { query: string; limit?: number }),
			read_pdf: (call) =>
				this.readPdf(
					call.args as { source: string; max_pages?: number },
				),
			create_memory: (call) =>
				this.createMemory(
					call.args as {
						category: string;
						content: string;
						tags?: string[];
					},
				),
			update_memory: (call) =>
				this.updateMemory(
					call.args as {
						id: string;
						category?: string;
						content?: string;
						tags?: string[];
					},
				),
			delete_memory: (call) =>
				this.deleteMemory(call.args as { id: string }),
			list_memories: (call) =>
				this.listMemories(
					call.args as {
						category?: string;
						tag?: string;
						limit?: number;
					},
				),
			search_memories: (call) =>
				this.searchMemories(
					call.args as { query: string; limit?: number },
				),
			read_memory_audit: (call) =>
				this.readMemoryAudit(call.args as { limit?: number }),
			search_past_sessions: (call) =>
				this.searchPastSessions(
					call.args as { query: string; limit?: number },
				),
			create_folder: (call) =>
				this.createFolder(call.args as { path: string }),
			move_note: (call) =>
				this.moveNote(call.args as { path: string; new_path: string }),
			delete_note: (call) =>
				this.deleteNote(call.args as { path: string }),
		});
		const providerDefinitions: ToolDefinition[] =
			this.integrationRegistry?.getToolDefinitions() ?? [];
		this.builtInRegistry = resolveToolRegistry(
			[...builtInDefinitions, ...providerDefinitions],
			{
				enableMemoryAuditTool:
					this.settings?.intelligence?.enableMemoryAuditTool,
			},
		);
	}

	getModelTools(): Record<string, Record<string, unknown>> {
		return this.builtInRegistry.tools;
	}

	async execute(call: ToolCall, signal?: AbortSignal): Promise<ToolResult> {
		try {
			const registryDef = this.builtInRegistry.byId.get(call.toolName);
			if (!registryDef?.execute) {
				return {
					error: `Unknown or unavailable tool: ${call.toolName}`,
				};
			}
			if (signal?.aborted) {
				return { error: "Tool call cancelled before execution." };
			}

			const validation = await validateToolArguments(
				registryDef,
				call.args,
			);
			if (!validation.ok) {
				return {
					error: `Invalid arguments for ${call.toolName}: ${validation.error}`,
				};
			}

			const result = await registryDef.execute(
				{ ...call, args: validation.args },
				{
					enableMemoryAuditTool:
						this.settings?.intelligence?.enableMemoryAuditTool,
				},
			);
			return result;
		} catch (e: any) {
			return { error: e.message || String(e) };
		}
	}

	private async searchNotes(args: {
		query: string;
		sort_by?: string;
		limit?: number;
		folder?: string;
	}): Promise<ToolResult> {
		const query = args.query?.toLowerCase() ?? "";
		const sortBy = args.sort_by ?? "name";
		const limit = Math.min(args.limit ?? 20, 50);
		const folder = args.folder;

		// Validate and resolve folder
		let folderFilter = folder;
		if (folder) {
			const resolved = this.resolveFolderPath(folder);
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
		files = this.sortFiles(files, sortBy);

		// Limit
		files = files.slice(0, limit);

		const matches = await Promise.all(
			files.map(async (f) => ({
				path: f.path,
				basename: f.basename,
				modified: f.stat.mtime,
				created: f.stat.ctime,
				size: f.stat.size,
			})),
		);
		const compactMatches =
			matches.length > 20
				? matches.map(({ path, basename, modified }) => ({
						path,
						basename,
						modified,
					}))
				: matches;

		return {
			success: true,
			matches: compactMatches,
			query: args.query ?? "",
			count: compactMatches.length,
		};
	}

	private async searchNoteContent(args: {
		query: string;
		folder?: string;
		sort_by?: string;
		limit?: number;
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
			const resolved = this.resolveFolderPath(folder);
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
		});

		// Limit
		const limited = results.slice(0, limit);
		const totalMatches = results.length;
		const truncated = totalMatches > limit;

		if (limited.length === 0) {
			return {
				success: true,
				content: `No notes found matching "${args.query}"${folderFilter ? ` in folder "${folderFilter}"` : ""}.`,
				count: 0,
				total_matches: 0,
				truncated: false,
				paths: [],
			};
		}

		// Format results
		if (!includeSnippets) {
			// Counts-only mode: just list paths
			const paths = limited.map((r) => r.file.path);
			return {
				success: true,
				paths,
				count: limited.length,
				total_matches: totalMatches,
				truncated,
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
				return `${i + 1}. **${r.file.basename}** — ${r.file.path} (${r.matchCount} matches)${excerptText}`;
			})
			.join("\n\n");

		return {
			success: true,
			content: `Found ${limited.length} note(s) matching "${args.query}"${folderFilter ? ` in folder "${folderFilter}"` : ""}:\n\n${formatted}`,
			count: limited.length,
			total_matches: totalMatches,
			truncated,
			paths: limited.map((r) => r.file.path),
		};
	}

	private async listNotes(args: {
		folder?: string;
		sort_by?: string;
		limit?: number;
		include_subfolders?: boolean;
		depth?: number;
	}): Promise<ToolResult> {
		const sortBy = args.sort_by ?? "name";
		const limit = Math.min(args.limit ?? 30, 100);
		const folder = args.folder;
		const includeSubfolders = args.include_subfolders ?? true;
		const depth = Math.min(args.depth ?? 1, 3);

		// Validate and resolve folder
		let folderFilter = folder;
		if (folder) {
			const resolved = this.resolveFolderPath(folder);
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

		files = this.sortFiles(files, sortBy);
		files = files.slice(0, limit);

		const notes = await Promise.all(
			files.map(async (f) => ({
				path: f.path,
				basename: f.basename,
				modified: f.stat.mtime,
				created: f.stat.ctime,
				size: f.stat.size,
			})),
		);

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
			notes,
			folder: folderFilter ?? "(all vault)",
			count: notes.length,
			subfolders,
			subfolderCount: subfolders?.length,
		};
	}

	private async countNotes(args: { folder?: string }): Promise<ToolResult> {
		const folder = args.folder;

		// Validate and resolve folder
		let folderFilter = folder;
		if (folder) {
			const resolved = this.resolveFolderPath(folder);
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

	private async getNoteMetadata(args: { path: string }): Promise<ToolResult> {
		const file = this.resolveNote(args.path);
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
	 * Resolve a folder path with case-insensitive fallback.
	 * Returns the canonical folder path if found, or null with suggestions.
	 */
	private normalizeFolderPath(folder: string): string {
		return folder
			.replace(/\\+/g, "/")
			.replace(/\/+/g, "/")
			.replace(/^\/+|\/+$/g, "");
	}

	private addFolderAndAncestors(
		allFolders: Set<string>,
		folderPath: string,
	): void {
		const normalized = this.normalizeFolderPath(folderPath);
		if (!normalized) return;

		const parts = normalized.split("/");
		let accumulated = "";
		for (const part of parts) {
			accumulated = accumulated ? `${accumulated}/${part}` : part;
			allFolders.add(accumulated);
		}
	}

	private resolveFolderPath(folder: string): {
		path: string | null;
		suggestions: string[];
	} {
		const requested = this.normalizeFolderPath(folder);
		if (!requested) return { path: null, suggestions: [] };

		const allFolders = new Set<string>();
		for (const entry of this.app.vault.getAllLoadedFiles()) {
			const candidate = entry as any;
			// TFolder entries expose children; TFile entries expose their parent.
			if (Array.isArray(candidate.children)) {
				this.addFolderAndAncestors(allFolders, candidate.path);
			} else if (candidate.parent?.path) {
				this.addFolderAndAncestors(allFolders, candidate.parent.path);
			}
		}

		const requestedLower = requested.toLowerCase();

		// 1. Exact and case-insensitive canonical paths.
		for (const candidate of allFolders) {
			if (candidate.toLowerCase() === requestedLower) {
				return { path: candidate, suggestions: [] };
			}
		}

		// 2. Unambiguous short folder names, e.g. "vocabulary".
		const aliasMatches = Array.from(allFolders).filter(
			(candidate) =>
				candidate.split("/").at(-1)?.toLowerCase() === requestedLower,
		);
		if (aliasMatches.length === 1) {
			return { path: aliasMatches[0], suggestions: [] };
		}

		// 3. Suggestions for missing or ambiguous paths.
		const suggestionSet = new Set<string>(aliasMatches);
		for (const candidate of allFolders) {
			const candidateLower = candidate.toLowerCase();
			if (
				candidateLower.includes(requestedLower) ||
				requestedLower.includes(candidateLower)
			) {
				suggestionSet.add(candidate);
			}
		}

		return {
			path: null,
			suggestions: Array.from(suggestionSet).sort().slice(0, 5),
		};
	}

	/**
	 * Check whether multiple note paths exist in the vault.
	 * Returns existence status, canonical path, and metadata for each.
	 */
	private async checkPaths(args: { paths: string[] }): Promise<ToolResult> {
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

				const file = this.resolveNote(path);
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
				warning:
					`⚠️ Ambiguous name: ${ambiguous.length} notes share the basename "${file.basename}". ` +
					`Reading "${file.path}". Other matches: ${ambiguous.filter((p) => p !== file.path).join(", ")}. ` +
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
			if (!note.path || !isPathAllowed(note.path))
				return denyPath(note.path);
			if (paths.has(note.path))
				return { error: `Duplicate note path in batch: ${note.path}` };
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

	private async moveNote(args: {
		path: string;
		new_path: string;
	}): Promise<ToolResult> {
		if (!isPathAllowed(args.path) || !isPathAllowed(args.new_path)) {
			return denyPath(
				!isPathAllowed(args.path) ? args.path : args.new_path,
			);
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

	private async deleteNote(args: { path: string }): Promise<ToolResult> {
		if (!isPathAllowed(args.path)) return denyPath(args.path);
		const file = this.resolveNote(args.path);
		if (!file) return { error: `Note not found: ${args.path}` };

		await this.app.vault.trash(file, false); // system trash
		new Notice(`✓ Deleted ${file.basename}`);
		return { success: true, path: file.path };
	}

	private async listFolders(args: { path?: string }): Promise<ToolResult> {
		const parentPath =
			args.path?.replace(/\\+/g, "/").replace(/\/$/, "") ?? "";

		// Validate and resolve parent folder
		let resolvedParent = parentPath;
		if (parentPath) {
			const resolved = this.resolveFolderPath(parentPath);
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

	private async searchWeb(args: {
		query: string;
		limit?: number;
	}): Promise<ToolResult> {
		const provider = this.settings?.webSearchProvider ?? "duckduckgo";
		const limit = Math.min(args.limit ?? 5, 20);

		try {
			let results: Array<{
				title: string;
				url: string;
				snippet: string;
			}> = [];

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

	private async readPdf(args: {
		source: string;
		max_pages?: number;
	}): Promise<ToolResult> {
		const { extractPdfFromUrl, extractPdfFromBuffer } =
			await import("../utils/PdfExtractor");

		const maxPages = args.max_pages ?? 50;
		const source = args.source;

		try {
			let result;

			if (source.startsWith("http://") || source.startsWith("https://")) {
				// Online PDF
				result = await extractPdfFromUrl(source, {
					maxPages,
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
				result = await extractPdfFromBuffer(buffer, { maxPages });
			}

			if (!result.success) {
				return { error: result.error || "PDF extraction failed" };
			}

			// Format as markdown for the LLM
			const meta = result.metadata;
			let header = `## PDF: ${source}\n\n`;
			if (meta?.title) header += `**Title:** ${meta.title}\n`;
			if (meta?.author) header += `**Author:** ${meta.author}\n`;
			if (meta?.totalPages) {
				header += `**Pages:** ${meta.extractedPages ?? "?"} of ${meta.totalPages} extracted\n`;
			}
			header += `**Word count:** ~${result.totalWordCount ?? "?"}\n\n---\n\n`;

			const body = result.fullText || "(No text extracted)";

			return {
				content: header + body,
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

	private async createMemory(args: {
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

	private async updateMemory(args: {
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

	private async deleteMemory(args: { id: string }): Promise<ToolResult> {
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

	private async listMemories(args: {
		category?: string;
		tag?: string;
		limit?: number;
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
				error: "Memory search is disabled. Enable the intelligence layer in Settings.",
			};
		}

		try {
			const entries = await this.personaLoader.memoryStore.search(
				args.query,
			);
			const limit = Math.min(args.limit ?? 10, 50);
			const limited = entries.slice(0, limit);

			if (limited.length === 0) {
				return {
					success: true,
					content: "No memories match your query.",
				};
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
				error: "Memory audit is disabled. Enable the intelligence layer in Settings.",
			};
		}

		if (!this.settings?.intelligence.enableMemoryAuditTool) {
			return {
				error: "Memory audit tool is disabled. Enable it in Settings → AI Intelligence Layer.",
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
				error: "Session search is not available. The search index has not been initialized.",
			};
		}

		try {
			const activeSessionId = this.getActiveSessionId?.();
			const results = (await this.searchIndex.search(args.query)).filter(
				(result) => result.sessionId !== activeSessionId,
			);
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
