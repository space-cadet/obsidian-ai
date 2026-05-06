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
				default:
					return { error: `Unknown tool: ${call.toolName}` };
			}
		} catch (e: any) {
			return { error: e.message || String(e) };
		}
	}

	private async readNote(args: { path: string }): Promise<ToolResult> {
		const file = this.app.vault.getAbstractFileByPath(args.path);
		if (!(file instanceof TFile))
			return { error: `Note not found: ${args.path}` };
		const content = await this.app.vault.read(file);
		return { content, path: args.path };
	}

	private async editNote(args: {
		path: string;
		content: string;
	}): Promise<ToolResult> {
		const file = this.app.vault.getAbstractFileByPath(args.path);
		if (!(file instanceof TFile))
			return { error: `Note not found: ${args.path}` };
		await this.app.vault.modify(file, args.content);
		new Notice(`✓ Edited ${file.basename}`);
		return { success: true, path: args.path };
	}

	private async appendToNote(args: {
		path: string;
		content: string;
	}): Promise<ToolResult> {
		const file = this.app.vault.getAbstractFileByPath(args.path);
		if (!(file instanceof TFile))
			return { error: `Note not found: ${args.path}` };
		const existing = await this.app.vault.read(file);
		await this.app.vault.modify(file, existing + "\n\n" + args.content);
		new Notice(`✓ Appended to ${file.basename}`);
		return { success: true, path: args.path };
	}

	private async createNote(args: {
		path: string;
		content: string;
	}): Promise<ToolResult> {
		const existing = this.app.vault.getAbstractFileByPath(args.path);
		if (existing) return { error: `Note already exists: ${args.path}` };
		await this.app.vault.create(args.path, args.content);
		new Notice(`✓ Created ${args.path}`);
		return { success: true, path: args.path };
	}
}
