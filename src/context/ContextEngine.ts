import { App, TFile } from "obsidian";
import { ContextItem } from "../types";
import { expandEmbeds } from "./embedExpander";
import { estimateTokens, TOKEN_ESTIMATE_RATIO } from "./tokenEstimator";

interface ResolvedNote {
	name: string;
	path: string;
	content: string;
	isActiveNote?: boolean;
}

export interface ContextResolutionResult {
	contextString: string;
	wasTruncated: boolean;
	stats: {
		notesRead: number;
		chars: number;
		estimatedTokens: number;
	};
}

const MAX_FILES_PER_FOLDER_TAG = 50;
function normalizeTag(tag: string): string {
	return tag.toLowerCase().replace(/^#/, "");
}

function fileHasTag(app: App, file: TFile, tag: string): boolean {
	const normalized = normalizeTag(tag);
	const cache = app.metadataCache.getFileCache(file);
	if (!cache) return false;

	// Inline tags
	if (
		cache.tags?.some(
			(t) => t.tag.toLowerCase().replace(/^#/, "") === normalized,
		)
	) {
		return true;
	}

	// Frontmatter tags
	const fmTags = cache.frontmatter?.tags;
	if (Array.isArray(fmTags)) {
		return fmTags.some((t) => String(t).toLowerCase() === normalized);
	}
	if (typeof fmTags === "string") {
		return fmTags.toLowerCase() === normalized;
	}

	return false;
}

function getFilesForFolder(app: App, folderPath: string): TFile[] {
	const prefix = folderPath === "" ? "" : folderPath + "/";
	return app.vault
		.getMarkdownFiles()
		.filter((f) => f.path.startsWith(prefix))
		.sort((a, b) => b.stat.mtime - a.stat.mtime)
		.slice(0, MAX_FILES_PER_FOLDER_TAG);
}

function getFilesForTag(app: App, tag: string): TFile[] {
	return app.vault
		.getMarkdownFiles()
		.filter((f) => fileHasTag(app, f, tag))
		.sort((a, b) => b.stat.mtime - a.stat.mtime)
		.slice(0, MAX_FILES_PER_FOLDER_TAG);
}

async function resolveSingleItem(
	item: ContextItem,
	app: App,
): Promise<ResolvedNote[]> {
	switch (item.type) {
		case "note": {
			const file = app.vault.getAbstractFileByPath(item.path);
			if (!(file instanceof TFile)) return [];
			const raw = await app.vault.read(file);
			const content = await expandEmbeds(raw, app);
			return [{ name: item.name, path: file.path, content }];
		}
		case "folder": {
			const files = getFilesForFolder(app, item.path);
			const prefix = item.path === "" ? "" : item.path + "/";
			const totalInFolder = app.vault
				.getMarkdownFiles()
				.filter((f) => f.path.startsWith(prefix)).length;
			// Show files with creation date (ctime) for chronological context
			const fileList = files
				.map((f) => {
					const created = new Date(f.stat.ctime).toLocaleDateString();
					const modified = new Date(
						f.stat.mtime,
					).toLocaleDateString();
					return `- ${f.basename} (created: ${created}, modified: ${modified})`;
				})
				.join("\n");
			const content =
				`Folder: ${item.name || item.path || "Vault root"}\n` +
				`Showing ${files.length} most recently MODIFIED files (of ${totalInFolder} total):\n` +
				`${fileList}\n\n` +
				`IMPORTANT: This list is sorted by modification time (most recent first), NOT creation time. ` +
				`The oldest notes by creation date may not appear here.\n\n` +
				`To find the OLDEST notes in this folder:\n` +
				`- list_notes(folder="${item.path}", sort_by="created", limit=100) — then check the LAST items (sorted newest first)\n\n` +
				`You can also:\n` +
				`- Use read_note(path) to read any file\n` +
				`- Use search_notes(query, folder="${item.path}", limit=100) to find specific files`;
			return [
				{
					name: item.name || item.path || "Folder",
					path: item.path,
					content,
				},
			];
		}
		case "tag": {
			const files = getFilesForTag(app, item.tag);
			const fileList = files.map((f) => `- ${f.basename}`).join("\n");
			const content =
				`Tag: #${item.tag}\n` +
				`Showing ${files.length} most recent files with this tag:\n` +
				`${fileList}\n\n` +
				`You can:\n` +
				`- Use read_note(path) to read any file\n` +
				`- Use search_notes(query, limit=100) to find more files\n` +
				`- Use list_notes(sort_by="modified", limit=100) to browse all notes`;
			return [
				{ name: `Tag: #${item.tag}`, path: `#${item.tag}`, content },
			];
		}
		case "active-note": {
			const file = app.workspace.getActiveFile();
			if (!(file instanceof TFile)) return [];
			const raw = await app.vault.read(file);
			const content = await expandEmbeds(raw, app);
			return [
				{
					name: file.basename,
					path: file.path,
					content,
					isActiveNote: true,
				},
			];
		}
	}
}

export async function resolveContextItems(
	items: ContextItem[],
	app: App,
	maxTokens: number,
): Promise<ContextResolutionResult> {
	const resolved: ResolvedNote[] = [];
	const seenPaths = new Set<string>();

	for (const item of items) {
		const notes = await resolveSingleItem(item, app);
		for (const note of notes) {
			// Deduplicate by path within this resolution batch
			if (seenPaths.has(note.path)) continue;
			seenPaths.add(note.path);
			resolved.push(note);
		}
	}

	let totalChars = 0;
	for (const note of resolved) {
		totalChars += note.content.length;
	}

	let wasTruncated = false;
	const estimatedTokens = estimateTokens(
		resolved.map((n) => n.content).join("\n"),
	);

	if (estimatedTokens > maxTokens && resolved.length > 0) {
		wasTruncated = true;
		const targetChars = maxTokens * TOKEN_ESTIMATE_RATIO;
		const perNoteTarget = Math.floor(targetChars / resolved.length);
		for (const note of resolved) {
			if (note.content.length > perNoteTarget) {
				note.content =
					note.content.slice(0, perNoteTarget) +
					"\n[...truncated for context window]";
			}
		}
		totalChars = resolved.reduce((sum, n) => sum + n.content.length, 0);
	}

	if (resolved.length === 0) {
		return {
			contextString: "",
			wasTruncated: false,
			stats: { notesRead: 0, chars: 0, estimatedTokens: 0 },
		};
	}

	const parts: string[] = ["<context>"];
	for (const note of resolved) {
		const tag = note.isActiveNote ? "active-note" : "note";
		parts.push(
			`<${tag} name="${escapeXml(note.name)}">\n${note.content}\n</${tag}>`,
		);
	}
	parts.push("</context>");

	return {
		contextString: parts.join("\n"),
		wasTruncated,
		stats: {
			notesRead: resolved.length,
			chars: totalChars,
			estimatedTokens: estimateTokens(parts.join("\n")),
		},
	};
}

function escapeXml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
