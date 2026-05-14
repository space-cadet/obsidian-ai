import React, { useEffect, useRef } from "react";
import { App, Component, MarkdownRenderer } from "obsidian";
import { ChatMessage } from "../types";
import MessageBubble from "./MessageBubble";

const StreamingBubble: React.FC<{ content: string; app: App }> = ({
	content,
	app,
}) => {
	const contentRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!contentRef.current) return;
		const logger = (window as any).__obsidianAiLogger;
		let unmounted = false;

		logger?.writeDirect?.(
			"debug",
			`[StreamingBubble] Step 1: entering useEffect — ${content.length} chars`,
		);

		try {
			logger?.writeDirect?.(
				"debug",
				`[StreamingBubble] Step 2: clearing innerHTML`,
			);
			contentRef.current.innerHTML = "";

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
	}, [content, app]);

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
	const bottomRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		// Use "auto" instead of "smooth" to avoid Chromium renderer crashes
		// when rapid DOM mutations (StreamingBubble unmount + MessageBubble mount)
		// happen simultaneously with scroll animation.
		bottomRef.current?.scrollIntoView({ behavior: "auto" });
	}, [messages, isStreaming]);

	return (
		<div className="chat-messages">
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
				<StreamingBubble content={currentAiMessage} app={app} />
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
	);
};

export default ChatMessages;
