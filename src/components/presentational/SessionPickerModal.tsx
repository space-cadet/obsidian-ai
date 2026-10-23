import React, { useEffect, useRef, useState } from "react";
import { ChatSession } from "../../types";
import {
	getSessionTotalTokens,
	sessionMessageCount,
} from "../../lib/sessionUtils";
import { normalizeSessionTags } from "../../lib/sessionTags";
import type { ExportFormat } from "./ExportModal";
import { ObsidianIcon } from "../ObsidianIcon";

interface SessionPickerModalProps {
	sessions: ChatSession[];
	activeSessionId: string | null;
	onLoad: (sessionId: string) => void;
	onDelete: (sessionId: string) => void;
	onRename: (sessionId: string, newTitle: string) => void;
	onClose: () => void;
	onCopy?: (session: ChatSession, format: ExportFormat) => void;
	onExport?: (session: ChatSession, format: ExportFormat) => void;
	onUpdateTags?: (sessionId: string, tags: string[]) => void;
}

interface SessionTagManagerProps {
	session: ChatSession;
	availableTags: string[];
	onUpdateTags: (sessionId: string, tags: string[]) => void;
	onClose: () => void;
}

type TagOption =
	| { kind: "existing"; value: string }
	| { kind: "create"; value: string };

function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);

	if (minutes < 1) return "Just now";
	if (minutes < 60) return minutes + "m ago";
	if (hours < 24) return hours + "h ago";
	if (days < 7) return days + "d ago";
	return new Date(timestamp).toLocaleDateString();
}

function getSessionTitle(session: ChatSession): string {
	const firstUserMessage =
		session.hydrated === false
			? undefined
			: session.messages.find((message) => message.role === "user");
	return (
		session.title ||
		(firstUserMessage
			? firstUserMessage.content.slice(0, 40) +
				(firstUserMessage.content.length > 40 ? "…" : "")
			: "Chat " + new Date(session.createdAt).toLocaleDateString())
	);
}

function SessionTagManagerModal({
	session,
	availableTags,
	onUpdateTags,
	onClose,
}: SessionTagManagerProps) {
	const [query, setQuery] = useState("");
	const [isOpen, setIsOpen] = useState(false);
	const [activeOptionIndex, setActiveOptionIndex] = useState(-1);
	const currentTags = normalizeSessionTags(session.tags ?? []);
	const currentTagKeys = new Set(
		currentTags.map((tag) => tag.toLocaleLowerCase()),
	);
	const allTagKeys = new Set(
		availableTags.map((tag) => tag.toLocaleLowerCase()),
	);
	const normalizedQuery = query.trim();
	const matchingTags = availableTags
		.filter((tag) => !currentTagKeys.has(tag.toLocaleLowerCase()))
		.filter(
			(tag) =>
				!normalizedQuery ||
				tag
					.toLocaleLowerCase()
					.includes(normalizedQuery.toLocaleLowerCase()),
		)
		.slice(0, 20);
	const canCreateTag =
		normalizedQuery.length > 0 &&
		!allTagKeys.has(normalizedQuery.toLocaleLowerCase());
	const options: TagOption[] = [
		...matchingTags.map((value) => ({ kind: "existing" as const, value })),
		...(canCreateTag
			? [{ kind: "create" as const, value: normalizedQuery }]
			: []),
	];
	const title = getSessionTitle(session);

	const chooseTag = (tag: string) => {
		const nextTags = normalizeSessionTags([...currentTags, tag]);
		if (nextTags.length !== currentTags.length) {
			onUpdateTags(session.id, nextTags);
		}
		setQuery("");
		setActiveOptionIndex(-1);
		setIsOpen(true);
	};

	const handleInputKeyDown = (
		event: React.KeyboardEvent<HTMLInputElement>,
	) => {
		if (event.key === "ArrowDown" && options.length > 0) {
			event.preventDefault();
			setIsOpen(true);
			setActiveOptionIndex((index) =>
				index < 0 ? 0 : (index + 1) % options.length,
			);
		} else if (event.key === "ArrowUp" && options.length > 0) {
			event.preventDefault();
			setIsOpen(true);
			setActiveOptionIndex((index) =>
				index < 0
					? options.length - 1
					: (index - 1 + options.length) % options.length,
			);
		} else if (event.key === "Enter" && isOpen && options.length > 0) {
			event.preventDefault();
			chooseTag(options[activeOptionIndex]?.value ?? options[0].value);
		} else if (event.key === "Escape" && isOpen) {
			event.preventDefault();
			setIsOpen(false);
		}
	};

	return (
		<div
			className="chat-modal-overlay chat-session-tag-manager-overlay"
			onClick={(event) => {
				event.stopPropagation();
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div
				className="chat-modal chat-session-tag-manager"
				role="dialog"
				aria-modal="true"
				aria-labelledby="chat-session-tag-manager-title"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="chat-modal-header">
					<div className="chat-session-tag-manager-heading">
						<h3 id="chat-session-tag-manager-title">Manage tags</h3>
						<p title={title}>{title}</p>
					</div>
					<button
						type="button"
						className="chat-modal-close"
						onClick={onClose}
						aria-label="Close tag manager"
					>
						<ObsidianIcon icon="x" size={18} />
					</button>
				</div>
				<div className="chat-modal-body chat-session-tag-manager-body">
					<section className="chat-session-tag-manager-section">
						<h4>Current tags ({currentTags.length})</h4>
						{currentTags.length > 0 ? (
							<div className="chat-session-tag-manager-current">
								{currentTags.map((tag) => (
									<span
										className="chat-session-tag"
										key={tag}
									>
										<span>{tag}</span>
										<button
											type="button"
											aria-label={"Remove tag " + tag}
											title={"Remove " + tag}
											onClick={() =>
												onUpdateTags(
													session.id,
													currentTags.filter(
														(value) =>
															value !== tag,
													),
												)
											}
										>
											<ObsidianIcon icon="x" size={13} />
										</button>
									</span>
								))}
							</div>
						) : (
							<p className="chat-session-tag-manager-empty">
								This session has no tags yet.
							</p>
						)}
					</section>
					<section className="chat-session-tag-manager-section">
						<label
							className="chat-session-tag-manager-label"
							htmlFor="chat-session-tag-search"
						>
							Add tag
						</label>
						<div className="chat-session-tag-search">
							<ObsidianIcon icon="search" size={16} />
							<input
								id="chat-session-tag-search"
								role="combobox"
								aria-autocomplete="list"
								aria-expanded={isOpen}
								aria-controls={
									isOpen
										? "chat-session-tag-options"
										: undefined
								}
								aria-activedescendant={
									isOpen &&
									options.length > 0 &&
									activeOptionIndex >= 0
										? "chat-session-tag-option-" +
											activeOptionIndex
										: undefined
								}
								autoComplete="off"
								placeholder="Search or add a tag…"
								value={query}
								onFocus={() => setIsOpen(true)}
								onBlur={() => setIsOpen(false)}
								onChange={(event) => {
									setQuery(event.target.value);
									setActiveOptionIndex(-1);
									setIsOpen(true);
								}}
								onKeyDown={handleInputKeyDown}
							/>
						</div>
						{isOpen && (
							<div
								className="chat-session-tag-options"
								id="chat-session-tag-options"
								role="listbox"
								aria-label="Available tags"
							>
								{options.map((option, index) => (
									<button
										type="button"
										role="option"
										tabIndex={-1}
										aria-selected={
											index === activeOptionIndex
										}
										id={"chat-session-tag-option-" + index}
										className={
											"chat-session-tag-option" +
											(index === activeOptionIndex
												? " is-active"
												: "")
										}
										key={option.kind + "-" + option.value}
										onPointerDown={(event) =>
											event.preventDefault()
										}
										onMouseEnter={() =>
											setActiveOptionIndex(index)
										}
										onClick={() => chooseTag(option.value)}
									>
										<ObsidianIcon
											icon={
												option.kind === "create"
													? "plus"
													: "tag"
											}
											size={15}
										/>
										<span>
											{option.kind === "create"
												? "Create “" +
													option.value +
													"”"
												: option.value}
										</span>
									</button>
								))}
								{options.length === 0 && (
									<div className="chat-session-tag-no-options">
										No matching tags
									</div>
								)}
							</div>
						)}
					</section>
				</div>
				<div className="chat-session-tag-manager-footer">
					<button
						type="button"
						className="chat-btn-small chat-btn-danger"
						disabled={currentTags.length === 0}
						onClick={() => onUpdateTags(session.id, [])}
					>
						<ObsidianIcon icon="trash-2" size={14} />
						Remove all tags
					</button>
					<button
						type="button"
						className="chat-btn chat-session-tag-manager-done"
						onClick={onClose}
					>
						Done
					</button>
				</div>
			</div>
		</div>
	);
}

const SessionPickerModal: React.FC<SessionPickerModalProps> = ({
	sessions,
	activeSessionId,
	onLoad,
	onDelete,
	onRename,
	onClose,
	onCopy,
	onExport,
	onUpdateTags,
}) => {
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editValue, setEditValue] = useState("");
	const [deleteCandidate, setDeleteCandidate] = useState<ChatSession | null>(
		null,
	);
	const [selectedTag, setSelectedTag] = useState("");
	const [searchQuery, setSearchQuery] = useState("");
	const [tagFilterOpen, setTagFilterOpen] = useState(false);
	const [activeTagFilterIndex, setActiveTagFilterIndex] = useState(0);
	const tagFilterRef = useRef<HTMLDivElement>(null);
	const [tagManagerSession, setTagManagerSession] =
		useState<ChatSession | null>(null);
	const [expandedTagsId, setExpandedTagsId] = useState<string | null>(null);

	const allSorted = sessions
		.filter((session) => sessionMessageCount(session) > 0)
		.sort((a, b) => b.updatedAt - a.updatedAt);
	const tags = [
		...new Set(allSorted.flatMap((session) => session.tags ?? [])),
	].sort((a, b) => a.localeCompare(b));
	const effectiveSelectedTag = tags.some(
		(tag) => tag.toLocaleLowerCase() === selectedTag.toLocaleLowerCase(),
	)
		? selectedTag
		: "";
	const tagSessionCounts = new Map<string, number>();
	for (const session of allSorted) {
		const uniqueSessionTags = new Set(
			(session.tags ?? []).map((tag) => tag.toLocaleLowerCase()),
		);
		for (const tag of uniqueSessionTags) {
			tagSessionCounts.set(tag, (tagSessionCounts.get(tag) ?? 0) + 1);
		}
	}
	const tagFilterOptions = [
		{ value: "", label: "All tags", count: allSorted.length },
		...tags.map((tag) => ({
			value: tag,
			label: tag,
			count: tagSessionCounts.get(tag.toLocaleLowerCase()) ?? 0,
		})),
	];
	const selectedTagFilterIndex = Math.max(
		0,
		tagFilterOptions.findIndex(
			(option) =>
				option.value.toLocaleLowerCase() ===
				effectiveSelectedTag.toLocaleLowerCase(),
		),
	);
	useEffect(() => {
		if (!tagFilterOpen) return;
		const handlePointerDown = (event: PointerEvent) => {
			if (!tagFilterRef.current?.contains(event.target as Node)) {
				setTagFilterOpen(false);
			}
		};
		document.addEventListener("pointerdown", handlePointerDown);
		return () =>
			document.removeEventListener("pointerdown", handlePointerDown);
	}, [tagFilterOpen]);
	const openTagFilter = () => {
		setActiveTagFilterIndex(selectedTagFilterIndex);
		setTagFilterOpen(true);
	};
	const handleTagFilterKeyDown = (
		event: React.KeyboardEvent<HTMLButtonElement>,
	) => {
		if (event.key === "Escape" && tagFilterOpen) {
			event.preventDefault();
			setTagFilterOpen(false);
		} else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			if (!tagFilterOpen) {
				openTagFilter();
				return;
			}
			const direction = event.key === "ArrowDown" ? 1 : -1;
			setActiveTagFilterIndex(
				(index) =>
					(index + direction + tagFilterOptions.length) %
					tagFilterOptions.length,
			);
		} else if (
			tagFilterOpen &&
			(event.key === "Enter" || event.key === " ")
		) {
			event.preventDefault();
			const option = tagFilterOptions[activeTagFilterIndex];
			if (option) setSelectedTag(option.value);
			setTagFilterOpen(false);
		}
	};
	const selectedTagSessions = effectiveSelectedTag
		? allSorted.filter((session) =>
				session.tags?.some(
					(tag) =>
						tag.toLocaleLowerCase() ===
						effectiveSelectedTag.toLocaleLowerCase(),
				),
			)
		: allSorted;
	const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
	const visibleSessions = selectedTagSessions.filter((session) => {
		if (!normalizedSearch) return true;
		const firstUserMessage =
			session.hydrated === false
				? undefined
				: session.messages.find((message) => message.role === "user");
		const searchableText = [
			getSessionTitle(session),
			firstUserMessage?.content ?? "",
			...(session.tags ?? []),
		]
			.join(" ")
			.toLocaleLowerCase();
		return searchableText.includes(normalizedSearch);
	});
	const currentTagManagerSession = tagManagerSession
		? (sessions.find((session) => session.id === tagManagerSession.id) ??
			tagManagerSession)
		: null;

	const commitRename = () => {
		if (editingId) {
			onRename(editingId, editValue);
			setEditingId(null);
			setEditValue("");
		}
	};

	const startRename = (session: ChatSession) => {
		setEditingId(session.id);
		setEditValue(session.title || "");
	};

	const handleRenameKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === "Enter") {
			event.preventDefault();
			commitRename();
		} else if (event.key === "Escape") {
			setEditingId(null);
			setEditValue("");
		}
	};

	const renderFormatMenu = (
		session: ChatSession,
		kind: "copy" | "export",
	) => {
		const isCopy = kind === "copy";
		const actionLabel = isCopy ? "Copy" : "Export";
		const handler = isCopy ? onCopy : onExport;
		const icon = isCopy ? "copy" : "download";
		return (
			<label
				className="chat-session-action-select"
				title={actionLabel + " session"}
			>
				<ObsidianIcon icon={icon} size={16} />
				<span className="sr-only">{actionLabel} session</span>
				<select
					defaultValue=""
					aria-label={actionLabel + " " + getSessionTitle(session)}
					onClick={(event) => event.stopPropagation()}
					onChange={(event) => {
						const format = event.target.value as ExportFormat;
						if (format) handler?.(session, format);
						event.target.value = "";
					}}
				>
					<option value="" disabled>
						Choose format
					</option>
					<option value="md">{actionLabel} Markdown</option>
					<option value="json">{actionLabel} JSON</option>
					<option value="jsonl">{actionLabel} JSONL</option>
				</select>
			</label>
		);
	};

	return (
		<div
			className="chat-modal-overlay"
			data-testid="session-picker-modal"
			onClick={onClose}
		>
			<div
				className="chat-modal chat-session-picker-modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="chat-history-title"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="chat-modal-header">
					<h3 id="chat-history-title">Chat History</h3>
					<button
						type="button"
						className="chat-modal-close"
						onClick={onClose}
						aria-label="Close"
					>
						<ObsidianIcon icon="x" size={18} />
					</button>
				</div>
				<div className="chat-modal-body">
					{allSorted.length > 0 && (
						<div className="chat-history-controls">
							<label className="chat-history-search">
								<ObsidianIcon icon="search" size={16} />
								<span className="sr-only">
									Search chat history
								</span>
								<input
									type="search"
									placeholder="Search chat history…"
									value={searchQuery}
									onChange={(event) =>
										setSearchQuery(event.target.value)
									}
								/>
							</label>
							<div
								className="chat-session-tag-filter"
								ref={tagFilterRef}
							>
								<button
									type="button"
									className="chat-session-tag-filter-trigger"
									aria-label={
										"Filter sessions by tag: " +
										(tagFilterOptions[
											selectedTagFilterIndex
										]?.label ?? "All tags")
									}
									aria-haspopup="listbox"
									aria-expanded={tagFilterOpen}
									aria-controls={
										tagFilterOpen
											? "chat-session-tag-filter-options"
											: undefined
									}
									aria-activedescendant={
										tagFilterOpen
											? "chat-session-tag-filter-option-" +
												activeTagFilterIndex
											: undefined
									}
									onClick={() =>
										tagFilterOpen
											? setTagFilterOpen(false)
											: openTagFilter()
									}
									onKeyDown={handleTagFilterKeyDown}
								>
									<ObsidianIcon icon="tag" size={15} />
									<span className="chat-session-tag-filter-label">
										{tagFilterOptions[
											selectedTagFilterIndex
										]?.label ?? "All tags"}
									</span>
									<ObsidianIcon
										icon="chevron-down"
										size={13}
									/>
								</button>
								{tagFilterOpen && (
									<div
										className="chat-session-tag-filter-options"
										id="chat-session-tag-filter-options"
										role="listbox"
										aria-label="Filter sessions by tag"
									>
										{tagFilterOptions.map(
											(option, index) => (
												<button
													type="button"
													role="option"
													tabIndex={-1}
													aria-selected={
														option.value.toLocaleLowerCase() ===
														effectiveSelectedTag.toLocaleLowerCase()
													}
													id={
														"chat-session-tag-filter-option-" +
														index
													}
													className={
														"chat-session-tag-filter-option" +
														(index ===
														activeTagFilterIndex
															? " is-active"
															: "")
													}
													key={
														option.value ||
														"all-tags"
													}
													onPointerDown={(event) =>
														event.preventDefault()
													}
													onMouseEnter={() =>
														setActiveTagFilterIndex(
															index,
														)
													}
													onClick={() => {
														setSelectedTag(
															option.value,
														);
														setTagFilterOpen(false);
													}}
												>
													<ObsidianIcon
														icon="tag"
														size={14}
													/>
													<span className="chat-session-tag-filter-option-label">
														{option.label}
													</span>
													<span
														className="chat-session-tag-filter-option-count"
														aria-label={
															option.count +
															" sessions"
														}
													>
														{option.count}
													</span>
													{option.value.toLocaleLowerCase() ===
														effectiveSelectedTag.toLocaleLowerCase() && (
														<ObsidianIcon
															icon="check"
															size={14}
														/>
													)}
												</button>
											),
										)}
									</div>
								)}
							</div>
						</div>
					)}
					{allSorted.length === 0 ? (
						<div className="chat-modal-empty">
							<p>No saved sessions.</p>
							<p className="chat-modal-empty-hint">
								Start a new chat and it will appear here.
							</p>
						</div>
					) : visibleSessions.length === 0 ? (
						<div className="chat-modal-empty">
							<p>
								{normalizedSearch
									? "No sessions match your search."
									: "No sessions use this tag yet."}
							</p>
						</div>
					) : (
						<div className="chat-session-list">
							{visibleSessions.map((session) => {
								const isActive = session.id === activeSessionId;
								const firstUserMessage =
									session.hydrated === false
										? undefined
										: session.messages.find(
												(message) =>
													message.role === "user",
											);
								const messageCount =
									sessionMessageCount(session);
								const preview = firstUserMessage
									? firstUserMessage.content.slice(0, 100) +
										(firstUserMessage.content.length > 100
											? "…"
											: "")
									: session.hydrated === false &&
										  messageCount > 0
										? messageCount +
											" message" +
											(messageCount === 1 ? "" : "s") +
											" — open to view"
										: "No messages";
								const displayTitle = getSessionTitle(session);
								const sessionTags = session.tags ?? [];

								return (
									<article
										key={session.id}
										className={
											"chat-session-item" +
											(isActive
												? " chat-session-item-active"
												: "")
										}
									>
										<div className="chat-session-info">
											{editingId === session.id ? (
												<input
													className="chat-session-rename-input"
													value={editValue}
													onChange={(event) =>
														setEditValue(
															event.target.value,
														)
													}
													onKeyDown={
														handleRenameKeyDown
													}
													onBlur={commitRename}
													autoFocus
													aria-label="Rename session"
												/>
											) : (
												<div
													className="chat-session-title"
													onDoubleClick={() =>
														startRename(session)
													}
													title="Double-click to rename"
												>
													<span className="chat-session-title-text">
														{displayTitle}
													</span>
													{isActive && (
														<span className="chat-session-badge">
															Active
														</span>
													)}
												</div>
											)}
											<div className="chat-session-meta">
												{messageCount} messages ·{" "}
												{formatRelativeTime(
													session.updatedAt,
												)}
												{getSessionTotalTokens(
													session,
												) > 0 && (
													<span className="chat-session-tokens">
														{" "}
														· ~
														{getSessionTotalTokens(
															session,
														).toLocaleString()}{" "}
														tokens
													</span>
												)}
											</div>
											<div className="chat-session-preview">
												{preview}
											</div>
											{onUpdateTags && (
												<>
													<div className="chat-session-tag-controls">
														{sessionTags.length >
															0 && (
															<button
																type="button"
																className="chat-session-tag-count"
																aria-expanded={
																	expandedTagsId ===
																	session.id
																}
																onClick={() =>
																	setExpandedTagsId(
																		expandedTagsId ===
																			session.id
																			? null
																			: session.id,
																	)
																}
															>
																<ObsidianIcon
																	icon="tag"
																	size={15}
																/>
																<span>
																	{
																		sessionTags.length
																	}{" "}
																	{sessionTags.length ===
																	1
																		? "tag"
																		: "tags"}
																</span>
																<ObsidianIcon
																	icon={
																		expandedTagsId ===
																		session.id
																			? "chevron-up"
																			: "chevron-down"
																	}
																	size={13}
																/>
															</button>
														)}
														<button
															type="button"
															className="chat-session-manage-tags"
															onClick={() =>
																setTagManagerSession(
																	session,
																)
															}
														>
															{sessionTags.length >
															0
																? "Manage tags"
																: "Add tags"}
														</button>
													</div>
													{expandedTagsId ===
														session.id &&
														sessionTags.length >
															0 && (
															<div
																className="chat-session-tags"
																aria-label={
																	"Tags for " +
																	displayTitle
																}
															>
																{sessionTags.map(
																	(tag) => (
																		<span
																			className="chat-session-tag"
																			key={
																				tag
																			}
																		>
																			{
																				tag
																			}
																		</span>
																	),
																)}
															</div>
														)}
												</>
											)}
										</div>
										<div
											className="chat-session-actions"
											aria-label={
												"Actions for " + displayTitle
											}
										>
											<button
												type="button"
												className={
													"chat-session-action-button chat-session-load" +
													(isActive
														? " is-current"
														: "")
												}
												onClick={() =>
													onLoad(session.id)
												}
												disabled={isActive}
												title={
													isActive
														? "Current session"
														: "Load session"
												}
												aria-label={
													isActive
														? "Current session"
														: "Load " + displayTitle
												}
											>
												<ObsidianIcon
													icon={
														isActive
															? "check"
															: "folder-open"
													}
													size={16}
												/>
											</button>
											{renderFormatMenu(session, "copy")}
											{renderFormatMenu(
												session,
												"export",
											)}
											<button
												type="button"
												className="chat-session-action-button"
												onClick={() =>
													startRename(session)
												}
												title="Rename session"
												aria-label={
													"Rename " + displayTitle
												}
											>
												<ObsidianIcon
													icon="pencil"
													size={16}
												/>
											</button>
											<button
												type="button"
												className="chat-session-action-button chat-btn-danger"
												onClick={() =>
													setDeleteCandidate(session)
												}
												title="Delete session"
												aria-label={
													"Delete " + displayTitle
												}
											>
												<ObsidianIcon
													icon="trash-2"
													size={16}
												/>
											</button>
										</div>
									</article>
								);
							})}
						</div>
					)}
				</div>
				{deleteCandidate && (
					<div
						className="chat-session-delete-confirm"
						role="alertdialog"
						aria-modal="true"
						aria-labelledby="chat-delete-session-title"
					>
						<div className="chat-session-delete-confirm-card">
							<h4 id="chat-delete-session-title">
								Delete this chat session?
							</h4>
							<p>
								This permanently deletes “
								{deleteCandidate.title || "Untitled chat"}” and
								its messages. This cannot be undone.
							</p>
							<div className="chat-session-delete-confirm-actions">
								<button
									type="button"
									onClick={() => setDeleteCandidate(null)}
								>
									Cancel
								</button>
								<button
									type="button"
									className="mod-warning"
									onClick={() => {
										onDelete(deleteCandidate.id);
										setDeleteCandidate(null);
									}}
								>
									Delete session
								</button>
							</div>
						</div>
					</div>
				)}
			</div>
			{currentTagManagerSession && onUpdateTags && (
				<SessionTagManagerModal
					session={currentTagManagerSession}
					availableTags={tags}
					onUpdateTags={onUpdateTags}
					onClose={() => setTagManagerSession(null)}
				/>
			)}
		</div>
	);
};

export default SessionPickerModal;
