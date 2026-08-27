import type { ChatApiManager } from "../api";
import { AgentApiManager } from "../api/AgentApiManager";
import type { App } from "obsidian";
import { estimateTokens } from "../context/tokenEstimator";
import type { ProviderProfile } from "../settings";
import type { ProviderTokenUsage } from "../types";
import { AgentLoop } from "./AgentLoop";
import { OpenResponsesLoop } from "./OpenResponsesLoop";
import type { ToolCall, ToolResult } from "./types";
import type { ResolvedToolRegistry } from "./toolRegistry";
import type { ToolExecutor } from "./ToolExecutor";
import { resolvedToolsToOpenResponses } from "./tools/toOpenResponses";

export interface ChatTurnCoordinatorOptions {
	profile: ProviderProfile;
	app: App;
	chatApi: ChatApiManager;
	toolExecutor: ToolExecutor;
	toolRegistry: ResolvedToolRegistry;
	messages: Array<any>;
	signal: AbortSignal;
	maxSteps: number;
	autoApprove: boolean;
	maxRequestTokens: number;
	maxContextMessages: number;
	preserveRecentMessages: number;
	requestResponseReserveTokens: number;
	maxToolResultTokens: number;
	thinkingEnabled: boolean;
	onTextDelta: (text: string) => void;
	onToolCall: (call: ToolCall) => void;
	requestApproval: (call: ToolCall) => Promise<ToolResult | null>;
	onToolResult: (call: ToolCall, result: ToolResult) => void;
	onTokenUpdate: (total: number) => void;
}

export interface ChatTurnCoordinatorResult {
	text: string;
	tokenEstimate: number;
	providerUsage?: ProviderTokenUsage;
}

/** Run one tool-enabled turn without depending on React or UI state. */
export async function runChatTurn(
	options: ChatTurnCoordinatorOptions,
): Promise<ChatTurnCoordinatorResult> {
	const {
		profile,
		chatApi,
		toolExecutor,
		toolRegistry,
		messages,
		signal,
		maxSteps,
		autoApprove,
		onTextDelta,
		onToolCall,
		requestApproval,
		onToolResult,
		onTokenUpdate,
	} = options;

	if (profile.provider === "agent") {
		if (!profile.endpointUrl) {
			throw new Error("Agent endpoint URL is not configured.");
		}

		const agentApi = new AgentApiManager(
			{
				id: profile.id,
				name: profile.name,
				provider: "agent",
				model: profile.model,
				endpointUrl: profile.endpointUrl,
				agentId: profile.agentId || "main",
				authToken: profile.apiKey,
				sessionKey: profile.sessionKey,
				autoApprove: profile.autoApprove ?? autoApprove,
				maxSteps: profile.maxSteps ?? maxSteps,
			},
			options.app,
		);
		const loop = new OpenResponsesLoop({
			agentApi,
			toolExecutor,
			maxSteps: profile.maxSteps ?? maxSteps,
			autoApprove: profile.autoApprove ?? autoApprove,
			maxToolResultTokens: options.maxToolResultTokens,
			requestResponseReserveTokens: options.requestResponseReserveTokens,
			onTextDelta,
			onToolCall,
			requestApproval,
			onToolResult,
			onTokenUpdate,
		});
		const text = await loop.run(
			messages as Array<{
				role: "user" | "assistant" | "system";
				content: string;
			}>,
			resolvedToolsToOpenResponses(toolRegistry),
			signal,
		);
		return {
			text,
			tokenEstimate: estimateTokens(text),
		};
	}

	const loop = new AgentLoop({
		chatApi,
		toolExecutor,
		maxSteps,
		autoApprove,
		maxRequestTokens: options.maxRequestTokens,
		maxContextMessages: options.maxContextMessages,
		preserveRecentMessages: options.preserveRecentMessages,
		requestResponseReserveTokens: options.requestResponseReserveTokens,
		maxToolResultTokens: options.maxToolResultTokens,
		profile,
		thinkingEnabled: options.thinkingEnabled,
		onTextDelta,
		onToolCall,
		requestApproval,
		onToolResult,
		onTokenUpdate,
	});

	const result = await loop.run(messages, toolRegistry.tools, signal);
	return {
		text: result.text,
		tokenEstimate: result.tokenEstimate,
		providerUsage: result.providerUsage,
	};
}
