import React, { useState } from "react";
import { ChatSession } from "../types";

interface SessionPickerModalProps {
	sessions: ChatSession[];
	activeSessionId: string | null;
	onLoad: (sessionId: string) => void;
	onDelete: (sessionId: string) => void;
	onRename: (sessionId: string, newTitle: string) => void;
	onClose: () => void;
}

function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);

	if (minutes < 1) return "Just now";
	if (minutes < 60) return `${minutes}m ago`;
	if (hours < 24) return `${hours}h ago`;
	if (days < 7) return `${days}d ago`;
	return new Date(timestamp).toLocaleDateString();
}

const SessionPickerModal: React.FC<SessionPickerModalProps> = ({
	sessions,
	activeSessionId,
	onLoad,
	onDelete,
	onRename,
	onClose,
}) => {
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editValue, setEditValue] = useState("");

	// Sort by updatedAt descending (newest first)
	const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

	const startRename = (session: ChatSession) => {
		setEditingId(session.id);
		setEditValue(session.title || "");
	};

	const commitRename = () => {
		if (editingId) {
			onRename(editingId, editValue);
			setEditingId(null);
			setEditValue("");
		}
	};

	const handleRenameKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault();
			commitRename();
		} else if (e.key === "Escape") {
			setEditingId(null);
			setEditValue("");
		}
	};

	return (
		<div className="chat-modal-overlay" onClick={onClose}>
			<div className="chat-modal" onClick={(e) => e.stopPropagation()}>
				<div className="chat-modal-header">
					<h3>Load Chat Session</h3>
					<button
						className="chat-modal-close"
						onClick={onClose}
						aria-label="Close"
					>
						×
					</button>
				</div>
				<div className="chat-modal-body">
					{sorted.length === 0 ? (
						<div className="chat-modal-empty">
							<p>No saved sessions.</p>
							<p className="chat-modal-empty-hint">
								Start a new chat and it will appear here.
							</p>
						</div>
					) : (
						<div className="chat-session-list">
							{sorted.map((session) => {
								const isActive = session.id === activeSessionId;
								const firstUserMsg = session.messages.find(
									(m) => m.role === "user",
								);
								const preview = firstUserMsg
									? firstUserMsg.content.slice(0, 60) +
										(firstUserMsg.content.length > 60 ? "…" : "")
									: "No messages";
								const displayTitle =
									session.title ||
									(firstUserMsg
										? firstUserMsg.content.slice(0, 40) +
											(firstUserMsg.content.length > 40 ? "…" : "")
									: `Chat ${new Date(session.createdAt).toLocaleDateString()}`);

								return (
									<div
										key={session.id}
										className={`chat-session-item${isActive ? " chat-session-item-active" : ""}`}
									>
										<div className="chat-session-info">
											{editingId === session.id ? (
												<input
													className="chat-session-rename-input"
													value={editValue}
													onChange={(e) => setEditValue(e.target.value)}
													onKeyDown={handleRenameKeyDown}
													onBlur={commitRename}
													autoFocus
												/>
											) : (
												<div
													className="chat-session-title"
													onDoubleClick={() => startRename(session)}
													title="Double-click to rename"
												>
													{displayTitle}
													{isActive && (
														<span className="chat-session-badge">
															Active
														</span>
													)}
												</div>
											)}
											<div className="chat-session-meta">
												{session.messages.length} messages ·{" "}
												{formatRelativeTime(session.updatedAt)}
											</div>
											<div className="chat-session-preview">
												{preview}
											</div>
										</div>
										<div className="chat-session-actions">
											<button
												className="chat-btn-small"
												onClick={() => onLoad(session.id)}
												disabled={isActive}
											>
												{isActive ? "Current" : "Load"}
											</button>
											<button
												className="chat-btn-small"
												onClick={() => startRename(session)}
												title="Rename session"
											>
												✎
											</button>
											<button
												className="chat-btn-small chat-btn-danger"
												onClick={() => onDelete(session.id)}
												title="Delete session"
											>
												×
											</button>
										</div>
									</div>
								);
								})}
							</div>
						)}
					</div>
				</div>
			</div>
		);
	};

export default SessionPickerModal;
