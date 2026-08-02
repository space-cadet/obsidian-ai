import React, { useEffect, useRef, useState, useCallback } from "react";
import { App, Component, MarkdownRenderer } from "obsidian";
import { ChatMessage, ContentPart } from "../types";
import { createRoot } from "react-dom/client";
import MessageBubble from "./MessageBubble";
import ToolCallNotification from "./ToolCallNotification";
import { sanitizeHtmlForRenderer } from "../lib/sanitizeHtml";

const StreamingBubble: React.FC<{
	content: string;
	contentParts?: ContentPart[];
	app: App;
	onOpenPastSession?: (sessionId: string, messageId: string) => void;
}> = ({ content, contentParts, app, onOpenPastSession }) => {
	const contentRef = useRef<HTMLDivElement>(null);
	const renderedCountRef = useRef(0);
	const lastTextRef = useRef("");
	const wasPartsModeRef = useRef(false);
	const toolRootsRef = useRef<Map<number, ReturnType<typeof createRoot>>>(new Map());

	useEffect(() => {
		if (!contentRef.current) return;
		const logger = (window as any).__obsidianAiLogger;
		let unmounted = false;

		logger?.writeDirect?.(
			"debug",
			`[StreamingBubble] entering useEffect — ${content.length} chars, ${contentParts?.length ?? 0} parts`,
		);

		try {
			const isPartsMode = Boolean(contentParts && contentParts.length > 0);

			// If we just switched from text-only to parts mode, clear the DOM to avoid
			// duplication — the text-only path may have already rendered content directly
			// into contentRef.current, and the parts path appends without clearing.
			if (isPartsMode && !wasPartsModeRef.current && contentRef.current) {
				contentRef.current.empty();
				renderedCountRef.current = 0;
				lastTextRef.current = "";
				logger?.writeDirect?.(
					"debug",
					`[StreamingBubble] cleared DOM on text→parts transition`,
				);
			}
			wasPartsModeRef.current = isPartsMode;

			// If we have contentParts with tool calls, use incremental rendering to avoid flicker
			if (contentParts && contentParts.length > 0) {
				const currentCount = renderedCountRef.current;
				const newParts = contentParts.slice(currentCount);

				// Update already-rendered tool calls when their results arrive (hourglass → checkmark)
				for (let i = 0; i < Math.min(currentCount, contentParts.length); i++) {
					const part = contentParts[i];
					if (part.type === "tool_call") {
						const root = toolRootsRef.current.get(i);
						if (root) {
							root.render(
								<ToolCallNotification
									toolCall={part.call}
									result={part.result}
									isPending={!part.result}
									onOpenPastSession={onOpenPastSession}
								/>
							);
						}
					}
				}

				// Render only new parts (append mode)
				for (let i = 0; i < newParts.length; i++) {
					const part = newParts[i];
					const partIndex = currentCount + i;
					if (part.type === "text") {
						const textDiv = contentRef.current.createDiv({ cls: "chat-bubble-text" });
						const comp = new Component();
						MarkdownRenderer.render(app, sanitizeHtmlForRenderer(part.content), textDiv, "", comp);
					} else if (part.type === "tool_call") {
						const toolDiv = contentRef.current.createDiv({ cls: "chat-bubble-tool" });
						const root = createRoot(toolDiv);
						toolRootsRef.current.set(partIndex, root);
						root.render(
							<ToolCallNotification
							toolCall={part.call}
							result={part.result}
							isPending={!part.result}
							onOpenPastSession={onOpenPastSession}
							/>
						);
					}
				}
				renderedCountRef.current = contentParts.length;

				// Update remaining text after last checkpoint (always re-render to keep in sync)
				const lastTextPart = contentParts.filter(p => p.type === "text").pop();
				if (lastTextPart && lastTextPart.type === "text") {
					const idx = content.lastIndexOf(lastTextPart.content);
					const remainingText = idx >= 0
						? content.slice(idx + lastTextPart.content.length)
						: content;
					if (remainingText.trim()) {
						// Check if we already have a remaining-text div
						let remainDiv = contentRef.current.querySelector(".chat-bubble-remain") as HTMLDivElement | null;
						if (!remainDiv) {
							remainDiv = contentRef.current.createDiv({ cls: "chat-bubble-remain" });
						} else {
							remainDiv.empty();
						}
						const comp = new Component();
						MarkdownRenderer.render(app, sanitizeHtmlForRenderer(remainingText), remainDiv, "", comp);
					}
				}
			} else {
				// Simple text-only streaming (no tool calls) — only re-render if text changed
				if (content !== lastTextRef.current) {
					lastTextRef.current = content;
					contentRef.current.empty();
					logger?.writeDirect?.(
						"debug",
						`[StreamingBubble] text changed, re-rendering`,
					);
					const comp = new Component();
					MarkdownRenderer.render(
						app,
						sanitizeHtmlForRenderer(content),
						contentRef.current,
						"",
						comp,
					).then(() => {
						if (unmounted) return;
						logger?.writeDirect?.(
							"debug",
							`[StreamingBubble] MarkdownRenderer.render resolved`,
						);
					}).catch((err: any) => {
						if (unmounted) return;
						logger?.writeDirect?.(
							"error",
							`[StreamingBubble] MarkdownRenderer.render rejected:`,
							err,
						);
						if (contentRef.current) {
							contentRef.current.empty();
							contentRef.current.createEl("pre", {
								text: content,
								cls: "chat-plaintext-fallback",
							});
						}
					});
				}
			}
		} catch (err: any) {
			logger?.writeDirect?.(
				"fatal",
				`[StreamingBubble] MarkdownRenderer.render threw synchronously:`,
				err,
			);
			if (contentRef.current) {
				contentRef.current.empty();
				contentRef.current.createEl("pre", {
					text: content,
					cls: "chat-plaintext-fallback",
				});
			}
		}

		return () => {
			unmounted = true;
		};
	}, [content, contentParts, app, onOpenPastSession]);

	// Cleanup tool roots on unmount
	useEffect(() => {
		return () => {
			toolRootsRef.current.forEach((root) => root.unmount());
			toolRootsRef.current.clear();
		};
	}, []);

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
	showThinking?: boolean;
	onOpenPastSession?: (sessionId: string, messageId: string) => void;
	scrollToMessageId?: string;
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
	showThinking,
	onOpenPastSession,
	scrollToMessageId,
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

	useEffect(() => {
		if (!scrollToMessageId) return;
		const target = scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${scrollToMessageId}"]`);
		if (!target) return;
		target.scrollIntoView({ behavior: "smooth", block: "center" });
		target.classList.add("chat-message-highlight");
		const timer = window.setTimeout(() => target.classList.remove("chat-message-highlight"), 2000);
		return () => window.clearTimeout(timer);
	}, [scrollToMessageId, messages]);

	useEffect(() => {
		if (!scrollToMessageId) return;
		const target = scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${scrollToMessageId}"]`);
		if (!target) return;
		target.scrollIntoView({ behavior: "smooth", block: "center" });
		target.classList.add("chat-message-highlight");
		const timer = window.setTimeout(() => target.classList.remove("chat-message-highlight"), 2000);
		return () => window.clearTimeout(timer);
	}, [scrollToMessageId, messages]);

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
					<div key={msg.id} data-message-id={msg.id}>
						<MessageBubble
							message={msg}
							app={app}
							showThinking={showThinking}
							onOpenPastSession={onOpenPastSession}
							onAppend={onAppend}
							onInsertAtCursor={onInsertAtCursor}
							onApply={onApply}
							onRetry={() => onRetry(msg.id)}
							onEdit={() => onEdit(msg.id)}
							onApplyToTarget={onApplyToTarget}
							onCreateNote={onCreateNote}
							onAppendToTarget={onAppendToTarget}
						/>
					</div>
				))}
				{isStreaming && currentAiMessage && (
					<StreamingBubble content={currentAiMessage} contentParts={currentContentParts} app={app} onOpenPastSession={onOpenPastSession} />
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
