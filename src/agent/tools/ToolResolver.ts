import { App, TFile, normalizePath } from "obsidian";
import type { ToolResult } from "../types";

const FORBIDDEN_PATH_PATTERNS = [
	/^\.obsidian\b/,
	/^\.trash\b/,
	/^\.git\b/,
	/^\.+\//,
	/\.\.\//,
];

/** Keep tool paths inside the user's vault. */
export function isPathAllowed(path: string): boolean {
	const normalized = normalizePath(path);
	return !FORBIDDEN_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function denyPath(path: string): ToolResult {
	return {
		error: `Access denied: "${path}" is outside the allowed vault area.`,
	};
}

/** Shared note, folder, and file lookup used by the tool handlers. */
export class ToolResolver {
	constructor(private readonly app: App) {}

	sortFiles(files: TFile[], sortBy: string): TFile[] {
		return [...files].sort((a, b) => {
			const primary = (() => {
				switch (sortBy) {
					case "modified":
						return b.stat.mtime - a.stat.mtime;
					case "created":
						return b.stat.ctime - a.stat.ctime;
					case "name":
					default:
						return a.basename.localeCompare(b.basename);
				}
			})();
			return primary || a.path.localeCompare(b.path);
		});
	}

	normalizeFolderPath(folder: string): string {
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

	resolveFolderPath(folder: string): {
		path: string | null;
		suggestions: string[];
	} {
		const requested = this.normalizeFolderPath(folder);
		if (!requested) return { path: null, suggestions: [] };

		const allFolders = new Set<string>();
		for (const entry of this.app.vault.getAllLoadedFiles()) {
			const candidate = entry as any;
			if (Array.isArray(candidate.children)) {
				this.addFolderAndAncestors(allFolders, candidate.path);
			} else if (candidate.parent?.path) {
				this.addFolderAndAncestors(allFolders, candidate.parent.path);
			}
		}

		const requestedLower = requested.toLowerCase();
		for (const candidate of allFolders) {
			if (candidate.toLowerCase() === requestedLower) {
				return { path: candidate, suggestions: [] };
			}
		}

		const aliasMatches = Array.from(allFolders).filter(
			(candidate) =>
				candidate.split("/").at(-1)?.toLowerCase() === requestedLower,
		);
		if (aliasMatches.length === 1) {
			return { path: aliasMatches[0], suggestions: [] };
		}

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

	/** Resolve a note by exact path, markdown path, or wiki-link name. */
	resolveNote(path: string): TFile | null {
		if (!isPathAllowed(path)) return null;

		let file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) return file;

		if (!path.endsWith(".md")) {
			file = this.app.vault.getAbstractFileByPath(path + ".md");
			if (file instanceof TFile) return file;
		}

		const resolved = this.app.metadataCache.getFirstLinkpathDest(path, "");
		if (resolved instanceof TFile) {
			const ambiguous = this.findAmbiguousMatches(path);
			if (ambiguous.length > 1) {
				(resolved as any).__ambiguous = ambiguous;
			}
			return resolved;
		}

		return null;
	}

	private findAmbiguousMatches(path: string): string[] {
		const basename = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
		return this.app.vault
			.getFiles()
			.filter((file) => file.basename === basename)
			.map((file) => file.path);
	}
}
