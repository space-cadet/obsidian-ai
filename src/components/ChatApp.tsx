import React, {
	useState,
	useRef,
	useCallback,
	useEffect,
	useMemo,
} from "react";
import { Notice, TFile, WorkspaceLeaf, MarkdownView } from "obsidian";

import { ChatPluginLike } from "../views/ObsidianAIChatView";
import { ChatMessage, ChatSession, ContextItem, ContentPart } from "../types";
import { resolveContextItems } from "../context/ContextEngine";
import { resolveAttachments } from "../context/AttachmentEngine";
import { estimateTokens } from "../context/tokenEstimator";
import { noteTools } from "../agent/tools";
import { ToolExecutor } from "../agent/ToolExecutor";
import { AgentLoop } from "../agent/AgentLoop";
import type { ToolCall, ToolResult } from "../agent/types";
import { Orchestrator, AgentResponse } from "../agent/Orchestrator";
import { ParticipantRouter } from "../agent/ParticipantRouter";
import { parseMentions } from "../agent/MentionParser";
import { getAgentColor, getAgentIcon } from "../lib/agentVisuals";
import { contextItemKey, sameContextItems } from "../lib/contextUtils";
import { parseSlashCommand, SlashCommand } from "../lib/slashCommand";
import { makeId, getSessionTotalTokens } from "../lib/sessionUtils";
import { buildSystemPrompt } from "../lib/systemPrompt";
import { useChatSession } from "../hooks/useChatSession";
import { useChatUI } from "../hooks/useChatUI";
import { useMessageActions } from "../hooks/useMessageActions";
import { useSessionActions } from "../hooks/useSessionActions";
import { useSettingsActions } from "../hooks/useSettingsActions";
import { useExportActions } from "../hooks/useExportActions";
import { useSearch } from "../hooks/useSearch";
import { useContextItems } from "../hooks/useContextItems";
import { useChatRuntimeState } from "../hooks/useChatRuntimeState";
import ActionBar from "./ActionBar";
import ChatTabBar from "./ChatTabBar";
import ChatMessages from "./ChatMessages";
import ContextBar from "./ContextBar";
import ChatInput from "./ChatInput";
import SessionPickerModal from "./SessionPickerModal";
import ContextPickerModal from "./ContextPickerModal";
import ExportModal from "./ExportModal";
import PendingToolCard from "./PendingToolCard";
import ObsidianIcon from "./ObsidianIcon";
import SearchInput from "./SearchInput";
import SearchResults from "./search-results";

import { ChatApiManager } from "../api";
import { OpenResponsesLoop } from "../agent/OpenResponsesLoop";
import { noteToolsToOpenResponses } from "../agent/tools/toOpenResponses";
import {
	getActiveProviderProfile,
	ProviderProfile,
} from "../settings";
import { stripThinkingTags } from "./MessageBubble";
import { WebSocketSyncAdapter } from "../sync/WebSocketSyncAdapter";
import type { SyncAdapter } from "../sync/SyncAdapter";

interface ChatAppProps {
	plugin: ChatPluginLike;
	/** Optional profile ID to use for this chat panel. Falls back to active profile. */
	profileId?: string;
	initialSessionId?: string;
	initialMessageId?: string;
}

const ChatApp: React.FC<ChatAppProps> = ({ plugin, profileId, initialSessionId, initialMessageId }) => {
	const {
		sessions,
		setSessions,
		activeSessionId,
		setActiveSessionId,
		chatDataLoaded,
		sessionsRef,
		activeSessionIdRef,
		openSessionIds: persistedOpenSessionIds,
		setOpenSessionIds: setPersistedOpenSessionIds,
		createNewSession,
		renameSession,
		updateSessionMessages,
		updateSessionContextItems,
		manualRenameActiveSession,
		autoNameSessions,
		setAutoNameSessions,
	} = useChatSession({ plugin, profileId });

	const [wasTruncated, setWasTruncated] = useState(false);
	const [contextTokenCount, setContextTokenCount] = useState(0);
	const [scrollToMessageId, setScrollToMessageId] = useState<string | undefined>(initialMessageId);
	const [thinkingEnabled, setThinkingEnabled] = useState(false);
	const savedSessions = useMemo(
		() => sessions.filter((session) => session.messages.length > 0),
		[sessions],
	);

	const {
		activeRuntime,
		getRuntime,
		patchRuntime,
		clearRuntime,
		abortRuntime,
	} = useChatRuntimeState(activeSessionId);
	const messagesRef = useRef<ChatMessage[]>([]);

	// Track if the app was hidden while streaming (for mobile background handling)
	const wasHiddenRef = useRef(false);
	const streamingWhenHiddenRef = useRef(false);

	// Force re-render when user returns to chat tab (settings may have changed)
	const [settingsTick, setSettingsTick] = useState(0);
	useEffect(() => {
		const onVis = () => { if (!document.hidden) setSettingsTick(t => t + 1); };
		document.addEventListener("visibilitychange", onVis);
		return () => document.removeEventListener("visibilitychange", onVis);
	}, []);

	const ui = useChatUI();
	const { connectedUsers, setConnectedUsers } = ui;
	const suppressProfilePersistenceRef = useRef(false);
	const scrollSaveTimersRef = useRef<Map<string, number>>(new Map());
	const getSelectedProfileIds = useCallback(
		() => Array.from(ui.selectedProfileIds),
		[ui.selectedProfileIds],
	);

	/** Resolve the profile for this chat panel */
	const resolvedProfile: ProviderProfile = useMemo(() => {
		if (profileId) {
			const p = plugin.settings.providerProfiles.find((pr) => pr.id === profileId);
			if (p) return p;
		}
		const activeSession = sessions.find((s) => s.id === activeSessionId);
		if (activeSession?.profileId) {
			const p = plugin.settings.providerProfiles.find((pr) => pr.id === activeSession.profileId);
			if (p) return p;
		}
		return getActiveProviderProfile(plugin.settings);
	}, [profileId, activeSessionId, plugin.settings.providerProfiles, sessions, settingsTick]);

	// ─── Derive participants from selectedProfileIds ───
	const participants = useMemo(() => {
		const ids = Array.from(ui.selectedProfileIds);
		if (ids.length < 2) return [];
		return ids.map((id) => {
			const profile = plugin.settings.providerProfiles.find((p) => p.id === id);
			return {
				id,
				name: profile?.name ?? "Unknown",
				profileId: id,
				color: getAgentColor(profile?.provider ?? "custom"),
				icon: getAgentIcon(profile?.provider ?? "custom"),
			};
		});
	}, [ui.selectedProfileIds, plugin.settings.providerProfiles]);

	const isGroupChat = participants.length >= 2 || ui.selectedRemoteUserIds.size > 0;

	// ─── Group Chat Orchestrator ───
	const orchestrator = useMemo(() => {
		if (!isGroupChat || participants.length === 0) return null;
		const resolved = participants.map((p) => {
			const profile = plugin.settings.providerProfiles.find((pr) => pr.id === p.profileId);
			return { ...p, profile: profile ?? undefined };
		});
		const orch = new Orchestrator({
			api: plugin.chatapi,
			participants: resolved.map((e) => ({
				id: e.id,
				name: e.name,
				profileId: e.profileId,
				color: e.color,
				icon: e.icon,
			})),
			mode: "sequential",
			contextStrategy: "full",
			enableTools: plugin.settings.enableAgentTools,
			autoApprove: plugin.settings.autoApply,
			maxSteps: plugin.settings.maxAgentSteps,
			toolExecutor: new ToolExecutor(
				plugin.app,
				plugin.settings,
				plugin.personaLoader ?? undefined,
			plugin.searchIndex ?? undefined,
			() => activeSessionIdRef.current,
			plugin.integrationRegistry,
			),
		});
		orch.engines = resolved.map((e) => ({
			id: e.id,
			name: e.name,
			color: e.color,
			profile: e.profile ?? {
				id: e.profileId,
				name: e.name,
				provider: "custom",
				model: "default",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			} as ProviderProfile,
		}));
		return orch;
	}, [isGroupChat, participants, plugin.chatapi, plugin.settings, plugin.app]);

	// ─── Participant Router (wraps orchestrator + relay) ───
	const participantRouter = useMemo(() => {
		if (!orchestrator || !syncAdapterRef.current) return null;
		return new ParticipantRouter(
			orchestrator,
			syncAdapterRef.current,
			plugin.settings.syncUserName || "local",
		);
	}, [orchestrator]);

	const messages = useMemo(() => {
		const s = sessions.find((s) => s.id === activeSessionId);
		return s?.messages ?? [];
	}, [sessions, activeSessionId]);
	messagesRef.current = messages;

	// Sync remoteUsers from active session to ParticipantRouter
	useEffect(() => {
		const session = sessions.find((s) => s.id === activeSessionId);
		if (participantRouter && session?.selectedRemoteUserIds) {
			participantRouter.setRemoteUsers(session.selectedRemoteUserIds);
		}
	}, [activeSessionId, sessions, participantRouter]);

	// ─── Session Actions ───
	const {
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
	} = useSessionActions({
		plugin,
		profileId,
		sessionsRef,
		activeSessionIdRef,
		setSessions,
		setActiveSessionId,
		setScrollToMessageId,
		createNewSession,
		setSelectedProfileIds: ui.setSelectedProfileIds,
		getSelectedProfileIds,
		setDebateMode: ui.setDebateMode,
		setWasTruncated,
		isStreaming: activeRuntime.isStreaming,
		abortActiveRuntime: () => abortRuntime(activeSessionIdRef.current),
		clearSessionRuntime: (sessionId) => {
			abortRuntime(sessionId);
			clearRuntime(sessionId);
		},
		openSessionIds: persistedOpenSessionIds,
		setOpenSessionIds: setPersistedOpenSessionIds,
	});

	// The toolbar is shared visually, but profile selection belongs to the
	// newly active session. This is deliberately one-way: writing picker changes
	// back into the session happens in the separate effect below.
	useEffect(() => {
		const activeSession = sessions.find((session) => session.id === activeSessionId);
		if (!activeSession) return;
		const ids = activeSession.selectedProfileIds?.length
			? activeSession.selectedProfileIds
			: activeSession.profileId
				? [activeSession.profileId]
				: [getActiveProviderProfile(plugin.settings).id];
		const currentIds = Array.from(ui.selectedProfileIds);
		if (ids.length !== currentIds.length || ids.some((id) => !ui.selectedProfileIds.has(id))) {
			suppressProfilePersistenceRef.current = true;
			ui.setSelectedProfileIds(new Set(ids));
		}
		// Also restore selected remote users
		const remoteIds = activeSession.selectedRemoteUserIds ?? [];
		const currentRemoteIds = Array.from(ui.selectedRemoteUserIds);
		if (remoteIds.length !== currentRemoteIds.length || remoteIds.some((id) => !ui.selectedRemoteUserIds.has(id))) {
			suppressProfilePersistenceRef.current = true;
			ui.setSelectedRemoteUserIds(new Set(remoteIds));
		}
	}, [activeSessionId, chatDataLoaded]);

	// ─── Settings Actions ───
	const {
		autoApprove,
		handleToggleAutoApprove,
		handleToggleAutoName,
		handleManualRename,
	} = useSettingsActions({
		plugin,
		autoNameSessions,
		setAutoNameSessions,
		sessionsRef,
		activeSessionIdRef,
		manualRenameActiveSession,
		resolvedProfile,
	});

	// ─── Export Actions ───
	const { handleExportChat } = useExportActions(ui.setShowExportModal);

	// ─── Search ───
	const {
		searchQuery,
		setSearchQuery,
		searchResults,
		searchLoading,
		searchVisible,
		toggleSearch,
		handleSelectSearchResult,
	} = useSearch(sessions, openSessionInTab);

	// ─── Context Items ───
	const {
		contextItems,
		setContextItems,
		targetNoteName,
		setTargetNoteName,
		handleToggleActiveNote,
		handleRemoveContextItem,
		handleAddMention,
		handleAddContextItems,
	} = useContextItems(
		plugin,
		sessionsRef,
		activeSessionIdRef,
		setSessions,
		setWasTruncated,
		() => ui.setShowContextPicker(false),
	);

	// ─── Message Actions ───
	const actions = useMessageActions({
		plugin,
		orchestrator,
		participantRouter,
		resolvedProfile,
		isGroupChat,
		participants,
		thinkingEnabled,
		sessionsRef,
		activeSessionIdRef,
		setSessions,
		setWasTruncated,
		setContextTokenCount,
		setContextItems,
		messagesRef,
		contextItemsRef: { current: contextItems } as React.MutableRefObject<ContextItem[]>,
		lastMarkdownLeafRef: useRef<WorkspaceLeaf | null>(null),
		getRuntime,
		patchRuntime,
		clearRuntime,
		ui,
	});

	// ═══════════════════════════════════════════════════════
	// RELAY / SYNC
	// ═══════════════════════════════════════════════════════
	const syncAdapterRef = useRef<SyncAdapter | null>(null);
	const [relayConnected, setRelayConnected] = useState(false);

	const activeSessionRelayEnabled = useMemo(() => {
		const session = sessions.find((s) => s.id === activeSessionId);
		return session?.relayEnabled ?? false;
	}, [sessions, activeSessionId]);

	// Connect/disconnect sync adapter when relayEnabled changes
	useEffect(() => {
		if (!activeSessionId) return;
		const session = sessions.find((s) => s.id === activeSessionId);
		if (!session) return;

		if (session.relayEnabled) {
			const adapter = new WebSocketSyncAdapter(plugin.settings.syncRelayUrl);
			// Register callbacks BEFORE connect to avoid race with server roster
			adapter.onUserList((users) => {
				setConnectedUsers(users);
			});
			adapter.onPresence((event) => {
				if (event.type === "join") {
					setConnectedUsers((prev) =>
						prev.includes(event.userId) ? prev : [...prev, event.userId],
					);
				} else if (event.type === "leave") {
					setConnectedUsers((prev) =>
						prev.filter((u) => u !== event.userId),
					);
				}
			});
			adapter.onMessage((remoteMsg) => {
				// Append remote message to current session
				setSessions((prev) =>
					prev.map((s) =>
						s.id === activeSessionId
							? {
									...s,
									messages: [...s.messages, remoteMsg],
									updatedAt: Date.now(),
								}
							: s,
					),
				);
			});
			adapter.connect(
				plugin.settings.syncRoomId,
				plugin.settings.syncUserName,
			).then(() => {
				setRelayConnected(true);
				new Notice("🔌 Relay connected");
			}).catch((err) => {
				console.warn("[ChatApp] Relay connect failed:", err);
				setRelayConnected(false);
				new Notice(`🔌 Relay failed: ${err.message}`);
			});
			syncAdapterRef.current = adapter;
		} else {
			if (syncAdapterRef.current) {
				syncAdapterRef.current.disconnect();
				syncAdapterRef.current = null;
				setRelayConnected(false);
				setConnectedUsers([]);
			}
		}

		return () => {
			if (syncAdapterRef.current) {
				syncAdapterRef.current.disconnect();
				syncAdapterRef.current = null;
				setRelayConnected(false);
				setConnectedUsers([]);
			}
		};
	}, [activeSessionId, activeSessionRelayEnabled, plugin.settings.syncRelayUrl, plugin.settings.syncRoomId, plugin.settings.syncUserName]);

	const handleToggleRelay = useCallback(() => {
		if (!activeSessionId) return;
		setSessions((prev) =>
			prev.map((s) =>
				s.id === activeSessionId
					? { ...s, relayEnabled: !s.relayEnabled }
					: s,
			),
		);
	}, [activeSessionId, setSessions]);

	// Wrap handleSend to also sync to relay (only if ParticipantRouter is not handling it)
	const handleSendWithSync = useCallback(
		async (text: string, attachments?: import("../types").Attachment[]) => {
			await actions.handleSend(text, attachments);
			// Only do legacy relay sync if ParticipantRouter is not active
			if (!participantRouter && syncAdapterRef.current && relayConnected) {
				const userMsg: ChatMessage = {
					id: makeId(),
					role: "user",
					content: text,
					timestamp: Date.now(),
					attachments: attachments && attachments.length > 0 ? attachments : undefined,
				};
				syncAdapterRef.current.sendMessage(userMsg).catch((err) => {
					console.warn("[ChatApp] Failed to sync message:", err);
				});
			}
		},
		[actions.handleSend, relayConnected, participantRouter],
	);

	// Sync selectedProfileIds into the active session whenever they change
	useEffect(() => {
		if (!activeSessionId) return;
		if (suppressProfilePersistenceRef.current) {
			suppressProfilePersistenceRef.current = false;
			return;
		}
		const ids = Array.from(ui.selectedProfileIds);
		setSessions((prev) =>
			prev.map((s) => {
				if (s.id !== activeSessionId) return s;
				const nextParticipants = ids.length >= 2
					? ids.map((id) => {
						const profile = plugin.settings.providerProfiles.find((p) => p.id === id);
						return {
							id,
							name: profile?.name ?? "Unknown",
							profileId: id,
							color: getAgentColor(profile?.provider ?? "custom"),
							icon: getAgentIcon(profile?.provider ?? "custom"),
						};
					})
					: [];
				const alreadyMatches =
					s.profileId === (ids.length === 1 ? ids[0] : undefined) &&
					JSON.stringify(s.selectedProfileIds ?? []) === JSON.stringify(ids) &&
					s.isGroupChat === (ids.length >= 2) &&
					JSON.stringify(s.selectedRemoteUserIds ?? []) === JSON.stringify(Array.from(ui.selectedRemoteUserIds));
				return alreadyMatches
					? s
					: {
						...s,
						profileId: ids.length === 1 ? ids[0] : undefined,
						selectedProfileIds: ids,
						isGroupChat: ids.length >= 2 || ui.selectedRemoteUserIds.size > 0,
						participants: nextParticipants,
						selectedRemoteUserIds: Array.from(ui.selectedRemoteUserIds),
					};
			}),
		);
	}, [ui.selectedProfileIds, ui.selectedRemoteUserIds, activeSessionId, plugin.settings.providerProfiles]);

	const handleScrollPositionChange = useCallback((sessionId: string, scrollTop: number) => {
		const existingTimer = scrollSaveTimersRef.current.get(sessionId);
		if (existingTimer) window.clearTimeout(existingTimer);
		scrollSaveTimersRef.current.set(sessionId, window.setTimeout(() => {
			setSessions((current) => current.map((session) =>
				session.id === sessionId && session.scrollPosition !== scrollTop
					? { ...session, scrollPosition: scrollTop }
					: session,
			));
			scrollSaveTimersRef.current.delete(sessionId);
		}, 200));
	}, [setSessions]);
	useEffect(() => () => {
		scrollSaveTimersRef.current.forEach((timer) => window.clearTimeout(timer));
	}, []);

	// ─── Draft auto-save (debounced) ───
	const draftTimerRef = useRef<number | null>(null);
	const handleDraftChange = useCallback((text: string) => {
		const currentActiveId = activeSessionIdRef.current;
		if (!currentActiveId) return;
		if (draftTimerRef.current) {
			window.clearTimeout(draftTimerRef.current);
		}
		draftTimerRef.current = window.setTimeout(() => {
			setSessions((prev) =>
				prev.map((s) =>
					s.id === currentActiveId ? { ...s, draft: text } : s,
				),
			);
			draftTimerRef.current = null;
		}, 500);
	}, [setSessions]);
	useEffect(() => {
		return () => {
			if (draftTimerRef.current) {
				window.clearTimeout(draftTimerRef.current);
			}
		};
	}, []);

	// Initialise leaf tracking and register workspace listener
	useEffect(() => {
		const initLeaf =
			plugin.app.workspace.getLeavesOfType("markdown")[0] ?? null;
		if (initLeaf?.view instanceof MarkdownView) {
			setTargetNoteName(
				(initLeaf.view as MarkdownView).file?.basename ?? null,
			);
		}
	}, [plugin]);

	const hasHistory = savedSessions.length > 0;

	return (
		<div className={`chat-panel${ui.zenMode ? ' is-zen' : ''}`}>
			{!ui.zenMode && (
				<div className="chat-action-bar-wrapper">
					<ActionBar
						onNewChat={handleNewChat}
						onLoadChat={() => ui.setShowSessionPicker(true)}
						onExportChat={handleExportChat}
						canLoad={hasHistory}
						plugin={plugin}
						autoApprove={autoApprove}
						onToggleAutoApprove={handleToggleAutoApprove}
						autoNameSessions={autoNameSessions}
						onToggleAutoName={handleToggleAutoName}
						onManualRename={handleManualRename}
						profile={resolvedProfile}
						sessionTitle={sessions.find((s) => s.id === activeSessionId)?.title}
						zenMode={ui.zenMode}
						onToggleZenMode={ui.toggleZenMode}
						participantCount={participants.length + ui.selectedRemoteUserIds.size}
						onToggleParticipantDropdown={ui.toggleParticipantDropdown}
						debateMode={ui.debateMode}
						onToggleDebateMode={ui.toggleDebateMode}
						searchVisible={searchVisible}
						onToggleSearch={toggleSearch}
						relayEnabled={activeSessionRelayEnabled && relayConnected}
						onToggleRelay={handleToggleRelay}
						connectedUsers={connectedUsers}
						onToggleRemoteUserDropdown={ui.toggleRemoteUserDropdown}
						remoteUserCount={connectedUsers.length}
					/>
					{ui.showParticipantDropdown && (
						<div ref={ui.participantDropdownRef} className="chat-participant-dropdown">
							{plugin.settings.providerProfiles.map((profile) => {
								const isSelected = ui.selectedProfileIds.has(profile.id);
								return (
									<label
										key={profile.id}
										className={`chat-participant-dropdown-item${isSelected ? " is-selected" : ""}`}
									>
										<input
											type="checkbox"
											checked={isSelected}
											onChange={() => ui.toggleProfile(profile.id)}
										/>
										<span style={{ color: getAgentColor(profile.provider) }}>●</span>
										<span className="chat-participant-dropdown-name">{profile.name}</span>
										<span className="chat-participant-dropdown-model">{profile.model}</span>
									</label>
								);
							})}
							{plugin.settings.providerProfiles.length === 0 && (
								<div className="chat-participant-dropdown-empty">
									No profiles configured
								</div>
							)}
						</div>
					)}
					{ui.showRemoteUserDropdown && (
						<div ref={ui.remoteUserDropdownRef} className="chat-remote-user-dropdown">
							<div className="chat-remote-user-dropdown-header">
								<span>Room: {plugin.settings.syncRoomId}</span>
								{relayConnected && (
									<span className="chat-remote-user-status is-connected">●</span>
								)}
							</div>
							{connectedUsers.length === 0 ? (
								<div className="chat-remote-user-dropdown-empty">
									No users connected
								</div>
							) : (
								connectedUsers.map((user) => {
									const isSelected = ui.selectedRemoteUserIds.has(user);
									return (
										<label
											key={user}
											className={`chat-remote-user-dropdown-item${isSelected ? " is-selected" : ""}${user === plugin.settings.syncUserName ? " is-self" : ""}`}
										>
											<input
												type="checkbox"
												checked={isSelected}
												onChange={() => ui.toggleRemoteUser(user)}
											/>
											<span className="chat-remote-user-dot">●</span>
											<span className="chat-remote-user-name">
												{user}
												{user === plugin.settings.syncUserName && " (You)"}
											</span>
										</label>
									);
									})
							)}
						</div>
					)}
				</div>
			)}
			{!ui.zenMode && (
				<ChatTabBar
					sessions={sessions}
					openSessionIds={openSessionIds}
					activeSessionId={activeSessionId}
					tabTitleWidth={plugin.settings.chatTabTitleWidth}
					onSelect={(sessionId) => openSessionInTab(sessionId)}
					onClose={handleCloseTab}
					onCloseOthers={handleCloseOtherTabs}
					onCloseToRight={handleCloseTabsToRight}
					onRename={handleRenameSession}
				/>
			)}

			{/* Search input + results */}
			{!ui.zenMode && searchVisible && (
				<>
					<SearchInput
						onSearch={setSearchQuery}
						placeholder="Search chats…"
					/>
					{searchQuery.trim() && (
						<SearchResults
							results={searchResults}
							loading={searchLoading}
							query={searchQuery}
							onSelectSession={handleSelectSearchResult}
						/>
					)}
				</>
			)}

			{/* Zen mode exit button (floating) */}
			{ui.zenMode && (
				<button
					className="chat-btn chat-icon-btn chat-zen-exit"
					onClick={() => ui.setZenMode(false)}
					title="Exit zen mode"
				>
					<ObsidianIcon icon="eye-off" size={15} />
				</button>
			)}

			<ChatMessages
				sessionId={activeSessionId}
				restoreScrollTop={plugin.settings.restoreChatTabs
					? sessions.find((session) => session.id === activeSessionId)?.scrollPosition
					: undefined}
				onScrollPositionChange={handleScrollPositionChange}
				messages={messages}
				currentAiMessage={activeRuntime.currentAiMessage}
				currentContentParts={activeRuntime.currentContentParts}
				isStreaming={activeRuntime.isStreaming}
				isEditing={ui.isEditing}
				app={plugin.app}
				showThinking={thinkingEnabled}
				onAppend={actions.handleAppend}
				onInsertAtCursor={actions.handleInsertAtCursor}
				onApply={actions.handleApply}
				onRetry={actions.handleRetry}
				onEdit={actions.handleEditMessage}
				onApplyToTarget={actions.handleApplyToTarget}
				onCreateNote={actions.handleCreateNote}
				onAppendToTarget={actions.handleAppendToTarget}
				onOpenPastSession={openSessionInTab}
				scrollToMessageId={scrollToMessageId}
			/>

			{activeRuntime.pendingToolCall && (
				<PendingToolCard
					toolCall={activeRuntime.pendingToolCall}
					onApprove={actions.handleApproveTool}
					onReject={actions.handleRejectTool}
					providerDisplay={plugin.integrationRegistry?.getCapabilityDisplay(activeRuntime.pendingToolCall.toolName)}
				/>
			)}

			<ChatInput
				app={plugin.app}
				plugin={plugin}
				onSend={handleSendWithSync}
				onStop={actions.handleStop}
				onAddMention={handleAddMention}
				isStreaming={activeRuntime.isStreaming}
				isEditing={ui.isEditing}
				onCancel={actions.handleCancelEdit}
				editMessage={ui.editMessageText}
				thinkingEnabled={thinkingEnabled}
				onToggleThinking={() => setThinkingEnabled((t) => !t)}
				attachments={ui.messageAttachments}
				onAttachmentsChange={ui.setMessageAttachments}
				pressEnterToSend={plugin.settings.pressEnterToSend}
				tokenTotal={(() => {
					const session = activeSessionId
						? sessions.find((s) => s.id === activeSessionId)
						: null;
					const sessionTotal = session
						? getSessionTotalTokens(session)
						: 0;
					if (activeRuntime.isStreaming && activeRuntime.runningTokenTotal > 0) {
						return `~${(sessionTotal + activeRuntime.runningTokenTotal).toLocaleString()} tokens`;
					}
					if (sessionTotal > 0) {
						return `~${sessionTotal.toLocaleString()} tokens`;
					}
					return undefined;
				})()}
				draft={undefined}
				onDraftChange={undefined}
			/>
			{ui.showSessionPicker && (
				<SessionPickerModal
					sessions={savedSessions}
					activeSessionId={activeSessionId}
					onLoad={handleLoadSession}
					onDelete={handleDeleteSession}
					onRename={handleRenameSession}
					onClose={() => ui.setShowSessionPicker(false)}
				/>
			)}
			{ui.showExportModal && (
				<ExportModal
					sessions={savedSessions}
					activeSessionId={activeSessionId}
					plugin={plugin}
					onClose={() => ui.setShowExportModal(false)}
				/>
			)}
			{ui.showContextPicker && (
				<ContextPickerModal
					plugin={plugin}
					app={plugin.app}
					onAdd={handleAddContextItems}
					onClose={() => ui.setShowContextPicker(false)}
				/>
			)}
		</div>
	);
};

export default ChatApp;
