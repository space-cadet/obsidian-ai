import { App } from "obsidian";
import { FileLogger } from "../logger";
import type { MemoryCategory, MemoryEntry } from "./MemoryStore";

export interface ScoredMemoryEntry extends MemoryEntry {
	score: number;
	accessCount: number;
	lastAccessed: string; // ISO-8601 date
	createdAt: string; // ISO-8601 date
}

export interface MemoryTierConfig {
	coreSize: "small" | "medium" | "large";
	stagedThreshold: number;
	coreThreshold: number;
	archiveThreshold: number;
	newnessHalfLifeDays: number;
	recencyHalfLifeDays: number;
	weights: {
		staged: { newness: number; importance: number; frequency: number };
		core: { recency: number; importance: number; frequency: number };
	};
}

export const DEFAULT_TIER_CONFIG: MemoryTierConfig = {
	coreSize: "medium",
	stagedThreshold: 0.3,
	coreThreshold: 0.6,
	archiveThreshold: 0.1,
	newnessHalfLifeDays: 7,
	recencyHalfLifeDays: 30,
	weights: {
		staged: { newness: 0.5, importance: 0.3, frequency: 0.2 },
		core: { recency: 0.4, importance: 0.4, frequency: 0.2 },
	},
};

export const CORE_SIZE_LIMITS = {
	small: 50,
	medium: 100,
	large: 200,
};

export interface ThreeTierMemoryStoreDeps {
	app: App;
	intelligenceDir: string;
	logger?: FileLogger;
	config?: Partial<MemoryTierConfig>;
}

/**
 * Three-tier memory store with automatic curation.
 *
 * Tiers:
 * - core.json: Hot memories, always loaded, injected into system prompt
 * - staged.json: New memories awaiting evaluation
 * - archive.json: Long-term storage, search-only
 *
 * Promotion: staged → core (score-based)
 * Demotion: core → archive (score-based, LRU eviction)
 */
export class ThreeTierMemoryStore {
	private deps: ThreeTierMemoryStoreDeps;
	private config: MemoryTierConfig;

	// File paths
	private readonly corePath: string;
	private readonly stagedPath: string;
	private readonly archivePath: string;
	private readonly auditPath: string;

	// In-memory caches
	private coreCache: ScoredMemoryEntry[] | null = null;
	private stagedCache: ScoredMemoryEntry[] | null = null;
	private archiveCache: ScoredMemoryEntry[] | null = null;
	private archiveIndex: Map<string, Map<string, number>> | null = null;

	constructor(deps: ThreeTierMemoryStoreDeps) {
		this.deps = deps;
		this.config = { ...DEFAULT_TIER_CONFIG, ...deps.config };

		const dir = deps.intelligenceDir;
		this.corePath = `${dir}/core.json`;
		this.stagedPath = `${dir}/staged.json`;
		this.archivePath = `${dir}/archive.json`;
		this.auditPath = `${dir}/memory-audit.jsonl`;
	}

	// ==================== LOAD/SAVE ====================

	async loadCore(): Promise<ScoredMemoryEntry[]> {
		if (this.coreCache) return this.coreCache;
		this.coreCache = await this._loadTier(this.corePath);
		return this.coreCache;
	}

	async loadStaged(): Promise<ScoredMemoryEntry[]> {
		if (this.stagedCache) return this.stagedCache;
		this.stagedCache = await this._loadTier(this.stagedPath);
		return this.stagedCache;
	}

	async loadArchive(): Promise<ScoredMemoryEntry[]> {
		if (this.archiveCache) return this.archiveCache;
		this.archiveCache = await this._loadTier(this.archivePath);
		return this.archiveCache;
	}

	private async _loadTier(path: string): Promise<ScoredMemoryEntry[]> {
		const adapter = this.deps.app.vault.adapter;
		if (await adapter.exists(path)) {
			try {
				const raw = await adapter.read(path);
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed)) {
					return parsed as ScoredMemoryEntry[];
				}
			} catch (e) {
				this.deps.logger?.log("warn", `Failed to parse ${path}: ${e}`);
			}
		}
		return [];
	}

	private async _saveTier(
		path: string,
		entries: ScoredMemoryEntry[],
	): Promise<void> {
		const adapter = this.deps.app.vault.adapter;
		await adapter.write(path, JSON.stringify(entries, null, 2));
	}

	async saveCore(entries: ScoredMemoryEntry[]): Promise<void> {
		this.coreCache = entries;
		await this._saveTier(this.corePath, entries);
	}

	async saveStaged(entries: ScoredMemoryEntry[]): Promise<void> {
		this.stagedCache = entries;
		await this._saveTier(this.stagedPath, entries);
	}

	async saveArchive(entries: ScoredMemoryEntry[]): Promise<void> {
		this.archiveCache = entries;
		this.archiveIndex = null;
		await this._saveTier(this.archivePath, entries);
	}

	// ==================== SCORING ====================

	/** Calculate staged score: how likely to promote to core */
	calculateStagedScore(entry: ScoredMemoryEntry): number {
		const now = Date.now();
		const ageDays =
			(now - new Date(entry.createdAt).getTime()) / (1000 * 60 * 60 * 24);
		const newness = Math.exp(
			-ageDays / this.config.newnessHalfLifeDays,
		);

		const importance = this._importanceScore(entry);
		const frequency = Math.log1p(entry.accessCount) / Math.log1p(10);

		const w = this.config.weights.staged;
		return w.newness * newness + w.importance * importance + w.frequency * frequency;
	}

	/** Calculate core score: how valuable to keep in core */
	calculateCoreScore(entry: ScoredMemoryEntry): number {
		const now = Date.now();
		const recencyDays =
			(now - new Date(entry.lastAccessed).getTime()) /
			(1000 * 60 * 60 * 24);
		const recency = Math.exp(
			-recencyDays / this.config.recencyHalfLifeDays,
		);

		const importance = this._importanceScore(entry);
		const frequency = Math.log1p(entry.accessCount) / Math.log1p(10);

		const w = this.config.weights.core;
		return w.recency * recency + w.importance * importance + w.frequency * frequency;
	}

	private _importanceScore(entry: ScoredMemoryEntry): number {
		// Heuristic: longer + tagged = more important
		const lengthScore = Math.min(entry.content.length / 500, 1);
		const tagScore = Math.min(entry.tags.length / 5, 1);
		return (lengthScore + tagScore) / 2;
	}

	// ==================== PROMOTION/DEMOTION ====================

	/** Evaluate staged entries and promote high-scorers to core */
	async evaluateStaged(): Promise<{
		promoted: number;
		demoted: number;
	}> {
		let staged = await this.loadStaged();
		let core = await this.loadCore();

		let promoted = 0;
		let demoted = 0;

		// Score all staged entries
		const scored = staged.map((e) => ({
			entry: e,
			score: this.calculateStagedScore(e),
		}));

		// Promote those above threshold, highest first
		const toPromote = scored
			.filter((s) => s.score >= this.config.stagedThreshold)
			.sort((a, b) => b.score - a.score);

		const coreLimit = CORE_SIZE_LIMITS[this.config.coreSize];

		for (const { entry, score } of toPromote) {
			// Refresh core size each iteration
			core = await this.loadCore();

			if (core.length >= coreLimit) {
				// Need to demote lowest-scoring core entry
				const lowest = this._findLowestCoreEntry(core);
				if (lowest && this.calculateCoreScore(lowest) < score) {
					await this._demoteToArchive(lowest);
					demoted++;
				} else {
					continue; // Can't promote, core full and all entries better
				}
			}

			await this._promoteToCore(entry);
			promoted++;
		}

		return { promoted, demoted };
	}

	/** Demote low-scoring core entries to archive */
	async cullCore(): Promise<number> {
		const core = await this.loadCore();
		const toDemote = core.filter(
			(e) => this.calculateCoreScore(e) < this.config.archiveThreshold,
		);

		for (const entry of toDemote) {
			await this._demoteToArchive(entry);
		}

		return toDemote.length;
	}

	private async _promoteToCore(entry: ScoredMemoryEntry): Promise<void> {
		const core = await this.loadCore();
		const staged = await this.loadStaged();

		// Remove from staged
		const filtered = staged.filter((e) => e.id !== entry.id);
		await this.saveStaged(filtered);

		// Add to core
		entry.score = this.calculateCoreScore(entry);
		core.push(entry);
		await this.saveCore(core);

		await this._audit("promote", entry.id, entry.category);
		this.deps.logger?.log(
			"info",
			`Promoted memory ${entry.id} to core`,
		);
	}

	private async _demoteToArchive(entry: ScoredMemoryEntry): Promise<void> {
		const core = await this.loadCore();
		const archive = await this.loadArchive();

		// Remove from core
		const filtered = core.filter((e) => e.id !== entry.id);
		await this.saveCore(filtered);

		// Add to archive
		archive.push(entry);
		await this.saveArchive(archive);

		await this._audit("demote", entry.id, entry.category);
		this.deps.logger?.log(
			"info",
			`Demoted memory ${entry.id} to archive`,
		);
	}

	private _findLowestCoreEntry(
		core: ScoredMemoryEntry[],
	): ScoredMemoryEntry | null {
		if (core.length === 0) return null;
		return core.reduce((lowest, entry) =>
			this.calculateCoreScore(entry) < this.calculateCoreScore(lowest)
				? entry
				: lowest,
		);
	}

	// ==================== CRUD (mirrors MemoryStore API) ====================

	/** Create a new memory entry — always goes to staged first */
	async create(
		category: MemoryCategory,
		content: string,
		tags?: string[],
	): Promise<ScoredMemoryEntry> {
		const now = new Date().toISOString();
		const entry: ScoredMemoryEntry = {
			id: this._makeId(),
			timestamp: now.split("T")[0],
			createdAt: now,
			lastAccessed: now,
			category,
			content: content.trim(),
			tags: tags ? tags.map((t) => t.toLowerCase().trim()) : [],
			score: 0,
			accessCount: 0,
		};

		const staged = await this.loadStaged();
		staged.push(entry);
		await this.saveStaged(staged);

		await this._audit("create", entry.id, category);
		this.deps.logger?.log("info", `Created staged memory ${entry.id}`);
		return entry;
	}

	/** Read an entry by ID — searches all tiers, increments access count */
	async read(id: string): Promise<ScoredMemoryEntry | null> {
		// Search core first
		const core = await this.loadCore();
		let found = core.find((e) => e.id === id);
		if (found) {
			await this._touch(found, core, "core");
			return found;
		}

		// Then staged
		const staged = await this.loadStaged();
		found = staged.find((e) => e.id === id);
		if (found) {
			await this._touch(found, staged, "staged");
			return found;
		}

		// Finally archive
		const archive = await this.loadArchive();
		found = archive.find((e) => e.id === id);
		if (found) {
			await this._touch(found, archive, "archive");
			return found;
		}

		return null;
	}

	private async _touch(
		entry: ScoredMemoryEntry,
		tier: ScoredMemoryEntry[],
		tierName: string,
	): Promise<void> {
		entry.lastAccessed = new Date().toISOString();
		entry.accessCount++;
		if (tierName === "core") {
			await this.saveCore(tier);
		} else if (tierName === "staged") {
			await this.saveStaged(tier);
		} else {
			await this.saveArchive(tier);
		}
	}

	/** Update an entry by ID */
	async update(
		id: string,
		updates: Partial<Pick<ScoredMemoryEntry, "category" | "content" | "tags">>,
	): Promise<ScoredMemoryEntry | null> {
		const found = await this.read(id);
		if (!found) return null;

		if (updates.category !== undefined) found.category = updates.category;
		if (updates.content !== undefined)
			found.content = updates.content.trim();
		if (updates.tags !== undefined) {
			found.tags = updates.tags.map((t) => t.toLowerCase().trim());
		}

		// Re-save in appropriate tier
		const core = await this.loadCore();
		if (core.find((e) => e.id === id)) {
			await this.saveCore(core);
		} else {
			const staged = await this.loadStaged();
			if (staged.find((e) => e.id === id)) {
				await this.saveStaged(staged);
			} else {
				const archive = await this.loadArchive();
				await this.saveArchive(archive);
			}
		}

		await this._audit("update", id, found.category);
		return found;
	}

	/** Delete an entry by ID from any tier */
	async delete(id: string): Promise<boolean> {
		const core = await this.loadCore();
		const coreFiltered = core.filter((e) => e.id !== id);
		if (coreFiltered.length < core.length) {
			await this.saveCore(coreFiltered);
			await this._audit("delete", id);
			return true;
		}

		const staged = await this.loadStaged();
		const stagedFiltered = staged.filter((e) => e.id !== id);
		if (stagedFiltered.length < staged.length) {
			await this.saveStaged(stagedFiltered);
			await this._audit("delete", id);
			return true;
		}

		const archive = await this.loadArchive();
		const archiveFiltered = archive.filter((e) => e.id !== id);
		if (archiveFiltered.length < archive.length) {
			await this.saveArchive(archiveFiltered);
			await this._audit("delete", id);
			return true;
		}

		return false;
	}

	/** List all entries from all tiers */
	async listAll(options?: {
		category?: MemoryCategory;
		tag?: string;
		limit?: number;
	}): Promise<ScoredMemoryEntry[]> {
		const core = await this.loadCore();
		const staged = await this.loadStaged();
		const archive = await this.loadArchive();
		let all = [...core, ...staged, ...archive];

		if (options?.category) {
			all = all.filter((e) => e.category === options.category);
		}
		if (options?.tag) {
			const t = options.tag.toLowerCase().trim();
			all = all.filter((e) => e.tags.includes(t));
		}
		if (options?.limit) {
			all = all.slice(0, options.limit);
		}
		return all;
	}

	/** Search across all tiers */
	async search(query: string): Promise<ScoredMemoryEntry[]> {
		const q = query.toLowerCase().trim();
		if (!q) return [];
		const [core, staged, archive] = await Promise.all([
			this.loadCore(), this.loadStaged(), this.loadArchive(),
		]);
		const terms = this._terms(q);
		const ranked: Array<{ entry: ScoredMemoryEntry; score: number }> = [];
		for (const entry of [...core, ...staged]) {
			const haystack = `${entry.content} ${entry.tags.join(" ")}`.toLowerCase();
			if (terms.some((term) => haystack.includes(term))) {
				ranked.push({ entry, score: terms.filter((term) => haystack.includes(term)).length + 1 });
			}
		}
		const index = this._getArchiveIndex(archive);
		for (const entry of archive) {
			const document = index.get(entry.id);
			if (!document) continue;
			const score = terms.reduce((sum, term) => sum + (document.get(term) ?? 0), 0);
			if (score > 0) ranked.push({ entry, score });
		}
		return ranked.sort((a, b) => b.score - a.score).map(({ entry }) => entry);
	}

	private _terms(text: string): string[] {
		return [...new Set(text.split(/[^a-z0-9]+/).filter((term) => term.length > 2))];
	}

	/** Build a lightweight in-memory TF-IDF index for the cold archive. */
	private _getArchiveIndex(entries: ScoredMemoryEntry[]): Map<string, Map<string, number>> {
		if (this.archiveIndex) return this.archiveIndex;
		const documents = entries.map((entry) => this._terms(`${entry.content} ${entry.tags.join(" ")}`));
		const documentFrequency = new Map<string, number>();
		for (const terms of documents) for (const term of new Set(terms)) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
		const count = Math.max(entries.length, 1);
		this.archiveIndex = new Map(entries.map((entry, i) => {
			const terms = documents[i];
			const frequencies = new Map<string, number>();
			for (const term of terms) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
			for (const [term, frequency] of frequencies) frequencies.set(term, (frequency / terms.length) * Math.log(count / (documentFrequency.get(term) ?? 1)));
			return [entry.id, frequencies];
		}));
		return this.archiveIndex;
	}

	/** Get formatted context for system prompt (core entries only) */
	async getSystemPromptContext(maxTokens?: number): Promise<string> {
		let core = await this.loadCore();
		if (core.length === 0) return "";

		// Iteratively trim entries until under token limit
		while (maxTokens && core.length > 0) {
			const text = this._formatCoreEntries(core);
			const estimatedTokens = text.length / 4;
			if (estimatedTokens <= maxTokens) {
				return text;
			}
			// Remove oldest entry (first in array)
			core = core.slice(1);
		}

		return this._formatCoreEntries(core);
	}

	private _formatCoreEntries(entries: ScoredMemoryEntry[]): string {
		const lines = ["## Long-term memory", ""];
		for (const entry of entries) {
			lines.push(`- [${entry.category}] ${entry.content}`);
			if (entry.tags.length > 0) {
				lines.push(`  Tags: ${entry.tags.join(", ")}`);
			}
		}
		return lines.join("\n");
	}

	// ==================== MIGRATION ====================

	/** Migrate from legacy memory.json to three-tier system */
	async migrateFromLegacy(legacyEntries: MemoryEntry[]): Promise<{
		core: number;
		staged: number;
		archive: number;
	}> {
		const now = new Date().toISOString();
		const scored = legacyEntries.map((e) => ({
			...e,
			score: 0,
			accessCount: 0,
			createdAt: e.timestamp + "T00:00:00Z",
			lastAccessed: now,
		}));

		// Score all entries
		const withCoreScore = scored.map((e) => ({
			entry: e,
			score: this.calculateCoreScore(e),
		}));

		// Sort by score descending
		withCoreScore.sort((a, b) => b.score - a.score);

		const coreLimit = CORE_SIZE_LIMITS[this.config.coreSize];
		const core = withCoreScore
			.slice(0, coreLimit)
			.map((s) => s.entry);
		const staged: ScoredMemoryEntry[] = [];
		const archive = withCoreScore.slice(coreLimit).map((s) => s.entry);

		await this.saveCore(core);
		await this.saveStaged(staged);
		await this.saveArchive(archive);

		return {
			core: core.length,
			staged: staged.length,
			archive: archive.length,
		};
	}

	// ==================== HELPERS ====================

	private _makeId(): string {
		return (
			Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
		);
	}

	private async _audit(
		operation: string,
		entryId: string,
		category?: string,
	): Promise<void> {
		const adapter = this.deps.app.vault.adapter;
		const entry = {
			timestamp: new Date().toISOString(),
			operation,
			entryId,
			category,
		};
		const line = JSON.stringify(entry) + "\n";
		try {
			if (await adapter.exists(this.auditPath)) {
				const existing = await adapter.read(this.auditPath);
				await adapter.write(this.auditPath, existing + line);
			} else {
				await adapter.write(this.auditPath, line);
			}
		} catch {
			// Silently fail audit logging
		}
	}
}
