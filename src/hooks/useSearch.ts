import { useState, useRef, useCallback, useEffect } from "react";
import type { ChatSession } from "../types";
import { FuzzySearcher } from "../search/fuzzy-search";

export interface UseSearchResult {
	searchQuery: string;
	setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
	searchResults: any[];
	searchLoading: boolean;
	searchVisible: boolean;
	toggleSearch: () => void;
	handleSelectSearchResult: (
		sessionId: string,
		messageId: string | null,
	) => void;
}

export function useSearch(
	sessions: ChatSession[],
	openSessionInTab: (sessionId: string, messageId?: string) => void,
): UseSearchResult {
	const [searchQuery, setSearchQuery] = useState("");
	const [searchResults, setSearchResults] = useState<any[]>([]);
	const [searchLoading, setSearchLoading] = useState(false);
	const [searchVisible, setSearchVisible] = useState(false);
	const fuzzySearcherRef = useRef(new FuzzySearcher());

	useEffect(() => {
		if (!searchVisible || !searchQuery.trim()) {
			setSearchResults([]);
			return;
		}
		setSearchLoading(true);
		fuzzySearcherRef.current.setSessions(sessions);
		const results = fuzzySearcherRef.current.search(searchQuery);
		setSearchResults(results);
		setSearchLoading(false);
	}, [searchQuery, sessions, searchVisible]);

	const toggleSearch = useCallback(() => {
		setSearchVisible((v) => !v);
		if (searchVisible) {
			setSearchQuery("");
			setSearchResults([]);
		}
	}, [searchVisible]);

	const handleSelectSearchResult = useCallback(
		(sessionId: string, messageId: string | null) => {
			openSessionInTab(sessionId, messageId ?? undefined);
			setSearchQuery("");
			setSearchResults([]);
			setSearchVisible(false);
		},
		[openSessionInTab],
	);

	return {
		searchQuery,
		setSearchQuery,
		searchResults,
		searchLoading,
		searchVisible,
		toggleSearch,
		handleSelectSearchResult,
	};
}
