import { useRef, useCallback, useEffect } from "react";
import { Notice } from "obsidian";
import type { ChatPluginLike } from "../views/ObsidianAIChatView";
import type { ChatSession, ContextItem } from "../types";
import { getActiveProviderProfile } from "../settings";
import { makeId } from "../lib/sessionUtils";

interface UseSessionActionsOptions {
	plugin: ChatPluginLike;
	profileId?: string;
	sessionsRef: React.MutableRefObject<ChatSession[]>;
	activeSessionIdRef: React.MutableRefObject<string | null>;
	setSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>;
	setActiveSessionId: React.Dispatch<React.SetStateAction<string | null>>;
	setScrollToMessageId: React.Dispatch<React.SetStateAction<string | undefined>>;
	createNewSession: (opts?: {
		includeActiveNote?: boolean;
		selectedProfileIds?: string[];
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
	openSessionIds: string[];
	setOpenSessionIds: React.Dispatch<React.SetStateAction<string[]>>;
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
	setSessions,
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
	openSessionIds,
	setOpenSessionIds,
}: UseSessionActionsOptions): UseSessionActionsResult {

	const openSessionInTab = useCallback(
		(sessionId: string, messageId?: string) => {
			setOpenSessionIds((current) =>
				current.includes(sessionId) ? current : [...current, sessionId],
			);
			setActiveSessionId(sessionId);
			setScrollToMessageId(messageId);
		},
		[setActiveSessionId, setScrollToMessageId],
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
		setOpenSessionIds((current) => current.filter((id) => knownIds.has(id)));
	}, [sessionsRef]);

	const handleNewChat = useCallback(() => {
		if (isStreaming) abortActiveRuntime();

		// T26 Phase 2: Auto-summarize the ending session before starting a new one
		const endingSessionId = activeSessionIdRef.current;
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
	}, [isStreaming, plugin, createNewSession, setSelectedProfileIds, getSelectedProfileIds, setDebateMode, setWasTruncated, abortActiveRuntime, activeSessionIdRef, sessionsRef]);

	const handleLoadSession = useCallback(
		(sessionId: string) => {
			const session = sessionsRef.current.find((s) => s.id === sessionId);
			if (session?.selectedProfileIds && session.selectedProfileIds.length > 0) {
				setSelectedProfileIds(new Set(session.selectedProfileIds));
			} else if (session?.participants && session.participants.length > 0) {
				setSelectedProfileIds(new Set(session.participants.map((p) => p.id)));
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
			const isDraft = sessionsRef.current.find((session) => session.id === sessionId)
				?.messages.length === 0;
			if (isDraft) {
				setSessions((current) => current.filter((session) => session.id !== sessionId));
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
		[createNewSession, plugin.settings, setSessions, setActiveSessionId, setScrollToMessageId, activeSessionIdRef, sessionsRef, clearSessionRuntime],
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
		[setActiveSessionId, setScrollToMessageId, activeSessionIdRef, clearSessionRuntime],
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
		[setActiveSessionId, setScrollToMessageId, activeSessionIdRef, clearSessionRuntime],
	);

	const handleDeleteSession = useCallback(
		(sessionId: string) => {
			clearSessionRuntime(sessionId);
			setSessions((prev) => {
				const filtered = prev.filter((s) => s.id !== sessionId);
				if (activeSessionIdRef.current === sessionId) {
					const mostRecent = filtered.sort(
						(a, b) => b.updatedAt - a.updatedAt,
					)[0];
					if (mostRecent) {
						if (mostRecent.selectedProfileIds && mostRecent.selectedProfileIds.length > 0) {
							setSelectedProfileIds(new Set(mostRecent.selectedProfileIds));
						} else if (mostRecent.participants && mostRecent.participants.length > 0) {
							setSelectedProfileIds(new Set(mostRecent.participants.map((p) => p.id)));
						} else {
							setSelectedProfileIds(new Set());
						}
						setDebateMode(false);
						setActiveSessionId(mostRecent.id);
					} else {
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
						setSelectedProfileIds(new Set());
					}
				}
				return filtered;
			});
		},
		[setSessions, setActiveSessionId, setSelectedProfileIds, setDebateMode, activeSessionIdRef, plugin.settings.includeActiveNote, profileId, clearSessionRuntime],
	);

	const handleRenameSession = useCallback(
		(sessionId: string, newTitle: string) => {
			setSessions((prev) =>
				prev.map((s) =>
					s.id === sessionId ? { ...s, title: newTitle.trim() } : s,
				),
			);
		},
		[setSessions],
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
