import React, { useEffect, useRef } from "react";
import { App, MarkdownRenderer, Component } from "obsidian";
import { ChatMessage } from "../types";

interface MessageBubbleProps {
	message: ChatMessage;
	app: App;
	onAppend: (content: string) => void;
	onInsertAtCursor: (content: string) => void;
	onApply: (content: string) => void;
	onRetry: () => void;
	onApplyToTarget: (content: string, target: string) => void;
	onCreateNote: (content: string, target: string) => void;
	onAppendToTarget: (content: string, target: string) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
	message,
	app,
	onAppend,
	onInsertAtCursor,
	onApply,
	onRetry,
	onApplyToTarget,
	onCreateNote,
	onAppendToTarget,
}) => {
	const contentRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!contentRef.current) return;
		contentRef.current.innerHTML = "";
		MarkdownRenderer.render(
			app,
			message.content,
			contentRef.current,
			"",
			new Component(),
		).catch(console.error);
	}, [message.content, app]);

	const handleCopy = () => {
		navigator.clipboard.writeText(message.content);
	};

	const time = new Date(message.timestamp).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});

	return (
		<div
			className={`chat-bubble chat-bubble-${message.role}${message.isError ? " chat-bubble-error" : ""}`}
		>
			<div className="chat-bubble-header">
				<span className="chat-bubble-role">
					{message.role === "user" ? "You" : "Obsidian AI"}
				</span>
				<span className="chat-bubble-time">{time}</span>
			</div>
			<div ref={contentRef} className="chat-bubble-content" />
			{message.role === "assistant" && !message.isError && (
				<div className="chat-bubble-actions">
					{message.command?.type === "edit" && (
						<button
							className="chat-btn-small"
							onClick={() =>
								onApplyToTarget(
									message.content,
									message.command!.target,
								)
							}
							title={`Apply as diff to ${message.command.target}`}
						>
							✓ Apply → {message.command.target}
						</button>
					)}
					{message.command?.type === "create" && (
						<button
							className="chat-btn-small"
							onClick={() =>
								onCreateNote(
									message.content,
									message.command!.target,
								)
							}
							title={`Create ${message.command.target}`}
						>
							✓ Create {message.command.target}
						</button>
					)}
					{message.command?.type === "append" && (
						<button
							className="chat-btn-small"
							onClick={() =>
								onAppendToTarget(
									message.content,
									message.command!.target,
								)
							}
							title={`Append to ${message.command.target}`}
						>
							+ Append → {message.command.target}
						</button>
					)}
					{!message.command && (
						<button
							className="chat-btn-small"
							onClick={() => onApply(message.content)}
							title="Preview changes as a diff in the active note"
						>
							✓ Apply
						</button>
					)}
					<button
						className="chat-btn-small"
						onClick={() => onInsertAtCursor(message.content)}
						title="Insert at the current cursor position"
					>
						⌶ Insert at Cursor
					</button>
					{!message.command && (
						<button
							className="chat-btn-small"
							onClick={() => onAppend(message.content)}
							title="Append directly to the end of the note — no confirmation step"
						>
							+ Append
						</button>
					)}
					<button
						className="chat-btn-small"
						onClick={handleCopy}
						title="Copy response"
					>
						⎘ Copy
					</button>
					<button
						className="chat-btn-small"
						onClick={onRetry}
						title="Retry this message"
					>
						↺ Retry
					</button>
				</div>
			)}
		</div>
	);
};

export default MessageBubble;
