import { useState, useRef, useCallback, useEffect } from "react";
import type { ChatSession, ChatMessage, ContextItem } from "../types";
import type { ChatPluginLike } from "../views/ObsidianAIChatView";
import type { ProviderProfile } from "../settings";
import type { ChatApiManager } from "../api";
import { getActiveProviderProfile } from "../settings";
import { makeId, pruneSessions } from "../lib/sessionUtils";
import { generateSessionTitle, generateSessionTitleLLM } from "../lib/sessionTitle";

interface UseChatSessionOptions {
	plugin: ChatPluginLike;
	profileId?: string;
}

export interface UseChatSessionResult {
	sessions: ChatSession[];
	setSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>;
	activeSessionId: string | null;
	setActiveSessionId: React.Dispatch<React.SetStateAction<string | null>>;
	chatDataLoaded: boolean;
	sessionsRef: React.MutableRefObject<ChatSession[]>;
	activeSessionIdRef: React.MutableRefObject<string | null>;
	/** Create a new session, prune old ones, and activate it. */
	createNewSession: (opts?: {
		includeActiveNote?: boolean;
		selectedProfileIds?: string[];
		autoNameSessions?: boolean;
	}) => ChatSession;
	/** Delete a session. If active, switches to the most recent remaining. */
	deleteSession: (sessionId: string) => void;
	/** Rename a session. */
	renameSession: (sessionId: string, title: string) => void;
	/** Update a session's messages. */
	updateSessionMessages: (sessionId: string, messages: ChatMessage[]) => void;
	/** Update a session's context items. */
	updateSessionContextItems: (sessionId: string, contextItems: ContextItem[]) => void;
	/** Manually rename the active session via LLM + heuristic fallback. */
	manualRenameActiveSession: (
		resolvedProfile: ProviderProfile,
		chatapi: ChatApiManager,
	) => Promise<string | null>;
	autoNameSessions: boolean;
	setAutoNameSessions: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useChatSession({
	plugin,
	profileId,
}: UseChatSessionOptions): UseChatSessionResult {
	const [sessions, setSessions] = useState<ChatSession[]>([]);
	const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
	const [chatDataLoaded, setChatDataLoaded] = useState(false);

	const sessionsRef = useRef<ChatSession[]>([]);
	const activeSessionIdRef = useRef<string | null>(null);
	const llmNamedRef = useRef<Set<string>>(new Set());
	const saveTimerRef = useRef<number | null>(null);
	const skipNextAutosaveRef = useRef(false);

	sessionsRef.current = sessions;
	activeSessionIdRef.current = activeSessionId;

	// ─── Load persisted sessions on mount ───
	useEffect(() => {
		let cancelled = false;
		plugin.loadChatData().then((data) => {
			if (cancelled) return;
			if (data.sessions.length > 0 || data.activeSessionId) {
				skipNextAutosaveRef.current = true;
				setSessions(data.sessions);
				setActiveSessionId(data.activeSessionId);
			} else {
				// No saved data — create an empty session
				const activeProfile = getActiveProviderProfile(plugin.settings);
				const defaultSelectedIds =
					plugin.settings.selectedProfileIds?.length > 0
						? plugin.settings.selectedProfileIds
						: [activeProfile.id];

				const newSession: ChatSession = {
					id: makeId(),
					title: "",
					createdAt: Date.now(),
					updatedAt: Date.now(),
					messages: [],
					contextItems: plugin.settings.includeActiveNote
						? [{ type: "active-note", id: makeId() }]
						: [],
					profileId: profileId || activeProfile.id,
					selectedProfileIds: defaultSelectedIds,
				};
				setSessions([newSession]);
				setActiveSessionId(newSession.id);
			}
			setChatDataLoaded(true);
		});
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [plugin]);

	// ─── Persist sessions whenever they change (debounced) ───
	useEffect(() => {
		if (!chatDataLoaded) return;
		if (skipNextAutosaveRef.current) {
			skipNextAutosaveRef.current = false;
			return;
		}
		if (sessions.length > 0) {
			if (saveTimerRef.current) {
				window.clearTimeout(saveTimerRef.current);
			}
			saveTimerRef.current = window.setTimeout(() => {
				void plugin.saveChatData({ sessions, activeSessionId });
				saveTimerRef.current = null;
			}, 150);
		}
		return () => {
			if (saveTimerRef.current) {
				window.clearTimeout(saveTimerRef.current);
				saveTimerRef.current = null;
			}
		};
	}, [sessions, activeSessionId, plugin, chatDataLoaded]);

	// ─── Auto-title session after it has a few messages ───
	const [autoNameSessions, setAutoNameSessions] = useState(
		plugin.settings.autoNameSessions,
	);
	useEffect(() => {
		if (!autoNameSessions) return;
		const currentActiveId = activeSessionIdRef.current;
		if (!currentActiveId) return;
		if (llmNamedRef.current.has(currentActiveId)) return;
		const session = sessionsRef.current.find(
			(s) => s.id === currentActiveId,
		);
		if (!session || session.title) return;
		const userMsgs = session.messages.filter((m) => m.role === "user");
		const assistantMsgs = session.messages.filter(
			(m) => m.role === "assistant",
		);
		if (userMsgs.length >= 1 && assistantMsgs.length >= 2) {
			llmNamedRef.current.add(currentActiveId);
			// Try LLM naming first, then fall back to heuristic
			void (async () => {
				const activeProfile = getActiveProviderProfile(plugin.settings);
				const title = await generateSessionTitleLLM(
					session.messages.slice(0, 6),
					activeProfile,
					plugin.chatapi,
				);
				if (title) {
					setSessions((prev) =>
						prev.map((s) =>
							s.id === currentActiveId ? { ...s, title } : s,
						),
					);
				} else {
					const fallback = generateSessionTitle(session.messages);
					setSessions((prev) =>
						prev.map((s) =>
							s.id === currentActiveId
								? { ...s, title: fallback }
								: s,
						),
					);
				}
			})();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sessions, activeSessionId, autoNameSessions, plugin.settings, plugin.chatapi]);

	// ─── Create a new session ───
	const createNewSession = useCallback(
		(opts?: {
			includeActiveNote?: boolean;
			selectedProfileIds?: string[];
			autoNameSessions?: boolean;
		}): ChatSession => {
			const currentActiveId = activeSessionIdRef.current;
			const newSession: ChatSession = {
				id: makeId(),
				title: "",
				createdAt: Date.now(),
				updatedAt: Date.now(),
				messages: [],
				contextItems:
					opts?.includeActiveNote ?? plugin.settings.includeActiveNote
						? [{ type: "active-note", id: makeId() }]
						: [],
				profileId: profileId || undefined,
			};

			setSessions((prev) => {
				const currentSession = prev.find(
					(s) => s.id === currentActiveId,
				);
				// If current session is empty, keep it instead of creating another
				if (currentSession && currentSession.messages.length === 0) {
					return prev.map((s) =>
						s.id === currentActiveId
							? { ...s, updatedAt: Date.now() }
							: s,
					);
				}
				const updated = prev.map((s) =>
					s.id === currentActiveId
						? {
								...s,
								title:
									opts?.autoNameSessions ?? plugin.settings.autoNameSessions
										? s.title || generateSessionTitle(s.messages)
										: s.title,
								updatedAt: Date.now(),
							}
							: s,
				);
				const withNew = [...updated, newSession];
				const max = plugin.settings.maxSavedConversations || 20;
				return pruneSessions(withNew, max, newSession.id);
			});
			setActiveSessionId(newSession.id);
			return newSession;
		},
		[plugin, profileId],
	);

	// ─── Delete a session ───
	const deleteSession = useCallback(
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
							profileId: profileId || undefined,
						};
						filtered.push(empty);
						setActiveSessionId(empty.id);
					}
				}
				return filtered;
			});
		},
		[plugin, profileId],
	);

	// ─── Rename a session ───
	const renameSession = useCallback(
		(sessionId: string, newTitle: string) => {
			setSessions((prev) =>
				prev.map((s) =>
					s.id === sessionId ? { ...s, title: newTitle.trim() } : s,
				),
			);
		},
		[],
	);

	// ─── Update session messages ───
	const updateSessionMessages = useCallback(
		(sessionId: string, messages: ChatMessage[]) => {
			setSessions((prev) =>
				prev.map((s) =>
					s.id === sessionId
						? { ...s, messages, updatedAt: Date.now() }
						: s,
				),
			);
		},
		[],
	);

	// ─── Update session context items ───
	const updateSessionContextItems = useCallback(
		(sessionId: string, contextItems: ContextItem[]) => {
			setSessions((prev) =>
				prev.map((s) =>
					s.id === sessionId ? { ...s, contextItems } : s,
				),
			);
		},
		[],
	);

	// ─── Manual LLM rename of active session ───
	const manualRenameActiveSession = useCallback(
		async function(
			resolvedProfile: ProviderProfile,
			chatapi: ChatApiManager,
		): Promise<string | null> {
			const currentActiveId = activeSessionIdRef.current;
			if (!currentActiveId) return null;
			const session = sessionsRef.current.find(
				(s) => s.id === currentActiveId,
			);
			if (!session || session.messages.length === 0) {
				return null;
			}
			const title = await generateSessionTitleLLM(
				session.messages,
				resolvedProfile,
				chatapi,
			);
			if (title) {
				setSessions((prev) =>
					prev.map((s) =>
						s.id === currentActiveId ? { ...s, title } : s,
					),
				);
				return title;
			} else {
				const fallback = generateSessionTitle(session.messages);
				setSessions((prev) =>
					prev.map((s) =>
						s.id === currentActiveId ? { ...s, title: fallback } : s,
					),
				);
				return fallback;
			}
		},
		[],
	);

	return {
		sessions,
		setSessions,
		activeSessionId,
		setActiveSessionId,
		chatDataLoaded,
		sessionsRef,
		activeSessionIdRef,
		createNewSession,
		deleteSession,
		renameSession,
		updateSessionMessages,
		updateSessionContextItems,
		manualRenameActiveSession,
		autoNameSessions,
		setAutoNameSessions,
	};
}
