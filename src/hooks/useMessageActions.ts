import { useCallback } from "react";
import { MarkdownView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import type { ChatPluginLike } from "../views/ObsidianAIChatView";
import type {
	ChatMessage,
	ChatSession,
	ContextItem,
	ContentPart,
	GroupChatParticipant,
} from "../types";
import type { ProviderProfile } from "../settings";
import type { ToolCall, ToolResult } from "../agent/types";
import { ToolExecutor } from "../agent/ToolExecutor";
import { AgentLoop } from "../agent/AgentLoop";
import { AgentApiManager } from "../api/AgentApiManager";
import { OpenResponsesLoop } from "../agent/OpenResponsesLoop";
import { NoteEditingBridge } from "../noteEditing/NoteEditingBridge";
import { resolveContextItems } from "../context/ContextEngine";
import { resolveAttachments } from "../context/AttachmentEngine";
import { estimateTokens, estimateContentPartsTokens } from "../context/tokenEstimator";
import { buildSystemPrompt } from "../lib/systemPrompt";
import { parseSlashCommand } from "../lib/slashCommand";
import { makeId } from "../lib/sessionUtils";
import { noteTools } from "../agent/tools";
import { noteToolsToOpenResponses } from "../agent/tools/toOpenResponses";
import { getActiveProviderProfile } from "../settings";
import { stripThinkingTags } from "../components/MessageBubble";
import type { UseChatUIResult } from "./useChatUI";

export interface UseMessageActionsDeps {
	plugin: ChatPluginLike;
	orchestrator: import("../agent/Orchestrator").Orchestrator | null;
	resolvedProfile: ProviderProfile;
	isGroupChat: boolean;
	participants: GroupChatParticipant[];
	thinkingEnabled: boolean;

	// Session
	sessionsRef: React.MutableRefObject<ChatSession[]>;
	activeSessionIdRef: React.MutableRefObject<string | null>;
	setSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>;

	// Streaming display state
	setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
	setCurrentAiMessage: React.Dispatch<React.SetStateAction<string>>;
	setCurrentContentParts: React.Dispatch<React.SetStateAction<ContentPart[]>>;
	setPendingToolCall: React.Dispatch<React.SetStateAction<ToolCall | null>>;
	setWasTruncated: React.Dispatch<React.SetStateAction<boolean>>;
	setContextTokenCount: React.Dispatch<React.SetStateAction<number>>;
	setContextItems: React.Dispatch<React.SetStateAction<ContextItem[]>>;

	// Refs
	controllerRef: React.MutableRefObject<AbortController | null>;
	resolveToolRef: React.MutableRefObject<
		((result: ToolResult | null) => void) | null
	>;
	messagesRef: React.MutableRefObject<ChatMessage[]>;
	contextItemsRef: React.MutableRefObject<ContextItem[]>;
	lastMarkdownLeafRef: React.MutableRefObject<WorkspaceLeaf | null>;
	pendingToolCallRef: React.MutableRefObject<ToolCall | null>;

	// UI hook result
	ui: UseChatUIResult;
}

export function useMessageActions(deps: UseMessageActionsDeps) {
	const {
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
		controllerRef,
		resolveToolRef,
		messagesRef,
		contextItemsRef,
		lastMarkdownLeafRef,
		pendingToolCallRef,
		ui,
	} = deps;

	// ═══════════════════════════════════════════════════════
	// SEND
	// ═══════════════════════════════════════════════════════
	const handleSend = useCallback(
		async (
			text: string,
			attachments?: import("../types").Attachment[],
		) => {
			if (
				(!text.trim() &&
					(!attachments || attachments.length === 0)) ||
				controllerRef.current
			)
				return;

			// ─── GROUP CHAT PATH ───
			if (isGroupChat && orchestrator) {
				const userMsg: ChatMessage = {
					id: makeId(),
					role: "user",
					content: text,
					timestamp: Date.now(),
					attachments:
						ui.messageAttachments &&
						ui.messageAttachments.length > 0
							? ui.messageAttachments
							: undefined,
				};
				const currentActiveId = activeSessionIdRef.current;
				setSessions((prev) =>
					prev.map((s) =>
						s.id === currentActiveId
							? {
									...s,
									messages: [...s.messages, userMsg],
									updatedAt: Date.now(),
								}
								: s,
					),
				);
				setIsStreaming(true);
				controllerRef.current = new AbortController();

				const { targets } = orchestrator.parseAndRoute(
					text,
					ui.messageAttachments,
				);
				ui.setTypingAgents(
					new Set(targets.map((t) => t.name)),
				);

				try {
					const stream = ui.debateMode
						? orchestrator.debate(
								text,
								sessionsRef.current.find(
									(s) => s.id === currentActiveId,
								)?.messages ?? [],
								controllerRef.current?.signal,
								2,
							)
						: orchestrator.dispatch(
								text,
								sessionsRef.current.find(
									(s) => s.id === currentActiveId,
								)?.messages ?? [],
								controllerRef.current?.signal,
							);

					for await (const response of stream) {
						ui.setTypingAgents((prev) => {
							const next = new Set(prev);
							next.delete(response.agentName);
							return next;
						});

						const assistantMsg: ChatMessage = {
							id: makeId(),
							role: "assistant",
							content: response.error
								? `⚠️ ${response.agentName} failed: ${response.error}`
								: response.text,
							timestamp: Date.now(),
							agentId: response.agentId,
							agentName: response.agentName,
							agentColor: response.agentColor,
							isError: !!response.error,
							toolCalls: response.toolCalls,
							estimatedTokens: response.tokenEstimate,
						};

						setSessions((prev) =>
							prev.map((s) =>
								s.id === currentActiveId
									? {
											...s,
											messages: [
												...s.messages,
												assistantMsg,
											],
											updatedAt: Date.now(),
										}
									: s,
							),
						);
					}
				} catch (error: any) {
					new Notice(
						`❌ Group chat error: ${error.message}`,
					);
					const errorMsg: ChatMessage = {
						id: makeId(),
						role: "assistant",
						content: `⚠️ Council error: ${error.message}`,
						timestamp: Date.now(),
						isError: true,
					};
					setSessions((prev) =>
						prev.map((s) =>
							s.id === currentActiveId
								? {
										...s,
										messages: [
											...s.messages,
											errorMsg,
										],
										updatedAt: Date.now(),
									}
								: s,
						),
					);
				} finally {
					setIsStreaming(false);
					ui.setTypingAgents(new Set());
					controllerRef.current = null;
				}
				return;
			}

			// ─── SINGLE CHAT PATH ───
			const slashCmd = parseSlashCommand(text);
			let sendText = text;
			let sendContextItems = contextItemsRef.current;
			let commandMeta: ChatMessage["command"] = undefined;

			if (slashCmd) {
				commandMeta = {
					type: slashCmd.command,
					target: slashCmd.target,
				};
				sendText =
					slashCmd.prompt ||
					`Please ${slashCmd.command} ${slashCmd.target}`;

				if (
					slashCmd.command === "edit" ||
					slashCmd.command === "append"
				) {
					const file =
						plugin.app.metadataCache.getFirstLinkpathDest(
							slashCmd.target,
							"",
						);
					if (file && file instanceof TFile) {
						const exists = sendContextItems.some(
							(i) =>
								i.type === "note" &&
								i.path === file.path,
						);
						if (!exists) {
							sendContextItems = [
								...sendContextItems,
								{
									type: "note",
									path: file.path,
									name: file.basename,
									id: makeId(),
								},
							];
						}
					}
				}
			}

			const resolved = await resolveContextItems(
				sendContextItems,
				plugin.app,
				plugin.settings.maxContextTokens || 8000,
			);
			setWasTruncated(resolved.wasTruncated);
			setContextTokenCount(resolved.stats.estimatedTokens);

			const selectedIds = Array.from(ui.selectedProfileIds);
			const activeProfile: ProviderProfile =
				selectedIds.length === 1
					? (plugin.settings.providerProfiles.find(
							(p) => p.id === selectedIds[0],
						) ?? resolvedProfile)
					: resolvedProfile;

			// Resolve attachments before computing token estimate
			let resolvedAttachmentParts: import("../api").MessageContentPart[] = [];
			if (attachments && attachments.length > 0) {
				resolvedAttachmentParts = await resolveAttachments(
					attachments,
					plugin.app,
					activeProfile.provider,
				);
			}

			// Compute token estimate: context text + message text + attachments
			let userTokenEstimate = estimateTokens(
				(resolved.contextString
					? resolved.contextString + "\n\n"
					: "") + sendText,
			);
			if (resolvedAttachmentParts.length > 0) {
				userTokenEstimate += estimateContentPartsTokens(
					resolvedAttachmentParts as Array<
						| { type: "text"; text: string }
						| { type: "image"; image: string }
						| { type: "file"; data: string; mimeType: string }
					>,
				);
			}

			const userMsg: ChatMessage = {
				id: makeId(),
				role: "user",
				content: text,
				timestamp: Date.now(),
				contextItems: sendContextItems,
				attachments:
					attachments && attachments.length > 0
						? attachments
						: undefined,
				estimatedTokens: userTokenEstimate,
			};

			const currentActiveId = activeSessionIdRef.current;
			setSessions((prev) =>
				prev.map((s) =>
					s.id === currentActiveId
						? {
								...s,
								messages: [...s.messages, userMsg],
								updatedAt: Date.now(),
								contextItems: sendContextItems,
							}
							: s,
				),
			);
			setIsStreaming(true);
			setCurrentAiMessage("");
			setCurrentContentParts([]);
			controllerRef.current = new AbortController();
			const streamStartTime = Date.now();

			const maxContextMessages =
				plugin.settings.maxContextMessages || 10;
			const history = messagesRef.current
				.slice(-maxContextMessages)
				.map((m) => ({
					role: m.role as "user" | "assistant",
					content: m.content,
				}));

			let userContent = sendText;
			if (resolved.contextString) {
				userContent = `${resolved.contextString}\n\n${sendText}`;
			}

			const isAgentProvider = activeProfile.provider === "agent";
			const useTools =
				plugin.settings.enableAgentTools || isAgentProvider;
			const autoApprove = plugin.settings.autoApply;
			const maxAgentSteps = plugin.settings.maxAgentSteps;

			let userMessageContent:
				| string
				| import("../api").MessageContentPart[] = userContent;
			if (resolvedAttachmentParts.length > 0) {
				userMessageContent = [
					{ type: "text", text: userContent },
					...resolvedAttachmentParts,
				];
			}

			const chatMessages = [
				{
					role: "system" as const,
					content: buildSystemPrompt(
						sendContextItems,
						slashCmd ?? undefined,
						useTools && !slashCmd,
					),
				},
				...history,
				{
					role: "user" as const,
					content: userMessageContent,
				},
			];

			let fullText = "";
			let toolCallsLog: Array<{ call: ToolCall; result?: ToolResult }> =
				[];
			let contentParts: ContentPart[] = [];
			let textCheckpoint = 0;

			let assistantContent = fullText;
			let assistantTokenEstimate = 0;

			try {
				if (isAgentProvider) {
					// … OpenResponsesLoop path (same as original)
					if (!activeProfile.endpointUrl) {
						throw new Error(
							"Agent endpoint URL is not configured.",
						);
					}
					const agentApi = new AgentApiManager(
						{
							id: activeProfile.id,
							name: activeProfile.name,
							provider: "agent",
							model: activeProfile.model,
							endpointUrl: activeProfile.endpointUrl,
							agentId: activeProfile.agentId || "main",
							authToken: activeProfile.apiKey,
							sessionKey: activeProfile.sessionKey,
							autoApprove:
								activeProfile.autoApprove ?? autoApprove,
							maxSteps:
								activeProfile.maxSteps ?? maxAgentSteps,
						},
						plugin.app,
					);
					const openResponsesLoop = new OpenResponsesLoop({
						agentApi,
						toolExecutor: new ToolExecutor(
							plugin.app,
							plugin.settings,
						),
						maxSteps:
							activeProfile.maxSteps ?? maxAgentSteps,
						autoApprove:
							activeProfile.autoApprove ?? autoApprove,
						onTextDelta: (text) => {
							fullText = text;
							setCurrentAiMessage(stripThinkingTags(text));
						},
						onToolCall: (call) => {
							const pendingText = stripThinkingTags(
								fullText.slice(textCheckpoint),
							);
							if (pendingText) {
								contentParts.push({
									type: "text",
									content: pendingText,
								});
							}
							toolCallsLog.push({ call });
							contentParts.push({
								type: "tool_call",
								call,
							});
							setCurrentContentParts([...contentParts]);
							textCheckpoint = fullText.length;
						},
						requestApproval: async (call) => {
							setPendingToolCall(call);
							const resolved = await new Promise<
								ToolResult | null
							>((resolve) => {
								resolveToolRef.current = resolve;
							});
							setPendingToolCall(null);
							const lastIdx = toolCallsLog.length - 1;
							if (lastIdx >= 0) {
								toolCallsLog[lastIdx] = {
									...toolCallsLog[lastIdx],
									result: resolved || undefined,
								};
							}
							const partIdx = contentParts.findIndex(
								(p) =>
									p.type === "tool_call" &&
									p.call.toolCallId === call.toolCallId,
							);
							if (partIdx >= 0 && resolved) {
								const part = contentParts[partIdx];
								if (part.type === "tool_call") {
									contentParts[partIdx] = {
										...part,
										result: resolved,
									};
								}
							}
							return resolved;
						},
						onToolResult: (call, result) => {
							const idx = toolCallsLog.findIndex(
								(tc) =>
									tc.call.toolCallId === call.toolCallId,
							);
							if (idx >= 0) {
								toolCallsLog[idx] = {
									...toolCallsLog[idx],
									result,
								};
							}
							const partIdx = contentParts.findIndex(
								(p) =>
									p.type === "tool_call" &&
									p.call.toolCallId === call.toolCallId,
							);
							if (partIdx >= 0) {
								const part = contentParts[partIdx];
								if (part.type === "tool_call") {
									contentParts[partIdx] = {
										...part,
										result,
									};
								}
							}
						},
					});
					const orTools = noteToolsToOpenResponses(noteTools);
					const resultText = await openResponsesLoop.run(
						chatMessages as Array<{
							role: "user" | "assistant" | "system";
							content: string;
						}>,
						orTools,
						controllerRef.current.signal,
					);
					assistantContent = resultText;
					assistantTokenEstimate = estimateTokens(resultText);
				} else if (useTools && !slashCmd) {
					// … AgentLoop path
					const agent = new AgentLoop({
						chatApi: plugin.chatapi,
						toolExecutor: new ToolExecutor(
							plugin.app,
							plugin.settings,
						),
						maxSteps: maxAgentSteps,
						autoApprove,
						profile: activeProfile,
						thinkingEnabled,
						onTextDelta: (text) => {
							fullText = text;
							setCurrentAiMessage(stripThinkingTags(text));
						},
						onToolCall: (call) => {
							const pendingText = stripThinkingTags(
								fullText.slice(textCheckpoint),
							);
							if (pendingText) {
								contentParts.push({
									type: "text",
									content: pendingText,
								});
							}
							toolCallsLog.push({ call });
							contentParts.push({
								type: "tool_call",
								call,
							});
							setCurrentContentParts([...contentParts]);
							textCheckpoint = fullText.length;
						},
						requestApproval: async (call) => {
							setPendingToolCall(call);
							const resolved = await new Promise<
								ToolResult | null
							>((resolve) => {
								resolveToolRef.current = resolve;
							});
							setPendingToolCall(null);
							const lastIdx = toolCallsLog.length - 1;
							if (lastIdx >= 0) {
								toolCallsLog[lastIdx] = {
									...toolCallsLog[lastIdx],
									result: resolved || undefined,
								};
							}
							const partIdx = contentParts.findIndex(
								(p) =>
									p.type === "tool_call" &&
									p.call.toolCallId === call.toolCallId,
							);
							if (partIdx >= 0 && resolved) {
								const part = contentParts[partIdx];
								if (part.type === "tool_call") {
									contentParts[partIdx] = {
										...part,
										result: resolved,
									};
								}
							}
							return resolved;
						},
						onToolResult: (call, result) => {
							const idx = toolCallsLog.findIndex(
								(tc) =>
									tc.call.toolCallId === call.toolCallId,
							);
							if (idx >= 0) {
								toolCallsLog[idx] = {
									...toolCallsLog[idx],
									result,
								};
							}
							const partIdx = contentParts.findIndex(
								(p) =>
									p.type === "tool_call" &&
									p.call.toolCallId === call.toolCallId,
							);
							if (partIdx >= 0) {
								const part = contentParts[partIdx];
								if (part.type === "tool_call") {
									contentParts[partIdx] = {
										...part,
										result,
									};
								}
							}
						},
					});

					const result = await agent.run(
						chatMessages as Array<any>,
						noteTools,
						controllerRef.current.signal,
					);
					assistantContent = result.text;
					assistantTokenEstimate = result.tokenEstimate;
				} else {
					// … standard streamChat path
					for await (const chunk of plugin.chatapi.streamChat(
						chatMessages,
						controllerRef.current.signal,
						activeProfile,
						thinkingEnabled,
					)) {
						fullText += chunk;
						if (!slashCmd) {
							setCurrentAiMessage(
								stripThinkingTags(fullText),
							);
						}
					}
					assistantContent = fullText;
					assistantTokenEstimate = estimateTokens(fullText);
					contentParts = [
						{
							type: "text",
							content: stripThinkingTags(fullText),
						},
					];
				}

				// Slash-command post-processing
				if (slashCmd?.command === "create" && fullText) {
					const fileName = slashCmd.target.endsWith(".md")
						? slashCmd.target
						: `${slashCmd.target}.md`;
					try {
						await plugin.app.vault.create(
							fileName,
							fullText,
						);
						new Notice(`✓ Created note: ${slashCmd.target}`);
						assistantContent = `✓ Created note: ${slashCmd.target}`;
					} catch (e: any) {
						new Notice(
							`⚠️ Could not create note: ${e.message}`,
						);
						assistantContent = `⚠️ Could not create note: ${e.message}`;
					}
					assistantTokenEstimate = estimateTokens(assistantContent);
				} else if (slashCmd?.command === "edit" && fullText) {
					const success =
						await NoteEditingBridge.applyToTargetNote(
							plugin.app,
							slashCmd.target,
							fullText,
							"Apply AI edit",
						);
					assistantContent = success
						? `✓ Applied edits to ${slashCmd.target}`
						: `⚠️ Could not apply edits to ${slashCmd.target}`;
					assistantTokenEstimate = estimateTokens(assistantContent);
				} else if (slashCmd?.command === "append" && fullText) {
					let file = plugin.app.vault.getAbstractFileByPath(
						slashCmd.target,
					);
					if (!file || !(file instanceof TFile)) {
						const resolved =
							plugin.app.metadataCache.getFirstLinkpathDest(
								slashCmd.target,
								"",
							);
						if (resolved && resolved instanceof TFile) {
							file = resolved;
						}
					}
					if (file && file instanceof TFile) {
						await NoteEditingBridge.appendToNote(
							plugin.app,
							file,
							fullText,
						);
						assistantContent = `✓ Appended to ${slashCmd.target}`;
					} else {
						assistantContent = `⚠️ Note not found: ${slashCmd.target}`;
					}
					assistantTokenEstimate = estimateTokens(assistantContent);
				}

				// Finalize remaining text for tool paths
				if (useTools && !slashCmd) {
					const remainingText = stripThinkingTags(
						fullText.slice(textCheckpoint),
					);
					if (remainingText) {
						contentParts.push({
							type: "text",
							content: remainingText,
						});
					}
				}

				const cleanAssistantContent = stripThinkingTags(assistantContent);
				const assistantMsg: ChatMessage = {
					id: makeId(),
					role: "assistant",
					content: cleanAssistantContent,
					timestamp: Date.now(),
					command: commandMeta,
					estimatedTokens: assistantTokenEstimate,
					modelName: activeProfile.model,
					responseTimeMs: Date.now() - streamStartTime,
					toolCalls:
						toolCallsLog.length > 0
							? toolCallsLog
							: undefined,
					contentParts:
						contentParts.length > 0 ? contentParts : undefined,
				};
				setSessions((prev) =>
					prev.map((s) =>
						s.id === currentActiveId
							? {
									...s,
									messages: [
										...s.messages,
										assistantMsg,
									],
									updatedAt: Date.now(),
									contextItems: sendContextItems,
								}
								: s,
					),
				);
			} catch (e: any) {
				if (e.name === "AbortError") {
					if (fullText) {
						let abortedParts: ContentPart[] = [];
						if (useTools && !slashCmd) {
							abortedParts = [...contentParts];
							const remainingText = stripThinkingTags(
								fullText.slice(textCheckpoint),
							);
							if (remainingText) {
								abortedParts.push({
									type: "text",
									content: remainingText + " [stopped]",
								});
							}
						} else {
							abortedParts = [
								{
									type: "text",
									content:
										stripThinkingTags(fullText) +
										" [stopped]",
								},
							];
						}
						const stoppedMsg: ChatMessage = {
							id: makeId(),
							role: "assistant",
							content:
								stripThinkingTags(fullText) + " [stopped]",
							timestamp: Date.now(),
							command: commandMeta,
							estimatedTokens: estimateTokens(fullText),
							modelName: activeProfile.model,
							responseTimeMs: Date.now() - streamStartTime,
							contentParts: abortedParts,
						};
						setSessions((prev) =>
							prev.map((s) =>
								s.id === currentActiveId
									? {
											...s,
											messages: [
												...s.messages,
												stoppedMsg,
											],
											updatedAt: Date.now(),
											contextItems: sendContextItems,
										}
									: s,
							),
						);
					}
				} else {
					const errorMsg: ChatMessage = {
						id: makeId(),
						role: "assistant",
						content: `Error: ${e.message}`,
						timestamp: Date.now(),
						isError: true,
						command: commandMeta,
						estimatedTokens: estimateTokens(
							`Error: ${e.message}`,
						),
					};
					setSessions((prev) =>
						prev.map((s) =>
							s.id === currentActiveId
								? {
										...s,
										messages: [
											...s.messages,
											errorMsg,
										],
										updatedAt: Date.now(),
										contextItems: sendContextItems,
									}
								: s,
						),
					);
				}
			} finally {
				setIsStreaming(false);
				setCurrentAiMessage("");
				setCurrentContentParts([]);
				controllerRef.current = null;
				ui.setIsEditing(false);
				ui.setOriginalMessages([]);
				ui.setEditMessageText("");
				ui.setMessageAttachments([]);
				setContextItems([]);
			}
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[
			plugin,
			orchestrator,
			resolvedProfile,
			isGroupChat,
			participants,
			thinkingEnabled,
			ui,
		],
	);

	// ═══════════════════════════════════════════════════════
	// STOP
	// ═══════════════════════════════════════════════════════
	const handleStop = useCallback(() => {
		controllerRef.current?.abort();
	}, [controllerRef]);

	// ═══════════════════════════════════════════════════════
	// RETRY
	// ═══════════════════════════════════════════════════════
	const handleRetry = useCallback(
		(messageId: string) => {
			if (controllerRef.current) return;
			const currentActiveId = activeSessionIdRef.current;
			if (!currentActiveId) return;

			const session = sessionsRef.current.find(
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
			const truncated = session.messages.slice(0, userIndex);
			messagesRef.current = truncated;

			setSessions((prev) =>
				prev.map((s) =>
					s.id === currentActiveId
						? {
								...s,
								messages: truncated,
								updatedAt: Date.now(),
							}
							: s,
				),
			);

			handleSend(userMsg.content);
		},
		[handleSend],
	);

	// ═══════════════════════════════════════════════════════
	// EDIT
	// ═══════════════════════════════════════════════════════
	const handleEditMessage = useCallback(
		(messageId: string) => {
			if (controllerRef.current) return;
			const currentActiveId = activeSessionIdRef.current;
			if (!currentActiveId) return;

			const session = sessionsRef.current.find(
				(s) => s.id === currentActiveId,
			);
			if (!session) return;

			const index = session.messages.findIndex(
				(m) => m.id === messageId,
			);
			if (index < 0 || session.messages[index].role !== "user")
				return;

			const msg = session.messages[index];
			const truncated = session.messages.slice(0, index);

			ui.setOriginalMessages([...session.messages]);
			messagesRef.current = truncated;

			// Restore attachments and context items from the message being edited
			ui.setMessageAttachments(msg.attachments ?? []);
			setContextItems(msg.contextItems ?? []);

			setSessions((prev) =>
				prev.map((s) =>
					s.id === currentActiveId
						? {
								...s,
								messages: truncated,
								updatedAt: Date.now(),
							}
							: s,
				),
			);
			ui.setIsEditing(true);
			ui.setEditMessageText(msg.content);
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[controllerRef, activeSessionIdRef, sessionsRef, setSessions, ui],
	);

	const handleCancelEdit = useCallback(() => {
		const currentActiveId = activeSessionIdRef.current;
		if (!currentActiveId || ui.originalMessages.length === 0) return;

		setSessions((prev) =>
			prev.map((s) =>
				s.id === currentActiveId
					? {
							...s,
							messages: ui.originalMessages,
							updatedAt: Date.now(),
						}
						: s,
			),
		);
		ui.setIsEditing(false);
		ui.setOriginalMessages([]);
		ui.setEditMessageText("");
		ui.setMessageAttachments([]);
		setContextItems([]);
	}, [activeSessionIdRef, setSessions, setContextItems, ui]);

	// ═══════════════════════════════════════════════════════
	// NOTE ACTIONS
	// ═══════════════════════════════════════════════════════
	const handleAppend = useCallback(
		async (content: string) => {
			const leaf = lastMarkdownLeafRef.current;
			const file =
				leaf?.view instanceof MarkdownView
					? (leaf.view as MarkdownView).file
					: null;
			if (!(file instanceof TFile)) {
				new Notice("⚠️ No active note to append to.");
				return;
			}
			await NoteEditingBridge.appendToNote(plugin.app, file, content);
		},
		[plugin, lastMarkdownLeafRef],
	);

	const handleInsertAtCursor = useCallback(
		(content: string) => {
			const leaf = lastMarkdownLeafRef.current;
			if (!(leaf?.view instanceof MarkdownView)) {
				new Notice("⚠️ Open a note first to insert at cursor.");
				return;
			}
			NoteEditingBridge.insertAtCursor(
				plugin.app,
				leaf.view as MarkdownView,
				content,
			);
		},
		[plugin, lastMarkdownLeafRef],
	);

	const handleApply = useCallback(
		(content: string) => {
			const leaf = lastMarkdownLeafRef.current;
			if (!(leaf?.view instanceof MarkdownView)) {
				new Notice("⚠️ Open a note first to apply edits.");
				return;
			}
			const view = leaf.view as MarkdownView;
			NoteEditingBridge.applyToNote(
				plugin.app,
				view,
				content,
				"Apply AI edit",
			);
		},
		[plugin, lastMarkdownLeafRef],
	);

	const handleApplyToTarget = useCallback(
		async (content: string, target: string) => {
			await NoteEditingBridge.applyToTargetNote(
				plugin.app,
				target,
				content,
				"Apply AI edit",
			);
		},
		[plugin],
	);

	const handleCreateNote = useCallback(
		async (content: string, target: string) => {
			await NoteEditingBridge.createNote(
				plugin.app,
				target,
				content,
				"Create note",
			);
		},
		[plugin],
	);

	const handleAppendToTarget = useCallback(
		async (content: string, target: string) => {
			let file = plugin.app.vault.getAbstractFileByPath(target);
			if (!file || !(file instanceof TFile)) {
				const resolved =
					plugin.app.metadataCache.getFirstLinkpathDest(
						target,
						"",
					);
				if (resolved && resolved instanceof TFile) {
					file = resolved;
				}
			}
			if (file && file instanceof TFile) {
				await NoteEditingBridge.appendToNote(
					plugin.app,
					file,
					content,
				);
			} else {
				new Notice(`⚠️ Note not found: ${target}`);
			}
		},
		[plugin],
	);

	// ═══════════════════════════════════════════════════════
	// TOOL APPROVAL
	// ═══════════════════════════════════════════════════════
	const handleApproveTool = useCallback(
		async () => {
			const pendingToolCall = pendingToolCallRef.current;
			if (!pendingToolCall) return;
			const toolExecutor = new ToolExecutor(
				plugin.app,
				plugin.settings,
			);
			const result = await toolExecutor.execute(pendingToolCall);
			resolveToolRef.current?.(result);
			resolveToolRef.current = null;
		},
		[plugin, resolveToolRef, pendingToolCallRef],
	);

	const handleRejectTool = useCallback(() => {
		resolveToolRef.current?.(null);
		resolveToolRef.current = null;
	}, [resolveToolRef]);

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
