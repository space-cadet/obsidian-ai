import React, { useCallback } from "react";
import ObsidianIcon from "./ObsidianIcon";
import type { FuzzySearchResult } from "../search/fuzzy-search";

interface SearchResultsProps {
	results: FuzzySearchResult[];
	loading: boolean;
	query: string;
	onSelectSession: (sessionId: string) => void;
}

const SearchResults: React.FC<SearchResultsProps> = ({
	results,
	loading,
	query,
	onSelectSession,
}) => {
	const handleClick = useCallback(
		(sessionId: string) => {
			onSelectSession(sessionId);
		},
		[onSelectSession],
	);

	if (loading) {
		return (
			<div className="chat-search-results">
				<div className="chat-search-loading">
					<ObsidianIcon icon="refresh-cw" size={16} />
					<span>Searching…</span>
				</div>
			</div>
		);
	}

	if (!query.trim()) {
		return (
			<div className="chat-search-results chat-search-results-empty">
				<ObsidianIcon icon="search" size={24} />
				<p>Type to search across chats</p>
			</div>
		);
	}

	if (results.length === 0) {
		return (
			<div className="chat-search-results chat-search-results-empty">
				<ObsidianIcon icon="x" size={24} />
				<p>No results for “{query}”</p>
			</div>
		);
	}

	return (
		<div className="chat-search-results">
			<div className="chat-search-results-count">
				{results.length} result{results.length === 1 ? "" : "s"}
			</div>
			{results.map((result) => (
				<button
					key={`${result.sessionId}-${result.messageId ?? "title"}`}
					className="chat-search-result-item"
					onClick={() => handleClick(result.sessionId)}
					title={result.isTitleMatch ? "Session title" : "Message match"}
				>
					<div className="chat-search-result-title">
						<ObsidianIcon icon="message-square" size={12} />
						<span>{result.sessionTitle}</span>
						{result.isTitleMatch && (
							<span className="chat-search-result-badge">title</span>
						)}
					</div>
					<div className="chat-search-result-snippet">
						{renderHighlightedSnippet(result.snippet, result.highlights)}
					</div>
				</button>
			))}
		</div>
	);
};

/**
 * Render a snippet with highlighted ranges as spans.
 * Ranges are assumed to be sorted and non-overlapping.
 */
function renderHighlightedSnippet(
	snippet: string,
	highlights: Array<{ start: number; end: number }>,
): React.ReactNode {
	if (!highlights || highlights.length === 0) {
		return <span>{snippet}</span>;
	}

	const nodes: React.ReactNode[] = [];
	let cursor = 0;

	for (const { start, end } of highlights) {
		if (start > cursor) {
			nodes.push(
				<span key={`text-${cursor}`}>{snippet.slice(cursor, start)}</span>,
			);
		}
		nodes.push(
			<mark key={`mark-${start}`} className="chat-search-highlight">
				{snippet.slice(start, end)}
			</mark>,
		);
		cursor = end;
	}

	if (cursor < snippet.length) {
		nodes.push(<span key={`text-${cursor}`}>{snippet.slice(cursor)}</span>);
	}

	return <>{nodes}</>;
}

export default SearchResults;
