import React, { useState, useRef, useCallback } from "react";
import { MarkdownView } from "obsidian";
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

const SYSTEM_PROMPT = "You are a helpful assistant.";

const ChatApp: React.FC<ChatAppProps> = ({ plugin }) => {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [isStreaming, setIsStreaming] = useState(false);
	const [currentAiMessage, setCurrentAiMessage] = useState("");
	const [includeActiveNote, setIncludeActiveNote] = useState(false);
	const controllerRef = useRef<AbortController | null>(null);
	// Keep a ref so handleSend always sees the latest messages without stale closure
	const messagesRef = useRef<ChatMessage[]>([]);
	messagesRef.current = messages;

	const getActiveNoteName = (): string | null => {
		const leaves = plugin.app.workspace.getLeavesOfType("markdown");
		return leaves.length > 0
			? (leaves[0].view as MarkdownView).file?.basename ?? null
			: null;
	};

	const handleToggleActiveNote = useCallback(() => {
		setIncludeActiveNote((prev) => !prev);
	}, []);

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
			setCurrentAiMessage("");
			controllerRef.current = new AbortController();

			const history = messagesRef.current.map((m) => ({
				role: m.role as "user" | "assistant",
				content: m.content,
			}));

			let userContent = text;
			if (includeActiveNote) {
				const leaves = plugin.app.workspace.getLeavesOfType("markdown");
				const view =
					leaves.length > 0
						? (leaves[0].view as MarkdownView)
						: null;
				if (view?.file) {
					const noteContent = await plugin.app.vault.read(view.file);
					userContent = `<context>\n<active-note name="${view.file.basename}">\n${noteContent}\n</active-note>\n</context>\n\n${text}`;
				}
			}

			const chatMessages = [
				{ role: "system" as const, content: SYSTEM_PROMPT },
				...history,
				{ role: "user" as const, content: userContent },
			];

			let fullText = "";
			try {
				console.log(`[ChatApp] streamChat start — ${chatMessages.length} msgs`);
				for await (const chunk of plugin.chatapi.streamChat(
					chatMessages,
					controllerRef.current.signal,
				)) {
					fullText += chunk;
					setCurrentAiMessage(fullText);
				}
				console.log(`[ChatApp] streamChat done — ${fullText.length} chars`);
				setMessages((prev) => [
					...prev,
					{
						id: crypto.randomUUID(),
						role: "assistant",
						content: fullText,
						timestamp: Date.now(),
					},
				]);
			} catch (e: any) {
				if (e.name === "AbortError") {
					console.log(`[ChatApp] streamChat aborted — partial ${fullText.length} chars`);
					if (fullText) {
						setMessages((prev) => [
							...prev,
							{
								id: crypto.randomUUID(),
								role: "assistant",
								content: fullText + " [stopped]",
								timestamp: Date.now(),
							},
						]);
					}
				} else {
					console.error("[ChatApp] streamChat error:", e.message);
					setMessages((prev) => [
						...prev,
						{
							id: crypto.randomUUID(),
							role: "assistant",
							content: `Error: ${e.message}`,
							timestamp: Date.now(),
							isError: true,
						},
					]);
				}
			} finally {
				setIsStreaming(false);
				setCurrentAiMessage("");
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
				currentAiMessage={currentAiMessage}
				isStreaming={isStreaming}
				app={plugin.app}
			/>
			<ContextBar
				includeActiveNote={includeActiveNote}
				activeNoteName={getActiveNoteName()}
				onToggleActiveNote={handleToggleActiveNote}
			/>
			<ChatInput
				onSend={handleSend}
				onStop={handleStop}
				isStreaming={isStreaming}
			/>
		</div>
	);
};

export default ChatApp;
