import { Notice, TFile } from "obsidian";
import type { ChatPluginLike } from "../views/ObsidianAIChatView";
import type {
	ChatMessage,
	ChatSession,
	ContextItem,
	ContentPart,
	GroupChatParticipant,
	ResolvedMessagePart,
	Attachment,
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
import {
	estimateTokens,
	estimateContentPartsTokens,
	estimateAttachmentTokens,
} from "../context/tokenEstimator";
import {
	buildBudgetedHistory,
	truncateTextForTokens,
} from "../context/contextBudget";
import {
	compactionHysteresisReleased,
	formatCompactionSummary,
	planSemanticCompaction,
} from "../context/semanticCompaction";
import { buildSystemPrompt } from "../lib/systemPrompt";
import { parseSlashCommand } from "../lib/slashCommand";
import { buildHistoryWithTools } from "../lib/historyBuilder";
import { handleDebugCommand } from "../lib/debugCommands";
import { makeId } from "../lib/sessionUtils";
import { noteTools } from "../agent/tools";
import { createBuiltInToolRegistry } from "../agent/toolRegistry";
import { noteToolsToOpenResponses } from "../agent/tools/toOpenResponses";
import { stripThinkingTags } from "../components/MessageBubble";
import type { ChatRuntimeState, ChatRuntimePatch } from "../hooks/useChatRuntimeState";
import type { UseChatUIResult } from "../hooks/useChatUI";
import type { ParticipantRouter } from "../agent/ParticipantRouter";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface TurnLifecycleDeps {
	plugin: ChatPluginLike;
	orchestrator: import("../agent/Orchestrator").Orchestrator | null;
	participantRouter: ParticipantRouter | null;
	resolvedProfile: ProviderProfile;
	isGroupChat: boolean;
	participants: GroupChatParticipant[];
	thinkingEnabled: boolean;
	sessionsRef: { current: ChatSession[] };
	activeSessionIdRef: { current: string | null };
	setSessions: (update: ((prev: ChatSession[]) => ChatSession[]) | ChatSession[]) => void;
	getRuntime: (sessionId: string | null | undefined) => ChatRuntimeState;
	patchRuntime: (
		sessionId: string | null | undefined,
		patch: ChatRuntimePatch | ((current: ChatRuntimeState) => ChatRuntimePatch),
	) => void;
	clearRuntime: (sessionId: string | null | undefined) => void;
	setWasTruncated: (value: boolean) => void;
	setContextTokenCount: (count: number) => void;
	setContextItems: (items: ContextItem[]) => void;
	messagesRef: { current: ChatMessage[] };
	contextItemsRef: { current: ContextItem[] };
	ui: UseChatUIResult;
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════
// TURN LIFECYCLE
// ═══════════════════════════════════════════════════════

export class TurnLifecycle {
	private compactionBySession: Record<string, string> = {};
	private compactionInFlight: Record<string, boolean> = {};

	constructor(private getDeps: () => TurnLifecycleDeps) {}

	// ─────────────────────────────────────────────────────
	// SEND
	// ─────────────────────────────────────────────────────
	send = async (text: string, attachments?: Attachment[]): Promise<void> => {
		const deps = this.getDeps();

		if (
			(!text.trim() && (!attachments || attachments.length === 0)) ||
			deps.getRuntime(deps.activeSessionIdRef.current).controller
		)
			return;

		// ─── GROUP CHAT PATH ───
		if (deps.isGroupChat && (deps.participantRouter || deps.orchestrator)) {
			const groupAttachments =
				attachments ?? deps.ui.messageAttachments ?? [];
			const groupResolvedParts =
				groupAttachments.length > 0
					? await resolveAttachments(
							groupAttachments,
							deps.plugin.app,
							deps.resolvedProfile.provider,
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
			const currentActiveId = deps.activeSessionIdRef.current;
			if (!currentActiveId) return;
			deps.setSessions((prev) =>
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
			deps.patchRuntime(currentActiveId, {
				isStreaming: true,
				controller,
				currentAiMessage: "",
				currentContentParts: [],
				pendingToolCall: null,
				resolveTool: null,
				runningTokenTotal: 0,
			});

			// Use ParticipantRouter if available, otherwise fall back to Orchestrator
			const router = deps.participantRouter || deps.orchestrator!;
			const { targets } = router.parseAndRoute(text, groupAttachments);
			deps.ui.setTypingAgents(new Set(targets.map((t: any) => t.name)));

			try {
				const stream = deps.ui.debateMode
					? deps.orchestrator!.debate(
							text,
							deps.sessionsRef.current.find(
								(s) => s.id === currentActiveId,
							)?.messages ?? [],
							controller.signal,
							groupResolvedParts,
							2,
						)
					: deps.participantRouter
						? deps.participantRouter.dispatch(
								text,
								deps.sessionsRef.current.find(
									(s) => s.id === currentActiveId,
								)?.messages ?? [],
								controller.signal,
								groupResolvedParts,
							)
						: deps.orchestrator!.dispatch(
									text,
									deps.sessionsRef.current.find(
										(s) => s.id === currentActiveId,
									)?.messages ?? [],
									controller.signal,
									groupResolvedParts,
								);

				for await (const response of stream) {
					deps.ui.setTypingAgents((prev) => {
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

					deps.setSessions((prev) =>
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
				deps.setSessions((prev) =>
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
				deps.patchRuntime(currentActiveId, {
					isStreaming: false,
					controller: null,
					runningTokenTotal: 0,
				});
				deps.ui.setTypingAgents(new Set());
			}
			return;
		}

		// ─── SINGLE CHAT PATH ───

		// Check for debug commands first (!debug ...)
		const currentSession = deps.sessionsRef.current.find(
			(s) => s.id === deps.activeSessionIdRef.current,
		);
		const debugResult = handleDebugCommand(
			text,
			currentSession,
			deps.resolvedProfile,
			{
				toolHistoryMode: deps.plugin.settings.toolHistoryMode ?? "elide",
				maxRequestTokens: deps.plugin.settings.maxRequestTokens,
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
			const currentActiveId = deps.activeSessionIdRef.current;
			if (currentActiveId) {
				deps.setSessions((prev) =>
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
		let sendContextItems = deps.contextItemsRef.current;
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
				const file = deps.plugin.app.metadataCache.getFirstLinkpathDest(
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
			deps.plugin.app,
			deps.plugin.settings.maxContextTokens || 8000,
		);
		deps.setWasTruncated(resolved.wasTruncated);
		deps.setContextTokenCount(resolved.stats.estimatedTokens);

		const selectedIds = Array.from(deps.ui.selectedProfileIds);

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
			const currentActiveId = deps.activeSessionIdRef.current;
			if (!currentActiveId) return;
			deps.setSessions((prev) =>
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
				? (deps.plugin.settings.providerProfiles.find(
						(p) => p.id === selectedIds[0],
					) ?? deps.resolvedProfile)
				: deps.resolvedProfile;

		// Resolve attachments before computing token estimate
		let resolvedAttachmentParts: import("../api").MessageContentPart[] =
			[];
		if (attachments && attachments.length > 0) {
			resolvedAttachmentParts = await resolveAttachments(
				attachments,
				deps.plugin.app,
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

		const currentActiveId = deps.activeSessionIdRef.current;
		if (!currentActiveId) return;
		deps.setSessions((prev) =>
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
		deps.patchRuntime(currentActiveId, {
			isStreaming: true,
			currentAiMessage: "",
			currentContentParts: [],
			pendingToolCall: null,
			controller,
			resolveTool: null,
			runningTokenTotal: 0,
		});
		const streamStartTime = Date.now();

		const maxContextMessages = deps.plugin.settings.maxContextMessages || 10;
		const sessionIdForCompaction = deps.activeSessionIdRef.current;
		let existingSummary = sessionIdForCompaction
			? this.compactionBySession[sessionIdForCompaction]
			: undefined;
		if (
			existingSummary &&
			compactionHysteresisReleased(deps.messagesRef.current, {
				triggerTokens:
					deps.plugin.settings.compactionTriggerTokens ?? 24000,
				releaseTokens:
					deps.plugin.settings.compactionReleaseTokens ?? 16000,
				keepRecentMessages: Math.max(
					3,
					deps.plugin.settings.preserveRecentMessages ?? 4,
				),
			})
		) {
			existingSummary = undefined;
			if (sessionIdForCompaction) {
				delete this.compactionBySession[sessionIdForCompaction];
			}
		}
		const compactionPlan = planSemanticCompaction(
			deps.messagesRef.current,
			{
				triggerTokens:
					deps.plugin.settings.compactionTriggerTokens ?? 24000,
				releaseTokens:
					deps.plugin.settings.compactionReleaseTokens ?? 16000,
				keepRecentMessages: Math.max(
					3,
					deps.plugin.settings.preserveRecentMessages ?? 4,
				),
			},
			Boolean(existingSummary),
		);
		let modelHistory = deps.messagesRef.current;
		let compactionSummary = existingSummary ?? "";
		if (
			compactionPlan.shouldCompact &&
			sessionIdForCompaction &&
			!this.compactionInFlight[sessionIdForCompaction]
		) {
			// Fire-and-forget: the current request is never delayed by compaction.
			this.compactionInFlight[sessionIdForCompaction] = true;
			void deps.plugin.chatapi
				.callApi(
					"You summarize conversation history for another model. Return JSON only.",
					compactionPlan.prompt,
					activeProfile,
				)
				.then((rawSummary) => {
					const parsed = JSON.parse(rawSummary);
					this.compactionBySession[sessionIdForCompaction] =
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
					delete this.compactionInFlight[sessionIdForCompaction];
				});
		} else if (existingSummary) {
			modelHistory = deps.messagesRef.current.slice(
				-Math.max(3, deps.plugin.settings.preserveRecentMessages ?? 4),
			);
		}
		const legacyHistory = buildHistoryWithTools(
			modelHistory,
			maxContextMessages,
			deps.plugin.settings.maxToolResultTokens ?? 4000,
			deps.plugin.settings.toolHistoryMode ?? "elide",
		);

		let userContent = sendText;
		if (resolved.contextString) {
			userContent = `${resolved.contextString}\n\n${sendText}`;
		}

		const isAgentProvider = activeProfile.provider === "agent";
		const useTools =
			deps.plugin.settings.enableAgentTools || isAgentProvider;
		const resolvedToolRegistry =
			deps.plugin.integrationRegistry?.getResolvedToolRegistry(noteTools, {
				enableMemoryAuditTool:
					deps.plugin.settings.intelligence?.enableMemoryAuditTool ??
					false,
			}) ??
			createBuiltInToolRegistry({
				enableMemoryAuditTool:
					deps.plugin.settings.intelligence?.enableMemoryAuditTool ??
					false,
			});
		const toolRegistry = resolvedToolRegistry.tools;
		const autoApprove = deps.plugin.settings.autoApply;
		const maxAgentSteps = deps.plugin.settings.maxAgentSteps;

		let userMessageContent:
			| string
			| import("../api").MessageContentPart[] = userContent;
		if (resolvedAttachmentParts.length > 0) {
			userMessageContent = [
				{ type: "text", text: userContent },
				...resolvedAttachmentParts,
			];
		}

		let systemPrompt = await buildSystemPrompt(
			sendContextItems,
			deps.plugin.personaLoader,
			slashCmd ?? undefined,
			useTools && !slashCmd,
		);
		if (compactionSummary) {
			systemPrompt += `\n\n${compactionSummary}`;
		}
		const budgetedHistory = buildBudgetedHistory({
			systemPrompt,
			currentMessage: userMessageContent,
			history: legacyHistory,
			options: {
				maxRequestTokens: deps.plugin.settings.maxRequestTokens ?? 32000,
				maxMessages: maxContextMessages,
				preserveRecentMessages:
					deps.plugin.settings.preserveRecentMessages ?? 4,
				responseReserveTokens:
					deps.plugin.settings.requestResponseReserveTokens ?? 4096,
				additionalTokens: useTools
					? estimateTokens(JSON.stringify(toolRegistry) ?? "")
					: 0,
			},
		});
		if (budgetedHistory.overBudget) {
			throw new Error(
				"The request exceeds the configured model context budget. Reduce the prompt or increase the request budget.",
			);
		}

		// Build replay content for history
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

		const chatMessages = [
			{ role: "system" as const, content: systemPrompt },
			...budgetedHistory.history.map((msg) => ({
				...msg,
				content: buildReplayContent(msg as ChatMessage),
			})),
			{
				role: "user" as const,
				content: userMessageContent,
			},
		];

		const fullPayloadTokenEstimate = deps.plugin.settings
			.showFullRequestTokens
			? estimateTokens(JSON.stringify(chatMessages))
			: userTokenEstimate;

		// Update runtime with full payload estimate so UI shows correct starting count
		deps.patchRuntime(currentActiveId, {
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
						maxSteps: activeProfile.maxSteps ?? maxAgentSteps,
					},
					deps.plugin.app,
				);
				const openResponsesLoop = new OpenResponsesLoop({
					agentApi,
					toolExecutor: new ToolExecutor(
						deps.plugin.app,
						deps.plugin.settings,
						deps.plugin.personaLoader ?? undefined,
						deps.plugin.searchIndex ?? undefined,
						() => currentActiveId,
						deps.plugin.integrationRegistry,
						deps.plugin.saveSettings.bind(deps.plugin),
					),
					maxSteps: activeProfile.maxSteps ?? maxAgentSteps,
					autoApprove: activeProfile.autoApprove ?? autoApprove,
					maxToolResultTokens:
						deps.plugin.settings.maxToolResultTokens ?? 4000,
					requestResponseReserveTokens:
						deps.plugin.settings.requestResponseReserveTokens ??
						4096,
					onTextDelta: (text) => {
						fullText = text;
						deps.patchRuntime(currentActiveId, {
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
						contentParts.push({
							type: "tool_call",
							call,
						});
						deps.patchRuntime(currentActiveId, {
							currentContentParts: [...contentParts],
						});
						textCheckpoint = fullText.length;
					},
					requestApproval: async (call) => {
						const resolved =
							await new Promise<ToolResult | null>(
								(resolve) => {
									deps.patchRuntime(currentActiveId, {
										pendingToolCall: call,
										resolveTool: resolve,
									});
								},
							);
						deps.patchRuntime(currentActiveId, {
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
							(tc) => tc.call.toolCallId === call.toolCallId,
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
								deps.patchRuntime(currentActiveId, {
									currentContentParts: [...contentParts],
								});
							}
						}
					},
					onTokenUpdate: (total) => {
						deps.patchRuntime(currentActiveId, {
							runningTokenTotal:
								fullPayloadTokenEstimate + total,
						});
					},
				});
				const orTools = noteToolsToOpenResponses(toolRegistry);
				const resultText = await openResponsesLoop.run(
					chatMessages as Array<{
						role: "user" | "assistant" | "system";
						content: string;
					}>,
					orTools,
					controller.signal,
				);
				const sessionLinks = formatPastSessionLinks(
					toolCallsLog,
					deps.sessionsRef.current,
				);
				assistantContent = resultText + sessionLinks;
				if (sessionLinks) {
					contentParts.push({
						type: "text",
						content: sessionLinks,
					});
				}
				assistantTokenEstimate = estimateTokens(assistantContent);
			} else if (useTools && !slashCmd) {
				// … AgentLoop path
				const agent = new AgentLoop({
					chatApi: deps.plugin.chatapi,
					toolExecutor: new ToolExecutor(
						deps.plugin.app,
						deps.plugin.settings,
						deps.plugin.personaLoader ?? undefined,
						deps.plugin.searchIndex ?? undefined,
						() => currentActiveId,
						deps.plugin.integrationRegistry,
						deps.plugin.saveSettings.bind(deps.plugin),
					),
					maxSteps: maxAgentSteps,
					autoApprove,
					maxRequestTokens:
						deps.plugin.settings.maxRequestTokens ?? 32000,
					maxContextMessages,
					preserveRecentMessages:
						deps.plugin.settings.preserveRecentMessages ?? 4,
					requestResponseReserveTokens:
						deps.plugin.settings.requestResponseReserveTokens ??
						4096,
					maxToolResultTokens:
						deps.plugin.settings.maxToolResultTokens ?? 4000,
					profile: activeProfile,
					thinkingEnabled: deps.thinkingEnabled,
					onTextDelta: (text) => {
						fullText = text;
						deps.patchRuntime(currentActiveId, {
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
						contentParts.push({
							type: "tool_call",
							call,
						});
						deps.patchRuntime(currentActiveId, {
							currentContentParts: [...contentParts],
						});
						textCheckpoint = fullText.length;
					},
					requestApproval: async (call) => {
						const resolved =
							await new Promise<ToolResult | null>(
								(resolve) => {
									deps.patchRuntime(currentActiveId, {
										pendingToolCall: call,
										resolveTool: resolve,
									});
								},
							);
						deps.patchRuntime(currentActiveId, {
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
							(tc) => tc.call.toolCallId === call.toolCallId,
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
								deps.patchRuntime(currentActiveId, {
									currentContentParts: [...contentParts],
								});
							}
						}
					},
					onTokenUpdate: (total) => {
						deps.patchRuntime(currentActiveId, {
							runningTokenTotal:
								fullPayloadTokenEstimate + total,
						});
					},
				});

				const result = await agent.run(
					chatMessages as Array<any>,
					toolRegistry,
					controller.signal,
				);
				assistantContent = result.text;
				const sessionLinks = formatPastSessionLinks(
					toolCallsLog,
					deps.sessionsRef.current,
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
				// … standard streamChat path (no tools)
				let streamTokenTotal = userTokenEstimate;
				for await (const chunk of deps.plugin.chatapi.streamChat(
					chatMessages as any,
					controller.signal,
					activeProfile,
					deps.thinkingEnabled,
					(usage) => {
						providerUsage = usage;
					},
				)) {
					fullText += chunk;
					if (!slashCmd) {
						deps.patchRuntime(currentActiveId, {
							currentAiMessage: stripThinkingTags(fullText),
						});
					}
					// Update running token total incrementally for standard stream
					streamTokenTotal =
						fullPayloadTokenEstimate + estimateTokens(fullText);
					deps.patchRuntime(currentActiveId, {
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
					await deps.plugin.app.vault.create(fileName, fullText);
					new Notice(`✓ Created note: ${slashCmd.target}`);
					assistantContent = `✓ Created note: ${slashCmd.target}`;
				} catch (e: any) {
					new Notice(`⚠️ Could not create note: ${e.message}`);
					assistantContent = `⚠️ Could not create note: ${e.message}`;
				}
				assistantTokenEstimate = estimateTokens(assistantContent);
			} else if (slashCmd?.command === "edit" && fullText) {
				const success = await NoteEditingBridge.applyToTargetNote(
					deps.plugin.app,
					slashCmd.target,
					fullText,
					"Apply AI edit",
				);
				assistantContent = success
					? `✓ Applied edits to ${slashCmd.target}`
					: `⚠️ Could not apply edits to ${slashCmd.target}`;
				assistantTokenEstimate = estimateTokens(assistantContent);
			} else if (slashCmd?.command === "append" && fullText) {
				let file = deps.plugin.app.vault.getAbstractFileByPath(
					slashCmd.target,
				);
				if (!file || !(file instanceof TFile)) {
					const resolved =
						deps.plugin.app.metadataCache.getFirstLinkpathDest(
							slashCmd.target,
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
			deps.setSessions((prev) =>
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
				deps.setSessions((prev) =>
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
				deps.setSessions((prev) =>
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
			deps.patchRuntime(currentActiveId, {
				isStreaming: false,
				currentAiMessage: "",
				currentContentParts: [],
				pendingToolCall: null,
				controller: null,
				resolveTool: null,
				runningTokenTotal: 0,
			});
			deps.ui.setIsEditing(false);
			deps.ui.setOriginalMessages([]);
			deps.ui.setEditMessageText("");
			deps.ui.setMessageAttachments([]);
			deps.setContextItems([]);
		}
	};

	// ─────────────────────────────────────────────────────
	// STOP
	// ─────────────────────────────────────────────────────
	stop = (): void => {
		const deps = this.getDeps();
		const currentActiveId = deps.activeSessionIdRef.current;
		deps.getRuntime(currentActiveId).controller?.abort();
	};

	// ─────────────────────────────────────────────────────
	// RETRY
	// ─────────────────────────────────────────────────────
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
		const truncated = session.messages.slice(0, userIndex);
		deps.messagesRef.current = truncated;

		deps.setSessions((prev) =>
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
			deps.ui.setMessageAttachments(userMsg.attachments);
		}
		if (userMsg.contextItems && userMsg.contextItems.length > 0) {
			deps.setContextItems(userMsg.contextItems);
		}

		void this.send(userMsg.content, userMsg.attachments);
	};

	// ─────────────────────────────────────────────────────
	// EDIT
	// ─────────────────────────────────────────────────────
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

		// Restore attachments and context items from the message being edited
		deps.ui.setMessageAttachments(msg.attachments ?? []);
		deps.setContextItems(msg.contextItems ?? []);

		deps.setSessions((prev) =>
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
		deps.ui.setIsEditing(true);
		deps.ui.setEditMessageText(msg.content);
	};

	// ─────────────────────────────────────────────────────
	// CANCEL EDIT
	// ─────────────────────────────────────────────────────
	cancelEdit = (): void => {
		const deps = this.getDeps();
		const currentActiveId = deps.activeSessionIdRef.current;
		if (!currentActiveId || deps.ui.originalMessages.length === 0) return;

		deps.setSessions((prev) =>
			prev.map((s) =>
				s.id === currentActiveId
					? {
							...s,
							messages: deps.ui.originalMessages,
							updatedAt: Date.now(),
						}
					: s,
			),
		);
		deps.ui.setIsEditing(false);
		deps.ui.setOriginalMessages([]);
		deps.ui.setEditMessageText("");
		deps.ui.setMessageAttachments([]);
		deps.setContextItems([]);
	};

	// ─────────────────────────────────────────────────────
	// TOOL APPROVAL
	// ─────────────────────────────────────────────────────
	approveTool = async (): Promise<void> => {
		const deps = this.getDeps();
		const currentActiveId = deps.activeSessionIdRef.current;
		if (!currentActiveId) return;
		const runtime = deps.getRuntime(currentActiveId);
		const pendingToolCall = runtime.pendingToolCall;
		if (!pendingToolCall) return;
		const toolExecutor = new ToolExecutor(
			deps.plugin.app,
			deps.plugin.settings,
			deps.plugin.personaLoader ?? undefined,
			deps.plugin.searchIndex ?? undefined,
			() => currentActiveId,
			deps.plugin.integrationRegistry,
			deps.plugin.saveSettings.bind(deps.plugin),
		);
		const result = await toolExecutor.execute(pendingToolCall);
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
