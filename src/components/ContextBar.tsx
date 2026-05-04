import React from "react";
import { ContextItem } from "../types";

interface ContextBarProps {
	contextItems: ContextItem[];
	activeNoteName: string | null;
	wasTruncated: boolean;
	onToggleActiveNote: () => void;
}

const ContextBar: React.FC<ContextBarProps> = ({
	contextItems,
	activeNoteName,
	wasTruncated,
	onToggleActiveNote,
}) => {
	const hasActiveNote = contextItems.some(
		(item) => item.type === "active-note",
	);

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
		</div>
	);
};

export default ContextBar;
