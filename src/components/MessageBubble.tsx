import React, { useEffect, useRef } from "react";
import { App, MarkdownRenderer, Component } from "obsidian";
import { ChatMessage } from "./ChatApp";

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
					{message.role === "user" ? "You" : "InlineAI"}
				</span>
				<span className="chat-bubble-time">{time}</span>
			</div>
			<div ref={contentRef} className="chat-bubble-content" />
			{message.role === "assistant" && (
				<div className="chat-bubble-actions">
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
