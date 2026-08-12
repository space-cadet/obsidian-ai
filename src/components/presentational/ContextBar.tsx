import React from "react";
import { ContextItem } from "../../types";

interface ContextBarProps {
	contextItems: ContextItem[];
	activeNoteName: string | null;
	wasTruncated: boolean;
	onToggleActiveNote: () => void;
	estimatedTokens?: number;
	maxTokens?: number;
}

const ContextBar: React.FC<ContextBarProps> = ({
	contextItems,
	activeNoteName,
	wasTruncated,
	onToggleActiveNote,
	estimatedTokens = 0,
	maxTokens = 8000,
}) => {
	const hasActiveNote = contextItems.some(
		(item) => item.type === "active-note",
	);

	const usagePercent =
		maxTokens > 0 ? (estimatedTokens / maxTokens) * 100 : 0;
	let usageClass = "chat-token-usage-low";
	if (usagePercent > 85) {
		usageClass = "chat-token-usage-high";
	} else if (usagePercent > 60) {
		usageClass = "chat-token-usage-medium";
	}

	return (
		<div className="chat-context-bar">
			<button
				className={`chat-context-chip${hasActiveNote ? " chat-context-chip-active" : ""}`}
				onClick={onToggleActiveNote}
				title={
					hasActiveNote
						? "Remove active note from context"
						: "Include active note as context"
				}
			>
				{hasActiveNote
					? activeNoteName
						? `📄 ${activeNoteName}`
						: "📄 Active note"
					: "＋ Active note"}
			</button>

			{wasTruncated && (
				<span className="chat-context-chip chat-context-chip-warning">
					⚠️ Context truncated
				</span>
			)}

			{estimatedTokens > 0 && (
				<span
					className={`chat-context-chip chat-token-usage ${usageClass}`}
				>
					~{estimatedTokens.toLocaleString()} /{" "}
					{maxTokens.toLocaleString()} tokens
				</span>
			)}
		</div>
	);
};

export default ContextBar;
