import React, { useEffect, useRef } from "react";
import { App, MarkdownRenderer, Component } from "obsidian";
import { ChatMessage, ContextItem } from "../types";

interface MessageBubbleProps {
	message: ChatMessage;
	app: App;
	onAppend: (content: string) => void;
	onInsertAtCursor: (content: string) => void;
	onApply: (content: string) => void;
	onRetry: () => void;
	onEdit: () => void;
	onApplyToTarget: (content: string, target: string) => void;
	onCreateNote: (content: string, target: string) => void;
	onAppendToTarget: (content: string, target: string) => void;
}

function formatContextItems(items: ContextItem[]): string {
	return items
		.map((item) => {
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
		})
		.join(", ");
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
	message,
	app,
	onAppend,
	onInsertAtCursor,
	onApply,
	onRetry,
	onEdit,
	onApplyToTarget,
	onCreateNote,
	onAppendToTarget,
}) => {
	const contentRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!contentRef.current) return;
		const logger = (window as any).__obsidianAiLogger;
		let unmounted = false;

		// Use writeDirect for crash-surviving synchronous flush
		logger?.writeDirect?.(
			"debug",
			`[MessageBubble ${message.id}] Step 1: entering useEffect — ${message.content.length} chars`,
		);

		try {
			logger?.writeDirect?.(
				"debug",
				`[MessageBubble ${message.id}] Step 2: clearing innerHTML`,
			);
			contentRef.current.innerHTML = "";

			logger?.writeDirect?.(
				"debug",
				`[MessageBubble ${message.id}] Step 3: creating Component`,
			);
			const comp = new Component();

			logger?.writeDirect?.(
				"debug",
				`[MessageBubble ${message.id}] Step 4: calling MarkdownRenderer.render`,
			);
			MarkdownRenderer.render(
				app,
				message.content,
				contentRef.current,
				"",
				comp,
			).then(() => {
				if (unmounted) return;
				logger?.writeDirect?.(
					"debug",
					`[MessageBubble ${message.id}] Step 5: MarkdownRenderer.render resolved`,
				);
			}).catch((err: any) => {
				if (unmounted) return;
				logger?.writeDirect?.(
					"error",
					`[MessageBubble ${message.id}] MarkdownRenderer.render rejected:`,
					err,
				);
				if (contentRef.current) {
					contentRef.current.innerHTML = "";
					contentRef.current.createEl("pre", {
						text: message.content,
						cls: "chat-plaintext-fallback",
					});
				}
			});
		} catch (err: any) {
			logger?.writeDirect?.(
				"fatal",
				`[MessageBubble ${message.id}] MarkdownRenderer.render threw synchronously:`,
				err,
			);
			if (contentRef.current) {
				contentRef.current.innerHTML = "";
				contentRef.current.createEl("pre", {
					text: message.content,
					cls: "chat-plaintext-fallback",
				});
			}
		}

		return () => {
			unmounted = true;
		};
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

			{/* Context tracking for user messages */}
			{message.role === "user" && message.contextItems && message.contextItems.length > 0 && (
				<div className="chat-message-context-footer">
					<span className="chat-message-context-label">Context:</span>
					<span className="chat-message-context-items">
						{formatContextItems(message.contextItems)}
					</span>
				</div>
			)}

			{/* Token count */}
			{message.estimatedTokens !== undefined && (
				<div className="chat-message-token-count">
					~{message.estimatedTokens} tokens
				</div>
			)}

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

			{/* Edit button for user messages */}
			{message.role === "user" && (
				<div className="chat-bubble-actions chat-bubble-actions-user">
					<button
						className="chat-btn-small"
						onClick={onEdit}
						title="Edit and resubmit"
					>
						✎ Edit
					</button>
					<button
						className="chat-btn-small"
						onClick={handleCopy}
						title="Copy message"
					>
						⎘ Copy
					</button>
				</div>
			)}
		</div>
	);
};

export default MessageBubble;
