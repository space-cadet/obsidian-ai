import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { MarkdownView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import { ChatPluginLike } from "../views/ObsidianAIChatView";
import { NoteEditingBridge } from "../noteEditing/NoteEditingBridge";
import { ChatMessage, ChatSession, ContextItem } from "../types";
import { resolveContextItems } from "../context/ContextEngine";
import ActionBar from "./ActionBar";
import ChatMessages from "./ChatMessages";
import ContextBar from "./ContextBar";
import ChatInput from "./ChatInput";
import SessionPickerModal from "./SessionPickerModal";
import ContextPickerModal from "./ContextPickerModal";

interface ChatAppProps {
	plugin: ChatPluginLike;
}

function buildSystemPrompt(
	contextItems: ContextItem[],
	slashCmd?: SlashCommand,
): string {
	let prompt =
		"You are a helpful assistant integrated into an Obsidian note-taking app.";
	const hasActiveNote = contextItems.some((i) => i.type === "active-note");

	if (slashCmd) {
		switch (slashCmd.command) {
			case "edit":
				prompt += `\n\nThe user wants to edit the note "${slashCmd.target}". Return ONLY the complete revised note content. Do not wrap it in markdown code blocks or add explanations.`;
				break;
			case "create":
				prompt += `\n\nThe user wants to create a new note named "${slashCmd.target}". Return the complete note content.`;
				break;
			case "append":
				prompt += `\n\nThe user wants to append to the note "${slashCmd.target}". Return only the new content to append.`;
				break;
		}
	} else if (hasActiveNote) {
		prompt +=
			"\n\nThe active note is included in context. When the user asks you to edit, rewrite, or improve the note, return ONLY the complete revised note content. Do not wrap it in markdown code blocks or add explanations.";
	}
	return prompt;
}

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

function makeId(): string {
	return crypto.randomUUID();
}

interface SlashCommand {
	command: "edit" | "create" | "append";
	target: string;
	prompt: string;
}

function parseSlashCommand(text: string): SlashCommand | null {
	const match = text.match(
		/^\/(edit|create|append)\s+(?:\[\[)?([^\]\n]+?)(?:\]\])?(?:\s+([\s\S]*))?$/i,
	);
	if (!match) return null;
	return {
		command: match[1].toLowerCase() as "edit" | "create" | "append",
		target: match[2].trim(),
		prompt: (match[3] ?? "").trim(),
	};
}

const ChatApp: React.FC<ChatAppProps> = ({ plugin }) => {
	const [sessions, setSessions] = useState<ChatSession[]>([]);
	const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
	const [isStreaming, setIsStreaming] = useState(false);
	const [currentAiMessage, setCurrentAiMessage] = useState("");
	const [contextItems, setContextItems] = useState<ContextItem[]>([]);
	const [wasTruncated, setWasTruncated] = useState(false);
	const [targetNoteName, setTargetNoteName] = useState<string | null>(null);
	const [showSessionPicker, setShowSessionPicker] = useState(false);
	const [showContextPicker, setShowContextPicker] = useState(false);
	const controllerRef = useRef<AbortController | null>(null);
	// Refs so callbacks always see latest values without stale closures
	const messagesRef = useRef<ChatMessage[]>([]);
	const contextItemsRef = useRef<ContextItem[]>([]);
	const sessionsRef = useRef<ChatSession[]>([]);
	contextItemsRef.current = contextItems;
	sessionsRef.current = sessions;
	const activeSessionIdRef = useRef<string | null>(null);
	activeSessionIdRef.current = activeSessionId;
	// Tracks the last focused markdown leaf
	const lastMarkdownLeafRef = useRef<WorkspaceLeaf | null>(null);

	const messages = useMemo(() => {
		const s = sessions.find((s) => s.id === activeSessionId);
		return s?.messages ?? [];
	}, [sessions, activeSessionId]);
	messagesRef.current = messages;

	// Sync contextItems when active session changes
	useEffect(() => {
		const s = sessions.find((s) => s.id === activeSessionId);
		setContextItems(s?.contextItems ?? []);
		setWasTruncated(false);
	}, [activeSessionId, sessions]);

	// Persist contextItems to the current session whenever they change
	useEffect(() => {
		const currentActiveId = activeSessionIdRef.current;
		if (!currentActiveId) return;
		setSessions((prev) =>
			prev.map((s) =>
				s.id === currentActiveId ? { ...s, contextItems } : s,
			),
		);
		setWasTruncated(false);
	}, [contextItems]);

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
			plugin.app.workspace.off(
				"active-leaf-change",
				onLeafChange as any,
			);
	}, [plugin]);

	// Load persisted sessions on mount
	useEffect(() => {
		plugin.loadChatData().then((data) => {
			setSessions(data.sessions);
			setActiveSessionId(data.activeSessionId);
			if (!data.activeSessionId && data.sessions.length === 0) {
				const newSession: ChatSession = {
					id: makeId(),
					title: "",
					createdAt: Date.now(),
					updatedAt: Date.now(),
					messages: [],
					contextItems: plugin.settings.includeActiveNote
						? [{ type: "active-note", id: makeId() }]
						: [],
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
		setContextItems((prev) => {
			const hasActive = prev.some((i) => i.type === "active-note");
			if (hasActive) {
				return prev.filter((i) => i.type !== "active-note");
			}
			return [...prev, { type: "active-note", id: makeId() }];
		});
	}, []);

	const handleRemoveContextItem = useCallback((id: string) => {
		setContextItems((prev) => prev.filter((i) => i.id !== id));
	}, []);

	const handleAddMention = useCallback((item: ContextItem) => {
		handleAddContextItems([item]);
	}, []);

	const handleAddContextItems = useCallback((items: ContextItem[]) => {
		setContextItems((prev) => {
			const existing = new Set(
				prev.map((i) => {
					if (i.type === "note") return `note:${i.path}`;
					if (i.type === "folder") return `folder:${i.path}`;
					if (i.type === "tag") return `tag:${i.tag}`;
					return `active:${i.id}`;
				}),
			);
			const merged = [...prev];
			for (const item of items) {
				const key =
					item.type === "note"
						? `note:${item.path}`
						: item.type === "folder"
							? `folder:${item.path}`
							: item.type === "tag"
								? `tag:${item.tag}`
								: `active:${item.id}`;
				if (!existing.has(key)) {
					existing.add(key);
					merged.push(item);
				}
			}
			return merged;
		});
		setShowContextPicker(false);
	}, []);

	const handleSend = useCallback(
		async (text: string) => {
			if (!text.trim() || isStreaming) return;

			// Parse slash commands
			const slashCmd = parseSlashCommand(text);
			let sendText = text;
			let sendContextItems = contextItemsRef.current;
			let commandMeta: ChatMessage["command"] = undefined;

			if (slashCmd) {
				commandMeta = {
					type: slashCmd.command,
					target: slashCmd.target,
				};
				sendText =
					slashCmd.prompt ||
					`Please ${slashCmd.command} ${slashCmd.target}`;

				if (slashCmd.command === "edit" || slashCmd.command === "append") {
					// Resolve target note and add to context
					const file =
						plugin.app.metadataCache.getFirstLinkpathDest(
							slashCmd.target,
							"",
						);
					if (file && file instanceof TFile) {
						const exists = sendContextItems.some(
							(i) =>
								i.type === "note" && i.path === file.path,
						);
						if (!exists) {
							sendContextItems = [
								...sendContextItems,
								{
									type: "note",
									path: file.path,
									name: file.basename,
									id: makeId(),
								},
							];
						}
					}
				}
			}

			const userMsg: ChatMessage = {
				id: makeId(),
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
								contextItems: contextItemsRef.current,
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

			let userContent = sendText;
			const resolved = await resolveContextItems(
				sendContextItems,
				plugin.app,
				plugin.settings.maxContextTokens || 8000,
			);
			setWasTruncated(resolved.wasTruncated);
			if (resolved.contextString) {
				userContent = `${resolved.contextString}\n\n${sendText}`;
			}

			const chatMessages = [
				{
					role: "system" as const,
					content: buildSystemPrompt(sendContextItems, slashCmd ?? undefined),
				},
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
					id: makeId(),
					role: "assistant",
					content: fullText,
					timestamp: Date.now(),
					command: commandMeta,
				};
				setSessions((prev) =>
					prev.map((s) =>
						s.id === currentActiveId
							? {
									...s,
									messages: [...s.messages, assistantMsg],
									updatedAt: Date.now(),
									contextItems: contextItemsRef.current,
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
							id: makeId(),
							role: "assistant",
							content: fullText + " [stopped]",
							timestamp: Date.now(),
							command: commandMeta,
						};
						setSessions((prev) =>
							prev.map((s) =>
								s.id === currentActiveId
									? {
											...s,
											messages: [...s.messages, stoppedMsg],
											updatedAt: Date.now(),
											contextItems: contextItemsRef.current,
										}
										: s,
							),
						);
					}
				} else {
					console.error("[ChatApp] streamChat error:", e.message);
					const errorMsg: ChatMessage = {
						id: makeId(),
						role: "assistant",
						content: `Error: ${e.message}`,
						timestamp: Date.now(),
						isError: true,
						command: commandMeta,
					};
					setSessions((prev) =>
						prev.map((s) =>
							s.id === currentActiveId
								? {
										...s,
										messages: [...s.messages, errorMsg],
										updatedAt: Date.now(),
										contextItems: contextItemsRef.current,
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
			id: makeId(),
			title: "",
			createdAt: Date.now(),
			updatedAt: Date.now(),
			messages: [],
			contextItems: plugin.settings.includeActiveNote
				? [{ type: "active-note", id: makeId() }]
				: [],
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
		setWasTruncated(false);
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

	const handleApply = useCallback(
		(content: string) => {
			const leaf = lastMarkdownLeafRef.current;
			if (!(leaf?.view instanceof MarkdownView)) {
				new Notice("⚠️ Open a note first to apply edits.");
				return;
			}
			const view = leaf.view as MarkdownView;
			NoteEditingBridge.applyToNote(
				plugin.app,
				view,
				content,
				"Apply AI edit",
			);
		},
		[plugin],
	);

	const handleRetry = useCallback(
		(messageId: string) => {
			if (isStreaming) return;
			const currentActiveId = activeSessionIdRef.current;
			if (!currentActiveId) return;

			const session = sessionsRef.current.find(
				(s) => s.id === currentActiveId,
			);
			if (!session) return;

			const assistantIndex = session.messages.findIndex(
				(m) => m.id === messageId,
			);
			if (assistantIndex <= 0) return;

			// Find the preceding user message
			let userIndex = -1;
			for (let i = assistantIndex - 1; i >= 0; i--) {
				if (session.messages[i].role === "user") {
					userIndex = i;
					break;
				}
			}
			if (userIndex === -1) return;

			const userMsg = session.messages[userIndex];
			const truncated = session.messages.slice(0, userIndex);

			// Update ref so handleSend sees truncated history
			messagesRef.current = truncated;

			setSessions((prev) =>
				prev.map((s) =>
					s.id === currentActiveId
						? { ...s, messages: truncated, updatedAt: Date.now() }
						: s,
				),
			);

			console.log(`[ChatApp] retry message ${messageId} — re-sending user msg`);
			handleSend(userMsg.content);
		},
		[isStreaming, handleSend],
	);

	const handleApplyToTarget = useCallback(
		async (content: string, target: string) => {
			await NoteEditingBridge.applyToTargetNote(
				plugin.app,
				target,
				content,
				"Apply AI edit",
			);
		},
		[plugin],
	);

	const handleCreateNote = useCallback(
		async (content: string, target: string) => {
			await NoteEditingBridge.createNote(
				plugin.app,
				target,
				content,
				"Create note",
			);
		},
		[plugin],
	);

	const handleAppendToTarget = useCallback(
		async (content: string, target: string) => {
			let file = plugin.app.vault.getAbstractFileByPath(target);
			if (!file || !(file instanceof TFile)) {
				const resolved = plugin.app.metadataCache.getFirstLinkpathDest(
					target,
					"",
				);
				if (resolved && resolved instanceof TFile) {
					file = resolved;
				}
			}
			if (!file || !(file instanceof TFile)) {
				new Notice(`⚠️ Note not found: ${target}`);
				return;
			}
			await NoteEditingBridge.appendToNote(plugin.app, file, content);
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
							id: makeId(),
							title: "",
							createdAt: Date.now(),
							updatedAt: Date.now(),
							messages: [],
							contextItems: plugin.settings.includeActiveNote
								? [{ type: "active-note", id: makeId() }]
								: [],
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
				onApply={handleApply}
				onRetry={handleRetry}
				onApplyToTarget={handleApplyToTarget}
				onCreateNote={handleCreateNote}
				onAppendToTarget={handleAppendToTarget}
			/>
			<ContextBar
				contextItems={contextItems}
				activeNoteName={targetNoteName}
				wasTruncated={wasTruncated}
				onToggleActiveNote={handleToggleActiveNote}
				onRemoveItem={handleRemoveContextItem}
				onOpenPicker={() => setShowContextPicker(true)}
			/>
			<ChatInput
				app={plugin.app}
				onSend={handleSend}
				onStop={handleStop}
				onAddMention={handleAddMention}
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
			{showContextPicker && (
				<ContextPickerModal
					app={plugin.app}
					onAdd={handleAddContextItems}
					onClose={() => setShowContextPicker(false)}
				/>
			)}
		</div>
	);
};

export default ChatApp;
