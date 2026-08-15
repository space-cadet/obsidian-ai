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

export interface DedupOptions {
	/** Skip creation if similarity to existing entry exceeds this threshold (0-1). Default: 0.7 */
	threshold?: number;
	/** Only check duplicates within the same category. Default: true */
	sameCategoryOnly?: boolean;
}

export interface MemoryAuditEntry {
	timestamp: string; // ISO-8601
	operation: "create" | "update" | "delete";
	entryId: string;
	category?: string;
	content?: string;
	tags?: string[];
}

export interface PruneResult {
	removed: number;
	kept: number;
	groups: number;
	bytesBefore: number;
	bytesAfter: number;
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
	private readonly auditPath: string;

	constructor(deps: MemoryStoreDeps) {
		this.deps = deps;
		this.jsonPath = `${deps.intelligenceDir}/memory.json`;
		this.mdPath = `${deps.intelligenceDir}/memory.md`;
		this.auditPath = `${deps.intelligenceDir}/memory-audit.jsonl`;
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
	async saveEntries(entries: MemoryEntry[]): Promise<void> {
		await this._save(entries);
	}

	/** Overwrite JSON and regenerate markdown. */
	private async _save(entries: MemoryEntry[]): Promise<void> {
		const adapter = this.deps.app.vault.adapter;
		await adapter.write(this.jsonPath, JSON.stringify(entries, null, 2));
		await this._regenerateMarkdown(entries);
	}

	/** Create a new memory entry, or reaffirm an existing one if a near-duplicate is found. */
	async create(
		category: MemoryCategory,
		content: string,
		tags?: string[],
		options?: DedupOptions,
	): Promise<MemoryEntry> {
		const entries = await this.loadEntries();
		const threshold = options?.threshold ?? 0.7;
		const sameCategoryOnly = options?.sameCategoryOnly ?? true;

		const normalizedNew = this._normalizeForDedup(content);

		for (const existing of entries) {
			if (sameCategoryOnly && existing.category !== category) continue;

			const similarity = this._computeSimilarity(
				normalizedNew,
				this._normalizeForDedup(existing.content),
			);
			if (similarity >= threshold) {
				// Reaffirm: bump timestamp so it stays in the active set
				existing.timestamp = new Date().toISOString().split("T")[0];
				await this._save(entries);
				this.deps.logger?.log(
					"info",
					`Reaffirmed memory ${existing.id} (similarity ${similarity.toFixed(2)})`,
				);
				return existing;
			}
		}

		const entry: MemoryEntry = {
			id: this._makeId(),
			timestamp: new Date().toISOString().split("T")[0],
			category,
			content: content.trim(),
			tags: tags ? tags.map((t) => t.toLowerCase().trim()) : [],
		};
		entries.push(entry);
		await this._save(entries);
		await this._audit({
			timestamp: new Date().toISOString(),
			operation: "create",
			entryId: entry.id,
			category: entry.category,
			content: entry.content,
			tags: entry.tags,
		});
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
		await this._audit({
			timestamp: new Date().toISOString(),
			operation: "update",
			entryId: id,
			category: entries[idx].category,
			content: entries[idx].content,
			tags: entries[idx].tags,
		});
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
		await this._audit({
			timestamp: new Date().toISOString(),
			operation: "delete",
			entryId: id,
		});
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

	/** Append an audit log entry. */
	private async _audit(entry: MemoryAuditEntry): Promise<void> {
		const line = JSON.stringify(entry) + "\n";
		const adapter = this.deps.app.vault.adapter;
		try {
			if (await adapter.exists(this.auditPath)) {
				const existing = await adapter.read(this.auditPath);
				await adapter.write(this.auditPath, existing + line);
			} else {
				await adapter.write(this.auditPath, line);
			}
		} catch (e) {
			this.deps.logger?.log("warn", `Failed to write audit log: ${e}`);
		}
	}

	/** Read recent audit entries (newest first). */
	async readAudit(limit: number = 50): Promise<MemoryAuditEntry[]> {
		const adapter = this.deps.app.vault.adapter;
		if (!(await adapter.exists(this.auditPath))) return [];
		try {
			const raw = await adapter.read(this.auditPath);
			const lines = raw.trim().split("\n").filter(Boolean);
			const entries: MemoryAuditEntry[] = [];
			for (const line of lines.slice(-limit)) {
				try {
					entries.push(JSON.parse(line));
				} catch { /* skip malformed */ }
			}
			return entries.reverse();
		} catch (e) {
			this.deps.logger?.log("warn", `Failed to read audit log: ${e}`);
			return [];
		}
	}
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

	/** One-time cleanup: remove historical duplicates using the same similarity logic as create(). */
	async pruneDuplicates(threshold: number = 0.7): Promise<PruneResult> {
		const entries = await this.loadEntries();
		const beforeSize = JSON.stringify(entries).length;

		const kept: MemoryEntry[] = [];
		let removed = 0;
		let groups = 0;

		// Group by category for efficiency
		const byCategory = new Map<MemoryCategory, MemoryEntry[]>();
		for (const e of entries) {
			const list = byCategory.get(e.category) ?? [];
			list.push(e);
			byCategory.set(e.category, list);
		}

		for (const [, catEntries] of byCategory) {
			const visited = new Set<number>();
			for (let i = 0; i < catEntries.length; i++) {
				if (visited.has(i)) continue;
				const group: MemoryEntry[] = [catEntries[i]];
				visited.add(i);

				for (let j = i + 1; j < catEntries.length; j++) {
					if (visited.has(j)) continue;
					const sim = this._computeSimilarity(
						this._normalizeForDedup(catEntries[i].content),
						this._normalizeForDedup(catEntries[j].content),
					);
					if (sim >= threshold) {
						group.push(catEntries[j]);
						visited.add(j);
					}
				}

				if (group.length > 1) {
					groups++;
					// Keep the entry with longest content (most detail), or oldest if tied
					group.sort((a, b) => {
						const lenDiff = b.content.length - a.content.length;
						if (lenDiff !== 0) return lenDiff;
						return a.timestamp.localeCompare(b.timestamp);
					});
					kept.push(group[0]);
					removed += group.length - 1;
				} else {
					kept.push(catEntries[i]);
				}
			}
		}

		// Preserve original order
		const idSet = new Set(kept.map((e) => e.id));
		const finalEntries = entries.filter((e) => idSet.has(e.id));

		await this._save(finalEntries);

		// Audit the prune operation
		await this._audit({
			timestamp: new Date().toISOString(),
			operation: "delete",
			entryId: `prune-${Date.now()}`,
			content: `Pruned ${removed} duplicates in ${groups} groups`,
		});

		const afterSize = JSON.stringify(finalEntries).length;
		this.deps.logger?.log(
			"info",
			`Memory prune complete: removed ${removed}, kept ${kept.length}, saved ${beforeSize - afterSize} bytes`,
		);

		return {
			removed,
			kept: kept.length,
			groups,
			bytesBefore: beforeSize,
			bytesAfter: afterSize,
		};
	}

	/** Quick stats about the memory store. */
	async getStats(): Promise<{ entries: number; size: number; categories: Record<string, number> }> {
		const entries = await this.loadEntries();
		const cats: Record<string, number> = {};
		for (const e of entries) {
			cats[e.category] = (cats[e.category] || 0) + 1;
		}
		return {
			entries: entries.length,
			size: JSON.stringify(entries).length,
			categories: cats,
		};
	}

	private _normalizeForDedup(text: string): string {
		return text
			.toLowerCase()
			.replace(/[^\w\s]/g, " ")
			.replace(/\s+/g, " ")
			.trim();
	}

	/**
	 * Compute Jaccard similarity between two normalized strings.
	 * Ignores words shorter than 3 characters to reduce noise.
	 */
	private _computeSimilarity(a: string, b: string): number {
		const wordsA = new Set(a.split(" ").filter((w) => w.length > 2));
		const wordsB = new Set(b.split(" ").filter((w) => w.length > 2));

		if (wordsA.size === 0 || wordsB.size === 0) return 0;

		// Fast path: substring containment
		if (a.includes(b) || b.includes(a)) return 1;

		const intersection = new Set([...wordsA].filter((x) => wordsB.has(x)));
		const union = new Set([...wordsA, ...wordsB]);
		return intersection.size / union.size;
	}

	private _isValidCategory(c: string): c is MemoryCategory {
		return ["user_fact", "project", "preference", "insight", "reference"].includes(c);
	}

	private _makeId(): string {
		return Math.random().toString(36).slice(2, 10);
	}
}
