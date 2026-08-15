import React, { useState, useRef, useEffect } from "react";

interface MessageActionsProps {
	onCopy: () => void;
	onRetry?: () => void;
	onEdit?: () => void;
	onApply?: () => void;
	onInsertAtCursor?: () => void;
	onAppend?: () => void;
	onApplyToTarget?: () => void;
	onCreateNote?: () => void;
	onAppendToTarget?: () => void;
	commandType?: "edit" | "create" | "append";
	isUser?: boolean;
}

const MessageActions: React.FC<MessageActionsProps> = ({
	onCopy,
	onRetry,
	onEdit,
	onApply,
	onInsertAtCursor,
	onAppend,
	onApplyToTarget,
	onCreateNote,
	onAppendToTarget,
	commandType,
	isUser = false,
}) => {
	const [showMenu, setShowMenu] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				menuRef.current &&
				!menuRef.current.contains(event.target as Node)
			) {
				setShowMenu(false);
			}
		};
		if (showMenu) {
			document.addEventListener("mousedown", handleClickOutside);
		}
		return () =>
			document.removeEventListener("mousedown", handleClickOutside);
	}, [showMenu]);

	if (isUser) {
		return (
			<div className="message-actions">
				<button
					className="message-action-btn"
					onClick={onEdit}
					title="Edit and resubmit"
				>
					<svg
						viewBox="0 0 24 24"
						width="16"
						height="16"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
						<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
					</svg>
				</button>
				<button
					className="message-action-btn"
					onClick={onCopy}
					title="Copy message"
				>
					<svg
						viewBox="0 0 24 24"
						width="16"
						height="16"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<rect
							x="9"
							y="9"
							width="13"
							height="13"
							rx="2"
							ry="2"
						/>
						<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
					</svg>
				</button>
			</div>
		);
	}

	return (
		<div className="message-actions">
			{/* Primary actions — always visible */}
			{commandType === "edit" && onApplyToTarget && (
				<button
					className="message-action-btn message-action-primary"
					onClick={onApplyToTarget}
					title={`Apply to target`}
				>
					<svg
						viewBox="0 0 24 24"
						width="16"
						height="16"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<polyline points="20 6 9 17 4 12" />
					</svg>
				</button>
			)}
			{commandType === "create" && onCreateNote && (
				<button
					className="message-action-btn message-action-primary"
					onClick={onCreateNote}
					title="Create note"
				>
					<svg
						viewBox="0 0 24 24"
						width="16"
						height="16"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
						<polyline points="14 2 14 8 20 8" />
						<line x1="12" y1="18" x2="12" y2="12" />
						<line x1="9" y1="15" x2="15" y2="15" />
					</svg>
				</button>
			)}
			{commandType === "append" && onAppendToTarget && (
				<button
					className="message-action-btn message-action-primary"
					onClick={onAppendToTarget}
					title="Append to target"
				>
					<svg
						viewBox="0 0 24 24"
						width="16"
						height="16"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
						<polyline points="17 8 12 3 7 8" />
						<line x1="12" y1="3" x2="12" y2="15" />
					</svg>
				</button>
			)}
			{!commandType && onApply && (
				<button
					className="message-action-btn message-action-primary"
					onClick={onApply}
					title="Apply to active note"
				>
					<svg
						viewBox="0 0 24 24"
						width="16"
						height="16"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<polyline points="20 6 9 17 4 12" />
					</svg>
				</button>
			)}

			{/* Standard actions */}
			<button
				className="message-action-btn"
				onClick={onCopy}
				title="Copy"
			>
				<svg
					viewBox="0 0 24 24"
					width="16"
					height="16"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
					<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
				</svg>
			</button>

			{onRetry && (
				<button
					className="message-action-btn"
					onClick={onRetry}
					title="Retry"
				>
					<svg
						viewBox="0 0 24 24"
						width="16"
						height="16"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<polyline points="23 4 23 10 17 10" />
						<polyline points="1 20 1 14 7 14" />
						<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
					</svg>
				</button>
			)}

			{/* More menu */}
			<div className="message-action-menu-container" ref={menuRef}>
				<button
					className="message-action-btn"
					onClick={() => setShowMenu(!showMenu)}
					title="More actions"
				>
					<svg
						viewBox="0 0 24 24"
						width="16"
						height="16"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<circle cx="12" cy="12" r="1" />
						<circle cx="19" cy="12" r="1" />
						<circle cx="5" cy="12" r="1" />
					</svg>
				</button>

				{showMenu && (
					<div className="message-action-menu">
						{!commandType && onInsertAtCursor && (
							<button
								className="message-action-menu-item"
								onClick={() => {
									onInsertAtCursor();
									setShowMenu(false);
								}}
							>
								<svg
									viewBox="0 0 24 24"
									width="14"
									height="14"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
									<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
								</svg>
								<span>Insert at cursor</span>
							</button>
						)}
						{!commandType && onAppend && (
							<button
								className="message-action-menu-item"
								onClick={() => {
									onAppend();
									setShowMenu(false);
								}}
							>
								<svg
									viewBox="0 0 24 24"
									width="14"
									height="14"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
									<polyline points="17 8 12 3 7 8" />
									<line x1="12" y1="3" x2="12" y2="15" />
								</svg>
								<span>Append to note</span>
							</button>
						)}
						{commandType === "edit" && onApply && (
							<button
								className="message-action-menu-item"
								onClick={() => {
									onApply();
									setShowMenu(false);
								}}
							>
								<svg
									viewBox="0 0 24 24"
									width="14"
									height="14"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<polyline points="20 6 9 17 4 12" />
								</svg>
								<span>Apply as diff</span>
							</button>
						)}
					</div>
				)}
			</div>
		</div>
	);
};

export default MessageActions;
