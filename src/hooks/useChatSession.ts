import { Notice } from "obsidian";
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

export interface UseChatSessionResult {
	sessions: ChatSession[];
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
	updateSessionMessages: (
		sessionId: string,
		messages: ChatMessage[] | ((messages: ChatMessage[]) => ChatMessage[]),
	) => void;
	updateSessionMetadata: (
		sessionId: string,
		patch: Partial<Omit<ChatSession, "id" | "messages">>,
	) => void;
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
	const [activeSessionId, setActiveSessionIdState] = useState<string | null>(
		null,
	);
	const [chatDataLoaded, setChatDataLoaded] = useState(false);
	const [openSessionIds, setOpenSessionIdsState] = useState<string[]>([]);
	const activeSessionIdRef = useRef<string | null>(null);
	const activeSessionViewKey = useRef<object>({});
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
			owner.setActiveSessionId(next);
			owner.setViewActiveSessionId(activeSessionViewKey.current, next);
		},
		[owner],
	);
	useEffect(
		() => () => owner.removeActiveSessionView(activeSessionViewKey.current),
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
			owner.setOpenSessionIds(next);
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
			if (
				owner
					.getSnapshot()
					.sessions.some((session) => session.id === sessionId)
			) {
				owner.markDeleted(sessionId);
			}
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
			const baseline = owner.captureSyncRevisions();
			void plugin
				.loadChatData()
				.then((data) => {
					if (cancelled) return;
					const current = owner.getSnapshot();
					owner.applySyncSnapshot(
						{
							...data,
							activeSessionId: current.activeSessionId,
							openSessionIds: current.openSessionIds,
						},
						baseline,
					);
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
		owner
			.initialize()
			.then((state) => {
				if (cancelled) return;
				plugin.logger?.log(
					"info",
					`[Startup] loadChatData resolved in ${Date.now() - loadStart}ms`,
				);
				const data = state;
				const savedSessions = data.sessions;
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
						plugin.settings.restoreChatTabs &&
							data.openSessionIds !== undefined
							? restoredOpenIds
							: restoredActiveId
								? [restoredActiveId]
								: [],
					);
				} else {
					// No saved data — create an empty session
					const activeProfile = getActiveProviderProfile(
						plugin.settings,
					);
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
					owner.addSession(newSession);
					setActiveSessionId(newSession.id);
					setOpenSessionIds([newSession.id]);
				}
				setChatDataLoaded(true);
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				plugin.logger?.log(
					"error",
					`[Session] archive could not be loaded: ${String(error)}`,
				);
				new Notice(
					"Saved chats could not be loaded. Check Chat Lab data diagnostics before saving.",
				);
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
				if (!loaded || loaded.hydrated === false) {
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
					owner.updateMetadata(currentActiveId, { title });
				} else {
					const fallback = generateSessionTitle(session.messages);
					owner.updateMetadata(currentActiveId, { title: fallback });
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

			const endingSession = sessionsRef.current.find(
				(session) => session.id === currentActiveId,
			);
			if (endingSession) {
				owner.updateMetadata(endingSession.id, {
					title:
						(opts?.autoNameSessions ??
						plugin.settings.autoNameSessions)
							? endingSession.title ||
								generateSessionTitle(endingSession.messages)
							: endingSession.title,
					updatedAt: Date.now(),
				});
				if (plugin.onSessionEnd)
					void plugin.onSessionEnd(endingSession);
			}
			owner.addSession(newSession);
			setActiveSessionId(newSession.id);
			return newSession;
		},
		[plugin, profileId, owner, sessionsRef],
	);

	// Reconcile each view against shared removals without replacing its own
	// navigation when another view selects a different existing chat.
	useEffect(() => {
		if (!chatDataLoaded) return;
		const known = new Set(sessions.map((session) => session.id));
		const remaining = openSessionIdsRef.current.filter((id) =>
			known.has(id),
		);
		if (remaining.length !== openSessionIdsRef.current.length)
			setOpenSessionIds(remaining);
		if (activeSessionIdRef.current && known.has(activeSessionIdRef.current))
			return;
		if (sessions.length === 0) {
			createNewSession();
			return;
		}
		const next = remaining[0] ?? sessions[0].id;
		setActiveSessionId(next);
		if (!remaining.includes(next)) setOpenSessionIds([...remaining, next]);
	}, [
		sessions,
		chatDataLoaded,
		createNewSession,
		setActiveSessionId,
		setOpenSessionIds,
	]);

	// ─── Delete a session ───
	const deleteSession = useCallback(
		(sessionId: string) => {
			const remaining = sessionsRef.current.filter(
				(session) => session.id !== sessionId,
			);
			markSessionDeleted(sessionId);
			if (activeSessionIdRef.current !== sessionId) return;
			const next = remaining.sort((a, b) => b.updatedAt - a.updatedAt)[0];
			if (next) {
				setActiveSessionId(next.id);
				return;
			}
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
			owner.addSession(empty);
			setActiveSessionId(empty.id);
		},
		[
			markSessionDeleted,
			plugin,
			profileId,
			sessionsRef,
			owner,
			setActiveSessionId,
		],
	);

	const renameSession = useCallback(
		(sessionId: string, newTitle: string) => {
			owner.updateMetadata(sessionId, { title: newTitle.trim() });
		},
		[owner],
	);

	// ─── Update session messages ───
	const updateSessionMessages = useCallback(
		(
			sessionId: string,
			messages:
				| ChatMessage[]
				| ((messages: ChatMessage[]) => ChatMessage[]),
		) => {
			owner.updateMessages(sessionId, messages);
		},
		[owner],
	);
	const updateSessionMetadata = useCallback(
		(
			sessionId: string,
			patch: Partial<Omit<ChatSession, "id" | "messages">>,
		) => {
			owner.updateMetadata(sessionId, patch);
		},
		[owner],
	);

	// ─── Update session context items ───
	const updateSessionContextItems = useCallback(
		(sessionId: string, contextItems: ContextItem[]) => {
			owner.updateMetadata(sessionId, { contextItems });
		},
		[owner],
	);

	// ─── Manual LLM rename of active session ───
	const manualRenameActiveSession = useCallback(
		async function (
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
				owner.updateMetadata(currentActiveId, { title });
				return title;
			} else {
				const fallback = generateSessionTitle(session.messages);
				owner.updateMetadata(currentActiveId, { title: fallback });
				return fallback;
			}
		},
		[owner],
	);

	return {
		sessions,
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
		updateSessionMetadata,
		updateSessionContextItems,
		manualRenameActiveSession,
		autoNameSessions,
		setAutoNameSessions,
	};
}
