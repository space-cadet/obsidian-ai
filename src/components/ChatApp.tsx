import React, { useState, useRef, useCallback } from "react";
import { ChatPluginLike } from "../views/ObsidianAIChatView";
import ActionBar from "./ActionBar";
import ChatMessages from "./ChatMessages";
import ContextBar from "./ContextBar";
import ChatInput from "./ChatInput";

export interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp: number;
	isError?: boolean;
}

interface ChatAppProps {
	plugin: ChatPluginLike;
}

const ChatApp: React.FC<ChatAppProps> = ({ plugin }) => {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [isStreaming, setIsStreaming] = useState(false);
	const controllerRef = useRef<AbortController | null>(null);

	const handleSend = useCallback(
		async (text: string) => {
			if (!text.trim() || isStreaming) return;

			const userMsg: ChatMessage = {
				id: crypto.randomUUID(),
				role: "user",
				content: text,
				timestamp: Date.now(),
			};
			setMessages((prev) => [...prev, userMsg]);
			setIsStreaming(true);
			controllerRef.current = new AbortController();

			try {
				// T4: replace with streamChat(messages, controller.signal) when streaming is implemented
				const response = await plugin.chatapi.callApi(
					"You are a helpful assistant.",
					text,
				);
				const aiMsg: ChatMessage = {
					id: crypto.randomUUID(),
					role: "assistant",
					content: response,
					timestamp: Date.now(),
				};
				setMessages((prev) => [...prev, aiMsg]);
			} catch (e: any) {
				const errMsg: ChatMessage = {
					id: crypto.randomUUID(),
					role: "assistant",
					content: `Error: ${e.message}`,
					timestamp: Date.now(),
					isError: true,
				};
				setMessages((prev) => [...prev, errMsg]);
			} finally {
				setIsStreaming(false);
				controllerRef.current = null;
			}
		},
		[isStreaming, plugin],
	);

	const handleStop = useCallback(() => {
		controllerRef.current?.abort();
	}, []);

	const handleNewChat = useCallback(() => {
		if (isStreaming) {
			controllerRef.current?.abort();
		}
		setMessages([]);
	}, [isStreaming]);

	return (
		<div className="chat-panel">
			<ActionBar onNewChat={handleNewChat} plugin={plugin} />
			<ChatMessages
				messages={messages}
				isStreaming={isStreaming}
				app={plugin.app}
			/>
			<ContextBar />
			<ChatInput
				onSend={handleSend}
				onStop={handleStop}
				isStreaming={isStreaming}
			/>
		</div>
	);
};

export default ChatApp;
