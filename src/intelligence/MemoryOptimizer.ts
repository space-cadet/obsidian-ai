import { ChatApiManager } from "../api";
import { MemoryStore, MemoryEntry, MemoryCategory, PruneResult } from "./MemoryStore";
import { FileLogger } from "../logger";

export interface MemoryOptimizerDeps {
	memoryStore: MemoryStore;
	chatApi: ChatApiManager;
	logger?: FileLogger;
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

	constructor(deps: MemoryOptimizerDeps) {
		this.deps = deps;
	}

	/**
	 * AI-powered prune: uses an LLM to judge semantic similarity.
	 * Groups entries by category, then asks the LLM to cluster duplicates.
	 */
	async aiPrune(): Promise<PruneResult> {
		const entries = await this.deps.memoryStore.loadEntries();
		const beforeSize = JSON.stringify(entries).length;

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

		for (const [category, catEntries] of byCategory) {
			if (catEntries.length < 2) {
				kept.push(...catEntries);
				continue;
			}

			const clusters = await this._clusterWithAI(category, catEntries);

			for (const cluster of clusters) {
				if (cluster.length === 1) {
					kept.push(catEntries[cluster[0]]);
				} else {
					groups++;
					// Keep the entry with the longest content (most detail)
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
		}

		// Preserve original order
		const idSet = new Set(kept.map((e) => e.id));
		const finalEntries = entries.filter((e) => idSet.has(e.id));

		await this.deps.memoryStore.saveEntries(finalEntries);

		const afterSize = JSON.stringify(finalEntries).length;
		this.deps.logger?.log(
			"info",
			`AI prune complete: removed ${removed}, kept ${kept.length}, saved ${beforeSize - afterSize} bytes`,
		);

		return {
			removed,
			kept: kept.length,
			groups,
			bytesBefore: beforeSize,
			bytesAfter: afterSize,
		};
	}

	private async _clusterWithAI(
		category: MemoryCategory,
		entries: MemoryEntry[],
	): Promise<number[][]> {
		// Build the prompt
		const lines = entries.map((e, i) => `${i}. [${e.timestamp}] ${e.content}`);
		const prompt = `Category: ${category}\n\nEntries:\n${lines.join("\n")}\n\nGroup these entries into clusters of duplicates. Return ONLY JSON: {"clusters":[[...]]}`;

		try {
			const response = await this.deps.chatApi.callApi(
				SYSTEM_PROMPT,
				prompt,
			);

			const clusters = this._parseClusters(response, entries.length);
			if (clusters) {
				return clusters;
			}
		} catch (e) {
			this.deps.logger?.log("warn", `AI clustering failed for ${category}: ${e}`);
		}

		// Fallback: each entry in its own cluster (no pruning)
		return entries.map((_, i) => [i]);
	}

	private _parseClusters(response: string, entryCount: number): number[][] | null {
		// Try to extract JSON from the response
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

			// Add any missing entries as singleton clusters
			for (let i = 0; i < entryCount; i++) {
				if (!seen.has(i)) clusters.push([i]);
			}

			return clusters;
		} catch {
			return null;
		}
	}
}
