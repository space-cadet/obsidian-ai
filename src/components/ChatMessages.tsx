import React, { useEffect, useRef, useState, useCallback } from "react";
import { App, Component, MarkdownRenderer } from "obsidian";
import { ChatMessage, ContentPart } from "../types";
import MessageBubble from "./MessageBubble";
import PendingToolCard from "./PendingToolCard";

const StreamingBubble: React.FC<{
	content: string;
	contentParts?: ContentPart[];
	app: App;
}> = ({ content, contentParts, app }) => {
	const contentRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!contentRef.current) return;
		const logger = (window as any).__obsidianAiLogger;
		let unmounted = false;

		logger?.writeDirect?.(
			"debug",
			`[StreamingBubble] Step 1: entering useEffect — ${content.length} chars, ${contentParts?.length ?? 0} parts`,
		);

		try {
			logger?.writeDirect?.(
				"debug",
				`[StreamingBubble] Step 2: clearing innerHTML`,
			);
			contentRef.current.innerHTML = "";

			// If we have contentParts with tool calls, render them as structured UI
			if (contentParts && contentParts.length > 0) {
				for (const part of contentParts) {
					if (part.type === "text") {
						const textDiv = contentRef.current.createDiv({ cls: "chat-bubble-text" });
						const comp = new Component();
						MarkdownRenderer.render(app, part.content, textDiv, "", comp);
					} else if (part.type === "tool_call") {
						const toolDiv = contentRef.current.createDiv({ cls: "chat-bubble-tool" });
						if (part.result) {
							// Render completed tool result
							const resultDiv = toolDiv.createDiv();
							resultDiv.innerHTML = `<div class="tool-result-inline">✓ ${part.call.toolName}</div>`;
						} else {
							// Render pending tool call
							const pendingDiv = toolDiv.createDiv();
							pendingDiv.innerHTML = `<div class="tool-pending-inline">⏳ ${part.call.toolName}...</div>`;
						}
					}
				}
				// Render any remaining text after last checkpoint
				const lastTextPart = contentParts.filter(p => p.type === "text").pop();
				if (lastTextPart && lastTextPart.type === "text") {
					const remainingText = content.slice(content.lastIndexOf(lastTextPart.content) + lastTextPart.content.length);
					if (remainingText.trim()) {
						const remainDiv = contentRef.current.createDiv({ cls: "chat-bubble-text" });
						const comp = new Component();
						MarkdownRenderer.render(app, remainingText, remainDiv, "", comp);
					}
				}
			} else {
				// Simple text-only streaming (no tool calls)
				logger?.writeDirect?.(
					"debug",
					`[StreamingBubble] Step 3: creating Component`,
				);
				const comp = new Component();

				logger?.writeDirect?.(
					"debug",
					`[StreamingBubble] Step 4: calling MarkdownRenderer.render`,
				);
				MarkdownRenderer.render(
					app,
					content,
					contentRef.current,
					"",
					comp,
				).then(() => {
					if (unmounted) return;
					logger?.writeDirect?.(
						"debug",
						`[StreamingBubble] Step 5: MarkdownRenderer.render resolved`,
					);
				}).catch((err: any) => {
					if (unmounted) return;
					logger?.writeDirect?.(
						"error",
						`[StreamingBubble] MarkdownRenderer.render rejected:`,
						err,
					);
					if (contentRef.current) {
						contentRef.current.innerHTML = "";
						contentRef.current.createEl("pre", {
							text: content,
							cls: "chat-plaintext-fallback",
						});
					}
				});
			}
		} catch (err: any) {
			logger?.writeDirect?.(
				"fatal",
				`[StreamingBubble] MarkdownRenderer.render threw synchronously:`,
				err,
			);
			if (contentRef.current) {
				contentRef.current.innerHTML = "";
				contentRef.current.createEl("pre", {
					text: content,
					cls: "chat-plaintext-fallback",
				});
			}
		}

		return () => {
			unmounted = true;
		};
	}, [content, contentParts, app]);

	return (
		<div className="chat-bubble chat-bubble-assistant chat-bubble-streaming">
			<div className="chat-bubble-header">
				<span className="chat-bubble-role">Obsidian AI</span>
				<span className="chat-streaming-indicator" title="Generating response...">
					<span className="chat-streaming-dot" />
					<span className="chat-streaming-label">Generating</span>
				</span>
			</div>
			<div ref={contentRef} className="chat-bubble-content" />
		</div>
	);
};

interface ChatMessagesProps {
	messages: ChatMessage[];
	currentAiMessage: string;
	currentContentParts?: ContentPart[];
	isStreaming: boolean;
	isEditing: boolean;
	app: App;
	onAppend: (content: string) => void;
	onInsertAtCursor: (content: string) => void;
	onApply: (content: string) => void;
	onRetry: (messageId: string) => void;
	onEdit: (messageId: string) => void;
	onApplyToTarget: (content: string, target: string) => void;
	onCreateNote: (content: string, target: string) => void;
	onAppendToTarget: (content: string, target: string) => void;
}

const ChatMessages: React.FC<ChatMessagesProps> = ({
	messages,
	currentAiMessage,
	currentContentParts,
	isStreaming,
	isEditing,
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
	const scrollRef = useRef<HTMLDivElement>(null);
	const bottomRef = useRef<HTMLDivElement>(null);
	const [showScrollTop, setShowScrollTop] = useState(false);
	const [showScrollBottom, setShowScrollBottom] = useState(false);
	const isNearBottomRef = useRef(true);
	const prevMessagesLength = useRef(messages.length);

	/** Check scroll position and update button visibility */
	const checkScrollPosition = useCallback(() => {
		const container = scrollRef.current;
		if (!container) return;
		const threshold = 80;
		const distanceFromBottom =
			container.scrollHeight - container.scrollTop - container.clientHeight;
		const atBottom = distanceFromBottom < threshold;
		isNearBottomRef.current = atBottom;
		setShowScrollBottom(!atBottom && messages.length > 0);
		setShowScrollTop(container.scrollTop > 200);
	}, [messages.length]);

	/** Attach scroll listener */
	useEffect(() => {
		const container = scrollRef.current;
		if (!container) return;
		const onScroll = () => checkScrollPosition();
		container.addEventListener("scroll", onScroll, { passive: true });
		checkScrollPosition();
		return () => container.removeEventListener("scroll", onScroll);
	}, [checkScrollPosition]);

	/** Auto-scroll to bottom on new messages or streaming content — but ONLY if user is already near bottom */
	useEffect(() => {
		if (messages.length > prevMessagesLength.current || isStreaming) {
			if (isNearBottomRef.current) {
				bottomRef.current?.scrollIntoView({ behavior: "auto" });
			}
			// Update button visibility after render
			requestAnimationFrame(checkScrollPosition);
		}
		prevMessagesLength.current = messages.length;
	}, [messages, isStreaming, currentAiMessage, checkScrollPosition]);

	/** Scroll to bottom on mount if there are messages */
	useEffect(() => {
		if (messages.length > 0) {
			bottomRef.current?.scrollIntoView({ behavior: "auto" });
			isNearBottomRef.current = true;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const scrollToTop = useCallback(() => {
		scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
	}, []);

	const scrollToBottom = useCallback(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
		isNearBottomRef.current = true;
		setShowScrollBottom(false);
	}, []);

	return (
		<div className="chat-messages-scroll-wrapper">
			<div className="chat-messages" ref={scrollRef}>
				{messages.length === 0 && (
					<div className="chat-empty-state">
						Ask anything about your vault...
					</div>
				)}
				{messages.map((msg) => (
					<MessageBubble
						key={msg.id}
						message={msg}
						app={app}
						onAppend={onAppend}
						onInsertAtCursor={onInsertAtCursor}
						onApply={onApply}
						onRetry={() => onRetry(msg.id)}
						onEdit={() => onEdit(msg.id)}
						onApplyToTarget={onApplyToTarget}
						onCreateNote={onCreateNote}
						onAppendToTarget={onAppendToTarget}
					/>
				))}
				{isStreaming && currentAiMessage && (
					<StreamingBubble content={currentAiMessage} contentParts={currentContentParts} app={app} />
				)}
				{isStreaming && !currentAiMessage && (
					<div className="chat-typing-indicator">
						<span />
						<span />
						<span />
					</div>
				)}
				<div ref={bottomRef} />
			</div>
			{showScrollTop && (
				<button
					className="chat-scroll-btn chat-scroll-top"
					onClick={scrollToTop}
					title="Scroll to top"
				>
					<svg
						viewBox="0 0 24 24"
						width="16"
						height="16"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<polyline points="18 15 12 9 6 15" />
					</svg>
				</button>
			)}
			{showScrollBottom && (
				<button
					className="chat-scroll-btn chat-scroll-bottom"
					onClick={scrollToBottom}
					title="Scroll to bottom"
				>
					<svg
						viewBox="0 0 24 24"
						width="16"
						height="16"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<polyline points="6 9 12 15 18 9" />
					</svg>
				</button>
			)}
		</div>
	);
};

export default ChatMessages;
