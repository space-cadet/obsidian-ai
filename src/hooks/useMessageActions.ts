import { useCallback, useRef } from "react";
import { MarkdownView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import type { ChatPluginLike } from "../views/ObsidianAIChatView";
import type {
	ChatMessage,
	ChatSession,
	ContextItem,
	ContentPart,
	GroupChatParticipant,
	ResolvedMessagePart,
} from "../types";
import type { ProviderProfile } from "../settings";
import type { ToolCall, ToolResult } from "../agent/types";
import { ToolExecutor } from "../agent/ToolExecutor";
import { runChatTurn } from "../agent/ChatTurnCoordinator";
import { NoteEditingBridge } from "../noteEditing/NoteEditingBridge";
import { resolveContextItems } from "../context/ContextEngine";
import { resolveAttachments } from "../context/AttachmentEngine";
import {
	estimateTokens,
	estimateContentPartsTokens,
	estimateAttachmentTokens,
} from "../context/tokenEstimator";
import { truncateTextForTokens } from "../context/contextBudget";
import {
	compactionHysteresisReleased,
	formatCompactionSummary,
	planSemanticCompaction,
} from "../context/semanticCompaction";
import { appendPendingText, finalizeContentParts } from "../lib/streamingUtils";
import { parseSlashCommand } from "../lib/slashCommand";
import { handleDebugCommand } from "../lib/debugCommands";
import { makeId } from "../lib/sessionUtils";
import { getActiveProviderProfile } from "../settings";
import { stripThinkingTags } from "../components/MessageBubble";
import { buildChatTurnRequest } from "../agent/ChatTurnRequest";
import type { ChatRuntimeState, ChatRuntimePatch } from "./useChatRuntimeState";

function formatPastSessionLinks(
	toolCalls: Array<{ call: ToolCall; result?: ToolResult }>,
	sessions: ChatSession[],
): string {
	const results = toolCalls
		.filter((entry) => entry.call.toolName === "search_past_sessions")
		.flatMap((entry) => entry.result?.sessionResults ?? [])
		.filter(
			(result, index, all) =>
				all.findIndex(
					(candidate) =>
						candidate.sessionId === result.sessionId &&
						candidate.messageId === result.messageId,
				) === index,
		);
	if (results.length === 0) return "";

	const links = results.map((session) => {
		const title =
			sessions.find((candidate) => candidate.id === session.sessionId)
				?.title ||
			`Session from ${new Date(session.timestamp).toLocaleDateString()}`;
		const params = new URLSearchParams({
			sessionId: session.sessionId,
			messageId: session.messageId,
		});
		const safeTitle = title.replace(/[\\[\]]/g, "\\$&");
		const snippet = session.snippet
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, 180);
		return `- **[${safeTitle}](obsidian-ai://open-session?${params.toString()})**  \n  ${snippet}${session.snippet.length > 180 ? "…" : ""}`;
	});
	return `\n\n### Past sessions\n${links.join("\n")}`;
}
import type { UseChatUIResult } from "./useChatUI";
import type { ParticipantRouter } from "../agent/ParticipantRouter";

export interface UseMessageActionsDeps {
	plugin: ChatPluginLike;
	orchestrator: import("../agent/Orchestrator").Orchestrator | null;
	participantRouter: ParticipantRouter | null;
	resolvedProfile: ProviderProfile;
	isGroupChat: boolean;
	participants: GroupChatParticipant[];
	thinkingEnabled: boolean;

	// Session
	sessionsRef: React.MutableRefObject<ChatSession[]>;
	activeSessionIdRef: React.MutableRefObject<string | null>;
	setSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>;

	// Session-keyed streaming display state
	getRuntime: (sessionId: string | null | undefined) => ChatRuntimeState;
	patchRuntime: (
		sessionId: string | null | undefined,
		patch:
			| ChatRuntimePatch
			| ((current: ChatRuntimeState) => ChatRuntimePatch),
	) => void;
	clearRuntime: (sessionId: string | null | undefined) => void;
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
	const compactionBySessionRef = useRef<Record<string, string>>({});
	const compactionInFlightRef = useRef<Record<string, boolean>>({});
	const {
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
		getRuntime,
		patchRuntime,
		clearRuntime,
		setWasTruncated,
		setContextTokenCount,
		setContextItems,
		messagesRef,
		contextItemsRef,
		lastMarkdownLeafRef,
		ui,
	} = deps;

	const buildReplayContent = (
		message: ChatMessage,
	): string | import("../api").MessageContentPart[] => {
		const replayText =
			message.remote && message.fromUserId
				? `[Remote User ${message.fromUserId}]: ${message.content}`
				: message.content;

		if (!message.resolvedParts || message.resolvedParts.length === 0) {
			return replayText;
		}

		return [
			{ type: "text", text: replayText },
			...(message.resolvedParts as import("../api").MessageContentPart[]),
		];
	};

	// ═══════════════════════════════════════════════════════
	// SEND
	// ═══════════════════════════════════════════════════════
	const handleSend = useCallback(
		async (text: string, attachments?: import("../types").Attachment[]) => {
			if (
				(!text.trim() && (!attachments || attachments.length === 0)) ||
				getRuntime(activeSessionIdRef.current).controller
			)
				return;

			// ─── GROUP CHAT PATH ───
			if (isGroupChat && (participantRouter || orchestrator)) {
				const groupAttachments =
					attachments ?? ui.messageAttachments ?? [];
				const groupResolvedParts =
					groupAttachments.length > 0
						? await resolveAttachments(
								groupAttachments,
								plugin.app,
								resolvedProfile.provider,
							)
						: [];
				const userTokenEstimate =
					estimateTokens(text) +
					groupAttachments.reduce(
						(sum, att) => sum + estimateAttachmentTokens(att),
						0,
					);
				const userMsg: ChatMessage = {
					id: makeId(),
					role: "user",
					content: text,
					timestamp: Date.now(),
					attachments:
						groupAttachments.length > 0
							? groupAttachments
							: undefined,
					resolvedParts:
						groupResolvedParts.length > 0
							? (groupResolvedParts as ResolvedMessagePart[])
							: undefined,
					estimatedTokens: userTokenEstimate,
				};
				const currentActiveId = activeSessionIdRef.current;
				if (!currentActiveId) return;
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
				const controller = new AbortController();
				patchRuntime(currentActiveId, {
					isStreaming: true,
					controller,
					currentAiMessage: "",
					currentContentParts: [],
					pendingToolCall: null,
					resolveTool: null,
					runningTokenTotal: 0,
				});

				// Use ParticipantRouter if available, otherwise fall back to Orchestrator
				const router = participantRouter || orchestrator!;
				const { targets } = router.parseAndRoute(
					text,
					groupAttachments,
				);
				ui.setTypingAgents(new Set(targets.map((t: any) => t.name)));

				try {
					const stream = ui.debateMode
						? orchestrator!.debate(
								text,
								sessionsRef.current.find(
									(s) => s.id === currentActiveId,
								)?.messages ?? [],
								controller.signal,
								groupResolvedParts,
								2,
							)
						: participantRouter
							? participantRouter.dispatch(
									text,
									sessionsRef.current.find(
										(s) => s.id === currentActiveId,
									)?.messages ?? [],
									controller.signal,
									groupResolvedParts,
								)
							: orchestrator!.dispatch(
									text,
									sessionsRef.current.find(
										(s) => s.id === currentActiveId,
									)?.messages ?? [],
									controller.signal,
									groupResolvedParts,
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
							providerUsage: response.providerUsage,
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
					new Notice(`❌ Group chat error: ${error.message}`);
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
										messages: [...s.messages, errorMsg],
										updatedAt: Date.now(),
									}
								: s,
						),
					);
				} finally {
					patchRuntime(currentActiveId, {
						isStreaming: false,
						controller: null,
						runningTokenTotal: 0,
					});
					ui.setTypingAgents(new Set());
				}
				return;
			}

			// ─── SINGLE CHAT PATH ───

			// Check for debug commands first (!debug ...)
			const currentSession = sessionsRef.current.find(
				(s) => s.id === activeSessionIdRef.current,
			);
			const debugResult = handleDebugCommand(
				text,
				currentSession,
				resolvedProfile,
				{
					toolHistoryMode: plugin.settings.toolHistoryMode ?? "elide",
					maxRequestTokens: plugin.settings.maxRequestTokens,
				},
			);
			if (debugResult.handled) {
				const debugMsg: ChatMessage = {
					id: makeId(),
					role: "assistant",
					content: debugResult.response || "",
					timestamp: Date.now(),
					isDebug: true,
				};
				const currentActiveId = activeSessionIdRef.current;
				if (currentActiveId) {
					setSessions((prev) =>
						prev.map((s) =>
							s.id === currentActiveId
								? {
										...s,
										messages: [...s.messages, debugMsg],
										updatedAt: Date.now(),
									}
								: s,
						),
					);
				}
				return;
			}

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
					const file = plugin.app.metadataCache.getFirstLinkpathDest(
						slashCmd.target,
						"",
					);
					if (file && file instanceof TFile) {
						const exists = sendContextItems.some(
							(i) => i.type === "note" && i.path === file.path,
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

			// ─── HUMAN-ONLY TAB: No AI selected ───
			if (selectedIds.length === 0) {
				const userMsg: ChatMessage = {
					id: makeId(),
					role: "user",
					content: text,
					timestamp: Date.now(),
					attachments:
						attachments && attachments.length > 0
							? attachments
							: undefined,
				};
				const currentActiveId = activeSessionIdRef.current;
				if (!currentActiveId) return;
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
				return;
			}

			const activeProfile: ProviderProfile =
				selectedIds.length === 1
					? (plugin.settings.providerProfiles.find(
							(p) => p.id === selectedIds[0],
						) ?? resolvedProfile)
					: resolvedProfile;

			// Resolve attachments before computing token estimate
			let resolvedAttachmentParts: import("../api").MessageContentPart[] =
				[];
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
				resolvedParts:
					resolvedAttachmentParts.length > 0
						? (resolvedAttachmentParts as ResolvedMessagePart[])
						: undefined,
				estimatedTokens: userTokenEstimate,
			};

			const currentActiveId = activeSessionIdRef.current;
			if (!currentActiveId) return;
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
			const controller = new AbortController();
			patchRuntime(currentActiveId, {
				isStreaming: true,
				currentAiMessage: "",
				currentContentParts: [],
				pendingToolCall: null,
				controller,
				resolveTool: null,
				runningTokenTotal: 0,
			});
			const streamStartTime = Date.now();

			const maxContextMessages = plugin.settings.maxContextMessages || 10;
			const sessionIdForCompaction = activeSessionIdRef.current;
			let existingSummary = sessionIdForCompaction
				? compactionBySessionRef.current[sessionIdForCompaction]
				: undefined;
			if (
				existingSummary &&
				compactionHysteresisReleased(messagesRef.current, {
					triggerTokens:
						plugin.settings.compactionTriggerTokens ?? 24000,
					releaseTokens:
						plugin.settings.compactionReleaseTokens ?? 16000,
					keepRecentMessages: Math.max(
						3,
						plugin.settings.preserveRecentMessages ?? 4,
					),
				})
			) {
				existingSummary = undefined;
				if (sessionIdForCompaction) {
					delete compactionBySessionRef.current[
						sessionIdForCompaction
					];
				}
			}
			const compactionPlan = planSemanticCompaction(
				messagesRef.current,
				{
					triggerTokens:
						plugin.settings.compactionTriggerTokens ?? 24000,
					releaseTokens:
						plugin.settings.compactionReleaseTokens ?? 16000,
					keepRecentMessages: Math.max(
						3,
						plugin.settings.preserveRecentMessages ?? 4,
					),
				},
				Boolean(existingSummary),
			);
			let modelHistory = messagesRef.current;
			let compactionSummary = existingSummary ?? "";
			if (
				compactionPlan.shouldCompact &&
				sessionIdForCompaction &&
				!compactionInFlightRef.current[sessionIdForCompaction]
			) {
				// Fire-and-forget: the current request is never delayed by compaction.
				compactionInFlightRef.current[sessionIdForCompaction] = true;
				void plugin.chatapi
					.callApi(
						"You summarize conversation history for another model. Return JSON only.",
						compactionPlan.prompt,
						activeProfile,
					)
					.then((rawSummary) => {
						const parsed = JSON.parse(rawSummary);
						compactionBySessionRef.current[sessionIdForCompaction] =
							formatCompactionSummary(parsed);
						new Notice(
							"Conversation compacted for future requests.",
						);
					})
					.catch((error) => {
						console.warn(
							"[T48c] Semantic compaction skipped:",
							error,
						);
					})
					.finally(() => {
						delete compactionInFlightRef.current[
							sessionIdForCompaction
						];
					});
			} else if (existingSummary) {
				modelHistory = messagesRef.current.slice(
					-Math.max(3, plugin.settings.preserveRecentMessages ?? 4),
				);
			}
			const isAgentProvider = activeProfile.provider === "agent";
			const useTools =
				plugin.settings.enableAgentTools || isAgentProvider;
			const toolExecutor = new ToolExecutor(
				plugin.app,
				plugin.settings,
				plugin.personaLoader ?? undefined,
				plugin.searchIndex ?? undefined,
				() => currentActiveId,
				plugin.integrationRegistry,
				plugin.saveSettings
					? plugin.saveSettings.bind(plugin)
					: undefined,
			);
			const resolvedToolRegistry = toolExecutor.getResolvedToolRegistry();
			const toolRegistry = resolvedToolRegistry.tools;
			const autoApprove = plugin.settings.autoApply;
			const maxAgentSteps = plugin.settings.maxAgentSteps;

			const { chatMessages, fullPayloadTokenEstimate } =
				await buildChatTurnRequest({
					contextItems: sendContextItems,
					personaLoader: plugin.personaLoader,
					slashCommand: slashCmd ?? undefined,
					useTools,
					toolDefinitions: resolvedToolRegistry.definitions,
					compactionSummary,
					sendText,
					resolvedContextString: resolved.contextString,
					resolvedAttachmentParts,
					history: modelHistory,
					maxContextMessages,
					maxToolResultTokens:
						plugin.settings.maxToolResultTokens ?? 4000,
					toolHistoryMode: plugin.settings.toolHistoryMode ?? "elide",
					maxRequestTokens: plugin.settings.maxRequestTokens ?? 32000,
					preserveRecentMessages:
						plugin.settings.preserveRecentMessages ?? 4,
					responseReserveTokens:
						plugin.settings.requestResponseReserveTokens ?? 4096,
					showFullRequestTokens:
						plugin.settings.showFullRequestTokens,
					userTokenEstimate,
					toolRegistry,
				});

			// Update runtime with full payload estimate so UI shows correct starting count
			patchRuntime(currentActiveId, {
				runningTokenTotal: fullPayloadTokenEstimate,
			});

			let fullText = "";
			let toolCallsLog: Array<{ call: ToolCall; result?: ToolResult }> =
				[];
			let contentParts: ContentPart[] = [];
			let textCheckpoint = 0;

			let assistantContent = fullText;
			let assistantTokenEstimate = 0;
			let providerUsage:
				| import("../types").ProviderTokenUsage
				| undefined;

			try {
				if (useTools && !slashCmd) {
					const result = await runChatTurn({
						app: plugin.app,
						profile: activeProfile,
						chatApi: plugin.chatapi,
						toolExecutor,
						toolRegistry: resolvedToolRegistry,
						messages: chatMessages,
						signal: controller.signal,
						maxSteps: maxAgentSteps,
						autoApprove,
						maxRequestTokens:
							plugin.settings.maxRequestTokens ?? 32000,
						maxContextMessages,
						preserveRecentMessages:
							plugin.settings.preserveRecentMessages ?? 4,
						requestResponseReserveTokens:
							plugin.settings.requestResponseReserveTokens ??
							4096,
						maxToolResultTokens:
							plugin.settings.maxToolResultTokens ?? 4000,
						thinkingEnabled,
						onTextDelta: (text) => {
							fullText = text;
							patchRuntime(currentActiveId, {
								currentAiMessage: stripThinkingTags(text),
							});
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
							contentParts.push({ type: "tool_call", call });
							patchRuntime(currentActiveId, {
								currentContentParts: [...contentParts],
							});
							textCheckpoint = fullText.length;
						},
						requestApproval: async (call) => {
							const resolved =
								await new Promise<ToolResult | null>(
									(resolve) => {
										patchRuntime(currentActiveId, {
											pendingToolCall: call,
											resolveTool: resolve,
										});
									},
								);
							patchRuntime(currentActiveId, {
								pendingToolCall: null,
								resolveTool: null,
							});
							const lastIdx = toolCallsLog.length - 1;
							if (lastIdx >= 0) {
								toolCallsLog[lastIdx] = {
									...toolCallsLog[lastIdx],
									result: resolved || undefined,
								};
							}
							const partIdx = contentParts.findIndex(
								(part) =>
									part.type === "tool_call" &&
									part.call.toolCallId === call.toolCallId,
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
								(entry) =>
									entry.call.toolCallId === call.toolCallId,
							);
							if (idx >= 0) {
								toolCallsLog[idx] = {
									...toolCallsLog[idx],
									result,
								};
							}
							const partIdx = contentParts.findIndex(
								(part) =>
									part.type === "tool_call" &&
									part.call.toolCallId === call.toolCallId,
							);
							if (partIdx >= 0) {
								const part = contentParts[partIdx];
								if (part.type === "tool_call") {
									contentParts[partIdx] = { ...part, result };
									patchRuntime(currentActiveId, {
										currentContentParts: [...contentParts],
									});
								}
							}
						},
						onTokenUpdate: (total) => {
							patchRuntime(currentActiveId, {
								runningTokenTotal:
									fullPayloadTokenEstimate + total,
							});
						},
					});
					assistantContent = result.text;
					const sessionLinks = formatPastSessionLinks(
						toolCallsLog,
						sessionsRef.current,
					);
					if (sessionLinks) {
						assistantContent += sessionLinks;
						contentParts.push({
							type: "text",
							content: sessionLinks,
						});
					}
					assistantTokenEstimate = result.tokenEstimate;
					providerUsage = result.providerUsage;
				} else {
					let streamTokenTotal = userTokenEstimate;
					for await (const chunk of plugin.chatapi.streamChat(
						chatMessages as any,
						controller.signal,
						activeProfile,
						thinkingEnabled,
						(usage) => {
							providerUsage = usage;
						},
					)) {
						fullText += chunk;
						patchRuntime(currentActiveId, {
							currentAiMessage: stripThinkingTags(fullText),
						});
						streamTokenTotal =
							fullPayloadTokenEstimate + estimateTokens(fullText);
						patchRuntime(currentActiveId, {
							runningTokenTotal: streamTokenTotal,
						});
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
						await plugin.app.vault.create(fileName, fullText);
						new Notice(`✓ Created note: ${slashCmd.target}`);
						assistantContent = `✓ Created note: ${slashCmd.target}`;
					} catch (e: any) {
						new Notice(`⚠️ Could not create note: ${e.message}`);
						assistantContent = `⚠️ Could not create note: ${e.message}`;
					}
					assistantTokenEstimate = estimateTokens(assistantContent);
				} else if (slashCmd?.command === "edit" && fullText) {
					const success = await NoteEditingBridge.applyToTargetNote(
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

				const cleanAssistantContent =
					stripThinkingTags(assistantContent);
				const assistantMsg: ChatMessage = {
					id: makeId(),
					role: "assistant",
					content: cleanAssistantContent,
					timestamp: Date.now(),
					command: commandMeta,
					estimatedTokens: assistantTokenEstimate,
					requestTokenEstimate: fullPayloadTokenEstimate,
					providerUsage,
					modelName: activeProfile.model,
					responseTimeMs: Date.now() - streamStartTime,
					toolCalls:
						toolCallsLog.length > 0 ? toolCallsLog : undefined,
					contentParts:
						contentParts.length > 0 ? contentParts : undefined,
				};
				setSessions((prev) =>
					prev.map((s) =>
						s.id === currentActiveId
							? {
									...s,
									messages: [...s.messages, assistantMsg],
									updatedAt: Date.now(),
									contextItems: sendContextItems,
								}
							: s,
					),
				);
			} catch (e: any) {
				// Preserve partial content for ALL interruptions (AbortError, TypeError, network errors, etc.)
				// The user should see what was received, not lose it.
				if (fullText) {
					let interruptedParts: ContentPart[] = [];
					if (useTools && !slashCmd) {
						interruptedParts = [...contentParts];
						const remainingText = stripThinkingTags(
							fullText.slice(textCheckpoint),
						);
						if (remainingText) {
							interruptedParts.push({
								type: "text",
								content: remainingText + " [interrupted]",
							});
						}
					} else {
						interruptedParts = [
							{
								type: "text",
								content:
									stripThinkingTags(fullText) +
									" [interrupted]",
							},
						];
					}
					const interruptedMsg: ChatMessage = {
						id: makeId(),
						role: "assistant",
						content: stripThinkingTags(fullText) + " [interrupted]",
						timestamp: Date.now(),
						command: commandMeta,
						estimatedTokens: estimateTokens(fullText),
						modelName: activeProfile.model,
						responseTimeMs: Date.now() - streamStartTime,
						contentParts: interruptedParts,
						isError: e.name !== "AbortError",
					};
					setSessions((prev) =>
						prev.map((s) =>
							s.id === currentActiveId
								? {
										...s,
										messages: [
											...s.messages,
											interruptedMsg,
										],
										updatedAt: Date.now(),
										contextItems: sendContextItems,
									}
								: s,
						),
					);
				} else if (e.name !== "AbortError") {
					// No partial content received and it's a real error — show error message
					const errorMsg: ChatMessage = {
						id: makeId(),
						role: "assistant",
						content: `Error: ${e.message}`,
						timestamp: Date.now(),
						isError: true,
						command: commandMeta,
						estimatedTokens: estimateTokens(`Error: ${e.message}`),
					};
					setSessions((prev) =>
						prev.map((s) =>
							s.id === currentActiveId
								? {
										...s,
										messages: [...s.messages, errorMsg],
										updatedAt: Date.now(),
										contextItems: sendContextItems,
									}
								: s,
						),
					);
				}
			} finally {
				patchRuntime(currentActiveId, {
					isStreaming: false,
					currentAiMessage: "",
					currentContentParts: [],
					pendingToolCall: null,
					controller: null,
					resolveTool: null,
					runningTokenTotal: 0,
				});
				ui.setIsEditing(false);
				ui.setOriginalMessages([]);
				ui.setEditMessageText("");
				ui.setMessageAttachments([]);
				setContextItems([]);
			}
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps -- action callbacks are stable runtime dependencies managed by the hook.
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
		const currentActiveId = activeSessionIdRef.current;
		getRuntime(currentActiveId).controller?.abort();
	}, [activeSessionIdRef, getRuntime]);

	// ═══════════════════════════════════════════════════════
	// RETRY
	// ═══════════════════════════════════════════════════════
	const handleRetry = useCallback(
		(messageId: string) => {
			const currentActiveId = activeSessionIdRef.current;
			if (!currentActiveId) return;
			if (getRuntime(currentActiveId).controller) return;

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

			// Restore attachments and context items before resending
			if (userMsg.attachments && userMsg.attachments.length > 0) {
				ui.setMessageAttachments(userMsg.attachments);
			}
			if (userMsg.contextItems && userMsg.contextItems.length > 0) {
				setContextItems(userMsg.contextItems);
			}

			handleSend(userMsg.content, userMsg.attachments);
		},
		[handleSend],
	);

	// ═══════════════════════════════════════════════════════
	// EDIT
	// ═══════════════════════════════════════════════════════
	const handleEditMessage = useCallback(
		(messageId: string) => {
			const currentActiveId = activeSessionIdRef.current;
			if (!currentActiveId) return;
			if (getRuntime(currentActiveId).controller) return;

			const session = sessionsRef.current.find(
				(s) => s.id === currentActiveId,
			);
			if (!session) return;

			const index = session.messages.findIndex((m) => m.id === messageId);
			if (index < 0 || session.messages[index].role !== "user") return;

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
		// eslint-disable-next-line react-hooks/exhaustive-deps -- edit cancellation intentionally reads the current session refs.
		[activeSessionIdRef, sessionsRef, setSessions, ui, getRuntime],
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
				const resolved = plugin.app.metadataCache.getFirstLinkpathDest(
					target,
					"",
				);
				if (resolved && resolved instanceof TFile) {
					file = resolved;
				}
			}
			if (file && file instanceof TFile) {
				await NoteEditingBridge.appendToNote(plugin.app, file, content);
			} else {
				new Notice(`⚠️ Note not found: ${target}`);
			}
		},
		[plugin],
	);

	// ═══════════════════════════════════════════════════════
	// TOOL APPROVAL
	// ═══════════════════════════════════════════════════════
	const handleApproveTool = useCallback(async () => {
		const currentActiveId = activeSessionIdRef.current;
		if (!currentActiveId) return;
		const runtime = getRuntime(currentActiveId);
		const pendingToolCall = runtime.pendingToolCall;
		if (!pendingToolCall) return;
		const toolExecutor = new ToolExecutor(
			plugin.app,
			plugin.settings,
			plugin.personaLoader ?? undefined,
			plugin.searchIndex ?? undefined,
			() => currentActiveId,
			plugin.integrationRegistry,
			plugin.saveSettings ? plugin.saveSettings.bind(plugin) : undefined,
		);
		const result = await toolExecutor.execute(pendingToolCall);
		runtime.resolveTool?.(result);
		patchRuntime(currentActiveId, { resolveTool: null });
	}, [plugin, activeSessionIdRef, getRuntime, patchRuntime]);

	const handleRejectTool = useCallback(() => {
		const currentActiveId = activeSessionIdRef.current;
		if (!currentActiveId) return;
		const runtime = getRuntime(currentActiveId);
		runtime.resolveTool?.(null);
		patchRuntime(currentActiveId, { resolveTool: null });
	}, [activeSessionIdRef, getRuntime, patchRuntime]);

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
