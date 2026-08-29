import React from "react";
import type { ToolCall } from "../../agent/types";
import type { ToolDisplayDescriptor } from "../../agent/toolRegistry";

interface PendingToolCardProps {
	toolCall: ToolCall;
	onApprove: () => void;
	onReject: () => void;
	toolDisplay?: ToolDisplayDescriptor | null;
}

/** Summarizes a pending tool call for the approval UI — never dumps full content */
function PendingToolCallPreview({
	toolCall,
	toolDisplay,
}: Pick<PendingToolCardProps, "toolCall" | "toolDisplay">): React.ReactElement {
	const { toolName, args } = toolCall;
	const path = String(args.path ?? args.noteName ?? "—");
	const presentation = toolDisplay?.presentation ?? "generic";
	const title = toolDisplay?.title ?? toolName;
	const providerTitle = toolDisplay?.providerName
		? `${toolDisplay.providerName} · ${title}`
		: title;
	const riskLabel =
		toolDisplay?.risk === "read" || toolDisplay?.risk === "remote-read"
			? "Read-only operation"
			: toolDisplay?.risk
				? `${toolDisplay.risk} operation`
				: "Operation";

	const summarizeText = (
		text: string | undefined,
		maxLen = 200,
	): { lines: number; preview: string } => {
		if (!text) return { lines: 0, preview: "" };
		const lines = text.split("\n").length;
		const preview =
			text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
		return { lines, preview };
	};

	if (presentation === "note-read") {
		return (
			<div className="pending-tool-summary">
				<div className="pending-tool-title">📖 {providerTitle}</div>
				<div className="pending-tool-meta">{path}</div>
			</div>
		);
	}

	if (
		presentation === "text-overwrite" ||
		presentation === "text-create" ||
		presentation === "text-append"
	) {
		const content = typeof args.content === "string" ? args.content : "";
		const { lines, preview } = summarizeText(content);
		const action =
			presentation === "text-overwrite"
				? "📝 Overwrite"
				: presentation === "text-create"
					? "➕ Create"
					: "⬇️ Append to";
		return (
			<div className="pending-tool-summary">
				<div className="pending-tool-title">
					{action} <strong>{path}</strong>
				</div>
				<div className="pending-tool-meta">
					{lines} line{lines !== 1 ? "s" : ""} · {content.length}{" "}
					chars
				</div>
				{preview && (
					<pre className="pending-tool-preview">{preview}</pre>
				)}
			</div>
		);
	}

	if (presentation === "batch-create") {
		const notes = Array.isArray(args.notes) ? args.notes : [];
		const names = notes
			.slice(0, 5)
			.map((note) =>
				note && typeof note === "object" && "path" in note
					? String(note.path || "(unnamed)")
					: "(unnamed)",
			);
		return (
			<div className="pending-tool-summary">
				<div className="pending-tool-title">
					➕ Create <strong>{notes.length} new notes</strong>
				</div>
				<div className="pending-tool-meta">
					Existing notes are skipped; no note is overwritten.
				</div>
				{names.length > 0 && (
					<pre className="pending-tool-preview">
						{names.join("\n")}
						{notes.length > names.length
							? `\n… and ${notes.length - names.length} more`
							: ""}
					</pre>
				)}
			</div>
		);
	}

	if (presentation === "patch") {
		const search = typeof args.search === "string" ? args.search : "";
		const replace = typeof args.replace === "string" ? args.replace : "";
		const replaceAll = args.replace_all === true;
		return (
			<div className="pending-tool-summary">
				<div className="pending-tool-title">
					🔧 Patch <strong>{path}</strong>
				</div>
				<div className="pending-tool-meta">
					{replaceAll
						? "Replace all occurrences"
						: "Replace first occurrence"}
				</div>
				<div className="pending-tool-patch-row">
					<span className="pending-tool-patch-label">Find:</span>
					<code className="pending-tool-patch-value">
						{search.length > 60
							? search.slice(0, 60) + "…"
							: search}
					</code>
				</div>
				<div className="pending-tool-patch-row">
					<span className="pending-tool-patch-label">Replace:</span>
					<code className="pending-tool-patch-value">
						{replace.length > 60
							? replace.slice(0, 60) + "…"
							: replace}
					</code>
				</div>
			</div>
		);
	}

	if (presentation === "section") {
		const heading = String(args.section_heading ?? "");
		const content =
			typeof args.new_content === "string" ? args.new_content : "";
		const { lines, preview } = summarizeText(content);
		return (
			<div className="pending-tool-summary">
				<div className="pending-tool-title">
					📋 Edit Section <strong>“{heading}”</strong> in {path}
				</div>
				<div className="pending-tool-meta">
					{lines} line{lines !== 1 ? "s" : ""} · {content.length}{" "}
					chars
				</div>
				{preview && (
					<pre className="pending-tool-preview">{preview}</pre>
				)}
			</div>
		);
	}

	if (presentation === "search") {
		const query = String(args.query ?? "");
		return (
			<div className="pending-tool-summary">
				<div className="pending-tool-title">🔍 {providerTitle}</div>
				<div className="pending-tool-meta">
					Query: <code>{query}</code>
				</div>
			</div>
		);
	}

	if (presentation === "folder-create") {
		const folderPath = String(args.path ?? "");
		return (
			<div className="pending-tool-summary">
				<div className="pending-tool-title">📁 {providerTitle}</div>
				<div className="pending-tool-meta">
					<code>{folderPath}</code>
				</div>
			</div>
		);
	}

	if (presentation === "move") {
		const from = String(args.path ?? "");
		const to = String(args.new_path ?? "");
		return (
			<div className="pending-tool-summary">
				<div className="pending-tool-title">📦 {providerTitle}</div>
				<div className="pending-tool-meta">
					{from} → {to}
				</div>
			</div>
		);
	}

	if (presentation === "delete") {
		const notePath = String(args.path ?? "");
		return (
			<div className="pending-tool-summary">
				<div className="pending-tool-title">🗑️ {providerTitle}</div>
				<div className="pending-tool-meta">
					<code>{notePath}</code>
				</div>
			</div>
		);
	}

	if (presentation === "folders") {
		const parent = String(args.path ?? "(root)");
		return (
			<div className="pending-tool-summary">
				<div className="pending-tool-title">📂 {providerTitle}</div>
				<div className="pending-tool-meta">
					Under: <code>{parent}</code>
				</div>
			</div>
		);
	}

	return (
		<div className="pending-tool-summary">
			<div className="pending-tool-title">
				🤖 <strong>{providerTitle}</strong>
			</div>
			<div className="pending-tool-meta">
				{riskLabel} · {path}
			</div>
		</div>
	);
}

const PendingToolCard: React.FC<PendingToolCardProps> = ({
	toolCall,
	onApprove,
	onReject,
	toolDisplay,
}) => {
	return (
		<div className="pending-tool-call">
			<PendingToolCallPreview
				toolCall={toolCall}
				toolDisplay={toolDisplay}
			/>
			<div className="pending-tool-actions">
				<button className="mod-cta" onClick={onApprove}>
					Approve
				</button>
				<button onClick={onReject}>Reject</button>
			</div>
		</div>
	);
};

export default PendingToolCard;
