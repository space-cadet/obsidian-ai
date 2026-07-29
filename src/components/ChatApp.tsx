import React, {
	useState,
	useRef,
	useCallback,
	useEffect,
	useMemo,
} from "react";
import { MarkdownView, Notice, TFile, WorkspaceLeaf } from "obsidian";

import { ChatPluginLike } from "../views/ObsidianAIChatView";
import { NoteEditingBridge } from "../noteEditing/NoteEditingBridge";
import { ChatMessage, ChatSession, ContextItem, GroupChatParticipant, ContentPart } from "../types";
import { resolveContextItems } from "../context/ContextEngine";
import { resolveAttachments } from "../context/AttachmentEngine";
import { estimateTokens } from "../context/tokenEstimator";
import { noteTools } from "../agent/tools";
import { ToolExecutor } from "../agent/ToolExecutor";
import { AgentLoop } from "../agent/AgentLoop";
import type { ToolCall, ToolResult } from "../agent/types";
import { Orchestrator, AgentResponse } from "../agent/Orchestrator";
import { parseMentions } from "../agent/MentionParser";
import { getAgentColor, getAgentIcon } from "../lib/agentVisuals";
import { contextItemKey, sameContextItems } from "../lib/contextUtils";
import { parseSlashCommand, SlashCommand } from "../lib/slashCommand";
import { makeId, getSessionTotalTokens } from "../lib/sessionUtils";
import { buildSystemPrompt } from "../lib/systemPrompt";
import { useChatSession } from "../hooks/useChatSession";
import { useChatUI } from "../hooks/useChatUI";
import { useMessageActions } from "../hooks/useMessageActions";
import ActionBar from "./ActionBar";
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
import { FuzzySearcher } from "../search/fuzzy-search";

import { ChatApiManager } from "../api";
import { OpenResponsesLoop } from "../agent/OpenResponsesLoop";
import { noteToolsToOpenResponses } from "../agent/tools/toOpenResponses";
import {
	getActiveProviderProfile,
	ProviderProfile,
} from "../settings";
import { stripThinkingTags } from "./MessageBubble";

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
		createNewSession,
		renameSession,
		updateSessionMessages,
		updateSessionContextItems,
		manualRenameActiveSession,
		autoNameSessions,
		setAutoNameSessions,
	} = useChatSession({ plugin, profileId });

	const [isStreaming, setIsStreaming] = useState(false);
	const [currentAiMessage, setCurrentAiMessage] = useState("");
	const [currentContentParts, setCurrentContentParts] = useState<ContentPart[]>([]);
	const [contextItems, setContextItems] = useState<ContextItem[]>([]);
	const [wasTruncated, setWasTruncated] = useState(false);
	const [contextTokenCount, setContextTokenCount] = useState(0);
	const [targetNoteName, setTargetNoteName] = useState<string | null>(null);
	const [thinkingEnabled, setThinkingEnabled] = useState(false);
	const [pendingToolCall, setPendingToolCall] = useState<ToolCall | null>(null);
	const [runningTokenTotal, setRunningTokenTotal] = useState(0);
	const [scrollToMessageId, setScrollToMessageId] = useState<string | undefined>(initialMessageId);
	useEffect(() => {
		if (!chatDataLoaded || !initialSessionId) return;
		if (sessions.some((session) => session.id === initialSessionId)) {
			setActiveSessionId(initialSessionId);
			setScrollToMessageId(initialMessageId);
		}
	}, [chatDataLoaded, initialSessionId, initialMessageId, sessions, setActiveSessionId]);
	const pendingToolCallRef = useRef<ToolCall | null>(null);
	useEffect(() => {
		pendingToolCallRef.current = pendingToolCall;
	}, [pendingToolCall]);
	const controllerRef = useRef<AbortController | null>(null);
	const resolveToolRef = useRef<((result: ToolResult | null) => void) | null>(null);
	// Refs so callbacks always see latest values without stale closures
	const messagesRef = useRef<ChatMessage[]>([]);
	const contextItemsRef = useRef<ContextItem[]>([]);
	contextItemsRef.current = contextItems;
	// Tracks the last focused markdown leaf
	const lastMarkdownLeafRef = useRef<WorkspaceLeaf | null>(null);
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

	/** Resolve the profile for this chat panel: explicit profileId → session's stored profile → active profile */
	const resolvedProfile: ProviderProfile = useMemo(() => {
		if (profileId) {
			const p = plugin.settings.providerProfiles.find((pr) => pr.id === profileId);
			if (p) return p;
		}
		// If a session is active and has a stored profileId, use it
		const activeSession = sessions.find((s) => s.id === activeSessionId);
		if (activeSession?.profileId) {
			const p = plugin.settings.providerProfiles.find((pr) => pr.id === activeSession.profileId);
			if (p) return p;
		}
		return getActiveProviderProfile(plugin.settings);
	}, [profileId, activeSessionId, plugin.settings.providerProfiles, sessions, settingsTick]);

	// ─── Derive participants from selectedProfileIds (auto group chat when 2+ selected) ───
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

	const isGroupChat = participants.length >= 2;

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
			toolExecutor: new ToolExecutor(plugin.app, plugin.settings, plugin.personaLoader ?? undefined, plugin.searchIndex ?? undefined),
		});
		// Override engine profiles
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

	// ─── Multi-select Toolbar Handlers ───


	const messages = useMemo(() => {
		const s = sessions.find((s) => s.id === activeSessionId);
		return s?.messages ?? [];
	}, [sessions, activeSessionId]);
	messagesRef.current = messages;

	// Sync contextItems when active session changes (NOT when sessions data mutates)
	const prevActiveSessionIdRef = useRef<string | null>(null);
	useEffect(() => {
		console.log(`[Effect1] fired — activeSessionId=${activeSessionId}, prev=${prevActiveSessionIdRef.current}`);
		if (activeSessionId === prevActiveSessionIdRef.current) {
			console.log(`[Effect1] SKIPPED — activeSessionId unchanged`);
			return; // activeSessionId didn't change — don't sync from session
		}
		prevActiveSessionIdRef.current = activeSessionId;
		const s = sessionsRef.current.find((s) => s.id === activeSessionId);
		const sessionItems = s?.contextItems ?? [];
		const needsUpdate = !sameContextItems(contextItemsRef.current, sessionItems);
		console.log(`[Effect1] activeSessionId CHANGED — sessionItems=${JSON.stringify(sessionItems.map(contextItemKey))}, current=${JSON.stringify(contextItemsRef.current.map(contextItemKey))}, needsUpdate=${needsUpdate}`);
		if (needsUpdate) {
			console.log(`[Effect1] calling setContextItems`);
			setContextItems(sessionItems);
		}
		setWasTruncated(false);
	}, [activeSessionId]);

	// Persist contextItems to the current session whenever they change
	useEffect(() => {
		const currentActiveId = activeSessionIdRef.current;
		console.log(`[Effect2] fired — contextItems changed, activeId=${currentActiveId}, items=${JSON.stringify(contextItems.map(contextItemKey))}`);
		if (!currentActiveId) {
			console.log(`[Effect2] SKIPPED — no active session`);
			return;
		}
		setSessions((prev) => {
			const s = prev.find((s) => s.id === currentActiveId);
			const same = s ? sameContextItems(s.contextItems, contextItems) : false;
			console.log(`[Effect2] setSessions updater — sameContextItems=${same}, sessionItems=${JSON.stringify(s?.contextItems.map(contextItemKey))}`);
			if (same) {
				console.log(`[Effect2] returning same session (no change)`);
				return prev;
			}
			const updated = prev.map((s) => {
				if (s.id !== currentActiveId) return s;
				return { ...s, contextItems };
			});
			console.log(`[Effect2] returning updated sessions`);
			return updated;
		});
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
			plugin.app.workspace.off("active-leaf-change", onLeafChange as any);
	}, [plugin]);

	// Sync selectedProfileIds into the active session whenever they change
	useEffect(() => {
		if (!activeSessionId) return;
		const ids = Array.from(ui.selectedProfileIds);
		setSessions((prev) =>
			prev.map((s) =>
				s.id === activeSessionId
					? {
						...s,
						selectedProfileIds: ids,
						isGroupChat: ids.length >= 2,
						participants: ids.length >= 2
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
							: [],
					}
					: s,
			),
		);
	}, [ui.selectedProfileIds, activeSessionId, plugin.settings.providerProfiles]);

	const [autoApprove, setAutoApprove] = useState(plugin.settings.autoApply);
	const [searchQuery, setSearchQuery] = useState("");
	const [searchResults, setSearchResults] = useState<any[]>([]);
	const [searchLoading, setSearchLoading] = useState(false);
	const [searchVisible, setSearchVisible] = useState(false);
	const fuzzySearcherRef = useRef(new FuzzySearcher());

	// Run fuzzy search when query changes
	useEffect(() => {
		if (!searchVisible || !searchQuery.trim()) {
			setSearchResults([]);
			return;
		}
		setSearchLoading(true);
		fuzzySearcherRef.current.setSessions(sessions);
		const results = fuzzySearcherRef.current.search(searchQuery);
		setSearchResults(results);
		setSearchLoading(false);
	}, [searchQuery, sessions, searchVisible]);

	/** Toggle search visibility */
	const toggleSearch = useCallback(() => {
		setSearchVisible(v => !v);
		if (searchVisible) {
			setSearchQuery("");
			setSearchResults([]);
		}
	}, [searchVisible]);
	const handleSelectSearchResult = useCallback((sessionId: string, messageId: string | null) => {
		setActiveSessionId(sessionId);
		setSearchQuery("");
		setSearchResults([]);
		setSearchVisible(false);
		if (messageId) {
			// Defer scroll until messages render
			setTimeout(() => {
				const el = document.querySelector(`[data-message-id="${messageId}"]`);
				if (el) {
					el.scrollIntoView({ behavior: "smooth", block: "center" });
					el.classList.add("chat-message-highlight");
					setTimeout(() => el.classList.remove("chat-message-highlight"), 2000);
				}
			}, 100);
		}
	}, [setActiveSessionId]);

	const handleToggleActiveNote = useCallback(() => {
		console.log(`[handleToggleActiveNote] fired — current items=${JSON.stringify(contextItemsRef.current.map(contextItemKey))}`);
		setContextItems((prev) => {
			const hasActive = prev.some((i) => i.type === "active-note");
			console.log(`[handleToggleActiveNote] hasActive=${hasActive}, prevItems=${JSON.stringify(prev.map(contextItemKey))}`);
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
		ui.setShowContextPicker(false);
	}, []);
	const hasHistory = sessions.some((s) => s.messages.length > 0);

	const actions = useMessageActions({
		plugin,
		orchestrator,
		resolvedProfile,
		isGroupChat,
		participants,
		thinkingEnabled,
		sessionsRef,
		activeSessionIdRef,
		setSessions,
		setIsStreaming,
		setCurrentAiMessage,
		setCurrentContentParts,
		setPendingToolCall,
		setWasTruncated,
		setContextTokenCount,
		setContextItems,
		setRunningTokenTotal,
		controllerRef,
		resolveToolRef,
		messagesRef,
		contextItemsRef,
		lastMarkdownLeafRef,
		pendingToolCallRef,
		ui,
	});


	const handleNewChat = useCallback(() => {
		if (isStreaming) controllerRef.current?.abort();
		createNewSession({
			includeActiveNote: plugin.settings.includeActiveNote,
			selectedProfileIds: plugin.settings.selectedProfileIds,
			autoNameSessions: plugin.settings.autoNameSessions,
		});
		// Select the default profile(s) from settings for the new chat
		if (plugin.settings.selectedProfileIds.length > 0) {
			ui.setSelectedProfileIds(new Set(plugin.settings.selectedProfileIds));
		} else {
			// Fall back to the active provider profile so the dropdown is never empty
			const activeProfile = getActiveProviderProfile(plugin.settings);
			ui.setSelectedProfileIds(new Set([activeProfile.id]));
		}
		ui.setDebateMode(false);
		setWasTruncated(false);
	}, [isStreaming, plugin, createNewSession]);

	const handleLoadSession = useCallback((sessionId: string) => {
		ui.setShowSessionPicker(false);
		// Restore selectedProfileIds for the loaded session BEFORE changing activeSessionId
		const session = sessionsRef.current.find((s) => s.id === sessionId);
		if (session?.selectedProfileIds && session.selectedProfileIds.length > 0) {
			ui.setSelectedProfileIds(new Set(session.selectedProfileIds));
		} else if (session?.participants && session.participants.length > 0) {
			// Backward compat: derive from legacy participants
			ui.setSelectedProfileIds(new Set(session.participants.map((p) => p.id)));
		} else {
			ui.setSelectedProfileIds(new Set());
		}
		ui.setDebateMode(false);
		setActiveSessionId(sessionId);
	}, []);

	const handleDeleteSession = useCallback((sessionId: string) => {
		setSessions((prev) => {
			const filtered = prev.filter((s) => s.id !== sessionId);
			// If deleting the active session, activate the most recent remaining
			if (activeSessionIdRef.current === sessionId) {
				const mostRecent = filtered.sort(
					(a, b) => b.updatedAt - a.updatedAt,
				)[0];
				if (mostRecent) {
					// Restore selectedProfileIds BEFORE changing active session
					if (mostRecent.selectedProfileIds && mostRecent.selectedProfileIds.length > 0) {
						ui.setSelectedProfileIds(new Set(mostRecent.selectedProfileIds));
					} else if (mostRecent.participants && mostRecent.participants.length > 0) {
						ui.setSelectedProfileIds(new Set(mostRecent.participants.map((p) => p.id)));
					} else {
						ui.setSelectedProfileIds(new Set());
					}
					ui.setDebateMode(false);
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
					ui.setSelectedProfileIds(new Set());
				}
			}
			return filtered;
		});
	}, []);

	const handleRenameSession = useCallback(
		(sessionId: string, newTitle: string) => {
			renameSession(sessionId, newTitle);
		},
		[renameSession],
	);

	const handleToggleAutoApprove = useCallback(() => {
		const newValue = !autoApprove;
		setAutoApprove(newValue);
		plugin.settings.autoApply = newValue;
		void plugin.saveSettings();
		new Notice(
			newValue
				? "🤖 Auto-approve ON — tool calls will run automatically"
				: "🔒 Manual mode — each tool call will ask for approval",
			2500,
		);
	}, [plugin, autoApprove]);

	const handleToggleAutoName = useCallback(() => {
		const newValue = !autoNameSessions;
		setAutoNameSessions(newValue);
		plugin.settings.autoNameSessions = newValue;
		void plugin.saveSettings();
		new Notice(
			newValue
				? "✨ Auto-name ON — sessions will be named automatically"
				: "✨ Auto-name OFF — sessions will not be named automatically",
			2500,
		);
	}, [plugin, autoNameSessions, setAutoNameSessions]);

	const handleManualRename = useCallback(async () => {
		const currentActiveId = activeSessionIdRef.current;
		if (!currentActiveId) return;
		const session = sessionsRef.current.find(
			(s) => s.id === currentActiveId,
		);
		if (!session || session.messages.length === 0) {
			new Notice("No messages to generate a title from", 2000);
			return;
		}
		new Notice("🪄 Asking model for a title…", 1500);
		const title = await manualRenameActiveSession(
			resolvedProfile,
			plugin.chatapi,
		);
		if (title) {
			new Notice(`Session renamed to: "${title}"`, 2500);
		}
	}, [resolvedProfile, plugin.chatapi, manualRenameActiveSession]);

	const handleExportChat = useCallback(() => {
		ui.setShowExportModal(true);
	}, []);

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
						participantCount={participants.length}
						onToggleParticipantDropdown={ui.toggleParticipantDropdown}
						debateMode={ui.debateMode}
						onToggleDebateMode={ui.toggleDebateMode}
						searchVisible={searchVisible}
						onToggleSearch={toggleSearch}
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
				</div>
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
				messages={messages}
				currentAiMessage={currentAiMessage}
				currentContentParts={currentContentParts}
				isStreaming={isStreaming}
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
				onOpenPastSession={(sessionId, messageId) => void plugin.openSessionInNewTab(sessionId, messageId)}
				scrollToMessageId={scrollToMessageId}
			/>

			{pendingToolCall && (
				<PendingToolCard
					toolCall={pendingToolCall}
					onApprove={actions.handleApproveTool}
					onReject={actions.handleRejectTool}
				/>
			)}

			<ChatInput
				app={plugin.app}
				plugin={plugin}
				onSend={actions.handleSend}
				onStop={actions.handleStop}
				onAddMention={handleAddMention}
				isStreaming={isStreaming}
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
					if (isStreaming && runningTokenTotal > 0) {
						return `~${(sessionTotal + runningTokenTotal).toLocaleString()} tokens`;
					}
					if (sessionTotal > 0) {
						return `~${sessionTotal.toLocaleString()} tokens`;
					}
					return undefined;
				})()}
			/>
			{ui.showSessionPicker && (
				<SessionPickerModal
					sessions={sessions}
					activeSessionId={activeSessionId}
					onLoad={handleLoadSession}
					onDelete={handleDeleteSession}
					onRename={handleRenameSession}
					onClose={() => ui.setShowSessionPicker(false)}
				/>
			)}
			{ui.showExportModal && (
				<ExportModal
					sessions={sessions}
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
