import { Notice } from "obsidian";
import type { ToolResult } from "../../types";
import { denyPath, isPathAllowed } from "../ToolResolver";
import {
	ToolHandlerBase,
	type ToolHandlerContext,
} from "../ToolHandlerContext";

/** Create, move, delete, and list vault folders and notes. */
export class VaultHandlers extends ToolHandlerBase {
	constructor(context: ToolHandlerContext) {
		super(context);
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
}
