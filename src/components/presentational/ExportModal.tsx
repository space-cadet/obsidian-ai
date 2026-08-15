import React, { useState, useMemo } from "react";
import { ChatSession } from "../../types";
import {
	serializeToMarkdown,
	serializeToJSON,
	serializeToJSONL,
	generateFilename,
} from "../../utils/exportChat";

export type ExportScope = "single" | "multiple" | "all";
export type ExportFormat = "md" | "json" | "jsonl";

interface ExportModalProps {
	sessions: ChatSession[];
	activeSessionId: string | null;
	plugin: {
		app: {
			vault: {
				create: (path: string, content: string) => Promise<unknown>;
			};
		};
	};
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

function displayTitle(session: ChatSession): string {
	if (session.title) return session.title;
	const firstUser = session.messages.find((m) => m.role === "user");
	if (firstUser)
		return (
			firstUser.content.slice(0, 40) +
			(firstUser.content.length > 40 ? "…" : "")
		);
	return `Chat ${new Date(session.createdAt).toLocaleDateString()}`;
}

const ExportModal: React.FC<ExportModalProps> = ({
	sessions,
	activeSessionId,
	plugin,
	onClose,
}) => {
	const [scope, setScope] = useState<ExportScope>("single");
	const [format, setFormat] = useState<ExportFormat>("md");
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [status, setStatus] = useState<string | null>(null);
	const [isExporting, setIsExporting] = useState(false);

	const activeSession = useMemo(
		() => sessions.find((s) => s.id === activeSessionId),
		[sessions, activeSessionId],
	);

	const sortedSessions = useMemo(
		() => [...sessions].sort((a, b) => b.updatedAt - a.updatedAt),
		[sessions],
	);

	const toggleSessionSelection = (id: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const getTargetSessions = (): ChatSession[] => {
		switch (scope) {
			case "single":
				return activeSession ? [activeSession] : [];
			case "multiple":
				return sessions.filter((s) => selectedIds.has(s.id));
			case "all":
				return [...sessions];
		}
	};

	const handleExport = async () => {
		const targetSessions = getTargetSessions();
		if (targetSessions.length === 0) {
			setStatus("No sessions selected.");
			return;
		}

		setIsExporting(true);
		setStatus("Exporting…");

		try {
			let content: string;
			let ext: string;

			switch (format) {
				case "md":
					content = serializeToMarkdown(targetSessions, scope);
					ext = "md";
					break;
				case "json":
					content = serializeToJSON(targetSessions, scope);
					ext = "json";
					break;
				case "jsonl":
					content = serializeToJSONL(targetSessions, scope);
					ext = "jsonl";
					break;
			}

			const filename = generateFilename(
				scope,
				format,
				activeSession?.title,
			);
			await plugin.app.vault.create(filename, content);
			setStatus(`\u2713 Exported to ${filename}`);
		} catch (err: any) {
			if (err?.message?.includes("already exists")) {
				// Retry with timestamp suffix
				try {
					const filename = generateFilename(
						scope,
						format,
						activeSession?.title,
						true,
					);
					let content: string;
					switch (format) {
						case "md":
							content = serializeToMarkdown(
								targetSessions,
								scope,
							);
							break;
						case "json":
							content = serializeToJSON(targetSessions, scope);
							break;
						case "jsonl":
							content = serializeToJSONL(targetSessions, scope);
							break;
					}
					await plugin.app.vault.create(filename, content);
					setStatus(`\u2713 Exported to ${filename}`);
				} catch (err2: any) {
					setStatus(`\u26A0 Export failed: ${err2.message}`);
				}
			} else {
				setStatus(`\u26A0 Export failed: ${err.message}`);
			}
		} finally {
			setIsExporting(false);
		}
	};

	const canExport =
		(scope === "single" && !!activeSession) ||
		(scope === "multiple" && selectedIds.size > 0) ||
		scope === "all";

	return (
		<div className="chat-modal-overlay" onClick={onClose}>
			<div
				className="chat-modal chat-export-modal"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="chat-modal-header">
					<h3>Export Chat</h3>
					<button
						className="chat-modal-close"
						onClick={onClose}
						aria-label="Close"
					>
						&times;
					</button>
				</div>
				<div className="chat-modal-body">
					{/* Scope selector */}
					<div className="chat-export-section">
						<label className="chat-export-label">
							Export scope
						</label>
						<div className="chat-export-options">
							<label className="chat-export-option">
								<input
									type="radio"
									name="export-scope"
									checked={scope === "single"}
									onChange={() => setScope("single")}
								/>
								<span>Single session</span>
								{activeSession && (
									<span className="chat-export-option-hint">
										{displayTitle(activeSession)}
									</span>
								)}
							</label>
							<label className="chat-export-option">
								<input
									type="radio"
									name="export-scope"
									checked={scope === "multiple"}
									onChange={() => setScope("multiple")}
								/>
								<span>Multiple sessions</span>
								<span className="chat-export-option-hint">
									{selectedIds.size > 0
										? `${selectedIds.size} selected`
										: "Choose below"}
								</span>
							</label>
							<label className="chat-export-option">
								<input
									type="radio"
									name="export-scope"
									checked={scope === "all"}
									onChange={() => setScope("all")}
								/>
								<span>All sessions</span>
								<span className="chat-export-option-hint">
									{sessions.length} total
								</span>
							</label>
						</div>
					</div>

					{/* Multiple session picker */}
					{scope === "multiple" && (
						<div className="chat-export-section">
							<label className="chat-export-label">
								Select sessions
							</label>
							<div className="chat-export-session-list">
								{sortedSessions.map((session) => {
									const isChecked = selectedIds.has(
										session.id,
									);
									return (
										<label
											key={session.id}
											className="chat-export-session-item"
										>
											<input
												type="checkbox"
												checked={isChecked}
												onChange={() =>
													toggleSessionSelection(
														session.id,
													)
												}
											/>
											<span className="chat-export-session-title">
												{displayTitle(session)}
											</span>
											<span className="chat-export-session-meta">
												{session.messages.length} msgs ·{" "}
												{formatRelativeTime(
													session.updatedAt,
												)}
											</span>
										</label>
									);
								})}
								{sortedSessions.length === 0 && (
									<div className="chat-export-empty">
										No sessions available
									</div>
								)}
							</div>
						</div>
					)}

					{/* Format selector */}
					<div className="chat-export-section">
						<label className="chat-export-label">Format</label>
						<div className="chat-export-options">
							<label className="chat-export-option">
								<input
									type="radio"
									name="export-format"
									checked={format === "md"}
									onChange={() => setFormat("md")}
								/>
								<span>Markdown (.md)</span>
								<span className="chat-export-option-hint">
									Human-readable
								</span>
							</label>
							<label className="chat-export-option">
								<input
									type="radio"
									name="export-format"
									checked={format === "json"}
									onChange={() => setFormat("json")}
								/>
								<span>JSON (.json)</span>
								<span className="chat-export-option-hint">
									Structured data
								</span>
							</label>
							<label className="chat-export-option">
								<input
									type="radio"
									name="export-format"
									checked={format === "jsonl"}
									onChange={() => setFormat("jsonl")}
								/>
								<span>JSONL (.jsonl)</span>
								<span className="chat-export-option-hint">
									One object per line
								</span>
							</label>
						</div>
					</div>

					{/* Status */}
					{status && (
						<div className="chat-export-status">{status}</div>
					)}

					{/* Actions */}
					<div className="chat-export-actions">
						<button
							className="chat-btn chat-btn-primary"
							onClick={handleExport}
							disabled={!canExport || isExporting}
						>
							{isExporting ? "Exporting…" : "Export to vault"}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
};

export default ExportModal;
