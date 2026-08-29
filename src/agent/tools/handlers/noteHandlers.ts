import { Notice } from "obsidian";
import type { ToolResult } from "../../types";
import { denyPath, isPathAllowed } from "../ToolResolver";
import {
	ToolHandlerBase,
	type ToolHandlerContext,
} from "../ToolHandlerContext";
import { contentFingerprint } from "../../contentFingerprint";

function changedSinceRead(path: string): ToolResult {
	return {
		error: `Note changed since it was read: ${path}. Read it again and retry so no newer content is overwritten.`,
	};
}

/** Operations that read or change note content. */
export class NoteHandlers extends ToolHandlerBase {
	constructor(context: ToolHandlerContext) {
		super(context);
	}

	async readNote(args: { path: string }): Promise<ToolResult> {
		if (!isPathAllowed(args.path)) return denyPath(args.path);
		const file = this.resolver.resolveNote(args.path);
		if (!file) return { error: `Note not found: ${args.path}` };
		const content = await this.app.vault.read(file);
		const fingerprint = await contentFingerprint(content);
		const ambiguous = (file as any).__ambiguous as string[] | undefined;
		if (ambiguous && ambiguous.length > 1) {
			return {
				content,
				content_fingerprint: fingerprint,
				path: file.path,
				warning:
					`⚠️ Ambiguous name: ${ambiguous.length} notes share the basename "${file.basename}". ` +
					`Reading "${file.path}". Other matches: ${ambiguous.filter((path) => path !== file.path).join(", ")}. ` +
					`Use the full path (e.g. "Folder/${file.basename}") to target a specific note.`,
			};
		}
		return { content, content_fingerprint: fingerprint, path: file.path };
	}

	async editNote(args: {
		path: string;
		content: string;
		expected_content_fingerprint?: string;
	}): Promise<ToolResult> {
		if (!isPathAllowed(args.path)) return denyPath(args.path);
		const file = this.resolver.resolveNote(args.path);
		if (!file) return { error: `Note not found: ${args.path}` };
		if (args.expected_content_fingerprint) {
			const current = await this.app.vault.read(file);
			if (
				(await contentFingerprint(current)) !==
				args.expected_content_fingerprint
			) {
				return changedSinceRead(file.path);
			}
		}
		await this.app.vault.modify(file, args.content);
		new Notice(`✓ Edited ${file.basename}`);
		return { success: true, path: file.path };
	}

	async appendToNote(args: {
		path: string;
		content: string;
		expected_content_fingerprint?: string;
	}): Promise<ToolResult> {
		if (!isPathAllowed(args.path)) return denyPath(args.path);
		const file = this.resolver.resolveNote(args.path);
		if (!file) return { error: `Note not found: ${args.path}` };
		const existing = await this.app.vault.read(file);
		if (
			args.expected_content_fingerprint &&
			(await contentFingerprint(existing)) !==
				args.expected_content_fingerprint
		) {
			return changedSinceRead(file.path);
		}
		await this.app.vault.modify(file, existing + "\n\n" + args.content);
		new Notice(`✓ Appended to ${file.basename}`);
		return { success: true, path: file.path };
	}

	async createNote(args: {
		path: string;
		content: string;
	}): Promise<ToolResult> {
		if (!isPathAllowed(args.path)) return denyPath(args.path);
		const fileName = args.path.endsWith(".md")
			? args.path
			: `${args.path}.md`;

		if (this.resolver.resolveNote(fileName)) {
			return { error: `Note already exists: ${fileName}` };
		}

		await this.app.vault.create(fileName, args.content);
		new Notice(`✓ Created ${fileName}`);
		return { success: true, path: fileName };
	}

	async patchNote(args: {
		path: string;
		search: string;
		replace: string;
		replace_all?: boolean;
		expected_content_fingerprint?: string;
	}): Promise<ToolResult> {
		if (!isPathAllowed(args.path)) return denyPath(args.path);
		const file = this.resolver.resolveNote(args.path);
		if (!file) return { error: `Note not found: ${args.path}` };

		const content = await this.app.vault.read(file);
		if (
			args.expected_content_fingerprint &&
			(await contentFingerprint(content)) !==
				args.expected_content_fingerprint
		) {
			return changedSinceRead(file.path);
		}
		if (!content.includes(args.search)) {
			return {
				error: "Search text not found in note. Consider read_note first to see exact content.",
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

	async editSection(args: {
		path: string;
		section_heading: string;
		new_content: string;
		expected_content_fingerprint?: string;
	}): Promise<ToolResult> {
		if (!isPathAllowed(args.path)) return denyPath(args.path);
		const file = this.resolver.resolveNote(args.path);
		if (!file) return { error: `Note not found: ${args.path}` };

		const content = await this.app.vault.read(file);
		if (
			args.expected_content_fingerprint &&
			(await contentFingerprint(content)) !==
				args.expected_content_fingerprint
		) {
			return changedSinceRead(file.path);
		}
		const lines = content.split("\n");
		const targetText = args.section_heading.startsWith("#")
			? args.section_heading.replace(/^#+\s*/, "").trim()
			: args.section_heading.trim();

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

		let endIdx = lines.length;
		for (let i = startIdx + 1; i < lines.length; i++) {
			const match = lines[i].match(/^(#{1,6})\s+/);
			if (match && match[1].length <= startLevel) {
				endIdx = i;
				break;
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
