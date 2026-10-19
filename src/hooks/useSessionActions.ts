import { useRef, useCallback, useEffect } from "react";
import { Notice } from "obsidian";
import type { ChatPluginLike } from "../views/ObsidianAIChatView";
import type { ChatSession, ContextItem } from "../types";
import { getActiveProviderProfile } from "../settings";
import { makeId, sessionMessageCount } from "../lib/sessionUtils";

interface UseSessionActionsOptions {
	plugin: ChatPluginLike;
	profileId?: string;
	sessionsRef: React.MutableRefObject<ChatSession[]>;
	activeSessionIdRef: React.MutableRefObject<string | null>;
	updateSessionMetadata: (
		sessionId: string,
		patch: Partial<Omit<ChatSession, "id" | "messages">>,
	) => void;
	updateSessionMessages: (
		sessionId: string,
		updater:
			| ChatSession["messages"]
			| ((current: ChatSession["messages"]) => ChatSession["messages"]),
	) => void;
	setActiveSessionId: React.Dispatch<React.SetStateAction<string | null>>;
	setScrollToMessageId: React.Dispatch<
		React.SetStateAction<string | undefined>
	>;
	createNewSession: (opts?: {
		includeActiveNote?: boolean;
		selectedProfileIds?: string[];
		modelOverrides?: Record<string, string>;
		autoNameSessions?: boolean;
		force?: boolean;
	}) => ChatSession;
	setSelectedProfileIds: (ids: Set<string>) => void;
	getSelectedProfileIds: () => string[];
	setDebateMode: (v: boolean) => void;
	setWasTruncated: (v: boolean) => void;
	isStreaming: boolean;
	abortActiveRuntime: () => void;
	clearSessionRuntime: (sessionId: string) => void;
	markSessionDeleted: (sessionId: string) => void;
	openSessionIds: string[];
	setOpenSessionIds: React.Dispatch<React.SetStateAction<string[]>>;
	getModelOverrides?: () => Record<string, string> | undefined;
}

export interface UseSessionActionsResult {
	openSessionIds: string[];
	setOpenSessionIds: React.Dispatch<React.SetStateAction<string[]>>;
	openSessionInTab: (sessionId: string, messageId?: string) => void;
	handleNewChat: () => void;
	handleLoadSession: (sessionId: string) => void;
	handleCloseTab: (sessionId: string) => void;
	handleCloseOtherTabs: (sessionId: string) => void;
	handleCloseTabsToRight: (sessionId: string) => void;
	handleDeleteSession: (sessionId: string) => void;
	handleRenameSession: (sessionId: string, newTitle: string) => void;
}

export function useSessionActions({
	plugin,
	profileId,
	sessionsRef,
	activeSessionIdRef,
	updateSessionMetadata,
	updateSessionMessages,
	setActiveSessionId,
	setScrollToMessageId,
	createNewSession,
	setSelectedProfileIds,
	getSelectedProfileIds,
	setDebateMode,
	setWasTruncated,
	isStreaming,
	abortActiveRuntime,
	clearSessionRuntime,
	markSessionDeleted,
	openSessionIds,
	setOpenSessionIds,
	getModelOverrides,
}: UseSessionActionsOptions): UseSessionActionsResult {
	const openSessionInTab = useCallback(
		(sessionId: string, messageId?: string) => {
			const activeId = activeSessionIdRef.current;
			if (
				activeId &&
				activeId !== sessionId &&
				!openSessionIds.includes(activeId) &&
				sessionsRef.current.some((session) => session.id === activeId)
			) {
				setOpenSessionIds((current) =>
					current.includes(activeId)
						? current
						: [...current, activeId],
				);
			}
			// Index-only boot: if this session's messages haven't been read yet,
			// start loading them now and fill state when they arrive. The send
			// gate awaits hydration, so a fast type-and-enter can't clobber.
			const target = sessionsRef.current.find((s) => s.id === sessionId);
			plugin.logger?.log(
				"debug",
				`[Session] open ${sessionId}: hydration=${target?.hydrated === false ? "pending" : target?.hydrated === true ? "ready" : target ? "unknown" : "missing"}`,
			);
			if (target && target.hydrated === false) {
				const hydrate = plugin.sessionState
					? plugin.sessionState.ensureLoaded(sessionId)
					: (async () => {
							let messages =
								(await plugin.hydrateSession?.(sessionId)) ??
								[];
							if (
								messages.length === 0 &&
								(target.messageCount ?? 0) > 0 &&
								plugin.peekSessionMessages
							) {
								messages =
									await plugin.peekSessionMessages(sessionId);
							}
							return { messages };
						})();
				hydrate
					.then((loaded) => {
						const messages = Array.isArray(loaded)
							? loaded
							: (loaded?.messages ?? []);
						if (
							!loaded ||
							("hydrated" in loaded &&
								loaded.hydrated === false) ||
							(messages.length === 0 &&
								(target.messageCount ?? 0) > 0)
						) {
							plugin.logger?.log(
								"warn",
								`[Session] open ${sessionId}: hydration resolved with 0 messages`,
							);
							return;
						}
						plugin.logger?.log(
							"info",
							`[Session] open ${sessionId}: applied ${messages.length} hydrated messages`,
						);
						// Write through the ref synchronously — anything reading
						// sessionsRef.current before React re-renders must see the
						// hydrated messages, not the empty boot copy.
						if (!plugin.sessionState)
							updateSessionMessages(sessionId, messages);
					})
					.catch((err) => {
						// Hydration failure now leaves the session unhydrated (retry
						// on next open) and logs the cause — surface it here too so
						// the user isn't staring at a silently empty session.
						console.error(
							"[ObsidianAI] hydrateSession failed:",
							err,
						);
						new Notice(
							"Failed to load session messages — will retry on next open",
						);
					});
			}
			setOpenSessionIds((current) =>
				current.includes(sessionId) ? current : [...current, sessionId],
			);
			setActiveSessionId(sessionId);
			setScrollToMessageId(messageId);
		},
		[
			plugin,
			sessionsRef,
			activeSessionIdRef,
			openSessionIds,
			setOpenSessionIds,
			updateSessionMessages,
			setActiveSessionId,
			setScrollToMessageId,
		],
	);

	// Listen for external open-session events
	useEffect(() => {
		const openSession = (event: Event) => {
			const { sessionId, messageId } = (
				event as CustomEvent<{ sessionId: string; messageId: string }>
			).detail;
			openSessionInTab(sessionId, messageId);
		};
		window.addEventListener("obsidian-ai:open-session", openSession);
		return () =>
			window.removeEventListener("obsidian-ai:open-session", openSession);
	}, [openSessionInTab]);

	// Keep openSessionIds in sync with active session and session list
	useEffect(() => {
		const knownIds = new Set(sessionsRef.current.map((s) => s.id));
		setOpenSessionIds((current) =>
			current.filter((id) => knownIds.has(id)),
		);
	}, [sessionsRef]);

	const handleNewChat = useCallback(() => {
		if (isStreaming) abortActiveRuntime();
		// A message can be sent from the fresh draft left behind after the last
		// tab closes. If that active session now contains history but has no tab,
		// keep it visible when the user creates another chat.
		const activeId = activeSessionIdRef.current;
		if (
			activeId &&
			!openSessionIds.includes(activeId) &&
			sessionsRef.current.some((session) => session.id === activeId)
		) {
			openSessionInTab(activeId);
		}

		// T26 Phase 2: Auto-summarize the ending session before starting a new one
		const endingSessionId = activeId;
		if (endingSessionId) {
			const endingSession = sessionsRef.current.find(
				(s) => s.id === endingSessionId,
			);
			if (endingSession) {
				void plugin.onSessionEnd?.(endingSession);
			}
		}

		const newSession = createNewSession({
			includeActiveNote: plugin.settings.includeActiveNote,
			// A new tab inherits the currently visible tab's model, not the global
			// default. This preserves the user's model choice across tab workflows.
			selectedProfileIds: getSelectedProfileIds(),
			modelOverrides: getModelOverrides?.(),
			autoNameSessions: plugin.settings.autoNameSessions,
		});
		setOpenSessionIds((current) => [...current, newSession.id]);
		const selectedProfileIds = getSelectedProfileIds();
		if (selectedProfileIds.length > 0) {
			setSelectedProfileIds(new Set(selectedProfileIds));
		} else {
			const activeProfile = getActiveProviderProfile(plugin.settings);
			setSelectedProfileIds(new Set([activeProfile.id]));
		}
		setDebateMode(false);
		setWasTruncated(false);
	}, [
		isStreaming,
		plugin,
		createNewSession,
		setSelectedProfileIds,
		getSelectedProfileIds,
		getModelOverrides,
		setDebateMode,
		setWasTruncated,
		openSessionInTab,
		abortActiveRuntime,
		activeSessionIdRef,
		sessionsRef,
		openSessionIds,
		setOpenSessionIds,
	]);

	const handleLoadSession = useCallback(
		(sessionId: string) => {
			const session = sessionsRef.current.find((s) => s.id === sessionId);
			if (
				session?.selectedProfileIds &&
				session.selectedProfileIds.length > 0
			) {
				setSelectedProfileIds(new Set(session.selectedProfileIds));
			} else if (
				session?.participants &&
				session.participants.length > 0
			) {
				setSelectedProfileIds(
					new Set(session.participants.map((p) => p.id)),
				);
			} else {
				setSelectedProfileIds(new Set());
			}
			setDebateMode(false);
			openSessionInTab(sessionId);
		},
		[openSessionInTab, setSelectedProfileIds, setDebateMode, sessionsRef],
	);

	const handleCloseTab = useCallback(
		(sessionId: string) => {
			clearSessionRuntime(sessionId);
			const closeTarget = sessionsRef.current.find(
				(session) => session.id === sessionId,
			);
			// Unhydrated saved sessions hold messages on disk (messageCount > 0)
			// even though their in-memory list is still empty — never treat them
			// as drafts, or closing a tab orphans their file.
			const isDraft =
				!!closeTarget && sessionMessageCount(closeTarget) === 0;
			if (isDraft) {
				if (plugin.sessionState)
					plugin.sessionState.discardDraft(sessionId);
			}
			setOpenSessionIds((current) => {
				if (current.length <= 1) {
					// Return to the initial no-tab state with a fresh, unsaved draft.
					createNewSession({
						includeActiveNote: plugin.settings.includeActiveNote,
						selectedProfileIds: plugin.settings.selectedProfileIds,
						autoNameSessions: plugin.settings.autoNameSessions,
					});
					setScrollToMessageId(undefined);
					return [];
				}
				const index = current.indexOf(sessionId);
				const remaining = current.filter((id) => id !== sessionId);
				if (sessionId === activeSessionIdRef.current) {
					setActiveSessionId(remaining[Math.max(0, index - 1)]);
					setScrollToMessageId(undefined);
				}
				return remaining;
			});
		},
		[
			createNewSession,
			plugin.settings,
			setActiveSessionId,
			setScrollToMessageId,
			activeSessionIdRef,
			sessionsRef,
			clearSessionRuntime,
		],
	);

	const handleCloseOtherTabs = useCallback(
		(sessionId: string) => {
			setOpenSessionIds((current) => {
				current
					.filter((id) => id !== sessionId)
					.forEach(clearSessionRuntime);
				if (activeSessionIdRef.current !== sessionId) {
					setActiveSessionId(sessionId);
					setScrollToMessageId(undefined);
				}
				return [sessionId];
			});
		},
		[
			setActiveSessionId,
			setScrollToMessageId,
			activeSessionIdRef,
			clearSessionRuntime,
		],
	);

	const handleCloseTabsToRight = useCallback(
		(sessionId: string) => {
			setOpenSessionIds((current) => {
				const index = current.indexOf(sessionId);
				if (index === -1) return current;
				const remaining = current.slice(0, index + 1);
				current.slice(index + 1).forEach(clearSessionRuntime);
				if (!remaining.includes(activeSessionIdRef.current ?? "")) {
					setActiveSessionId(sessionId);
					setScrollToMessageId(undefined);
				}
				return remaining;
			});
		},
		[
			setActiveSessionId,
			setScrollToMessageId,
			activeSessionIdRef,
			clearSessionRuntime,
		],
	);

	const handleDeleteSession = useCallback(
		(sessionId: string) => {
			const filtered = sessionsRef.current.filter(
				(session) => session.id !== sessionId,
			);
			markSessionDeleted(sessionId);
			clearSessionRuntime(sessionId);
			if (activeSessionIdRef.current !== sessionId) return;
			const mostRecent = filtered.sort(
				(a, b) => b.updatedAt - a.updatedAt,
			)[0];
			if (mostRecent) {
				setSelectedProfileIds(
					new Set(
						mostRecent.selectedProfileIds ??
							mostRecent.participants?.map((p) => p.id) ??
							[],
					),
				);
				setDebateMode(false);
				setActiveSessionId(mostRecent.id);
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
			};
			plugin.sessionState?.addSession(empty);
			setActiveSessionId(empty.id);
			setSelectedProfileIds(new Set());
		},
		[
			sessionsRef,
			setActiveSessionId,
			setSelectedProfileIds,
			setDebateMode,
			activeSessionIdRef,
			plugin.settings.includeActiveNote,
			profileId,
			clearSessionRuntime,
			markSessionDeleted,
		],
	);

	const handleRenameSession = useCallback(
		(sessionId: string, newTitle: string) => {
			updateSessionMetadata(sessionId, { title: newTitle.trim() });
		},
		[updateSessionMetadata],
	);

	return {
		openSessionIds,
		setOpenSessionIds,
		openSessionInTab,
		handleNewChat,
		handleLoadSession,
		handleCloseTab,
		handleCloseOtherTabs,
		handleCloseTabsToRight,
		handleDeleteSession,
		handleRenameSession,
	};
}
