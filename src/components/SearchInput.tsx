import React, { useState, useCallback, useRef } from "react";
import ObsidianIcon from "./ObsidianIcon";

interface SearchInputProps {
	onSearch: (query: string) => void;
	placeholder?: string;
}

const SearchInput: React.FC<SearchInputProps> = ({
	onSearch,
	placeholder = "Search chats…",
}) => {
	const [query, setQuery] = useState("");
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const emitSearch = useCallback(
		(newQuery: string) => {
			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
			}
			debounceRef.current = setTimeout(() => {
				onSearch(newQuery.trim());
			}, 300);
		},
		[onSearch],
	);

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const value = e.target.value;
			setQuery(value);
			emitSearch(value);
		},
		[emitSearch],
	);

	const handleClear = useCallback(() => {
		setQuery("");
		if (debounceRef.current) {
			clearTimeout(debounceRef.current);
		}
		onSearch("");
	}, [onSearch]);

	return (
		<div className="chat-search-input-wrapper">
			<ObsidianIcon icon="search" size={14} />
			<input
				type="text"
				className="chat-search-input"
				value={query}
				onChange={handleChange}
				placeholder={placeholder}
				aria-label="Search chats"
			/>
			{query && (
				<button
					className="chat-search-clear"
					onClick={handleClear}
					title="Clear search"
					aria-label="Clear search"
				>
					<ObsidianIcon icon="x" size={14} />
				</button>
			)}
		</div>
	);
};

export default SearchInput;
