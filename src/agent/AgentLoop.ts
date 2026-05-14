import { ChatApiManager } from "../api";
import { ToolExecutor } from "./ToolExecutor";
import type { ToolCall, ToolResult, StreamEvent } from "./types";
import { estimateTokens } from "../context/tokenEstimator";

export interface AgentLoopOptions {
	chatApi: ChatApiManager;
	toolExecutor: ToolExecutor;
	maxSteps: number;
	autoApprove: boolean;
	/** Called with accumulated text whenever a text-delta arrives. */
	onTextDelta: (accumulatedText: string) => void;
	/** Called when a tool call is detected (before execution/approval). */
	onToolCall: (call: ToolCall) => void;
	/** Called to request user approval. Return result to approve, null to reject. */
	requestApproval: (call: ToolCall) => Promise<ToolResult | null>;
}

export interface AgentLoopResult {
	text: string;
	tokenEstimate: number;
	stepsTaken: number;
}

/**
 * Orchestrates multi-step tool calling with the Vercel AI SDK.
 *
 * Each call to `run()` performs up to `maxSteps` iterations of:
 *   1. Stream LLM response with tools enabled (single step via stopWhen)
 *   2. Detect tool calls from the stream
 *   3. Execute tool (auto-approved or via user confirmation)
 *   4. Feed tool result back into the conversation
 *   5. Repeat until no more tool calls or maxSteps reached
 *
 * The caller (ChatApp) owns UI state; AgentLoop only handles the
 * stream → tool → result → stream cycle.
 */
export class AgentLoop {
	private opts: AgentLoopOptions;

	constructor(opts: AgentLoopOptions) {
		this.opts = opts;
	}

	/**
	 * Runs the agent loop with the given initial messages and tools.
	 *
	 * @param messages - Conversation messages (system + history + user)
	 * @param tools - Tool definitions registry
	 * @param signal - AbortSignal for cancellation
	 * @returns Final accumulated text and metadata
	 */
	async run(
		messages: Array<any>,
		tools: any,
		signal: AbortSignal,
	): Promise<AgentLoopResult> {
		const { chatApi, toolExecutor, maxSteps, autoApprove, onTextDelta } =
			this.opts;

		let fullText = "";
		let currentMessages = messages;

		for (let step = 0; step < maxSteps; step++) {
			let stepText = "";
			let pendingCall: ToolCall | null = null;

			for await (const event of chatApi.streamChatWithTools(
				currentMessages,
				tools,
				signal,
			)) {
				if (signal.aborted) break;

				switch (event.type) {
					case "text-delta":
						stepText += event.text;
						fullText += event.text;
						onTextDelta(fullText);
						break;
					case "tool-call":
						pendingCall = event.call;
						break;
					case "error":
						throw new Error(event.message);
					case "tool-error":
						console.warn(
							`[AgentLoop] tool-error from stream: ${event.callId} — ${event.error}`,
						);
						break;
					// finish, tool-result from stream are mostly bookkeeping
					default:
						break;
				}
			}

			if (signal.aborted) {
				console.log("[AgentLoop] aborted during step", step);
				break;
			}

			if (!pendingCall) {
				console.log(
					`[AgentLoop] done — no tool call at step ${step}, ${fullText.length} chars`,
				);
				break;
			}

			console.log(
				`[AgentLoop] step ${step} tool-call: ${pendingCall.toolName}`,
				pendingCall.args,
			);
			this.opts.onToolCall(pendingCall);

			let result: ToolResult;
			if (autoApprove) {
				result = await toolExecutor.execute(pendingCall);
			} else {
				result =
					(await this.opts.requestApproval(pendingCall)) ?? {
						error: "User rejected the tool call",
					};
			}

			console.log(
				`[AgentLoop] step ${step} tool-result:`,
				result.error ?? "success",
			);

			// Build assistant message (text + tool call)
			const assistantParts: Array<{
				type: string;
				[key: string]: unknown;
			}> = [];
			if (stepText) {
				assistantParts.push({ type: "text", text: stepText });
			}
			assistantParts.push({
				type: "tool-call",
				toolCallId: pendingCall.toolCallId,
				toolName: pendingCall.toolName,
				input: pendingCall.args,
			});

			const assistantMsg: any = {
				role: "assistant",
				content: assistantParts,
			};

			// Build tool result message
			const toolResultOutput = result.error
				? { type: "json", value: { error: result.error } }
				: { type: "json", value: result };

			const toolMsg: any = {
				role: "tool",
				content: [
					{
						type: "tool-result",
						toolCallId: pendingCall.toolCallId,
						toolName: pendingCall.toolName,
						output: toolResultOutput,
					},
				],
			};

			currentMessages = [
				...currentMessages,
				assistantMsg,
				toolMsg,
			];
		}

		return {
			text: fullText,
			tokenEstimate: estimateTokens(fullText),
			stepsTaken: maxSteps, // Simplified; could track actual
		};
	}
}
