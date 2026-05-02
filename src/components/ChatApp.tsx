import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { MarkdownView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import { ChatPluginLike } from "../views/ObsidianAIChatView";
import { NoteEditingBridge } from "../noteEditing/NoteEditingBridge";
import { ChatMessage, ChatSession } from "../types";
import ActionBar from "./ActionBar";
import ChatMessages from "./ChatMessages";
import ContextBar from "./ContextBar";
import ChatInput from "./ChatInput";
import SessionPickerModal from "./SessionPickerModal";

interface ChatAppProps {
	plugin: ChatPluginLike;
}

const SYSTEM_PROMPT = "You are a helpful assistant.";

function generateSessionTitle(messages: ChatMessage[]): string {
	const firstUser = messages.find((m) => m.role === "user");
	if (!firstUser) return `Chat ${new Date().toLocaleDateString()}`;
	const text = firstUser.content.trim();
	const clean = text.replace(/<context>[\s\S]*?<\/context>/, "").trim();
	if (clean.length === 0) return `Chat ${new Date().toLocaleDateString()}`;
	return clean.length > 40 ? clean.slice(0, 40) + "…" : clean;
}

function pruneSessions(
	sessions: ChatSession[],
	max: number,
	activeId: string | null,
): ChatSession[] {
	if (sessions.length <= max) return sessions;
	const sorted = [...sessions].sort((a, b) => a.updatedAt - b.updatedAt);
	const toRemove = sorted.slice(0, sessions.length - max);
	const removeIds = new Set(toRemove.map((s) => s.id));
	// Never prune the active session
	if (activeId) removeIds.delete(activeId);
	return sessions.filter((s) => !removeIds.has(s.id));
}

const ChatApp: React.FC<ChatAppProps> = ({ plugin }) => {
	const [sessions, setSessions] = useState<ChatSession[]>([]);
	const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
	const [isStreaming, setIsStreaming] = useState(false);
	const [currentAiMessage, setCurrentAiMessage] = useState("");
	const [includeActiveNote, setIncludeActiveNote] = useState(false);
	const [targetNoteName, setTargetNoteName] = useState<string | null>(null);
	const [showSessionPicker, setShowSessionPicker] = useState(false);
	const controllerRef = useRef<AbortController | null>(null);
	// Refs so callbacks always see latest values without stale closures
	const messagesRef = useRef<ChatMessage[]>([]);
	const includeActiveNoteRef = useRef(false);
	includeActiveNoteRef.current = includeActiveNote;
	const activeSessionIdRef = useRef<string | null>(null);
	activeSessionIdRef.current = activeSessionId;
	// Tracks the last focused markdown leaf — updated by active-leaf-change event
	const lastMarkdownLeafRef = useRef<WorkspaceLeaf | null>(null);

	const messages = useMemo(() => {
		const s = sessions.find((s) => s.id === activeSessionId);
		return s?.messages ?? [];
	}, [sessions, activeSessionId]);
	messagesRef.current = messages;

	// Initialise leaf tracking and register workspace listener
	useEffect(() => {
		const initLeaf =
			plugin.app.workspace.getLeavesOfType("markdown")[0] ?? null;
		if (initLeaf?.view instanceof MarkdownView) {
			lastMarkdownLeafRef.current = initLeaf;
			setTargetNoteName(
				(initLeaf.view as MarkdownView).file?.basename ?? null,
			);
		}

		const onLeafChange = (leaf: WorkspaceLeaf | null) => {
			if (leaf?.view instanceof MarkdownView) {
				lastMarkdownLeafRef.current = leaf;
				setTargetNoteName(
					(leaf.view as MarkdownView).file?.basename ?? null,
				);
			}
		};

		plugin.app.workspace.on("active-leaf-change", onLeafChange as any);
		return () =>
			plugin.app.workspace.off("active-leaf-change", onLeafChange as any);
	}, [plugin]);

	// Load persisted sessions on mount
	useEffect(() => {
		plugin.loadChatData().then((data) => {
			setSessions(data.sessions);
			setActiveSessionId(data.activeSessionId);
			if (!data.activeSessionId && data.sessions.length === 0) {
				const newSession: ChatSession = {
					id: crypto.randomUUID(),
					title: "",
					createdAt: Date.now(),
					updatedAt: Date.now(),
					messages: [],
				};
				setSessions([newSession]);
				setActiveSessionId(newSession.id);
			}
		});
	}, [plugin]);

	// Persist sessions whenever they change
	useEffect(() => {
		if (sessions.length > 0) {
			plugin.saveChatData({ sessions, activeSessionId });
		}
	}, [sessions, activeSessionId, plugin]);

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

			const currentActiveId = activeSessionIdRef.current;
			setSessions((prev) =>
				prev.map((s) =>
					s.id === currentActiveId
						? {
								...s,
								messages: [...s.messages, userMsg],
								updatedAt: Date.now(),
							}
						: s,
				),
			);
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
				const view =
					leaf?.view instanceof MarkdownView
						? (leaf.view as MarkdownView)
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
				const assistantMsg: ChatMessage = {
					id: crypto.randomUUID(),
					role: "assistant",
					content: fullText,
					timestamp: Date.now(),
				};
				setSessions((prev) =>
					prev.map((s) =>
						s.id === currentActiveId
							? {
									...s,
									messages: [...s.messages, assistantMsg],
									updatedAt: Date.now(),
								}
							: s,
					),
				);
			} catch (e: any) {
				if (e.name === "AbortError") {
					console.log(
						`[ChatApp] streamChat aborted — partial ${fullText.length} chars`,
					);
					if (fullText) {
						const stoppedMsg: ChatMessage = {
							id: crypto.randomUUID(),
							role: "assistant",
							content: fullText + " [stopped]",
							timestamp: Date.now(),
						};
						setSessions((prev) =>
							prev.map((s) =>
								s.id === currentActiveId
									? {
											...s,
											messages: [...s.messages, stoppedMsg],
											updatedAt: Date.now(),
										}
									: s,
							),
						);
					}
				} else {
					console.error("[ChatApp] streamChat error:", e.message);
					const errorMsg: ChatMessage = {
						id: crypto.randomUUID(),
						role: "assistant",
						content: `Error: ${e.message}`,
						timestamp: Date.now(),
						isError: true,
					};
					setSessions((prev) =>
						prev.map((s) =>
							s.id === currentActiveId
								? {
										...s,
										messages: [...s.messages, errorMsg],
										updatedAt: Date.now(),
									}
								: s,
						),
					);
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

		const currentActiveId = activeSessionIdRef.current;
		const newSession: ChatSession = {
			id: crypto.randomUUID(),
			title: "",
			createdAt: Date.now(),
			updatedAt: Date.now(),
			messages: [],
		};

		setSessions((prev) => {
			const currentSession = prev.find((s) => s.id === currentActiveId);
			// If current session is empty, just keep it instead of creating another empty one
			if (currentSession && currentSession.messages.length === 0) {
				return prev.map((s) =>
					s.id === currentActiveId ? { ...s, updatedAt: Date.now() } : s,
				);
			}
			const updated = prev.map((s) =>
				s.id === currentActiveId
					? {
							...s,
							title: s.title || generateSessionTitle(s.messages),
							updatedAt: Date.now(),
						}
					: s,
			);
			const withNew = [...updated, newSession];
			const max = plugin.settings.maxSavedConversations || 20;
			return pruneSessions(withNew, max, newSession.id);
		});
		setActiveSessionId(newSession.id);
	}, [isStreaming, plugin]);

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

	const handleInsertAtCursor = useCallback(
		(content: string) => {
			const leaf = lastMarkdownLeafRef.current;
			if (!(leaf?.view instanceof MarkdownView)) {
				new Notice("⚠️ Open a note first to insert at cursor.");
				return;
			}
			NoteEditingBridge.insertAtCursor(
				plugin.app,
				leaf.view as MarkdownView,
				content,
			);
		},
		[plugin],
	);

	const handleLoadSession = useCallback((sessionId: string) => {
		setActiveSessionId(sessionId);
		setShowSessionPicker(false);
	}, []);

	const handleDeleteSession = useCallback(
		(sessionId: string) => {
			setSessions((prev) => {
				const filtered = prev.filter((s) => s.id !== sessionId);
				// If deleting the active session, activate the most recent remaining
				if (activeSessionIdRef.current === sessionId) {
					const mostRecent = filtered.sort(
						(a, b) => b.updatedAt - a.updatedAt,
					)[0];
					if (mostRecent) {
						setActiveSessionId(mostRecent.id);
					} else {
						// No sessions left — create a new empty one
						const empty: ChatSession = {
							id: crypto.randomUUID(),
							title: "",
							createdAt: Date.now(),
							updatedAt: Date.now(),
							messages: [],
						};
						filtered.push(empty);
						setActiveSessionId(empty.id);
					}
				}
				return filtered;
			});
		},
		[],
	);

	const hasHistory = sessions.some((s) => s.messages.length > 0);

	return (
		<div className="chat-panel">
			<ActionBar
				onNewChat={handleNewChat}
				onLoadChat={() => setShowSessionPicker(true)}
				canLoad={hasHistory}
				plugin={plugin}
			/>
			<ChatMessages
				messages={messages}
				currentAiMessage={currentAiMessage}
				isStreaming={isStreaming}
				app={plugin.app}
				onAppend={handleAppend}
				onInsertAtCursor={handleInsertAtCursor}
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
			{showSessionPicker && (
				<SessionPickerModal
					sessions={sessions}
					activeSessionId={activeSessionId}
					onLoad={handleLoadSession}
					onDelete={handleDeleteSession}
					onClose={() => setShowSessionPicker(false)}
				/>
			)}
		</div>
	);
};

export default ChatApp;
