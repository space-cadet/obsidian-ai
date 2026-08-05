import React, { useState } from "react";
import type { ToolCall, ToolResult } from "../agent/types";

interface ToolCallNotificationProps {
	toolCall: ToolCall;
	result?: ToolResult;
	isPending?: boolean;
	onApprove?: () => void;
	onReject?: () => void;
	onOpenPastSession?: (sessionId: string, messageId: string) => void;
}

/** Summarizes a tool call for inline display in the message area */
function ToolCallSummary({ toolCall, result }: { toolCall: ToolCall; result?: ToolResult }): React.ReactElement {
	const { toolName, args } = toolCall;
	const path = (args as any).path ?? (args as any).noteName ?? "—";

	const getStatusIcon = () => {
		if (!result) return "⏳";
		if (result.error) return "❌";
		return "✓";
	};

	const getActionLabel = () => {
		switch (toolName) {
			case "read_note": return "Read note";
			case "edit_note": return "Edited note";
			case "create_note": return "Created note";
			case "create_notes": return "Created notes";
			case "append_to_note": return "Appended to note";
			case "patch_note": return "Patched note";
			case "edit_section": return "Edited section";
			case "search_notes": return "Searched notes";
			case "list_notes": return "Listed notes";
			case "get_note_metadata": return "Got metadata";
			case "create_folder": return "Created folder";
			case "move_note": return "Moved note";
			case "delete_note": return "Deleted note";
			case "list_folders": return "Listed folders";
			default: return toolName.replace(/_/g, " ");
		}
	};

	const getDetailText = () => {
		if (toolName === "search_notes") {
			const query = (args as any).query ?? "";
			return `Query: "${query}"`;
		}
		if (toolName === "move_note") {
			const from = (args as any).path ?? "";
			const to = (args as any).new_path ?? "";
			return `${from} → ${to}`;
		}
		if (toolName === "edit_section") {
			const heading = (args as any).section_heading ?? "";
			return `${path} — "${heading}"`;
		}
		if (toolName === "create_notes") {
			const requested = Array.isArray((args as any).notes) ? (args as any).notes.length : 0;
			const created = result?.createdPaths?.length ?? result?.count;
			const skipped = result?.skippedPaths?.length ?? 0;
			return created === undefined
				? `${requested} requested notes`
				: `${created} created${skipped ? ` · ${skipped} already existed` : ""}`;
		}
		return path;
	};

	return (
		<div className="tool-call-summary">
			<span className="tool-call-status">{getStatusIcon()}</span>
			<span className="tool-call-label">{getActionLabel()}</span>
			<span className="tool-call-detail">{getDetailText()}</span>
			{result?.error && (
				<span className="tool-call-error">{result.error}</span>
			)}
		</div>
	);
}

/** Expandable detail view for a tool call result */
function ToolCallDetail({ toolCall, result, onOpenPastSession }: { toolCall: ToolCall; result?: ToolResult; onOpenPastSession?: (sessionId: string, messageId: string) => void }): React.ReactElement | null {
	if (!result) return null;

	const { toolName } = toolCall;

	if (result.error) {
		return (
			<div className="tool-call-detail-content">
				<pre className="tool-call-error-text">{result.error}</pre>
			</div>
		);
	}

	if (toolName === "read_note" && result.content) {
		return (
			<div className="tool-call-detail-content">
				<pre className="tool-call-preview">{result.content.slice(0, 500)}{result.content.length > 500 ? "…" : ""}</pre>
			</div>
		);
	}

	if (toolName === "search_notes" && result.matches) {
		return (
			<div className="tool-call-detail-content">
				<div className="tool-call-result-table">
					{result.matches.map((m: any, i: number) => (
						<div key={i} className="tool-call-result-row">
							<span className="tool-call-result-name">[[{m.basename}]]</span>
							<span className="tool-call-result-meta">{m.size ? `${m.size} bytes` : ""}</span>
						</div>
					))}
				</div>
			</div>
		);
	}

	if (toolName === "list_notes" && result.notes) {
		return (
			<div className="tool-call-detail-content">
				<div className="tool-call-result-table">
					{result.notes.map((n: any, i: number) => (
						<div key={i} className="tool-call-result-row">
							<span className="tool-call-result-name">[[{n.basename}]]</span>
							<span className="tool-call-result-meta">{n.size ? `${n.size} bytes` : ""}</span>
						</div>
					))}
				</div>
			</div>
		);
	}

	if (toolName === "list_folders" && result.folders) {
		return (
			<div className="tool-call-detail-content">
				<ul className="tool-call-result-list">
					{result.folders.map((f: string, i: number) => (
						<li key={i}>{f}</li>
					))}
				</ul>
			</div>
		);
	}

	if (toolName === "get_note_metadata") {
		return (
			<div className="tool-call-detail-content">
				<div className="tool-call-metadata">
					<div>Size: {result.size ?? "—"} bytes</div>
					<div>Words: {result.wordCount ?? "—"}</div>
					<div>Created: {result.created ? new Date(result.created).toLocaleString() : "—"}</div>
					<div>Modified: {result.modified ? new Date(result.modified).toLocaleString() : "—"}</div>
				</div>
			</div>
		);
	}

	if (toolName === "create_notes") {
		const created = result.createdPaths ?? [];
		const skipped = result.skippedPaths ?? [];
		return (
			<div className="tool-call-detail-content">
				<div className="tool-call-success">Created {created.length} new note{created.length === 1 ? "" : "s"}.</div>
				{skipped.length > 0 && <div className="tool-call-result-list">Skipped {skipped.length} already-existing note{skipped.length === 1 ? "" : "s"}: {skipped.join(", ")}</div>}
			</div>
		);
	}

	return (
		<div className="tool-call-detail-content">
			<span className="tool-call-success">{toolName.replace(/_/g, " ")} completed successfully</span>
		</div>
	);
}

const ToolCallNotification: React.FC<ToolCallNotificationProps> = ({
	toolCall,
	result,
	isPending = false,
	onApprove,
	onReject,
	onOpenPastSession,
}) => {
	const [expanded, setExpanded] = useState(false);

	return (
		<div className={`tool-call-notification${isPending ? " tool-call-pending" : ""}${result?.error ? " tool-call-error" : ""}`}>
			<button
				className="tool-call-header"
				onClick={() => setExpanded(!expanded)}
				type="button"
			>
				<ToolCallSummary toolCall={toolCall} result={result} />
				<span className={`tool-call-chevron${expanded ? " is-expanded" : ""}`}>›</span>
			</button>

			{expanded && (
				<div className="tool-call-body">
					<ToolCallDetail toolCall={toolCall} result={result} onOpenPastSession={onOpenPastSession} />
				</div>
			)}

			{isPending && onApprove && onReject && (
				<div className="tool-call-actions">
					<button className="mod-cta" onClick={onApprove}>Approve</button>
					<button onClick={onReject}>Reject</button>
				</div>
			)}
		</div>
	);
};

export default ToolCallNotification;
