import type { App } from "obsidian";
import type { ChatMessage } from "../types";

export interface SearchResult {
	sessionId: string;
	messageId: string;
	timestamp: number;
	snippet: string;
}

interface IndexEntry {
	sessionId: string;
	messageId: string;
	timestamp: number;
	snippet: string;
}

const STOP_WORDS = new Set([
	"a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "he",
	"in", "is", "it", "its", "of", "on", "that", "the", "to", "was", "will", "with",
	"you", "your", "i", "me", "my", "we", "our", "us", "they", "them", "their",
	"this", "these", "those", "or", "but", "not", "no", "yes", "if", "then", "else",
	"when", "where", "what", "who", "how", "why", "which", "than", "so", "too",
	"can", "could", "would", "should", "may", "might", "must", "shall", "will",
	"do", "does", "did", "done", "doing", "have", "had", "having",
]);

/** Lightweight inverted index for searching across session JSONL files. */
export class SearchIndex {
	private app: App;
	private manifestId: string;
	private index: Map<string, IndexEntry[]> | null = null;
	private lastBuildTime = 0;

	constructor(app: App, manifestId: string) {
		this.app = app;
		this.manifestId = manifestId;
	}

	/** Build the inverted index from all session JSONL files. */
	async buildIndex(): Promise<void> {
		const adapter = this.app.vault.adapter;
		const sessionsDir = `${this.app.vault.configDir}/plugins/${this.manifestId}/sessions`;
		const newIndex = new Map<string, IndexEntry[]>();

		if (!(await adapter.exists(sessionsDir))) {
			this.index = newIndex;
			this.lastBuildTime = Date.now();
			return;
		}

		const entries = await adapter.list(sessionsDir);
		const jsonlFiles = entries.files.filter((f) => f.endsWith(".jsonl"));

		for (const fileName of jsonlFiles) {
			const sessionId = fileName.replace(/\.jsonl$/, "");
			if (!sessionId) continue;

			const path = `${sessionsDir}/${fileName}`;
			let raw = "";
			try {
				raw = await adapter.read(path);
			} catch {
				continue;
			}

			if (!raw.trim()) continue;
			const lines = raw.split("\n").filter((l) => l.trim());

			for (const line of lines) {
				let message: ChatMessage;
				try {
					message = JSON.parse(line) as ChatMessage;
				} catch {
					continue;
				}

				const content = message.content ?? "";
				const snippet = content.slice(0, 200);
				const words = this.tokenize(content);
				const seen = new Set<string>();

				for (const word of words) {
					if (seen.has(word)) continue;
					seen.add(word);

					const entry: IndexEntry = {
						sessionId,
						messageId: message.id,
						timestamp: message.timestamp ?? 0,
						snippet,
					};

					const list = newIndex.get(word);
					if (list) {
						list.push(entry);
					} else {
						newIndex.set(word, [entry]);
					}
				}
			}
		}

		this.index = newIndex;
		this.lastBuildTime = Date.now();
	}

	/** Search for messages matching all query words. */
	async search(query: string): Promise<SearchResult[]> {
		if (!this.index || this.index.size === 0) {
			await this.buildIndex();
		}

		const words = this.tokenize(query);
		if (words.length === 0) return [];

		const index = this.index!;
		let results: Map<string, IndexEntry> | null = null;

		for (const word of words) {
			const entries = index.get(word);
			if (!entries) return [];

			const map = new Map<string, IndexEntry>();
			for (const entry of entries) {
				const key = `${entry.sessionId}::${entry.messageId}`;
				map.set(key, entry);
			}

			if (results === null) {
				results = map;
			} else {
				// Intersection: keep only entries present in both
				for (const key of results.keys()) {
					if (!map.has(key)) {
						results.delete(key);
					}
				}
			}

			if (results.size === 0) return [];
		}

		if (!results || results.size === 0) return [];

		const sorted = Array.from(results.values()).sort((a, b) => b.timestamp - a.timestamp);
		return sorted.map((e) => ({
			sessionId: e.sessionId,
			messageId: e.messageId,
			timestamp: e.timestamp,
			snippet: e.snippet,
		}));
	}

	/** Clear the cached index to force a rebuild on next search. */
	invalidate(): void {
		this.index = null;
		this.lastBuildTime = 0;
	}

	/** Get the last index build timestamp (0 if never built). */
	getLastBuildTime(): number {
		return this.lastBuildTime;
	}

	private tokenize(text: string): string[] {
		const normalized = text.toLowerCase();
		const words = normalized.match(/\b[a-z0-9]+\b/g) ?? [];
		return words.filter((w) => w.length > 1 && !STOP_WORDS.has(w));
	}
}
