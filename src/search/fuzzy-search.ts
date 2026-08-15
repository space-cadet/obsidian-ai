import type { ChatSession, ChatMessage } from "../types";

export interface FuzzySearchResult {
	sessionId: string;
	messageId: string | null; // null for session-title matches
	timestamp: number;
	snippet: string;
	highlights: Array<{ start: number; end: number }>;
	score: number;
	sessionTitle: string;
	isTitleMatch: boolean;
}

interface SearchableItem {
	sessionId: string;
	sessionTitle: string;
	messageId: string | null;
	text: string;
	timestamp: number;
	isTitle: boolean;
}

function tokenizeForFuzzy(text: string): string {
	return text.toLowerCase().replace(/[^\w\s]/g, " ");
}

/**
 * Simple fuzzy match scoring.
 * Returns a score between 0 and 1, where 1 is an exact substring match
 * and lower values mean the characters are spread farther apart.
 */
function fuzzyScore(text: string, query: string): number {
	if (!query) return 1;
	if (!text) return 0;
	if (text.includes(query)) return 1;

	let ti = 0;
	let qi = 0;
	let totalGap = 0;
	let matches = 0;
	let lastMatchIndex = -1;

	while (ti < text.length && qi < query.length) {
		if (text[ti] === query[qi]) {
			if (lastMatchIndex >= 0) {
				totalGap += ti - lastMatchIndex - 1;
			}
			lastMatchIndex = ti;
			qi++;
			matches++;
		}
		ti++;
	}

	if (qi < query.length) return 0; // not all query chars matched

	// Score: fraction of query matched (always 1 here) penalized by gaps
	const gapPenalty = Math.min(totalGap / (text.length || 1), 0.6);
	return 1 - gapPenalty;
}

/**
 * Compute highlight regions for a fuzzy match.
 * Returns sorted, non-overlapping ranges of matched characters.
 */
function computeHighlights(
	text: string,
	query: string,
): Array<{ start: number; end: number }> {
	const highlights: Array<{ start: number; end: number }> = [];
	let ti = 0;
	let qi = 0;
	let currentStart = -1;
	let currentEnd = -1;

	while (ti < text.length && qi < query.length) {
		if (text[ti] === query[qi]) {
			if (currentStart === -1) {
				currentStart = ti;
			}
			currentEnd = ti + 1;
			qi++;
		} else {
			if (currentStart !== -1) {
				highlights.push({ start: currentStart, end: currentEnd });
				currentStart = -1;
				currentEnd = -1;
			}
		}
		ti++;
	}

	if (currentStart !== -1) {
		highlights.push({ start: currentStart, end: currentEnd });
	}

	return highlights;
}

/**
 * Extract a snippet around the first highlight, centered and clamped to
 * a maximum length. If no highlights, returns the start of the text.
 */
function extractSnippet(
	text: string,
	highlights: Array<{ start: number; end: number }>,
	maxLen = 160,
): string {
	if (!text) return "";
	if (text.length <= maxLen) return text;

	const first = highlights[0];
	if (!first) return text.slice(0, maxLen);

	const center = (first.start + first.end) / 2;
	let start = Math.max(0, Math.floor(center - maxLen / 2));
	let end = Math.min(text.length, start + maxLen);

	if (end - start < maxLen) {
		start = Math.max(0, end - maxLen);
	}

	return text.slice(start, end);
}

/**
 * Adjust highlights to be relative to the snippet, and clip them.
 */
function adjustHighlights(
	highlights: Array<{ start: number; end: number }>,
	snippetStart: number,
	snippetLength: number,
): Array<{ start: number; end: number }> {
	return highlights
		.map((h) => ({
			start: h.start - snippetStart,
			end: h.end - snippetStart,
		}))
		.filter((h) => h.end > 0 && h.start < snippetLength)
		.map((h) => ({
			start: Math.max(0, h.start),
			end: Math.min(snippetLength, h.end),
		}));
}

/**
 * Fuzzy searcher for chat sessions.
 * Searches across session titles and message content.
 */
export class FuzzySearcher {
	private sessions: ChatSession[] = [];
	private indexBuilt = false;

	/**
	 * Set the sessions to search. Call this whenever sessions change.
	 */
	setSessions(sessions: ChatSession[]): void {
		this.sessions = sessions;
		this.indexBuilt = false;
	}

	/**
	 * Search for the given query and return results above the threshold (0.4).
	 * Results are sorted by score descending, then by timestamp descending.
	 */
	search(query: string): FuzzySearchResult[] {
		if (!query.trim()) return [];

		const normalizedQuery = query.toLowerCase().trim();
		const items = this.buildSearchables();
		const results: FuzzySearchResult[] = [];

		for (const item of items) {
			const score = fuzzyScore(item.text, normalizedQuery);
			if (score >= 0.4) {
				const highlights = computeHighlights(
					item.text,
					normalizedQuery,
				);
				const snippet = extractSnippet(item.text, highlights);
				const adjustedHighlights = adjustHighlights(
					highlights,
					item.text.indexOf(snippet),
					snippet.length,
				);
				results.push({
					sessionId: item.sessionId,
					messageId: item.messageId,
					timestamp: item.timestamp,
					snippet,
					highlights: adjustedHighlights,
					score,
					sessionTitle: item.sessionTitle,
					isTitleMatch: item.isTitle,
				});
			}
		}

		results.sort((a, b) => {
			if (b.score !== a.score) return b.score - a.score;
			return b.timestamp - a.timestamp;
		});

		return results;
	}

	/**
	 * Build a flat list of searchable items from all sessions.
	 * Title is included as its own item; each message is an item.
	 */
	private buildSearchables(): SearchableItem[] {
		const items: SearchableItem[] = [];
		for (const session of this.sessions) {
			const titleText = tokenizeForFuzzy(session.title || "Untitled");
			items.push({
				sessionId: session.id,
				sessionTitle: session.title || "Untitled",
				messageId: null,
				text: titleText,
				timestamp: session.updatedAt,
				isTitle: true,
			});
			for (const message of session.messages) {
				const msgText = tokenizeForFuzzy(message.content || "");
				if (!msgText.trim()) continue;
				items.push({
					sessionId: session.id,
					sessionTitle: session.title || "Untitled",
					messageId: message.id,
					text: msgText,
					timestamp: message.timestamp,
					isTitle: false,
				});
			}
		}
		return items;
	}
}
