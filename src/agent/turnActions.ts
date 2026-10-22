import type { Attachment } from "../types";
import { ToolExecutor } from "./ToolExecutor";
import type { TurnLifecycleDeps } from "./turnLifecycle";

/**
 * User actions that control an existing turn or revise its messages.
 * The send pipeline remains in TurnLifecycle; this class owns the adjacent
 * stop, retry, edit, and tool-approval interactions.
 */
export class TurnActionController {
	constructor(
		private readonly getDeps: () => TurnLifecycleDeps,
		private readonly getCurrentToolExecutor: () => ToolExecutor | null,
		private readonly send: (
			text: string,
			attachments?: Attachment[],
			sessionId?: string,
		) => boolean,
	) {}

	private updateMessages(
		sessionId: string,
		messages: import("../types").ChatMessage[],
	): void {
		const deps = this.getDeps();
		deps.updateMessages(sessionId, messages);
	}

	stop = (): void => {
		const deps = this.getDeps();
		const currentActiveId = deps.activeSessionIdRef.current;
		deps.plugin.logger?.log(
			"info",
			`[Chat] stopped — session ${currentActiveId?.slice(0, 8)}`,
		);
		const runtime = deps.getRuntime(currentActiveId);
		runtime.controller?.abort();
		// Approval waits on this resolver rather than an abortable request. Reject
		// it so Stop can finish the turn and a later click cannot run the tool.
		runtime.resolveTool?.(null);
		deps.patchRuntime(currentActiveId, {
			pendingToolCall: null,
			pendingToolDisplay: null,
			resolveTool: null,
		});
	};

	retry = (messageId: string): void => {
		const deps = this.getDeps();
		const currentActiveId = deps.activeSessionIdRef.current;
		if (!currentActiveId) return;
		if (deps.getRuntime(currentActiveId).controller) return;

		const session = deps.sessionsRef.current.find(
			(s) => s.id === currentActiveId,
		);
		if (!session) return;

		const assistantIndex = session.messages.findIndex(
			(m) => m.id === messageId,
		);
		if (assistantIndex <= 0) return;

		let userIndex = -1;
		for (let i = assistantIndex - 1; i >= 0; i--) {
			if (session.messages[i].role === "user") {
				userIndex = i;
				break;
			}
		}
		if (userIndex === -1) return;

		const userMsg = session.messages[userIndex];
		const originalAttachments = deps.ui.messageAttachments;
		const originalContextItems = deps.contextItemsRef.current;
		const truncated = session.messages.slice(0, userIndex);
		deps.messagesRef.current = truncated;

		this.updateMessages(currentActiveId, truncated);

		if (userMsg.attachments && userMsg.attachments.length > 0) {
			deps.ui.setMessageAttachments(userMsg.attachments);
		}
		if (userMsg.contextItems && userMsg.contextItems.length > 0) {
			deps.setContextItems(userMsg.contextItems);
		}
		deps.plugin.logger?.log(
			"info",
			`[Chat] retry — session ${currentActiveId.slice(0, 8)}, ` +
				`restored ${userMsg.attachments?.length ?? 0} attachment(s), ` +
				`${userMsg.contextItems?.length ?? 0} context item(s)`,
		);

		const accepted = this.send(
			userMsg.content,
			userMsg.attachments,
			currentActiveId,
		);
		if (!accepted) {
			deps.messagesRef.current = session.messages;
			this.updateMessages(currentActiveId, session.messages);
			deps.ui.setMessageAttachments(originalAttachments);
			deps.setContextItems(originalContextItems);
		}
	};

	edit = (messageId: string): void => {
		const deps = this.getDeps();
		const currentActiveId = deps.activeSessionIdRef.current;
		if (!currentActiveId) return;
		if (deps.getRuntime(currentActiveId).controller) return;

		const session = deps.sessionsRef.current.find(
			(s) => s.id === currentActiveId,
		);
		if (!session) return;

		const index = session.messages.findIndex((m) => m.id === messageId);
		if (index < 0 || session.messages[index].role !== "user") return;

		const msg = session.messages[index];
		const truncated = session.messages.slice(0, index);

		deps.ui.setOriginalMessages([...session.messages]);
		deps.messagesRef.current = truncated;
		deps.ui.setMessageAttachments(msg.attachments ?? []);
		deps.setContextItems(msg.contextItems ?? []);

		this.updateMessages(currentActiveId, truncated);
		deps.plugin.logger?.log(
			"info",
			`[Chat] edit — session ${currentActiveId.slice(0, 8)}, ` +
				`restored ${msg.attachments?.length ?? 0} attachment(s), ` +
				`${msg.contextItems?.length ?? 0} context item(s)`,
		);
		deps.ui.setIsEditing(true);
		deps.ui.setEditMessageText(msg.content);
	};

	cancelEdit = (): void => {
		const deps = this.getDeps();
		const currentActiveId = deps.activeSessionIdRef.current;
		if (!currentActiveId || deps.ui.originalMessages.length === 0) return;

		this.updateMessages(currentActiveId, deps.ui.originalMessages);
		deps.ui.setIsEditing(false);
		deps.ui.setOriginalMessages([]);
		deps.ui.setEditMessageText("");
		deps.ui.setMessageAttachments([]);
		deps.setContextItems([]);
	};

	approveTool = async (): Promise<void> => {
		const deps = this.getDeps();
		const currentActiveId = deps.activeSessionIdRef.current;
		if (!currentActiveId) return;
		const runtime = deps.getRuntime(currentActiveId);
		const pendingToolCall = runtime.pendingToolCall;
		if (!pendingToolCall) return;
		const toolExecutor =
			this.getCurrentToolExecutor() ??
			new ToolExecutor(
				deps.plugin.app,
				deps.plugin.settings,
				deps.plugin.personaLoader ?? undefined,
				deps.plugin.searchIndex ?? undefined,
				() => currentActiveId,
				deps.plugin.integrationRegistry,
				deps.plugin.saveSettings.bind(deps.plugin),
				deps.plugin.manifest?.id,
				undefined,
				undefined,
				deps.plugin.logger,
				undefined,
				{
					state: deps.plugin.sessionState,
					openSession: (sessionId, messageId) =>
						deps.plugin.openSessionInNewTab(sessionId, messageId),
					getActiveSessionId: () => deps.activeSessionIdRef.current,
					isSessionBusy: (sessionId) =>
						Boolean(deps.getRuntime(sessionId).controller),
				},
			);
		toolExecutor.setLatestSystemPromptReader(
			() => deps.plugin.latestSystemPrompt ?? null,
		);
		const result = await toolExecutor.execute(
			pendingToolCall,
			runtime.controller?.signal,
		);
		runtime.resolveTool?.(result);
		deps.patchRuntime(currentActiveId, { resolveTool: null });
	};

	rejectTool = (): void => {
		const deps = this.getDeps();
		const currentActiveId = deps.activeSessionIdRef.current;
		if (!currentActiveId) return;
		const runtime = deps.getRuntime(currentActiveId);
		runtime.resolveTool?.(null);
		deps.patchRuntime(currentActiveId, { resolveTool: null });
	};
}
