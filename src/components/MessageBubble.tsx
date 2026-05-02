import React, { useEffect, useRef } from "react";
import { App, MarkdownRenderer, Component } from "obsidian";
import { ChatMessage } from "./ChatApp";
import { NoteEditingBridge } from "../noteEditing/NoteEditingBridge";

interface MessageBubbleProps {
	message: ChatMessage;
	app: App;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, app }) => {
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

	const handleApply = () => {
		console.log(`[MessageBubble] apply to active note — msgId: ${message.id}`);
		NoteEditingBridge.applyToActiveNote(app, message.content, "Apply from chat");
	};

	const handleAppend = () => {
		console.log(`[MessageBubble] append to active note — msgId: ${message.id}`);
		NoteEditingBridge.appendToActiveNote(app, message.content);
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
					<button
						className="chat-btn-small"
						onClick={handleApply}
						title="Apply as diff to active note"
					>
						✓ Apply to Note
					</button>
					<button
						className="chat-btn-small"
						onClick={handleAppend}
						title="Append to active note"
					>
						+ Append to Note
					</button>
					<button
						className="chat-btn-small"
						onClick={handleCopy}
						title="Copy response"
					>
						⎘ Copy
					</button>
				</div>
			)}
		</div>
	);
};

export default MessageBubble;
