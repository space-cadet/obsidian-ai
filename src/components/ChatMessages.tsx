import React, { useEffect, useRef } from "react";
import { App } from "obsidian";
import { ChatMessage } from "./ChatApp";
import MessageBubble from "./MessageBubble";

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
				<div className="chat-bubble chat-bubble-assistant chat-bubble-streaming">
					<div className="chat-bubble-header">
						<span className="chat-bubble-role">Obsidian AI</span>
					</div>
					<div className="chat-bubble-content">{currentAiMessage}</div>
				</div>
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
