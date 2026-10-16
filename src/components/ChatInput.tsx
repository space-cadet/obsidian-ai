import React, {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { App, Notice, TFolder } from "obsidian";
import type { Attachment, ContextItem } from "../types";
import { createExternalAttachment } from "../context/AttachmentEngine";
import { ChatPluginLike } from "../views/ObsidianAIChatView";
import ChatInputAttachments from "./ChatInputAttachments";
import {
	AutocompleteMenu,
	AutoCandidate,
	AutoState,
	detectAutocomplete,
	ReferenceTextOverlay,
} from "./ChatInputDecorations";

interface ChatInputProps {
	app: App;
	plugin: ChatPluginLike;
	contextItems: ContextItem[];
	onSend: (text: string, attachments?: Attachment[]) => void;
	onStop: () => void;
	onAddMention: (item: ContextItem) => void;
	isStreaming: boolean;
	isEditing?: boolean;
	onCancel?: () => void;
	editMessage?: string;
	thinkingEnabled?: boolean;
	onToggleThinking?: () => void;
	attachments?: Attachment[];
	onAttachmentsChange?: (attachments: Attachment[]) => void;
	pressEnterToSend?: boolean;
	tokenTotal?: string;
	draft?: string;
	onDraftChange?: (text: string) => void;
	onTyping?: () => void;
}

const SLASH_COMMANDS: AutoCandidate[] = [
	{
		key: "slash:edit",
		label: "/edit [[Note]] prompt",
		icon: "✏️",
		type: "slash",
	},
	{
		key: "slash:create",
		label: "/create [[Note]] prompt",
		icon: "📝",
		type: "slash",
	},
	{
		key: "slash:append",
		label: "/append [[Note]] prompt",
		icon: "➕",
		type: "slash",
	},
];

function makeId(): string {
	return crypto.randomUUID();
}

function buildCandidates(
	app: App,
	plugin: ChatPluginLike,
	type: AutoState["type"],
): AutoCandidate[] {
	if (type === "slash") return SLASH_COMMANDS;

	const candidates: AutoCandidate[] = app.vault
		.getMarkdownFiles()
		.sort((a, b) => b.stat.mtime - a.stat.mtime)
		.map((file) => ({
			key: `note:${file.path}`,
			label: file.basename,
			icon: "📄",
			type,
			contextType: "note",
			path: file.path,
			name: file.basename,
		}));

	const basenameCounts = new Map<string, number>();
	for (const candidate of candidates) {
		basenameCounts.set(
			candidate.label,
			(basenameCounts.get(candidate.label) ?? 0) + 1,
		);
	}
	const pathDisplay = plugin.settings.contextPickerPathDisplay;
	for (const candidate of candidates) {
		if (!candidate.path) continue;
		const duplicate = (basenameCounts.get(candidate.label) ?? 0) > 1;
		if (
			pathDisplay === "always" ||
			(pathDisplay === "duplicates" && duplicate)
		) {
			const lastSlash = candidate.path.lastIndexOf("/");
			candidate.folderPath =
				lastSlash > 0 ? candidate.path.slice(0, lastSlash) : "";
		}
	}

	if (type === "mention") {
		const folders = app.vault
			.getAllLoadedFiles()
			.filter((file): file is TFolder => file instanceof TFolder)
			.sort((a, b) => a.path.localeCompare(b.path));
		for (const folder of folders) {
			const isRoot = folder.path === "";
			candidates.push({
				key: `folder:${folder.path}`,
				label: isRoot ? "(vault root)" : folder.name,
				icon: "📁",
				type,
				contextType: "folder",
				path: folder.path,
				name: isRoot ? "(vault root)" : folder.name,
				folderPath: isRoot ? "" : folder.path,
			});
		}
		const tags = (app.metadataCache as any).getTags() as Record<
			string,
			number
		>;
		for (const [tag, count] of Object.entries(tags ?? {})) {
			candidates.push({
				key: `tag:${tag}`,
				label: `${tag} (${count})`,
				icon: "#",
				type,
				contextType: "tag",
				tag,
			});
		}
	}
	return candidates;
}

function rankCandidates(
	candidates: AutoCandidate[],
	query: string,
): AutoCandidate[] {
	const normalized = query.toLowerCase().trim();
	if (!normalized) return candidates;
	return candidates
		.map((candidate) => {
			const label = candidate.label.toLowerCase();
			const path = (candidate.path ?? "").toLowerCase();
			let score = 0;
			if (label === normalized || path === normalized) score = 100;
			else if (label.startsWith(normalized)) score = 80;
			else if (path.startsWith(normalized)) score = 70;
			else if (label.includes(normalized)) score = 60;
			else if (path.includes(normalized)) score = 50;
			else {
				const words = normalized.split(/\s+/).filter(Boolean);
				if (words.every((word) => label.includes(word))) score = 40;
				else if (words.every((word) => path.includes(word))) score = 30;
			}
			return { candidate, score };
		})
		.filter((entry) => entry.score > 0)
		.sort((a, b) => b.score - a.score)
		.map((entry) => entry.candidate);
}

const ChatInput: React.FC<ChatInputProps> = ({
	app,
	plugin,
	contextItems,
	onSend,
	onStop,
	onAddMention,
	isStreaming,
	isEditing = false,
	onCancel,
	editMessage,
	thinkingEnabled,
	onToggleThinking,
	attachments = [],
	onAttachmentsChange,
	pressEnterToSend = true,
	tokenTotal,
	draft,
	onDraftChange,
	onTyping,
}) => {
	const [value, setValue] = useState(draft ?? "");
	const [auto, setAuto] = useState<AutoState | null>(null);
	const [isDragOver, setIsDragOver] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const overlayTextRef = useRef<HTMLDivElement>(null);
	const isComposingRef = useRef(false);
	const typingTimerRef = useRef<number | null>(null);

	const updateValue = useCallback(
		(nextValue: string) => {
			setValue(nextValue);
			onDraftChange?.(nextValue);
		},
		[onDraftChange],
	);

	// An edit replaces the editor contents once. Ordinary draft updates only
	// synchronize when the composer is not editing a previous message.
	useEffect(() => {
		if (editMessage === undefined) return;
		setValue(editMessage);
		setAuto(null);
		const timer = window.setTimeout(() => textareaRef.current?.focus(), 50);
		return () => window.clearTimeout(timer);
	}, [editMessage]);

	useEffect(() => {
		if (editMessage === undefined) setValue(draft ?? "");
	}, [draft, editMessage]);

	useEffect(
		() => () => {
			if (typingTimerRef.current !== null) {
				window.clearTimeout(typingTimerRef.current);
			}
		},
		[],
	);

	const syncOverlayScroll = useCallback(() => {
		const textarea = textareaRef.current;
		const overlay = overlayTextRef.current;
		if (textarea && overlay) {
			overlay.style.transform = `translateY(-${textarea.scrollTop}px)`;
		}
	}, []);

	useLayoutEffect(() => {
		const textarea = textareaRef.current;
		if (!textarea) return;
		textarea.style.height = "auto";
		textarea.style.height = `${Math.min(textarea.scrollHeight, 96)}px`;
		syncOverlayScroll();
	}, [value, syncOverlayScroll]);

	const allCandidates = useMemo(
		() => (auto ? buildCandidates(app, plugin, auto.type) : []),
		[app, auto?.type, plugin],
	);
	const filteredCandidates = useMemo(
		() => (auto ? rankCandidates(allCandidates, auto.query) : []),
		[allCandidates, auto],
	);

	const handleTextChange = useCallback(
		(event: React.ChangeEvent<HTMLTextAreaElement>) => {
			const textarea = event.currentTarget;
			const nextValue = textarea.value;
			updateValue(nextValue);
			if (!isComposingRef.current) {
				const detected = detectAutocomplete(
					nextValue,
					textarea.selectionStart,
				);
				setAuto(detected ? { ...detected, index: 0 } : null);
			}
			if (onTyping && typingTimerRef.current === null) {
				onTyping();
				typingTimerRef.current = window.setTimeout(() => {
					typingTimerRef.current = null;
				}, 2000);
			}
		},
		[onTyping, updateValue],
	);

	const handleCompositionEnd = useCallback(
		(event: React.CompositionEvent<HTMLTextAreaElement>) => {
			isComposingRef.current = false;
			const textarea = event.currentTarget;
			const detected = detectAutocomplete(
				textarea.value,
				textarea.selectionStart,
			);
			setAuto(detected ? { ...detected, index: 0 } : null);
		},
		[],
	);

	const insertCandidate = useCallback(
		(candidate: AutoCandidate) => {
			if (!auto) return;
			let replacement = candidate.label;
			if (auto.type === "slash") replacement += " ";
			if (auto.type === "wikilink")
				replacement = `[[${candidate.label}]]`;

			const nextValue =
				value.slice(0, auto.start) +
				replacement +
				value.slice(auto.end);
			updateValue(nextValue);
			setAuto(null);

			if (auto.type === "mention") {
				const id = makeId();
				if (candidate.contextType === "note" && candidate.path) {
					onAddMention({
						type: "note",
						path: candidate.path,
						name: candidate.name ?? candidate.label,
						id,
					});
				} else if (
					candidate.contextType === "folder" &&
					candidate.path !== undefined
				) {
					onAddMention({
						type: "folder",
						path: candidate.path,
						name: candidate.name ?? candidate.label,
						id,
					});
				} else if (candidate.contextType === "tag" && candidate.tag) {
					onAddMention({ type: "tag", tag: candidate.tag, id });
				}
			}

			window.setTimeout(() => {
				const textarea = textareaRef.current;
				if (!textarea) return;
				textarea.focus();
				const cursor = auto.start + replacement.length;
				textarea.setSelectionRange(cursor, cursor);
			}, 0);
		},
		[auto, onAddMention, updateValue, value],
	);

	const sendMessage = useCallback(() => {
		const trimmed = value.trim();
		if ((!trimmed && attachments.length === 0) || isStreaming) return;
		onSend(trimmed, attachments.length > 0 ? attachments : undefined);
		updateValue("");
		setAuto(null);
		onAttachmentsChange?.([]);
	}, [
		attachments,
		isStreaming,
		onAttachmentsChange,
		onSend,
		updateValue,
		value,
	]);

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (
				isComposingRef.current ||
				event.nativeEvent.isComposing ||
				event.keyCode === 229
			) {
				return;
			}
			if (auto && filteredCandidates.length > 0) {
				if (event.key === "ArrowDown" || event.key === "ArrowUp") {
					event.preventDefault();
					const delta = event.key === "ArrowDown" ? 1 : -1;
					setAuto((previous) =>
						previous
							? {
									...previous,
									index:
										(previous.index +
											delta +
											filteredCandidates.length) %
										filteredCandidates.length,
								}
							: previous,
					);
					return;
				}
				if (event.key === "Enter") {
					event.preventDefault();
					insertCandidate(
						filteredCandidates[auto.index] ?? filteredCandidates[0],
					);
					return;
				}
				if (event.key === "Escape") {
					event.preventDefault();
					setAuto(null);
					return;
				}
			}
			if (event.key !== "Enter") return;
			const shouldSend = pressEnterToSend
				? !event.shiftKey
				: event.shiftKey || event.metaKey || event.ctrlKey;
			if (shouldSend) {
				event.preventDefault();
				sendMessage();
			}
		},
		[
			auto,
			filteredCandidates,
			insertCandidate,
			pressEnterToSend,
			sendMessage,
		],
	);

	const handleFiles = useCallback(
		async (files: FileList | null) => {
			if (!files?.length) return;
			const added: Attachment[] = [];
			for (const file of Array.from(files)) {
				try {
					added.push(await createExternalAttachment(file));
				} catch (error) {
					new Notice(`Failed to attach file: ${file.name}`);
					console.error(
						"[ChatInput] Failed to attach external file:",
						error,
					);
				}
			}
			if (added.length > 0) {
				onAttachmentsChange?.([...attachments, ...added]);
			}
		},
		[attachments, onAttachmentsChange],
	);

	const clearDragState = (event: React.DragEvent) => {
		event.preventDefault();
		event.stopPropagation();
		setIsDragOver(false);
	};

	const placeholder = pressEnterToSend
		? "Ask anything... (Shift+Enter for new line)"
		: "Ask anything... (Enter for new line, Shift+Enter or Cmd/Ctrl+Enter to send)";
	const canSend = value.trim().length > 0 || attachments.length > 0;

	return (
		<div
			style={{ position: "relative" }}
			data-testid="chat-composer"
			onDragOver={(event) => {
				event.preventDefault();
				event.stopPropagation();
				setIsDragOver(true);
			}}
			onDragLeave={clearDragState}
			onDrop={(event) => {
				clearDragState(event);
				handleFiles(event.dataTransfer.files);
			}}
		>
			{auto && filteredCandidates.length > 0 && (
				<AutocompleteMenu
					candidates={filteredCandidates}
					activeIndex={auto.index}
					onChoose={insertCandidate}
					onHover={(index) =>
						setAuto((previous) =>
							previous ? { ...previous, index } : previous,
						)
					}
				/>
			)}
			<div
				className={`chat-input-wrapper${isDragOver ? " drag-over" : ""}`}
			>
				<div className="chat-input-row">
					<div className="chat-textarea-container">
						<ReferenceTextOverlay
							text={value}
							contextItems={contextItems}
							contentRef={overlayTextRef}
						/>
						<textarea
							ref={textareaRef}
							className="chat-textarea chat-textarea-with-overlay"
							rows={1}
							placeholder={placeholder}
							value={value}
							onChange={handleTextChange}
							onKeyDown={handleKeyDown}
							onCompositionStart={() => {
								isComposingRef.current = true;
								setAuto(null);
							}}
							onCompositionEnd={handleCompositionEnd}
							onScroll={syncOverlayScroll}
							disabled={isStreaming}
						/>
					</div>
					<div className="chat-input-right">
						{isStreaming ? (
							<button
								className="chat-btn chat-stop-btn chat-send-icon"
								type="button"
								onClick={onStop}
								title="Stop"
							>
								⏹
							</button>
						) : isEditing ? (
							<div className="chat-input-actions">
								<button
									className="chat-btn chat-send-btn chat-send-icon"
									type="button"
									onClick={sendMessage}
									disabled={!canSend}
									title="Resubmit"
								>
									▶
								</button>
								<button
									className="chat-btn chat-send-icon"
									type="button"
									onClick={() => {
										updateValue("");
										setAuto(null);
										onCancel?.();
									}}
									title="Cancel"
								>
									✕
								</button>
							</div>
						) : (
							<button
								className="chat-btn chat-send-btn chat-send-icon"
								type="button"
								onClick={sendMessage}
								disabled={!canSend}
								title="Send"
							>
								▶
							</button>
						)}
					</div>
				</div>
				<ChatInputAttachments
					app={app}
					attachments={attachments}
					onAttachmentsChange={onAttachmentsChange}
					onFiles={handleFiles}
					thinkingEnabled={thinkingEnabled}
					onToggleThinking={onToggleThinking}
					tokenTotal={tokenTotal}
				/>
			</div>
		</div>
	);
};

export default ChatInput;
