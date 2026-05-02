import { App, TFile, TFolder } from "obsidian";
import { ContextItem } from "../types";

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
const TOKEN_ESTIMATE_RATIO = 4;

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
		return fmTags.some(
			(t) => String(t).toLowerCase() === normalized,
		);
	}
	if (typeof fmTags === "string") {
		return fmTags.toLowerCase() === normalized;
	}

	return false;
}

function getFilesForFolder(
	app: App,
	folderPath: string,
): TFile[] {
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

function estimateTokens(text: string): number {
	return Math.ceil(text.length / TOKEN_ESTIMATE_RATIO);
}

async function resolveSingleItem(
	item: ContextItem,
	app: App,
): Promise<ResolvedNote[]> {
	switch (item.type) {
		case "note": {
			const file = app.vault.getAbstractFileByPath(item.path);
			if (!(file instanceof TFile)) return [];
			const content = await app.vault.read(file);
			return [{ name: item.name, path: file.path, content }];
		}
		case "folder": {
			const files = getFilesForFolder(app, item.path);
			const results: ResolvedNote[] = [];
			for (const file of files) {
				const content = await app.vault.read(file);
				results.push({ name: file.basename, path: file.path, content });
			}
			return results;
		}
		case "tag": {
			const files = getFilesForTag(app, item.tag);
			const results: ResolvedNote[] = [];
			for (const file of files) {
				const content = await app.vault.read(file);
				results.push({ name: file.basename, path: file.path, content });
			}
			return results;
		}
		case "active-note": {
			const file = app.workspace.getActiveFile();
			if (!(file instanceof TFile)) return [];
			const content = await app.vault.read(file);
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
		totalChars = resolved.reduce(
			(sum, n) => sum + n.content.length,
			0,
		);
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
