import React, { useState, useRef, useCallback, useEffect } from "react";
import { MarkdownView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import { ChatPluginLike } from "../views/ObsidianAIChatView";
import { NoteEditingBridge } from "../noteEditing/NoteEditingBridge";
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
	const [targetNoteName, setTargetNoteName] = useState<string | null>(null);
	const controllerRef = useRef<AbortController | null>(null);
	// Refs so callbacks always see latest values without stale closures
	const messagesRef = useRef<ChatMessage[]>([]);
	messagesRef.current = messages;
	const includeActiveNoteRef = useRef(false);
	includeActiveNoteRef.current = includeActiveNote;
	// Tracks the last focused markdown leaf — updated by active-leaf-change event
	const lastMarkdownLeafRef = useRef<WorkspaceLeaf | null>(null);

	// Initialise leaf tracking and register workspace listener
	useEffect(() => {
		const initLeaf = plugin.app.workspace.getLeavesOfType("markdown")[0] ?? null;
		if (initLeaf?.view instanceof MarkdownView) {
			lastMarkdownLeafRef.current = initLeaf;
			setTargetNoteName((initLeaf.view as MarkdownView).file?.basename ?? null);
		}

		const onLeafChange = (leaf: WorkspaceLeaf | null) => {
			if (leaf?.view instanceof MarkdownView) {
				lastMarkdownLeafRef.current = leaf;
				setTargetNoteName((leaf.view as MarkdownView).file?.basename ?? null);
			}
		};

		// Cast needed: Obsidian's .on() overload typing doesn't narrow on event name string
		plugin.app.workspace.on("active-leaf-change", onLeafChange as any);
		return () => plugin.app.workspace.off("active-leaf-change", onLeafChange as any);
	}, [plugin]);

	// Load persisted messages on mount
	useEffect(() => {
		plugin.loadChatMessages().then((saved) => {
			if (saved.length > 0) {
				setMessages(saved);
				messagesRef.current = saved;
			}
		});
	}, [plugin]);

	// Persist messages whenever they change
	useEffect(() => {
		plugin.saveChatMessages(messages);
	}, [messages, plugin]);

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
			if (includeActiveNoteRef.current) {
				const leaf = lastMarkdownLeafRef.current;
				const view = leaf?.view instanceof MarkdownView ? (leaf.view as MarkdownView) : null;
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
		if (isStreaming) controllerRef.current?.abort();
		setMessages([]);
		plugin.saveChatMessages([]);
	}, [isStreaming, plugin]);

	const handleApply = useCallback(
		(content: string) => {
			const leaf = lastMarkdownLeafRef.current;
			if (!(leaf?.view instanceof MarkdownView)) {
				new Notice("⚠️ Open a note first to apply changes.");
				return;
			}
			NoteEditingBridge.applyToNote(
				plugin.app,
				leaf.view as MarkdownView,
				content,
				"Apply from chat",
			);
		},
		[plugin],
	);

	const handleAppend = useCallback(
		async (content: string) => {
			const leaf = lastMarkdownLeafRef.current;
			const file =
				leaf?.view instanceof MarkdownView
					? (leaf.view as MarkdownView).file
					: null;
			if (!(file instanceof TFile)) {
				new Notice("⚠️ No active note to append to.");
				return;
			}
			await NoteEditingBridge.appendToNote(plugin.app, file, content);
		},
		[plugin],
	);

	return (
		<div className="chat-panel">
			<ActionBar onNewChat={handleNewChat} plugin={plugin} />
			<ChatMessages
				messages={messages}
				currentAiMessage={currentAiMessage}
				isStreaming={isStreaming}
				app={plugin.app}
				targetNoteName={targetNoteName}
				onApply={handleApply}
				onAppend={handleAppend}
			/>
			<ContextBar
				includeActiveNote={includeActiveNote}
				activeNoteName={targetNoteName}
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
