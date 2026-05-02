import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { App, TFile, TFolder } from "obsidian";
import { ContextItem } from "../types";

interface ChatInputProps {
	app: App;
	onSend: (text: string) => void;
	onStop: () => void;
	onAddMention: (item: ContextItem) => void;
	isStreaming: boolean;
}

interface MentionCandidate {
	key: string;
	label: string;
	icon: string;
	type: ContextItem["type"];
	// Extra data for creating the ContextItem
	path?: string;
	name?: string;
	tag?: string;
}

function makeId(): string {
	return crypto.randomUUID();
}

function detectMention(
	text: string,
	cursorPos: number,
): { query: string; start: number } | null {
	const beforeCursor = text.slice(0, cursorPos);
	const match = beforeCursor.match(/@([^@\s]*)$/);
	if (match) {
		const start = beforeCursor.lastIndexOf("@");
		return { query: match[1], start };
	}
	return null;
}

const ChatInput: React.FC<ChatInputProps> = ({
	app,
	onSend,
	onStop,
	onAddMention,
	isStreaming,
}) => {
	const [value, setValue] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [mention, setMention] = useState<{
		query: string;
		start: number;
		index: number;
	} | null>(null);

	const allCandidates = useMemo(() => {
		const candidates: MentionCandidate[] = [];
		// Notes
		for (const file of app.vault.getMarkdownFiles().sort(
			(a, b) => b.stat.mtime - a.stat.mtime,
		)) {
			candidates.push({
				key: `note:${file.path}`,
				label: file.basename,
				icon: "📄",
				type: "note",
				path: file.path,
				name: file.basename,
			});
		}
		// Folders
		for (const folder of app.vault
			.getAllLoadedFiles()
			.filter((f): f is TFolder => f instanceof TFolder)
			.sort((a, b) => a.path.localeCompare(b.path))) {
			candidates.push({
				key: `folder:${folder.path}`,
				label:
					folder.path === ""
						? "(vault root)"
						: folder.name,
				icon: "📁",
				type: "folder",
				path: folder.path,
				name:
					folder.path === ""
						? "(vault root)"
						: folder.name,
			});
		}
		// Tags
		const tagMap = (app.metadataCache as any).getTags() as Record<
			string,
			number
		>;
		for (const [tag, count] of Object.entries(tagMap)) {
			candidates.push({
				key: `tag:${tag}`,
				label: `${tag} (${count})`,
				icon: "#",
				type: "tag",
				tag,
			});
		}
		return candidates;
	}, [app]);

	const filteredCandidates = useMemo(() => {
		if (!mention) return [];
		const q = mention.query.toLowerCase();
		if (!q) return allCandidates.slice(0, 10);
		return allCandidates
			.filter((c) => c.label.toLowerCase().includes(q))
			.slice(0, 10);
	}, [allCandidates, mention]);

	const handleInputChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			const text = e.target.value;
			const cursorPos = e.target.selectionStart;
			setValue(text);

			const detected = detectMention(text, cursorPos);
			if (detected) {
				setMention({
					query: detected.query,
					start: detected.start,
					index: 0,
				});
			} else {
				setMention(null);
			}
		},
		[],
	);

	const insertMention = useCallback(
		(candidate: MentionCandidate) => {
			if (!mention) return;
			// Remove the @query text from the input
			const before = value.slice(0, mention.start);
			const after = value.slice(
				textareaRef.current?.selectionStart ?? value.length,
			);
			const newValue = before + after;
			setValue(newValue);
			setMention(null);

			// Create ContextItem
			let item: ContextItem;
			if (candidate.type === "note") {
				item = {
					type: "note",
					path: candidate.path!,
					name: candidate.name!,
					id: makeId(),
				};
			} else if (candidate.type === "folder") {
				item = {
					type: "folder",
					path: candidate.path!,
					name: candidate.name!,
					id: makeId(),
				};
			} else {
				item = {
					type: "tag",
					tag: candidate.tag!,
					id: makeId(),
				};
			}
			onAddMention(item);

			// Refocus textarea
			setTimeout(() => textareaRef.current?.focus(), 0);
		},
		[mention, value, onAddMention],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (mention && filteredCandidates.length > 0) {
				if (e.key === "ArrowDown") {
					e.preventDefault();
					setMention((prev) =>
						prev
							? {
									...prev,
									index:
										(prev.index + 1) %
										filteredCandidates.length,
								}
							: prev,
					);
					return;
				}
				if (e.key === "ArrowUp") {
					e.preventDefault();
					setMention((prev) =>
						prev
							? {
									...prev,
									index:
										(prev.index -
											1 +
											filteredCandidates.length) %
										filteredCandidates.length,
								}
							: prev,
					);
					return;
				}
				if (e.key === "Enter") {
					e.preventDefault();
					insertMention(filteredCandidates[mention.index]);
					return;
				}
				if (e.key === "Escape") {
					e.preventDefault();
					setMention(null);
					return;
				}
			}

			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				const trimmed = value.trim();
				if (trimmed && !isStreaming) {
					onSend(trimmed);
					setValue("");
					setMention(null);
				}
			}
		},
		[
			mention,
			filteredCandidates,
			insertMention,
			value,
			isStreaming,
			onSend,
		],
	);

	return (
		<div style={{ position: "relative" }}>
			{mention && filteredCandidates.length > 0 && (
				<div className="chat-mention-dropdown">
					{filteredCandidates.map((candidate, i) => (
						<div
							key={candidate.key}
							className={`chat-mention-item${i === mention.index ? " chat-mention-item-active" : ""}`}
							onMouseDown={(e) => {
								e.preventDefault();
								insertMention(candidate);
							}}
							onMouseEnter={() =>
								setMention((prev) =>
									prev ? { ...prev, index: i } : prev,
								)
							}
						>
							<span className="chat-mention-icon">
								{candidate.icon}
							</span>
							<span className="chat-mention-label">
								{candidate.label}
							</span>
						</div>
					))}
				</div>
			)}
			<div className="chat-input-area">
				<textarea
					ref={textareaRef}
					className="chat-textarea"
					rows={2}
					placeholder="Ask anything... (Shift+Enter for new line)"
					value={value}
					onChange={handleInputChange}
					onKeyDown={handleKeyDown}
					disabled={isStreaming}
				/>
				{isStreaming ? (
					<button
						className="chat-btn chat-stop-btn"
						onClick={onStop}
					>
						⏹ Stop
					</button>
				) : (
					<button
						className="chat-btn chat-send-btn"
						onClick={() => {
							const trimmed = value.trim();
							if (trimmed) {
								onSend(trimmed);
								setValue("");
								setMention(null);
							}
						}}
						disabled={!value.trim()}
					>
						Send
					</button>
				)}
			</div>
		</div>
	);
};

export default ChatInput;
