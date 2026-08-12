import React from "react";
import type { ToolCall } from "../../agent/types";

interface PendingToolCardProps {
	toolCall: ToolCall;
	onApprove: () => void;
	onReject: () => void;
	providerDisplay?: { providerName: string; title: string; risk: string } | null;
}

/** Summarizes a pending tool call for the approval UI — never dumps full content */
function PendingToolCallPreview({ toolCall, providerDisplay }: Pick<PendingToolCardProps, "toolCall" | "providerDisplay">): React.ReactElement {
	const { toolName, args } = toolCall;
	const path = (args as any).path ?? (args as any).noteName ?? "—";

	const summarizeText = (text: string | undefined, maxLen = 200): { lines: number; preview: string } => {
		if (!text) return { lines: 0, preview: "" };
		const lines = text.split("\n").length;
		const preview = text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
		return { lines, preview };
	};

	if (providerDisplay) {
		return (
			<div className="pending-tool-summary">
				<div className="pending-tool-title">{providerDisplay.providerName} · {providerDisplay.title}</div>
				<div className="pending-tool-meta">{providerDisplay.risk === "read" ? "Read-only operation" : `${providerDisplay.risk} operation`}</div>
			</div>
		);
	}

	if (toolName === "read_note") {
		return (
			<div className="pending-tool-summary">
				<div className="pending-tool-title">📖 Read Note</div>
				<div className="pending-tool-meta">{path}</div>
			</div>
		);
	}

	if (toolName === "edit_note" || toolName === "create_note" || toolName === "append_to_note") {
		const content = (args as any).content ?? "";
		const { lines, preview } = summarizeText(content);
		const action = toolName === "edit_note" ? "📝 Overwrite" : toolName === "create_note" ? "➕ Create" : "⬇️ Append to";
		return (
			<div className="pending-tool-summary">
				<div className="pending-tool-title">{action} <strong>{path}</strong></div>
				<div className="pending-tool-meta">{lines} line{lines !== 1 ? "s" : ""} · {content.length} chars</div>
				{preview && <pre className="pending-tool-preview">{preview}</pre>}
			</div>
		);
	}

	if (toolName === "create_notes") {
		const notes = Array.isArray((args as any).notes) ? (args as any).notes : [];
		const names = notes.slice(0, 5).map((note: { path?: string }) => note.path || "(unnamed)");
		return (
			<div className="pending-tool-summary">
				<div className="pending-tool-title">➕ Create <strong>{notes.length} new notes</strong></div>
				<div className="pending-tool-meta">Existing notes are skipped; no note is overwritten.</div>
				{names.length > 0 && <pre className="pending-tool-preview">{names.join("\n")}{notes.length > names.length ? `\n… and ${notes.length - names.length} more` : ""}</pre>}
			</div>
		);
	}

	if (toolName === "patch_note") {
		const search = (args as any).search ?? "";
		const replace = (args as any).replace ?? "";
		const replaceAll = (args as any).replace_all ?? false;
		return (
			<div className="pending-tool-summary">
				<div className="pending-tool-title">🔧 Patch <strong>{path}</strong></div>
				<div className="pending-tool-meta">{replaceAll ? "Replace all occurrences" : "Replace first occurrence"}</div>
				<div className="pending-tool-patch-row">
					<span className="pending-tool-patch-label">Find:</span>
					<code className="pending-tool-patch-value">{search.length > 60 ? search.slice(0, 60) + "…" : search}</code>
				</div>
				<div className="pending-tool-patch-row">
					<span className="pending-tool-patch-label">Replace:</span>
					<code className="pending-tool-patch-value">{replace.length > 60 ? replace.slice(0, 60) + "…" : replace}</code>
				</div>
			</div>
		);
	}

	if (toolName === "edit_section") {
		const heading = (args as any).section_heading ?? "";
		const content = (args as any).new_content ?? "";
		const { lines, preview } = summarizeText(content);
		return (
			<div className="pending-tool-summary">
				<div className="pending-tool-title">📋 Edit Section <strong>“{heading}”</strong> in {path}</div>
				<div className="pending-tool-meta">{lines} line{lines !== 1 ? "s" : ""} · {content.length} chars</div>
				{preview && <pre className="pending-tool-preview">{preview}</pre>}
			</div>
		);
	}

	if (toolName === "search_notes") {
		const query = (args as any).query ?? "";
		return (
			<div className="pending-tool-summary">
				<div className="pending-tool-title">🔍 Search Notes</div>
				<div className="pending-tool-meta">Query: <code>{query}</code></div>
			</div>
		);
	}

	if (toolName === "create_folder") {
		const folderPath = (args as any).path ?? "";
		return (
			<div className="pending-tool-summary">
				<div className="pending-tool-title">📁 Create Folder</div>
				<div className="pending-tool-meta"><code>{folderPath}</code></div>
			</div>
		);
	}

	if (toolName === "move_note") {
		const from = (args as any).path ?? "";
		const to = (args as any).new_path ?? "";
		return (
			<div className="pending-tool-summary">
				<div className="pending-tool-title">📦 Move Note</div>
				<div className="pending-tool-meta">{from} → {to}</div>
			</div>
		);
	}

	if (toolName === "delete_note") {
		const notePath = (args as any).path ?? "";
		return (
			<div className="pending-tool-summary">
				<div className="pending-tool-title">🗑️ Delete Note</div>
				<div className="pending-tool-meta"><code>{notePath}</code></div>
			</div>
		);
	}

	if (toolName === "list_folders") {
		const parent = (args as any).path ?? "(root)";
		return (
			<div className="pending-tool-summary">
				<div className="pending-tool-title">📂 List Folders</div>
				<div className="pending-tool-meta">Under: <code>{parent}</code></div>
			</div>
		);
	}

	return (
		<div className="pending-tool-summary">
			<div className="pending-tool-title">🤖 <strong>{toolName}</strong></div>
			<div className="pending-tool-meta">{path}</div>
		</div>
	);
}

const PendingToolCard: React.FC<PendingToolCardProps> = ({
	toolCall,
	onApprove,
	onReject,
	providerDisplay,
}) => {
	return (
		<div className="pending-tool-call">
			<PendingToolCallPreview toolCall={toolCall} providerDisplay={providerDisplay} />
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
