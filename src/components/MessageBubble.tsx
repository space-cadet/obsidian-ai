import React, { useEffect, useRef, useState } from "react";
import { App, MarkdownRenderer, Component } from "obsidian";
import { ChatMessage, ContextItem, ContentPart } from "../types";
import MessageActions from "./MessageActions";
import ToolCallNotification from "./ToolCallNotification";

interface MessageBubbleProps {
	message: ChatMessage;
	app: App;
	isStreaming?: boolean;
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

/** Strips model thinking/reasoning tag blocks from text */
export function stripThinkingTags(text: string): string {
	return text
		.replace(/<\|channel\|>[\s\S]*?<channel\|>/gi, "")
		.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
		.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
		.replace(/<\|thinking\|>[\s\S]*?<\/thinking>/gi, "")
		.trim();
}

/** Renders a text segment using Obsidian's MarkdownRenderer */
function TextSegment({
	content,
	app,
}: {
	content: string;
	app: App;
}): React.ReactElement {
	const ref = useRef<HTMLDivElement>(null);
	const cleanContent = stripThinkingTags(content);

	useEffect(() => {
		if (!ref.current) return;
		let unmounted = false;
		const comp = new Component();
		ref.current.innerHTML = "";

		MarkdownRenderer.render(app, cleanContent, ref.current, "", comp).catch(
			(err: any) => {
				if (unmounted || !ref.current) return;
				ref.current.innerHTML = "";
				ref.current.createEl("pre", {
					text: cleanContent,
					cls: "chat-plaintext-fallback",
				});
			},
		);

		return () => {
			unmounted = true;
		};
	}, [cleanContent, app]);

	return <div ref={ref} className="chat-bubble-content-segment" />;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
	message,
	app,
	isStreaming,
	onAppend,
	onInsertAtCursor,
	onApply,
	onRetry,
	onEdit,
	onApplyToTarget,
	onCreateNote,
	onAppendToTarget,
}) => {
	const [isActive, setIsActive] = useState(false);
	const bubbleRef = useRef<HTMLDivElement>(null);

	// Click outside to deactivate
	useEffect(() => {
		if (!isActive) return;
		const handleDocClick = (e: MouseEvent) => {
			if (bubbleRef.current && !bubbleRef.current.contains(e.target as Node)) {
				setIsActive(false);
			}
		};
		document.addEventListener("mousedown", handleDocClick);
		return () => document.removeEventListener("mousedown", handleDocClick);
	}, [isActive]);

	const handleCopy = () => {
		navigator.clipboard.writeText(message.content);
	};

	const time = new Date(message.timestamp).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});

	// Determine what to render: contentParts (inline) or legacy fallback
	const hasInlineParts =
		message.contentParts && message.contentParts.length > 0;

	// For streaming display without parts yet, show the raw content
	const renderParts: ContentPart[] | null = hasInlineParts
		? message.contentParts!
		: isStreaming
			? [{ type: "text", content: message.content }]
			: null;

	// Legacy fallback: just render full content as before
	const useLegacyRender = !renderParts && !isStreaming;

	return (
		<div
			ref={bubbleRef}
			className={`chat-bubble chat-bubble-${message.role}${message.isError ? " chat-bubble-error" : ""}${isActive ? " is-active" : ""}${isStreaming ? " chat-bubble-streaming" : ""}`}
			onClick={() => {
				// Don't activate bubble if user is selecting/highlighting text
				const selection = window.getSelection();
				if (selection && selection.toString().trim().length > 0) {
					if (
						bubbleRef.current &&
						selection.containsNode(bubbleRef.current, true)
					) {
						return;
					}
				}
				setIsActive(true);
			}}
		>
			<div className="chat-bubble-header">
				<span className="chat-bubble-role">
					{message.role === "user"
						? "You"
						: message.agentName
							? message.agentName
							: "Obsidian AI"}
				</span>
				{message.agentColor && message.role === "assistant" && (
					<span
						className="chat-bubble-agent-dot"
						style={{ backgroundColor: message.agentColor }}
						title={message.agentName}
					/>
				)}
				<span className="chat-bubble-time">{time}</span>
			</div>

			{/* Content: inline parts or legacy single block */}
			{useLegacyRender ? (
				<LegacyContent content={message.content} app={app} messageId={message.id} />
			) : (
				<div className="chat-bubble-content-inline">
					{renderParts!.map((part, i) =>
						part.type === "text" ? (
							<TextSegment key={i} content={part.content} app={app} />
						) : (
							<ToolCallNotification
								key={i}
								toolCall={part.call}
								result={part.result}
								isPending={!part.result}
							/>
						),
					)}
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

			{/* Token count + metadata */}
			{(message.estimatedTokens !== undefined || message.modelName || message.responseTimeMs) && (
				<div className="chat-message-metadata">
					{message.modelName && (
						<span className="chat-message-model">{message.modelName}</span>
					)}
					{message.responseTimeMs !== undefined && (
						<span className="chat-message-timing">{message.responseTimeMs}ms</span>
					)}
					{message.estimatedTokens !== undefined && (
						<span className="chat-message-tokens">~{message.estimatedTokens} tokens</span>
					)}
				</div>
			)}

			{/* Message actions — visible on hover OR when active */}
			{message.role === "assistant" && !message.isError && (
				<div className={`message-actions-wrapper${isActive ? " is-active" : ""}`}>
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
				</div>
			)}

			{/* User message actions */}
			{message.role === "user" && (
				<div className={`message-actions-wrapper${isActive ? " is-active" : ""}`}>
					<MessageActions
						isUser={true}
						onCopy={handleCopy}
						onEdit={onEdit}
					/>
				</div>
			)}
		</div>
	);
};

/** Legacy single-block markdown renderer */
function LegacyContent({
	content,
	app,
	messageId,
}: {
	content: string;
	app: App;
	messageId: string;
}): React.ReactElement {
	const contentRef = useRef<HTMLDivElement>(null);
	const [displayContent, setDisplayContent] = useState(content);

	useEffect(() => {
		setDisplayContent(content);
	}, [content]);

	useEffect(() => {
		if (!contentRef.current) return;
		const logger = (window as any).__obsidianAiLogger;
		let unmounted = false;

		try {
			contentRef.current.innerHTML = "";
			const comp = new Component();
			MarkdownRenderer.render(
				app,
				displayContent,
				contentRef.current,
				"",
				comp,
			).catch((err: any) => {
				if (unmounted || !contentRef.current) return;
				contentRef.current.innerHTML = "";
				contentRef.current.createEl("pre", {
					text: displayContent,
					cls: "chat-plaintext-fallback",
				});
			});
		} catch (err: any) {
			if (!contentRef.current) return;
			contentRef.current.innerHTML = "";
			contentRef.current.createEl("pre", {
				text: displayContent,
				cls: "chat-plaintext-fallback",
			});
		}

		return () => {
			unmounted = true;
		};
	}, [displayContent, app]);

	return <div ref={contentRef} className="chat-bubble-content" />;
}

export default MessageBubble;
