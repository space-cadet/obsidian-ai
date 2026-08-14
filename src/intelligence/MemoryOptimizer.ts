import { ChatApiManager } from "../api";
import { MemoryStore, MemoryEntry, MemoryCategory, PruneResult } from "./MemoryStore";
import { FileLogger } from "../logger";

export interface MemoryOptimizerDeps {
	memoryStore: MemoryStore;
	chatApi: ChatApiManager;
	logger?: FileLogger;
}

export interface ProgressUpdate {
	stage: "loading" | "clustering" | "pruning" | "done" | "error";
	message: string;
	current: number;
	total: number;
	etaSeconds?: number;
}

const SYSTEM_PROMPT = `You are a memory deduplication assistant. Your job is to group memory entries that represent the SAME underlying fact, even if worded differently.

Rules:
- Entries about the same topic but different details are NOT duplicates
- Entries with different timestamps about ongoing projects are NOT duplicates (e.g., "migrated 8 sections" vs "migrated 20 sections")
- Preferences stated once vs preferences stated with examples ARE duplicates
- Entries about different sessions, dates, or progress updates are NOT duplicates

Return ONLY a JSON object with no markdown formatting:
{"clusters":[[0,2],[1],[3,4,5]]}

Where each inner array is a cluster of entry indices (0-based) that represent the same fact. Every entry must appear in exactly one cluster.`;

/**
 * AI-powered memory optimization using LLM semantic clustering.
 */
export class MemoryOptimizer {
	private deps: MemoryOptimizerDeps;
	private abortSignal: AbortSignal | null = null;
	private abortController: AbortController | null = null;

	constructor(deps: MemoryOptimizerDeps) {
		this.deps = deps;
	}

	cancel(): void {
		this.abortController?.abort();
	}

	/**
	 * AI-powered prune: uses an LLM to judge semantic similarity.
	 * Groups entries by category, then asks the LLM to cluster duplicates.
	 */
	async aiPrune(
		onProgress?: (update: ProgressUpdate) => void,
	): Promise<PruneResult> {
		this.abortController = new AbortController();
		this.abortSignal = this.abortController.signal;

		const startTime = Date.now();
		const entries = await this.deps.memoryStore.loadEntries();
		const beforeSize = JSON.stringify(entries).length;

		onProgress?.({
			stage: "loading",
			message: `Loaded ${entries.length} entries`,
			current: 0,
			total: 0,
		});

		if (this.abortSignal.aborted) {
			throw new Error("Cancelled by user");
		}

		const kept: MemoryEntry[] = [];
		let removed = 0;
		let groups = 0;

		// Group by category
		const byCategory = new Map<MemoryCategory, MemoryEntry[]>();
		for (const e of entries) {
			const list = byCategory.get(e.category) ?? [];
			list.push(e);
			byCategory.set(e.category, list);
		}

		const categories = Array.from(byCategory.entries());
		const totalCategories = categories.length;

		for (let catIdx = 0; catIdx < categories.length; catIdx++) {
			if (this.abortSignal.aborted) {
				throw new Error("Cancelled by user");
			}

			const [category, catEntries] = categories[catIdx];

			if (catEntries.length < 2) {
				kept.push(...catEntries);
				onProgress?.({
					stage: "clustering",
					message: `${category}: ${catEntries.length} entries — too few to cluster`,
					current: catIdx + 1,
					total: totalCategories,
					etaSeconds: this._estimateEta(startTime, catIdx, totalCategories),
				});
				continue;
			}

			onProgress?.({
				stage: "clustering",
				message: `${category}: clustering ${catEntries.length} entries...`,
				current: catIdx + 1,
				total: totalCategories,
				etaSeconds: this._estimateEta(startTime, catIdx, totalCategories),
			});

			const clusters = await this._clusterWithAI(category, catEntries);

			if (this.abortSignal.aborted) {
				throw new Error("Cancelled by user");
			}

			for (const cluster of clusters) {
				if (cluster.length === 1) {
					kept.push(catEntries[cluster[0]]);
				} else {
					groups++;
					const groupEntries = cluster.map((idx) => catEntries[idx]);
					groupEntries.sort((a, b) => {
						const lenDiff = b.content.length - a.content.length;
						if (lenDiff !== 0) return lenDiff;
						return a.timestamp.localeCompare(b.timestamp);
					});
					kept.push(groupEntries[0]);
					removed += cluster.length - 1;
				}
			}

			onProgress?.({
				stage: "clustering",
				message: `${category}: done — found ${clusters.filter(c => c.length > 1).length} duplicate groups`,
				current: catIdx + 1,
				total: totalCategories,
				etaSeconds: this._estimateEta(startTime, catIdx + 1, totalCategories),
			});
		}

		if (this.abortSignal.aborted) {
			throw new Error("Cancelled by user");
		}

		onProgress?.({
			stage: "pruning",
			message: `Saving ${kept.length} entries (removed ${removed} duplicates)...`,
			current: totalCategories,
			total: totalCategories,
		});

		// Preserve original order
		const idSet = new Set(kept.map((e) => e.id));
		const finalEntries = entries.filter((e) => idSet.has(e.id));

		await this.deps.memoryStore.saveEntries(finalEntries);

		const afterSize = JSON.stringify(finalEntries).length;
		this.deps.logger?.log(
			"info",
			`AI prune complete: removed ${removed}, kept ${kept.length}, saved ${beforeSize - afterSize} bytes`,
		);

		onProgress?.({
			stage: "done",
			message: `Done! Removed ${removed} duplicates (${groups} groups). Kept ${kept.length} entries.`,
			current: totalCategories,
			total: totalCategories,
		});

		return {
			removed,
			kept: kept.length,
			groups,
			bytesBefore: beforeSize,
			bytesAfter: afterSize,
		};
	}

	private _estimateEta(startTime: number, current: number, total: number): number | undefined {
		if (current <= 0 || current >= total) return undefined;
		const elapsed = Date.now() - startTime;
		const avgPerItem = elapsed / current;
		const remaining = (total - current) * avgPerItem;
		return Math.ceil(remaining / 1000);
	}

	private async _clusterWithAI(
		category: MemoryCategory,
		entries: MemoryEntry[],
	): Promise<number[][]> {
		if (this.abortSignal?.aborted) {
			throw new Error("Cancelled by user");
		}

		const lines = entries.map((e, i) => `${i}. [${e.timestamp}] ${e.content}`);
		const prompt = `Category: ${category}\n\nEntries:\n${lines.join("\n")}\n\nGroup these entries into clusters of duplicates. Return ONLY JSON: {"clusters":[[...]]}`;

		try {
			const response = await this.deps.chatApi.callApi(
				SYSTEM_PROMPT,
				prompt,
			);

			if (this.abortSignal?.aborted) {
				throw new Error("Cancelled by user");
			}

			const clusters = this._parseClusters(response, entries.length);
			if (clusters) {
				return clusters;
			}
		} catch (e) {
			if (e instanceof Error && e.message === "Cancelled by user") throw e;
			this.deps.logger?.log("warn", `AI clustering failed for ${category}: ${e}`);
		}

		// Fallback: each entry in its own cluster (no pruning)
		return entries.map((_, i) => [i]);
	}

	private _parseClusters(response: string, entryCount: number): number[][] | null {
		const jsonMatch = response.match(/\{[\s\S]*"clusters"[\s\S]*\}/);
		if (!jsonMatch) return null;

		try {
			const parsed = JSON.parse(jsonMatch[0]);
			if (!Array.isArray(parsed.clusters)) return null;

			const clusters: number[][] = [];
			const seen = new Set<number>();

			for (const cluster of parsed.clusters) {
				if (!Array.isArray(cluster)) continue;
				const validIndices = cluster
					.map((i) => Number(i))
					.filter((i) => Number.isInteger(i) && i >= 0 && i < entryCount && !seen.has(i));
				if (validIndices.length === 0) continue;
				for (const i of validIndices) seen.add(i);
				clusters.push(validIndices);
			}

			for (let i = 0; i < entryCount; i++) {
				if (!seen.has(i)) clusters.push([i]);
			}

			return clusters;
		} catch {
			return null;
		}
	}
}
