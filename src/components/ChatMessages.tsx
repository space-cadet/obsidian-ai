import React, { useEffect, useRef } from "react";
import { App } from "obsidian";
import { ChatMessage } from "./ChatApp";
import MessageBubble from "./MessageBubble";

interface ChatMessagesProps {
	messages: ChatMessage[];
	isStreaming: boolean;
	app: App;
}

const ChatMessages: React.FC<ChatMessagesProps> = ({
	messages,
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
			{isStreaming && (
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
