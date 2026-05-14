import React, { useEffect, useRef, useState } from "react";
import { App, MarkdownRenderer, Component } from "obsidian";
import { ChatMessage, ContextItem } from "../types";
import MessageActions from "./MessageActions";
import ToolCallNotification from "./ToolCallNotification";

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
	const [displayContent, setDisplayContent] = useState(message.content);

	useEffect(() => {
		setDisplayContent(message.content);
	}, [message.content]);

	useEffect(() => {
		if (!contentRef.current) return;
		const logger = (window as any).__obsidianAiLogger;
		let unmounted = false;

		logger?.writeDirect?.(
			"debug",
			`[MessageBubble ${message.id}] Step 1: entering useEffect — ${displayContent.length} chars`,
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
				displayContent,
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
						text: displayContent,
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
					text: displayContent,
					cls: "chat-plaintext-fallback",
				});
			}
		}

		return () => {
			unmounted = true;
		};
	}, [displayContent, app]);

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

			{/* Tool call notifications */}
			{message.toolCalls && message.toolCalls.length > 0 && (
				<div className="chat-bubble-tool-calls">
					{message.toolCalls.map((tc, i) => (
						<ToolCallNotification
							key={i}
							toolCall={tc.call}
							result={tc.result}
							isPending={!tc.result}
						/>
					))}
				</div>
			)}

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

			{/* Message actions */}
			{message.role === "assistant" && !message.isError && (
				<MessageActions
					onCopy={handleCopy}
					onRetry={onRetry}
					onApply={!message.command ? () => onApply(message.content) : undefined}
					onInsertAtCursor={() => onInsertAtCursor(message.content)}
					onAppend={!message.command ? () => onAppend(message.content) : undefined}
					onApplyToTarget={message.command?.type === "edit" ? () => onApplyToTarget(message.content, message.command!.target) : undefined}
					onCreateNote={message.command?.type === "create" ? () => onCreateNote(message.content, message.command!.target) : undefined}
					onAppendToTarget={message.command?.type === "append" ? () => onAppendToTarget(message.content, message.command!.target) : undefined}
					commandType={message.command?.type}
				/>
			)}

			{/* User message actions */}
			{message.role === "user" && (
				<MessageActions
					isUser={true}
					onCopy={handleCopy}
					onEdit={onEdit}
				/>
			)}
		</div>
	);
};

export default MessageBubble;
