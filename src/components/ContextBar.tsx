import React from "react";

interface ContextBarProps {
	includeActiveNote: boolean;
	activeNoteName: string | null;
	onToggleActiveNote: () => void;
}

const ContextBar: React.FC<ContextBarProps> = ({
	includeActiveNote,
	activeNoteName,
	onToggleActiveNote,
}) => {
	return (
		<div className="chat-context-bar">
			<button
				className={`chat-context-chip${includeActiveNote ? " chat-context-chip-active" : ""}`}
				onClick={onToggleActiveNote}
				title={
					includeActiveNote
						? "Remove active note from context"
						: "Include active note as context"
				}
			>
				{includeActiveNote && activeNoteName
					? `📄 ${activeNoteName}`
					: "＋ Active note"}
			</button>
		</div>
	);
};

export default ContextBar;
