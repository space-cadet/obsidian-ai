import React from "react";
import { ContextItem } from "../types";

interface ContextBarProps {
	contextItems: ContextItem[];
	activeNoteName: string | null;
	wasTruncated: boolean;
	onToggleActiveNote: () => void;
	onRemoveItem: (id: string) => void;
	onOpenPicker: () => void;
}

function getChipLabel(item: ContextItem): string {
	switch (item.type) {
		case "note":
			return `📄 ${item.name}`;
		case "folder":
			return `📁 ${item.name}`;
		case "tag":
			return `#${item.tag}`;
		case "active-note":
			return "📄 Active note";
	}
}

const ContextBar: React.FC<ContextBarProps> = ({
	contextItems,
	activeNoteName,
	wasTruncated,
	onToggleActiveNote,
	onRemoveItem,
	onOpenPicker,
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

			{contextItems
				.filter((item) => item.type !== "active-note")
				.map((item) => (
					<span
						key={item.id}
						className="chat-context-chip chat-context-chip-removable"
						title={getChipLabel(item)}
					>
						{getChipLabel(item)}
						<button
							className="chat-context-chip-remove"
							onClick={(e) => {
								e.stopPropagation();
								onRemoveItem(item.id);
							}}
							aria-label="Remove"
						>
							×
						</button>
					</span>
				))}

			{wasTruncated && (
				<span className="chat-context-chip chat-context-chip-warning">
					⚠️ Context truncated
				</span>
			)}

			<button
				className="chat-context-chip"
				onClick={onOpenPicker}
				title="Add notes, folders, or tags"
			>
				＋ Add context
			</button>
		</div>
	);
};

export default ContextBar;
