import {
	useState,
	useRef,
	useCallback,
	useEffect,
	useSyncExternalStore,
} from "react";
import type { ChatSession, ChatMessage, ContextItem } from "../types";
import type { ChatPluginLike } from "../views/ObsidianAIChatView";
import type { ProviderProfile } from "../settings";
import type { ChatApiManager } from "../api";
import { getActiveProviderProfile } from "../settings";
import { makeId, sessionMessageCount } from "../lib/sessionUtils";
import { SessionStateOwner } from "../state/SessionStateOwner";
import {
	generateSessionTitle,
	generateSessionTitleLLM,
} from "../lib/sessionTitle";

interface UseChatSessionOptions {
	plugin: ChatPluginLike;
	profileId?: string;
}

function hasDraftState(session: ChatSession): boolean {
	return Boolean(
		session.draft?.trim() ||
		session.draftAttachments?.length ||
		(session.thinkingMode && session.thinkingMode !== "provider-default"),
	);
}

function shouldPersistSession(session: ChatSession): boolean {
	return sessionMessageCount(session) > 0 || hasDraftState(session);
}

export interface UseChatSessionResult {
	sessions: ChatSession[];
	setSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>;
	activeSessionId: string | null;
	setActiveSessionId: React.Dispatch<React.SetStateAction<string | null>>;
	chatDataLoaded: boolean;
	sessionsRef: React.MutableRefObject<ChatSession[]>;
	activeSessionIdRef: React.MutableRefObject<string | null>;
	openSessionIds: string[];
	setOpenSessionIds: React.Dispatch<React.SetStateAction<string[]>>;
	/** Create and activate a new session for chat and composer drafts. */
	createNewSession: (opts?: {
		includeActiveNote?: boolean;
		selectedProfileIds?: string[];
		modelOverrides?: Record<string, string>;
		autoNameSessions?: boolean;
		force?: boolean;
	}) => ChatSession;
	/** Delete a session. If active, switches to the most recent remaining. */
	deleteSession: (sessionId: string) => void;
	/** Mark a deletion performed by the session-action layer for autosave. */
	markSessionDeleted: (sessionId: string) => void;
	/** Rename a session. */
	renameSession: (sessionId: string, title: string) => void;
	/** Update a session's messages. */
	updateSessionMessages: (sessionId: string, messages: ChatMessage[]) => void;
	/** Update a session's context items. */
	updateSessionContextItems: (
		sessionId: string,
		contextItems: ContextItem[],
	) => void;
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
	const ownerRef = useRef<SessionStateOwner | null>(null);
	if (!ownerRef.current) {
		ownerRef.current =
			plugin.sessionState ??
			new SessionStateOwner({
				load: () => plugin.loadChatData(),
				hydrate: (id) =>
					plugin.hydrateSession?.(id) ?? Promise.resolve([]),
				peek: (id) =>
					plugin.peekSessionMessages?.(id) ?? Promise.resolve([]),
				save: (data) => plugin.saveChatData(data),
			});
		if (!plugin.sessionState) plugin.sessionState = ownerRef.current;
	}
	const owner = ownerRef.current;
	const sessionSnapshot = useSyncExternalStore(
		owner.subscribe,
		owner.getSnapshot,
		owner.getServerSnapshot,
	);
	const sessions = sessionSnapshot.sessions;
	const setSessions = useCallback<
		React.Dispatch<React.SetStateAction<ChatSession[]>>
	>(
		(update) => {
			const current = owner.getSnapshot();
			const nextSessions =
				typeof update === "function"
					? update(current.sessions)
					: update;
			owner.replaceSnapshot({
				sessions: nextSessions,
				activeSessionId: current.activeSessionId,
				openSessionIds: current.openSessionIds,
			});
		},
		[owner],
	);
	const [activeSessionId, setActiveSessionIdState] = useState<string | null>(
		null,
	);
	const [chatDataLoaded, setChatDataLoaded] = useState(false);
	const [openSessionIds, setOpenSessionIdsState] = useState<string[]>([]);
	const activeSessionIdRef = useRef<string | null>(null);
	const openSessionIdsRef = useRef<string[]>([]);
	const setActiveSessionId = useCallback<
		React.Dispatch<React.SetStateAction<string | null>>
	>(
		(update) => {
			const next =
				typeof update === "function"
					? update(activeSessionIdRef.current)
					: update;
			activeSessionIdRef.current = next;
			setActiveSessionIdState(next);
			const state = owner.getSnapshot();
			owner.replaceSnapshot({
				sessions: state.sessions,
				activeSessionId: next,
				openSessionIds: state.openSessionIds,
			});
		},
		[owner],
	);
	const setOpenSessionIds = useCallback<
		React.Dispatch<React.SetStateAction<string[]>>
	>(
		(update) => {
			const next =
				typeof update === "function"
					? update(openSessionIdsRef.current)
					: update;
			openSessionIdsRef.current = next;
			setOpenSessionIdsState(next);
			const state = owner.getSnapshot();
			owner.replaceSnapshot({
				sessions: state.sessions,
				activeSessionId: state.activeSessionId,
				openSessionIds: next,
			});
		},
		[owner],
	);

	const sessionsRef = useRef<ChatSession[]>([]);
	const llmNamedRef = useRef<Set<string>>(new Set());
	const markSessionDeleted = useCallback(
		(sessionId: string) => {
			owner.markDeleted(sessionId);
		},
		[owner],
	);

	sessionsRef.current = sessions;
	activeSessionIdRef.current = activeSessionId;
	openSessionIdsRef.current = openSessionIds;

	// Remote deletion tombstones can remove a session while the chat view is
	// mounted. Keep the in-memory picker/tabs aligned with persisted storage.
	useEffect(() => {
		const handleRemoteDeletion = (event: Event) => {
			const sessionId = (event as CustomEvent<{ sessionId?: string }>)
				.detail?.sessionId;
			if (!sessionId) return;
			owner.markDeleted(sessionId);
			setSessions((current) => current.filter((s) => s.id !== sessionId));
			setOpenSessionIds((current) =>
				current.filter((id) => id !== sessionId),
			);
			if (activeSessionIdRef.current === sessionId) {
				const next = sessionsRef.current
					.filter((session) => session.id !== sessionId)
					.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
				setActiveSessionId(next?.id ?? null);
			}
		};
		window.addEventListener(
			"obsidian-ai:session-deleted",
			handleRemoteDeletion,
		);
		return () =>
			window.removeEventListener(
				"obsidian-ai:session-deleted",
				handleRemoteDeletion,
			);
	}, [owner]);

	// A completed remote download updates storage outside React's normal edit
	// path. Reload the lightweight session index so history and counts reflect
	// the downloaded sessions without requiring a view restart.
	useEffect(() => {
		let cancelled = false;
		const handleSessionsUpdated = () => {
			void plugin
				.loadChatData()
				.then((data) => {
					if (cancelled) return;
					const savedSessions =
						data.sessions.filter(shouldPersistSession);
					const currentActiveId = activeSessionIdRef.current;
					const nextActiveId = savedSessions.some(
						(session) => session.id === currentActiveId,
					)
						? currentActiveId
						: (savedSessions[0]?.id ?? null);
					// The sync refresh is metadata-only. Preserve messages already
					// present in React so the active chat and open tabs do not go
					// blank while the index is being refreshed.
					owner.applySyncSnapshot({
						...data,
						sessions: savedSessions,
					});
					setActiveSessionId(nextActiveId);
					setOpenSessionIds((current) => {
						const knownIds = new Set(
							savedSessions.map((s) => s.id),
						);
						const retained = current.filter((id) =>
							knownIds.has(id),
						);
						return retained.length > 0
							? retained
							: nextActiveId
								? [nextActiveId]
								: [];
					});
				})
				.catch((err: any) => {
					plugin.logger?.log(
						"warn",
						`[Sync] failed to refresh sessions after download: ${err?.message ?? err}`,
					);
				});
		};
		window.addEventListener(
			"obsidian-ai:sessions-updated",
			handleSessionsUpdated,
		);
		return () => {
			cancelled = true;
			window.removeEventListener(
				"obsidian-ai:sessions-updated",
				handleSessionsUpdated,
			);
		};
	}, [plugin, owner]);

	// ─── Load persisted sessions on mount ───
	useEffect(() => {
		let cancelled = false;
		const loadStart = Date.now();
		plugin.logger?.log(
			"info",
			"[Startup] ChatApp mount — loading chat data…",
		);
		owner.initialize().then((state) => {
			if (cancelled) return;
			plugin.logger?.log(
				"info",
				`[Startup] loadChatData resolved in ${Date.now() - loadStart}ms`,
			);
			const data = state;
			const savedSessions = data.sessions.filter(
				// messageCount comes from the index, so this stays correct even
				// when messages haven't been hydrated yet (index-only boot). Draft
				// sessions are restored when they contain composer content.
				shouldPersistSession,
			);
			if (savedSessions.length > 0) {
				// Preserve the loaded storage untouched unless this also removes legacy
				// zero-message entries; those should be cleaned up on the next autosave.
				const totalMessages = savedSessions.reduce(
					(sum, s) => sum + sessionMessageCount(s),
					0,
				);
				plugin.logger?.log(
					"info",
					`[Chat] restored ${savedSessions.length} session(s), ${totalMessages} message(s)`,
				);
				if (savedSessions.length !== data.sessions.length) {
					owner.replaceSnapshot({
						sessions: savedSessions,
						activeSessionId: data.activeSessionId,
						openSessionIds: data.openSessionIds,
					});
				}
				const restoredActiveId = savedSessions.some(
					(session) => session.id === data.activeSessionId,
				)
					? data.activeSessionId
					: savedSessions[0].id;
				setActiveSessionId(restoredActiveId);
				const knownIds = new Set(
					savedSessions.map((session) => session.id),
				);
				const restoredOpenIds = plugin.settings.restoreChatTabs
					? (data.openSessionIds ?? []).filter((id) =>
							knownIds.has(id),
						)
					: [];
				setOpenSessionIds(
					restoredOpenIds.length > 0
						? restoredOpenIds
						: restoredActiveId
							? [restoredActiveId]
							: [],
				);
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
					remoteUsers: [],
					selectedRemoteUserIds: [],
				};
				owner.replaceSnapshot({
					sessions: [newSession],
					activeSessionId: newSession.id,
					openSessionIds: [newSession.id],
				});
				setActiveSessionId(newSession.id);
				setOpenSessionIds([newSession.id]);
			}
			setChatDataLoaded(true);
		});
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- session initialization runs once for the plugin instance.
	}, [plugin, owner]);

	// Load the active transcript on every activation, including the tab selected
	// after closing another tab. Background restored tabs stay index-only.
	useEffect(() => {
		if (!chatDataLoaded || !activeSessionId) return;
		const target = sessionsRef.current.find(
			(s) => s.id === activeSessionId,
		);
		if (!target || target.hydrated !== false) return;
		let cancelled = false;
		const id = activeSessionId;
		plugin.logger?.log("debug", `[Session] scheduling hydration for ${id}`);
		void owner
			.ensureLoaded(id)
			.then((loaded) => {
				if (cancelled) return;
				if (
					!loaded ||
					(loaded.messages.length === 0 &&
						(loaded.messageCount ?? 0) > 0)
				) {
					plugin.logger?.log(
						"warn",
						`[Session] hydrate ${id} resolved with 0 messages; leaving retryable`,
					);
					return;
				}
				plugin.logger?.log(
					"info",
					`[Session] hydrated ${id} with ${loaded.messages.length} messages`,
				);
			})
			.catch((err: unknown) => {
				plugin.logger?.log(
					"warn",
					`[Session] hydrate ${id} failed: ${String(err)}`,
				);
			});
		return () => {
			cancelled = true;
		};
	}, [activeSessionId, chatDataLoaded, plugin, owner]);

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
		// eslint-disable-next-line react-hooks/exhaustive-deps -- autosave dependencies are intentionally limited to session state and settings.
	}, [
		sessions,
		activeSessionId,
		autoNameSessions,
		plugin.settings,
		plugin.chatapi,
	]);

	// ─── Create a new session ───
	const createNewSession = useCallback(
		(opts?: {
			includeActiveNote?: boolean;
			selectedProfileIds?: string[];
			autoNameSessions?: boolean;
			force?: boolean;
			modelOverrides?: Record<string, string>;
		}): ChatSession => {
			const currentActiveId = activeSessionIdRef.current;
			const newSession: ChatSession = {
				id: makeId(),
				title: "",
				createdAt: Date.now(),
				updatedAt: Date.now(),
				messages: [],
				contextItems:
					(opts?.includeActiveNote ??
					plugin.settings.includeActiveNote)
						? [{ type: "active-note", id: makeId() }]
						: [],
				profileId:
					profileId ||
					(opts?.selectedProfileIds?.length === 1
						? opts.selectedProfileIds[0]
						: getActiveProviderProfile(plugin.settings).id),
				selectedProfileIds: opts?.selectedProfileIds?.length
					? opts.selectedProfileIds
					: [getActiveProviderProfile(plugin.settings).id],
				modelOverrides: opts?.modelOverrides,
				remoteUsers: [],
				selectedRemoteUserIds: [],
			};

			setSessions((prev) => {
				const updated = prev.map((s) =>
					s.id === currentActiveId
						? {
								...s,
								title:
									(opts?.autoNameSessions ??
									plugin.settings.autoNameSessions)
										? s.title ||
											generateSessionTitle(s.messages)
										: s.title,
								updatedAt: Date.now(),
							}
						: s,
				);

				// Trigger auto-summarization for the ending session (fire-and-forget)
				const endingSession = prev.find(
					(s) => s.id === currentActiveId,
				);
				if (endingSession && plugin.onSessionEnd) {
					void plugin.onSessionEnd(endingSession);
				}

				// Retention limits must never silently delete persisted history.
				// Users can remove sessions explicitly from the history UI.
				return [...updated, newSession];
			});
			setActiveSessionId(newSession.id);
			return newSession;
		},
		[plugin, profileId],
	);

	// ─── Delete a session ───
	const deleteSession = useCallback(
		(sessionId: string) => {
			markSessionDeleted(sessionId);
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
							remoteUsers: [],
							selectedRemoteUserIds: [],
						};
						filtered.push(empty);
						setActiveSessionId(empty.id);
					}
				}
				return filtered;
			});
		},
		[markSessionDeleted, plugin, profileId],
	);

	// ─── Rename a session ───
	const renameSession = useCallback((sessionId: string, newTitle: string) => {
		setSessions((prev) =>
			prev.map((s) =>
				s.id === sessionId ? { ...s, title: newTitle.trim() } : s,
			),
		);
	}, []);

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
	const manualRenameActiveSession = useCallback(async function (
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
	}, []);

	return {
		sessions,
		setSessions,
		activeSessionId,
		setActiveSessionId,
		chatDataLoaded,
		sessionsRef,
		activeSessionIdRef,
		openSessionIds,
		setOpenSessionIds,
		createNewSession,
		deleteSession,
		markSessionDeleted,
		renameSession,
		updateSessionMessages,
		updateSessionContextItems,
		manualRenameActiveSession,
		autoNameSessions,
		setAutoNameSessions,
	};
}
