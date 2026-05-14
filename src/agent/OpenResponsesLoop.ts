// src/agent/OpenResponsesLoop.ts
// Turn-based conversation loop for OpenResponses agent communication

import { AgentApiManager } from "../api/AgentApiManager";
import type { OpenResponsesEvent } from "../api/OpenResponsesParser";
import type { ToolExecutor } from "./ToolExecutor";
import type { ToolCall, ToolResult } from "./types";
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

		// Convert messages to OpenResponses input format
		const input = messages.map((m) => ({
			role: m.role,
			content: m.content,
		}));

		while (step < this.maxSteps) {
			step++;
			console.log(`[OpenResponsesLoop] Step ${step}/${this.maxSteps}`);

			// Reset accumulated text for this turn
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
						this.onTextDelta?.(this.accumulatedText);
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
				break;
			}

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
						this.onTextDelta?.(this.accumulatedText);
						break;
					case "finish":
						lastResponseId = event.response_id;
						break;
					case "error":
						throw new Error(event.message);
				}
			}

			finalText = this.accumulatedText;
		}

		if (step >= this.maxSteps) {
			console.warn(
				`[OpenResponsesLoop] Max steps (${this.maxSteps}) reached`,
			);
		}

		return finalText;
	}
}
