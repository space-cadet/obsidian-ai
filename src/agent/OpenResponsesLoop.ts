// src/agent/OpenResponsesLoop.ts
// Turn-based conversation loop for OpenResponses agent communication

import { AgentApiManager } from "../api/AgentApiManager";
import type { OpenResponsesEvent } from "../api/OpenResponsesParser";
import type { ToolExecutor } from "./ToolExecutor";
import type { ToolCall, ToolResult } from "./types";
import { estimateTokens } from "../context/tokenEstimator";
import type { OpenResponsesTool } from "../api/AgentApiManager";

interface OpenResponsesLoopOptions {
	agentApi: AgentApiManager;
	toolExecutor: ToolExecutor;
	maxSteps: number;
	autoApprove: boolean;
	onTextDelta?: (text: string) => void;
	onToolCall?: (call: ToolCall) => void;
	requestApproval?: (call: ToolCall) => Promise<ToolResult | null>;
	onToolResult?: (call: ToolCall, result: ToolResult) => void;
	onTokenUpdate?: (runningTotal: number) => void;
}

export class OpenResponsesLoop {
	private agentApi: AgentApiManager;
	private toolExecutor: ToolExecutor;
	private maxSteps: number;
	private autoApprove: boolean;
	private onTextDelta?: (text: string) => void;
	private onToolCall?: (call: ToolCall) => void;
	private requestApproval?: (call: ToolCall) => Promise<ToolResult | null>;
	private onToolResult?: (call: ToolCall, result: ToolResult) => void;
	private onTokenUpdate?: (runningTotal: number) => void;

	private accumulatedText = "";
	private pendingFunctionCalls: Map<
		string,
		{ name: string; arguments: string }
	> = new Map();

	constructor(options: OpenResponsesLoopOptions) {
		this.agentApi = options.agentApi;
		this.toolExecutor = options.toolExecutor;
		this.maxSteps = options.maxSteps;
		this.autoApprove = options.autoApprove;
		this.onTextDelta = options.onTextDelta;
		this.onToolCall = options.onToolCall;
		this.requestApproval = options.requestApproval;
		this.onToolResult = options.onToolResult;
		this.onTokenUpdate = options.onTokenUpdate;
	}

	/**
	 * Run the agent loop.
	 *
	 * Flow:
	 * 1. Send user messages to agent
	 * 2. Stream response → collect text + function_call events
	 * 3. If function_call detected → execute tool → send result → continue
	 * 4. Repeat until no more function_calls or maxSteps reached
	 */
	public async run(
		messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
		tools: OpenResponsesTool[],
		signal?: AbortSignal,
	): Promise<string> {
		let step = 0;
		let finalText = "";
		let lastResponseId = "";
		const stepTokenEstimates: number[] = [];

		// Convert messages to OpenResponses input format
		const input = messages.map((m) => ({
			role: m.role,
			content: m.content,
		}));

		let runningTotal = 0;
		let totalAccumulatedText = ""; // Track text across all steps for UI

		while (step < this.maxSteps) {
			step++;
			console.log(`[OpenResponsesLoop] Step ${step}/${this.maxSteps}`);

			// Reset accumulated text for this turn (but keep totalAccumulatedText for UI)
			this.accumulatedText = "";
			this.pendingFunctionCalls.clear();

			// Stream response from agent
			for await (const event of this.agentApi.streamAgentResponse(
				{
					input,
					tools,
					stream: true,
				},
				signal,
			)) {
				if (signal?.aborted) break;

				switch (event.type) {
					case "text-delta":
						this.accumulatedText += event.delta;
						totalAccumulatedText += event.delta;
						this.onTextDelta?.(totalAccumulatedText);
						// Incremental token counting during streaming
						runningTotal += estimateTokens(event.delta);
						this.onTokenUpdate?.(runningTotal);
						break;

					case "function_call":
						// Collect partial function calls (arguments may be streamed)
						this.pendingFunctionCalls.set(event.call_id, {
							name: event.name,
							arguments: event.arguments,
						});
						break;

					case "function_call_done":
						// Complete function call — update with final arguments
						this.pendingFunctionCalls.set(event.call_id, {
							name: event.name,
							arguments: event.arguments,
						});
						break;

					case "finish":
						lastResponseId = event.response_id;
						break;

					case "error":
						throw new Error(event.message);
				}
			}

			// Store text accumulated in this step
			finalText = this.accumulatedText;

			// Check if any function calls need execution
			if (this.pendingFunctionCalls.size === 0) {
				// No tool calls — conversation is complete
				console.log("[OpenResponsesLoop] No function calls — done");
				// Text already counted incrementally during streaming
				this.onTokenUpdate?.(runningTotal);
				break;
			}

			// Tool call detected — count args only (text already counted incrementally)
			const stepArgsTokens = Array.from(this.pendingFunctionCalls.values())
				.reduce((sum, fc) => sum + estimateTokens(fc.arguments || ""), 0);
			runningTotal += stepArgsTokens;
			this.onTokenUpdate?.(runningTotal);

			// Execute pending function calls
			const functionCallOutputs: Array<{ call_id: string; output: string }> =
				[];

			for (const [call_id, fc] of this.pendingFunctionCalls) {
				let args: Record<string, unknown>;
				try {
					args = JSON.parse(fc.arguments || "{}");
				} catch {
					args = {};
				}

				const toolCall: ToolCall = {
					toolCallId: call_id,
					toolName: fc.name,
					args,
				};

				this.onToolCall?.(toolCall);

				let result: ToolResult;

				if (this.autoApprove) {
					result = await this.toolExecutor.execute(toolCall);
				} else {
					const approved = await this.requestApproval?.(toolCall);
					if (approved) {
						result = approved;
					} else {
						result = {
							success: false,
							content: "Tool call rejected by user.",
							error: "Rejected",
						};
					}
				}

				this.onToolResult?.(toolCall, result);

				// Format result for OpenResponses
				functionCallOutputs.push({
					call_id,
					output: JSON.stringify({
						success: result.success ?? !result.error,
						content: result.content,
						error: result.error,
						...result, // include all other fields
					}),
				});
			}

			// Send tool results back to agent for continuation
			console.log(
				`[OpenResponsesLoop] Sending ${functionCallOutputs.length} tool results for step ${step + 1}`,
			);

			// Count tool results
			const stepResultTokens = functionCallOutputs
				.reduce((sum, output) => sum + estimateTokens(output.output), 0);
			runningTotal += stepResultTokens;
			this.onTokenUpdate?.(runningTotal);

			// Continue streaming with tool results
			for await (const event of this.agentApi.continueWithToolResult(
				lastResponseId,
				functionCallOutputs,
				signal,
			)) {
				if (signal?.aborted) break;

				switch (event.type) {
					case "text-delta":
						this.accumulatedText += event.delta;
						totalAccumulatedText += event.delta;
						this.onTextDelta?.(totalAccumulatedText);
						// Incremental token counting during streaming
						runningTotal += estimateTokens(event.delta);
						this.onTokenUpdate?.(runningTotal);
						break;
					case "finish":
						lastResponseId = event.response_id;
						break;
					case "error":
						throw new Error(event.message);
				}
			}

			finalText = this.accumulatedText;
			// Text already counted incrementally during streaming; no need to re-count
			this.onTokenUpdate?.(runningTotal);

			// Track tokens for this step: args + tool results (text counted incrementally)
			stepTokenEstimates.push(stepArgsTokens + stepResultTokens);
		}

		if (step >= this.maxSteps) {
			console.warn(
				`[OpenResponsesLoop] Max steps (${this.maxSteps}) reached`,
			);
		}

		const totalTokens = runningTotal > 0 ? runningTotal : estimateTokens(finalText);
		this.onTokenUpdate?.(totalTokens);

		return finalText;
	}
}
