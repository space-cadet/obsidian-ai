import React from "react";
import { ContextItem } from "../types";

export type AutoType = "mention" | "slash" | "wikilink";

export interface AutoCandidate {
	key: string;
	label: string;
	icon: string;
	type: AutoType;
	contextType?: ContextItem["type"];
	path?: string;
	name?: string;
	tag?: string;
	folderPath?: string;
}

export interface AutoState {
	type: AutoType;
	query: string;
	start: number;
	end: number;
	index: number;
}

export function detectAutocomplete(
	text: string,
	cursorPos: number,
): Omit<AutoState, "index"> | null {
	const beforeCursor = text.slice(0, cursorPos);
	const wikiMatch = beforeCursor.match(/\[\[([^\[\]]*)$/);
	if (wikiMatch) {
		return {
			type: "wikilink",
			query: wikiMatch[1],
			start: beforeCursor.lastIndexOf("[["),
			end: cursorPos,
		};
	}

	const mentionMatch = beforeCursor.match(/@([^@\s]*)$/);
	if (mentionMatch) {
		return {
			type: "mention",
			query: mentionMatch[1],
			start: beforeCursor.lastIndexOf("@"),
			end: cursorPos,
		};
	}

	const slashMatch = beforeCursor.match(/^\/([^/\s]*)$/);
	if (slashMatch) {
		return {
			type: "slash",
			query: slashMatch[1],
			start: 0,
			end: cursorPos,
		};
	}

	return null;
}

interface ReferenceTextOverlayProps {
	text: string;
	contextItems: ContextItem[];
	contentRef: React.RefObject<HTMLDivElement>;
}

function getReferenceMatches(text: string, contextItems: ContextItem[]) {
	const contextNames = contextItems
		.map((item) => {
			switch (item.type) {
				case "note":
					return { name: item.name, isFolder: false };
				case "folder":
					return { name: item.name, isFolder: true };
				case "tag":
					return { name: item.tag, isFolder: false };
				case "active-note":
					return { name: "Active note", isFolder: false };
			}
		})
		.filter((reference): reference is { name: string; isFolder: boolean } =>
			Boolean(reference?.name),
		)
		.sort((a, b) => b.name.length - a.name.length);

	const matches: Array<{
		start: number;
		end: number;
		text: string;
		isFolder?: boolean;
		isContextReference?: boolean;
	}> = [];
	for (const regex of [/@([^\s]+)/g, /\[\[([^\]]+)\]\]/g]) {
		let match: RegExpExecArray | null;
		while ((match = regex.exec(text)) !== null) {
			matches.push({
				start: match.index,
				end: match.index + match[0].length,
				text: match[0],
			});
		}
	}

	for (const reference of contextNames) {
		let searchFrom = 0;
		while (searchFrom < text.length) {
			const start = text.indexOf(reference.name, searchFrom);
			if (start < 0) break;
			matches.push({
				start,
				end: start + reference.name.length,
				text: reference.name,
				isFolder: reference.isFolder,
				isContextReference: true,
			});
			searchFrom = start + reference.name.length;
		}
	}

	return matches.sort((a, b) => a.start - b.start || b.end - a.end);
}

export function hasReferenceDecoration(
	text: string,
	contextItems: ContextItem[],
) {
	return getReferenceMatches(text, contextItems).length > 0;
}

/** Draws reference pills without participating in text layout or input. */
export const ReferenceTextOverlay: React.FC<ReferenceTextOverlayProps> = ({
	text,
	contextItems,
	contentRef,
}) => {
	const matches = getReferenceMatches(text, contextItems);
	if (matches.length === 0) return null;
	const parts: React.ReactNode[] = [];
	let lastIndex = 0;
	for (const match of matches) {
		if (match.start < lastIndex) continue;
		if (match.start > lastIndex)
			parts.push(text.slice(lastIndex, match.start));
		parts.push(
			<span
				key={`${match.start}:${match.end}`}
				className={`chat-mention-pill${match.isContextReference ? " chat-mention-pill-reference" : ""}${match.isFolder ? " chat-mention-pill-folder" : ""}`}
			>
				{match.text}
			</span>,
		);
		lastIndex = match.end;
	}
	if (lastIndex < text.length) parts.push(text.slice(lastIndex));

	return (
		<div className="chat-textarea-overlay" aria-hidden="true">
			<div ref={contentRef} className="chat-textarea-overlay-text">
				{parts}
				{text.endsWith("\n") ? "\u00a0" : null}
			</div>
		</div>
	);
};

interface AutocompleteMenuProps {
	candidates: AutoCandidate[];
	activeIndex: number;
	onChoose: (candidate: AutoCandidate) => void;
	onHover: (index: number) => void;
}

export const AutocompleteMenu: React.FC<AutocompleteMenuProps> = ({
	candidates,
	activeIndex,
	onChoose,
	onHover,
}) => (
	<div className="chat-mention-dropdown">
		{candidates.map((candidate, index) => (
			<div
				key={candidate.key}
				className={`chat-mention-item${index === activeIndex ? " chat-mention-item-active" : ""}`}
				onMouseDown={(event) => {
					event.preventDefault();
					onChoose(candidate);
				}}
				onMouseEnter={() => onHover(index)}
			>
				<span className="chat-mention-icon">{candidate.icon}</span>
				<span className="chat-mention-label">
					{candidate.label}
					{candidate.folderPath && (
						<span className="chat-mention-folder">
							{candidate.folderPath}
						</span>
					)}
				</span>
			</div>
		))}
	</div>
);
