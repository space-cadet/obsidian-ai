import { App } from "obsidian";
import { FileLogger } from "../logger";

export type MemoryCategory =
	| "user_fact"
	| "project"
	| "preference"
	| "insight"
	| "reference";

export interface MemoryEntry {
	id: string;
	timestamp: string; // ISO-8601 date (YYYY-MM-DD)
	category: MemoryCategory;
	content: string;
	tags: string[];
}

export interface MemoryStoreDeps {
	app: App;
	intelligenceDir: string;
	logger?: FileLogger;
}

const DEFAULT_MEMORY_ENTRIES: MemoryEntry[] = [];

/**
 * Structured memory store with CRUD operations.
 *
 * Backing storage: memory.json (structured, machine-readable)
 * Human-readable export: memory.md (regenerated on every write)
 */
export class MemoryStore {
	private deps: MemoryStoreDeps;
	private readonly jsonPath: string;
	private readonly mdPath: string;

	constructor(deps: MemoryStoreDeps) {
		this.deps = deps;
		this.jsonPath = `${deps.intelligenceDir}/memory.json`;
		this.mdPath = `${deps.intelligenceDir}/memory.md`;
	}

	/** Ensure the JSON store exists; return current entries. */
	async loadEntries(): Promise<MemoryEntry[]> {
		const adapter = this.deps.app.vault.adapter;
		if (await adapter.exists(this.jsonPath)) {
			try {
				const raw = await adapter.read(this.jsonPath);
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed)) {
					return parsed as MemoryEntry[];
				}
			} catch (e) {
				this.deps.logger?.log("warn", `Failed to parse memory.json: ${e}`);
			}
		}
		return [...DEFAULT_MEMORY_ENTRIES];
	}

	/** Overwrite JSON and regenerate markdown. */
	private async _save(entries: MemoryEntry[]): Promise<void> {
		const adapter = this.deps.app.vault.adapter;
		await adapter.write(this.jsonPath, JSON.stringify(entries, null, 2));
		await this._regenerateMarkdown(entries);
	}

	/** Create a new memory entry. */
	async create(
		category: MemoryCategory,
		content: string,
		tags?: string[],
	): Promise<MemoryEntry> {
		const entries = await this.loadEntries();
		const entry: MemoryEntry = {
			id: this._makeId(),
			timestamp: new Date().toISOString().split("T")[0],
			category,
			content: content.trim(),
			tags: tags ? tags.map((t) => t.toLowerCase().trim()) : [],
		};
		entries.push(entry);
		await this._save(entries);
		this.deps.logger?.log("info", `Created memory ${entry.id}: ${category}`);
		return entry;
	}

	/** Read a single entry by ID. */
	async read(id: string): Promise<MemoryEntry | null> {
		const entries = await this.loadEntries();
		return entries.find((e) => e.id === id) ?? null;
	}

	/** Update an existing entry by ID. */
	async update(
		id: string,
		updates: Partial<Pick<MemoryEntry, "category" | "content" | "tags">>,
	): Promise<MemoryEntry | null> {
		const entries = await this.loadEntries();
		const idx = entries.findIndex((e) => e.id === id);
		if (idx === -1) return null;

		if (updates.category !== undefined) entries[idx].category = updates.category;
		if (updates.content !== undefined) entries[idx].content = updates.content.trim();
		if (updates.tags !== undefined) {
			entries[idx].tags = updates.tags.map((t) => t.toLowerCase().trim());
		}
		await this._save(entries);
		this.deps.logger?.log("info", `Updated memory ${id}`);
		return entries[idx];
	}

	/** Delete an entry by ID. */
	async delete(id: string): Promise<boolean> {
		const entries = await this.loadEntries();
		const beforeLen = entries.length;
		const filtered = entries.filter((e) => e.id !== id);
		if (filtered.length === beforeLen) return false;
		await this._save(filtered);
		this.deps.logger?.log("info", `Deleted memory ${id}`);
		return true;
	}

	/** List all entries, optionally filtered. */
	async list(options?: {
		category?: MemoryCategory;
		tag?: string;
		limit?: number;
	}): Promise<MemoryEntry[]> {
		let entries = await this.loadEntries();
		if (options?.category) {
			entries = entries.filter((e) => e.category === options.category);
		}
		if (options?.tag) {
			const t = options.tag.toLowerCase().trim();
			entries = entries.filter((e) => e.tags.includes(t));
		}
		if (options?.limit) {
			entries = entries.slice(-options.limit);
		}
		return entries;
	}

	/** Simple keyword search across content and tags. */
	async search(query: string): Promise<MemoryEntry[]> {
		const q = query.toLowerCase().trim();
		if (!q) return [];
		const entries = await this.loadEntries();
		return entries.filter(
			(e) =>
				e.content.toLowerCase().includes(q) ||
				e.tags.some((t) => t.includes(q)) ||
				e.category.includes(q),
		);
	}

	/** Regenerate memory.md from entries for human readability. */
	private async _regenerateMarkdown(entries: MemoryEntry[]): Promise<void> {
		const lines: string[] = [
			"# AI Memory",
			"",
			"Auto-generated from chat sessions. The AI may append entries here.",
			"Feel free to edit or delete anything — it's your memory.",
			"",
			"## Entries",
			"",
		];

		for (const e of entries) {
			const tagStr = e.tags.length > 0 ? " " + e.tags.map((t) => `#${t}`).join(" ") : "";
			lines.push(`- [${e.timestamp}] **${e.category}**: ${e.content}${tagStr} [id:${e.id}]`);
		}

		lines.push("");
		await this.deps.app.vault.adapter.write(this.mdPath, lines.join("\n"));
	}

	/** Migrate legacy markdown memory.md to structured JSON. Idempotent. */
	async migrateFromMarkdown(): Promise<number> {
		const adapter = this.deps.app.vault.adapter;
		if (await adapter.exists(this.jsonPath)) return 0; // Already migrated
		if (!(await adapter.exists(this.mdPath))) return 0;

		const md = await adapter.read(this.mdPath);
		const entries = this._parseMarkdown(md);
		if (entries.length > 0) {
			await this._save(entries);
		}
		this.deps.logger?.log(
			"info",
			`Migrated ${entries.length} entries from memory.md to memory.json`,
		);
		return entries.length;
	}

	/** Parse legacy markdown format into entries. */
	private _parseMarkdown(md: string): MemoryEntry[] {
		const entries: MemoryEntry[] = [];
		const lines = md.split("\n");
		const entryRegex =
			/^-\s*\[(\d{4}-\d{2}-\d{2})\]\s*\*\*(\w+)\*\*:\s*(.+?)\s*(?:\[id:([a-z0-9]+)\])?\s*$/;

		for (const line of lines) {
			const match = entryRegex.exec(line.trim());
			if (!match) continue;

			const [, date, category, rest, existingId] = match;
			// Extract tags from rest: look for #tag patterns at the end
			const tagRegex = /#(\w+)/g;
			const tags: string[] = [];
			let content = rest;
			let tagMatch;
			while ((tagMatch = tagRegex.exec(rest)) !== null) {
				tags.push(tagMatch[1].toLowerCase());
			}
			// Remove tags from content
			content = content.replace(/#\w+/g, "").trim();
			// Remove trailing punctuation if any
			content = content.replace(/[\s,;]+$/, "").trim();

			if (this._isValidCategory(category)) {
				entries.push({
					id: existingId || this._makeId(),
					timestamp: date,
					category: category as MemoryCategory,
					content,
					tags,
				});
			}
		}
		return entries;
	}

	private _isValidCategory(c: string): c is MemoryCategory {
		return ["user_fact", "project", "preference", "insight", "reference"].includes(c);
	}

	private _makeId(): string {
		return Math.random().toString(36).slice(2, 10);
	}
}
