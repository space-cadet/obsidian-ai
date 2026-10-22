import { useCallback, useRef } from "react";
import { MarkdownView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import { TurnLifecycle } from "../agent/turnLifecycle";
import type { ChatPluginLike } from "../views/ObsidianAIChatView";
import type {
	ChatMessage,
	ChatSession,
	ContextItem,
	GroupChatParticipant,
	ThinkingMode,
} from "../types";
import type { ProviderProfile } from "../settings";
import { NoteEditingBridge } from "../noteEditing/NoteEditingBridge";
import type {
	ChatRuntimeState,
	ChatRuntimePatch,
	SessionRunReservationResult,
} from "./useChatRuntimeState";
import type { UseChatUIResult } from "./useChatUI";
import type { ParticipantRouter } from "../agent/ParticipantRouter";

export interface UseMessageActionsDeps {
	plugin: ChatPluginLike;
	orchestrator: import("../agent/Orchestrator").Orchestrator | null;
	participantRouter: ParticipantRouter | null;
	resolvedProfile: ProviderProfile;
	isGroupChat: boolean;
	participants: GroupChatParticipant[];
	thinkingMode: ThinkingMode;

	// Session
	sessionsRef: React.MutableRefObject<ChatSession[]>;
	activeSessionIdRef: React.MutableRefObject<string | null>;
	updateMessages: (
		sessionId: string,
		messages: ChatMessage[] | ((messages: ChatMessage[]) => ChatMessage[]),
	) => void;
	updateMetadata: (
		sessionId: string,
		patch: Partial<Omit<ChatSession, "id" | "messages">>,
	) => void;

	// Session-keyed streaming display state
	getRuntime: (sessionId: string | null | undefined) => ChatRuntimeState;
	patchRuntime: (
		sessionId: string | null | undefined,
		patch:
			| ChatRuntimePatch
			| ((current: ChatRuntimeState) => ChatRuntimePatch),
	) => void;
	clearRuntime: (sessionId: string | null | undefined) => void;
	reserveSessionRun: (
		sessionId: string,
		maxParallelSessions: number,
	) => SessionRunReservationResult;
	releaseSessionRun: (sessionId: string) => void;
	setWasTruncated: React.Dispatch<React.SetStateAction<boolean>>;
	setContextTokenCount: React.Dispatch<React.SetStateAction<number>>;
	setContextItems: React.Dispatch<React.SetStateAction<ContextItem[]>>;

	// Refs
	messagesRef: React.MutableRefObject<ChatMessage[]>;
	contextItemsRef: React.MutableRefObject<ContextItem[]>;
	lastMarkdownLeafRef: React.MutableRefObject<WorkspaceLeaf | null>;

	// UI hook result
	ui: UseChatUIResult;
}

export function useMessageActions(deps: UseMessageActionsDeps) {
	// Keep a ref to latest deps so async lifecycle operations always see current state
	const depsRef = useRef(deps);
	depsRef.current = deps;

	// Lazily create TurnLifecycle once; it reads latest deps via the getter
	const lifecycleRef = useRef<TurnLifecycle | null>(null);
	if (!lifecycleRef.current) {
		lifecycleRef.current = new TurnLifecycle(() => depsRef.current);
	}

	// ═══════════════════════════════════════════════════════
	// LIFECYCLE ACTIONS (delegated to TurnLifecycle)
	// ═══════════════════════════════════════════════════════
	const handleSend = useCallback(
		async (text: string, attachments?: import("../types").Attachment[]) => {
			const sessionId = depsRef.current.activeSessionIdRef.current;
			const d = depsRef.current;
			if (sessionId) {
				if (d.plugin.sessionState) {
					const loaded =
						await d.plugin.sessionState.ensureLoaded(sessionId);
					if (!loaded || loaded.hydrated === false) {
						d.plugin.logger?.log(
							"warn",
							`[Session] send blocked; ${sessionId} transcript is not ready`,
						);
						return false;
					}
					d.sessionsRef.current =
						d.plugin.sessionState.getSnapshot().sessions;
				} else if (d.plugin.isSessionHydrated?.(sessionId) === false) {
					const messages = await d.plugin.hydrateSession?.(sessionId);
					const current = d.sessionsRef.current.find(
						(session) => session.id === sessionId,
					);
					if (
						!messages ||
						messages.length < (current?.messageCount ?? 0)
					)
						return false;
					d.updateMessages(sessionId, messages);
					d.sessionsRef.current = d.sessionsRef.current.map(
						(session) =>
							session.id === sessionId
								? {
										...session,
										messages,
										messageCount: messages.length,
										hydrated: true,
									}
								: session,
					);
				}
			}
			return lifecycleRef.current!.startSend(
				text,
				attachments,
				sessionId ?? undefined,
			);
		},
		[],
	);

	const handleStop = useCallback(() => {
		lifecycleRef.current!.stop();
	}, []);

	const handleRetry = useCallback((messageId: string) => {
		lifecycleRef.current!.retry(messageId);
	}, []);

	const handleEditMessage = useCallback((messageId: string) => {
		lifecycleRef.current!.edit(messageId);
	}, []);

	const handleCancelEdit = useCallback(() => {
		lifecycleRef.current!.cancelEdit();
	}, []);

	const handleApproveTool = useCallback(async () => {
		await lifecycleRef.current!.approveTool();
	}, []);

	const handleRejectTool = useCallback(() => {
		lifecycleRef.current!.rejectTool();
	}, []);

	// ═══════════════════════════════════════════════════════
	// NOTE ACTIONS (stay in hook — simple Obsidian API calls)
	// ═══════════════════════════════════════════════════════
	const handleAppend = useCallback(
		async (content: string) => {
			const leaf = deps.lastMarkdownLeafRef.current;
			const file =
				leaf?.view instanceof MarkdownView
					? (leaf.view as MarkdownView).file
					: null;
			if (!(file instanceof TFile)) {
				new Notice("⚠️ No active note to append to.");
				return;
			}
			await NoteEditingBridge.appendToNote(
				deps.plugin.app,
				file,
				content,
			);
		},
		[deps.plugin, deps.lastMarkdownLeafRef],
	);

	const handleInsertAtCursor = useCallback(
		(content: string) => {
			const leaf = deps.lastMarkdownLeafRef.current;
			if (!(leaf?.view instanceof MarkdownView)) {
				new Notice("⚠️ Open a note first to insert at cursor.");
				return;
			}
			NoteEditingBridge.insertAtCursor(
				deps.plugin.app,
				leaf.view as MarkdownView,
				content,
			);
		},
		[deps.plugin, deps.lastMarkdownLeafRef],
	);

	const handleApply = useCallback(
		(content: string) => {
			const leaf = deps.lastMarkdownLeafRef.current;
			if (!(leaf?.view instanceof MarkdownView)) {
				new Notice("⚠️ Open a note first to apply edits.");
				return;
			}
			const view = leaf.view as MarkdownView;
			NoteEditingBridge.applyToNote(
				deps.plugin.app,
				view,
				content,
				"Apply AI edit",
			);
		},
		[deps.plugin, deps.lastMarkdownLeafRef],
	);

	const handleApplyToTarget = useCallback(
		async (content: string, target: string) => {
			await NoteEditingBridge.applyToTargetNote(
				deps.plugin.app,
				target,
				content,
				"Apply AI edit",
			);
		},
		[deps.plugin],
	);

	const handleCreateNote = useCallback(
		async (content: string, target: string) => {
			await NoteEditingBridge.createNote(
				deps.plugin.app,
				target,
				content,
				"Create note",
			);
		},
		[deps.plugin],
	);

	const handleAppendToTarget = useCallback(
		async (content: string, target: string) => {
			let file = deps.plugin.app.vault.getAbstractFileByPath(target);
			if (!file || !(file instanceof TFile)) {
				const resolved =
					deps.plugin.app.metadataCache.getFirstLinkpathDest(
						target,
						"",
					);
				if (resolved && resolved instanceof TFile) {
					file = resolved;
				}
			}
			if (file && file instanceof TFile) {
				await NoteEditingBridge.appendToNote(
					deps.plugin.app,
					file,
					content,
				);
			} else {
				new Notice(`⚠️ Note not found: ${target}`);
			}
		},
		[deps.plugin],
	);

	return {
		handleSend,
		handleStop,
		handleRetry,
		handleEditMessage,
		handleCancelEdit,
		handleAppend,
		handleInsertAtCursor,
		handleApply,
		handleApplyToTarget,
		handleCreateNote,
		handleAppendToTarget,
		handleApproveTool,
		handleRejectTool,
	};
}
