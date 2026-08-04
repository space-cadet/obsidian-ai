import { useState, useRef, useCallback, useEffect } from "react";
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
	setDebateMode: (v: boolean) => void;
	setWasTruncated: (v: boolean) => void;
	isStreaming: boolean;
	controllerRef: React.MutableRefObject<AbortController | null>;
}

export interface UseSessionActionsResult {
	openSessionIds: string[];
	setOpenSessionIds: React.Dispatch<React.SetStateAction<string[]>>;
	openSessionInTab: (sessionId: string, messageId?: string) => void;
	handleNewChat: () => void;
	handleLoadSession: (sessionId: string) => void;
	handleCloseTab: (sessionId: string) => void;
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
	setDebateMode,
	setWasTruncated,
	isStreaming,
	controllerRef,
}: UseSessionActionsOptions): UseSessionActionsResult {
	const [openSessionIds, setOpenSessionIds] = useState<string[]>([]);

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
		if (isStreaming) controllerRef.current?.abort();

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

		createNewSession({
			includeActiveNote: plugin.settings.includeActiveNote,
			selectedProfileIds: plugin.settings.selectedProfileIds,
			autoNameSessions: plugin.settings.autoNameSessions,
		});
		if (plugin.settings.selectedProfileIds.length > 0) {
			setSelectedProfileIds(new Set(plugin.settings.selectedProfileIds));
		} else {
			const activeProfile = getActiveProviderProfile(plugin.settings);
			setSelectedProfileIds(new Set([activeProfile.id]));
		}
		setDebateMode(false);
		setWasTruncated(false);
	}, [isStreaming, plugin, createNewSession, setSelectedProfileIds, setDebateMode, setWasTruncated, controllerRef, activeSessionIdRef, sessionsRef]);

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
			setOpenSessionIds((current) => {
				if (current.length <= 1) {
					// A chat panel always needs an active session. Closing its final tab
					// preserves the saved conversation and opens a fresh chat in its place.
					const newSession = createNewSession({
						includeActiveNote: plugin.settings.includeActiveNote,
						selectedProfileIds: plugin.settings.selectedProfileIds,
						autoNameSessions: plugin.settings.autoNameSessions,
						force: true,
					});
					setScrollToMessageId(undefined);
					return [newSession.id];
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
		[createNewSession, plugin.settings, setActiveSessionId, setScrollToMessageId, activeSessionIdRef],
	);

	const handleDeleteSession = useCallback(
		(sessionId: string) => {
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
		[setSessions, setActiveSessionId, setSelectedProfileIds, setDebateMode, activeSessionIdRef, plugin.settings.includeActiveNote, profileId],
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
		handleDeleteSession,
		handleRenameSession,
	};
}
