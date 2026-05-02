import React, { useEffect, useRef } from "react";
import { App, Component, MarkdownRenderer } from "obsidian";
import { ChatMessage } from "./ChatApp";
import MessageBubble from "./MessageBubble";

const StreamingBubble: React.FC<{ content: string; app: App }> = ({
	content,
	app,
}) => {
	const contentRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!contentRef.current) return;
		contentRef.current.innerHTML = "";
		MarkdownRenderer.render(
			app,
			content,
			contentRef.current,
			"",
			new Component(),
		).catch(console.error);
	}, [content, app]);

	return (
		<div className="chat-bubble chat-bubble-assistant chat-bubble-streaming">
			<div className="chat-bubble-header">
				<span className="chat-bubble-role">Obsidian AI</span>
			</div>
			<div ref={contentRef} className="chat-bubble-content" />
		</div>
	);
};

interface ChatMessagesProps {
	messages: ChatMessage[];
	currentAiMessage: string;
	isStreaming: boolean;
	app: App;
}

const ChatMessages: React.FC<ChatMessagesProps> = ({
	messages,
	currentAiMessage,
	isStreaming,
	app,
}) => {
	const bottomRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages, isStreaming]);

	return (
		<div className="chat-messages">
			{messages.length === 0 && (
				<div className="chat-empty-state">
					Ask anything about your vault...
				</div>
			)}
			{messages.map((msg) => (
				<MessageBubble key={msg.id} message={msg} app={app} />
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
