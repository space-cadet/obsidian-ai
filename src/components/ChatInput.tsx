import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { App, TFile, TFolder } from "obsidian";
import { ContextItem } from "../types";

interface ChatInputProps {
	app: App;
	onSend: (text: string) => void;
	onStop: () => void;
	onAddMention: (item: ContextItem) => void;
	isStreaming: boolean;
	isEditing?: boolean;
	onCancel?: () => void;
	editMessage?: string;
	onToggleActiveNote?: () => void;
	hasActiveNote?: boolean;
	/** Whether thinking mode is enabled for LLM */
	thinkingEnabled?: boolean;
	/** Toggle thinking mode */
	onToggleThinking?: () => void;
	/** Whether to show thinking/reasoning content in messages */
	showThinking?: boolean;
}

type AutoType = "mention" | "slash" | "wikilink";

interface AutoCandidate {
	key: string;
	label: string;
	icon: string;
	type: AutoType;
	// Mention data
	contextType?: ContextItem["type"];
	path?: string;
	name?: string;
	tag?: string;
}

interface AutoState {
	type: AutoType;
	query: string;
	start: number;
	index: number;
}

function makeId(): string {
	return crypto.randomUUID();
}

function detectAutocomplete(
	text: string,
	cursorPos: number,
): Omit<AutoState, "index"> | null {
	const beforeCursor = text.slice(0, cursorPos);

	// 1. Wikilink [[ — check first so it beats mention when typing inside slash cmds
	const wikiMatch = beforeCursor.match(/\[\[([^\[\]]*)$/);
	if (wikiMatch) {
		const start = beforeCursor.lastIndexOf("[[");
		return { type: "wikilink", query: wikiMatch[1], start };
	}

	// 2. Mention @
	const mentionMatch = beforeCursor.match(/@([^@\s]*)$/);
	if (mentionMatch) {
		const start = beforeCursor.lastIndexOf("@");
		return { type: "mention", query: mentionMatch[1], start };
	}

	// 3. Slash command / — only at start of input
	const slashMatch = beforeCursor.match(/^\/([^/\s]*)$/);
	if (slashMatch) {
		return { type: "slash", query: slashMatch[1], start: 0 };
	}

	return null;
}

const SLASH_COMMANDS: AutoCandidate[] = [
	{ key: "slash:edit", label: "/edit [[Note]] prompt", icon: "✏️", type: "slash" },
	{ key: "slash:create", label: "/create [[Note]] prompt", icon: "📝", type: "slash" },
	{ key: "slash:append", label: "/append [[Note]] prompt", icon: "➕", type: "slash" },
];

const ChatInput: React.FC<ChatInputProps> = ({
	app,
	onSend,
	onStop,
	onAddMention,
	isStreaming,
	isEditing,
	onCancel,
	editMessage,
	onToggleActiveNote,
	hasActiveNote,
	thinkingEnabled,
	onToggleThinking,
	showThinking,
}) => {
	const [value, setValue] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [auto, setAuto] = useState<AutoState | null>(null);

	// Auto-resize textarea based on content
	useEffect(() => {
		const textarea = textareaRef.current;
		if (!textarea) return;
		// Reset to auto to shrink when deleting
		textarea.style.height = "auto";
		// Grow up to max 4 lines (~96px) then scroll
		const maxHeight = 96;
		const newHeight = Math.min(textarea.scrollHeight, maxHeight);
		textarea.style.height = newHeight + "px";
	}, [value]);

	useEffect(() => {
		if (editMessage !== undefined) {
			setValue(editMessage);
			setTimeout(() => textareaRef.current?.focus(), 50);
		}
	}, [editMessage]);

	const allCandidates = useMemo(() => {
		if (!auto) return [];

		if (auto.type === "slash") {
			return SLASH_COMMANDS;
		}

		const candidates: AutoCandidate[] = [];

		// Notes (for both mention and wikilink)
		for (const file of app.vault.getMarkdownFiles().sort(
			(a, b) => b.stat.mtime - a.stat.mtime,
		)) {
			candidates.push({
				key: `note:${file.path}`,
				label: file.basename,
				icon: "📄",
				type: auto.type,
				contextType: "note",
				path: file.path,
				name: file.basename,
			});
		}

		// Folders and tags only for mentions
		if (auto.type === "mention") {
			for (const folder of app.vault
				.getAllLoadedFiles()
				.filter((f): f is TFolder => f instanceof TFolder)
				.sort((a, b) => a.path.localeCompare(b.path))) {
				candidates.push({
					key: `folder:${folder.path}`,
					label: folder.path === "" ? "(vault root)" : folder.name,
					icon: "📁",
					type: "mention",
					contextType: "folder",
					path: folder.path,
					name: folder.path === "" ? "(vault root)" : folder.name,
				});
			}
			const tagMap = (app.metadataCache as any).getTags() as Record<
				string,
				number
			>;
			for (const [tag, count] of Object.entries(tagMap)) {
				candidates.push({
					key: `tag:${tag}`,
					label: `${tag} (${count})`,
					icon: "#",
					type: "mention",
					contextType: "tag",
					tag,
				});
			}
		}

		return candidates;
	}, [app, auto?.type]);

	const filteredCandidates = useMemo(() => {
		if (!auto) return [];
		const q = auto.query.toLowerCase();
		if (!q) return allCandidates.slice(0, 10);
		return allCandidates
			.filter((c) => c.label.toLowerCase().includes(q))
			.slice(0, 10);
	}, [allCandidates, auto]);

	const handleInputChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			const text = e.target.value;
			const cursorPos = e.target.selectionStart;
			setValue(text);

			const detected = detectAutocomplete(text, cursorPos);
			if (detected) {
				setAuto({ ...detected, index: 0 });
			} else {
				setAuto(null);
			}
		},
		[],
	);

	const insertCandidate = useCallback(
		(candidate: AutoCandidate) => {
			if (!auto) return;

			if (auto.type === "mention") {
				// Replace @query with the candidate name in the input
				const before = value.slice(0, auto.start);
				const after = value.slice(
					textareaRef.current?.selectionStart ?? value.length,
				);
				setValue(before + candidate.label + after);
				setAuto(null);

				// Create ContextItem
				let item: ContextItem;
				if (candidate.contextType === "note") {
					item = {
						type: "note",
						path: candidate.path!,
						name: candidate.name!,
						id: makeId(),
					};
				} else if (candidate.contextType === "folder") {
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
				setTimeout(() => textareaRef.current?.focus(), 0);
				return;
			}

			if (auto.type === "slash") {
				const replacement = candidate.label + " ";
				const before = value.slice(0, auto.start);
				const after = value.slice(
					textareaRef.current?.selectionStart ?? value.length,
				);
				const newValue = before + replacement + after;
				setValue(newValue);
				setAuto(null);
				setTimeout(() => {
					textareaRef.current?.focus();
					// Place cursor after the inserted command + space
					const pos = auto.start + replacement.length;
					textareaRef.current?.setSelectionRange(pos, pos);
				}, 0);
				return;
			}

			if (auto.type === "wikilink") {
				const replacement = `[[${candidate.label}]]`;
				const before = value.slice(0, auto.start);
				const after = value.slice(
					textareaRef.current?.selectionStart ?? value.length,
				);
				const newValue = before + replacement + after;
				setValue(newValue);
				setAuto(null);
				setTimeout(() => {
					textareaRef.current?.focus();
					const pos = auto.start + replacement.length;
					textareaRef.current?.setSelectionRange(pos, pos);
				}, 0);
				return;
			}
		},
		[auto, value, onAddMention],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (auto && filteredCandidates.length > 0) {
				if (e.key === "ArrowDown") {
					e.preventDefault();
					setAuto((prev) =>
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
					setAuto((prev) =>
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
					insertCandidate(filteredCandidates[auto.index]);
					return;
				}
				if (e.key === "Escape") {
					e.preventDefault();
					setAuto(null);
					return;
				}
			}

			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				const trimmed = value.trim();
				if (trimmed && !isStreaming) {
					onSend(trimmed);
					setValue("");
					setAuto(null);
				}
			}
		},
		[
			auto,
			filteredCandidates,
			insertCandidate,
			value,
			isStreaming,
			onSend,
		],
	);

	return (
		<div style={{ position: "relative" }}>
			{auto && filteredCandidates.length > 0 && (
				<div className="chat-mention-dropdown">
					{filteredCandidates.map((candidate, i) => (
						<div
							key={candidate.key}
							className={`chat-mention-item${i === auto.index ? " chat-mention-item-active" : ""}`}
							onMouseDown={(e) => {
								e.preventDefault();
								insertCandidate(candidate);
							}}
							onMouseEnter={() =>
								setAuto((prev) =>
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
				{onToggleActiveNote && (
					<button
						className={`chat-input-attach${hasActiveNote ? " is-active" : ""}`}
						onClick={onToggleActiveNote}
						title={hasActiveNote ? "Remove active note from context" : "Include active note as context"}
						type="button"
					>
						📎
					</button>
				)}
				{onToggleThinking && (
					<button
						className={`chat-input-thinking${thinkingEnabled ? " is-active" : ""}`}
						onClick={onToggleThinking}
						title={thinkingEnabled ? "Thinking mode ON — Click to disable" : "Thinking mode OFF — Click to enable"}
						type="button"
					>
						{thinkingEnabled ? "🧠" : "💤"}
					</button>
				)}
				<textarea
					ref={textareaRef}
					className="chat-textarea"
					rows={1}
					placeholder="Ask anything... (Shift+Enter for new line)"
					value={value}
					onChange={handleInputChange}
					onKeyDown={handleKeyDown}
					disabled={isStreaming}
				/>
				{isStreaming ? (
					<button
						className="chat-btn chat-stop-btn chat-send-icon"
						onClick={onStop}
						title="Stop"
					>
						⏹
					</button>
				) : isEditing ? (
					<div className="chat-input-actions">
						<button
							className="chat-btn chat-send-btn"
							onClick={() => {
								const trimmed = value.trim();
								if (trimmed) {
									onSend(trimmed);
									setValue("");
									setAuto(null);
								}
							}}
							disabled={!value.trim()}
						>
							Resubmit
						</button>
						<button
							className="chat-btn"
							onClick={() => {
								setValue("");
								setAuto(null);
								onCancel?.();
							}}
						>
							Cancel
						</button>
					</div>
				) : (
					<>
						{onToggleThinking && (
							<button
								className={`chat-btn chat-icon-btn${showThinking ? " is-active" : ""}`}
								onClick={onToggleThinking}
								title={showThinking ? "Hide thinking/reasoning" : "Show thinking/reasoning"}
								type="button"
							>
								💭
							</button>
						)}
						<button
							className="chat-btn chat-send-btn chat-send-icon"
							onClick={() => {
								const trimmed = value.trim();
								if (trimmed) {
									onSend(trimmed);
									setValue("");
									setAuto(null);
								}
							}}
							disabled={!value.trim()}
							title="Send"
						>
							▶
						</button>
					</>
				)}
			</div>
		</div>
	);
};

export default ChatInput;
