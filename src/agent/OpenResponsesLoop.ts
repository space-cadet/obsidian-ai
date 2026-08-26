// src/agent/OpenResponsesLoop.ts
// Turn-based conversation loop for OpenResponses agent communication

import { AgentApiManager } from "../api/AgentApiManager";
import type { OpenResponsesEvent } from "../api/OpenResponsesParser";
import type { ToolExecutor } from "./ToolExecutor";
import type { ToolCall, ToolResult } from "./types";
import { estimateTokens } from "../context/tokenEstimator";
import { truncateTextForTokens } from "../context/contextBudget";
import type { OpenResponsesTool } from "../api/AgentApiManager";
import {
	beginDiagnosticStep,
	finishDiagnosticStep,
	makeDiagnosticRequest,
	measureDiagnosticValue,
	type ChatDiagnosticStep,
} from "../diagnostics";

function abortError(): DOMException {
	return new DOMException("Generation was stopped.", "AbortError");
}

interface OpenResponsesLoopOptions {
	agentApi: AgentApiManager;
	toolExecutor: ToolExecutor;
	maxSteps: number;
	autoApprove: boolean;
	maxToolResultTokens?: number;
	/** Shared token allowance for all outputs in one continuation. */
	requestResponseReserveTokens?: number;
	onTextDelta?: (text: string) => void;
	onToolCall?: (call: ToolCall) => void;
	requestApproval?: (call: ToolCall) => Promise<ToolResult | null>;
	onToolResult?: (call: ToolCall, result: ToolResult) => void;
	onTokenUpdate?: (runningTotal: number) => void;
	onDiagnosticStep?: (step: ChatDiagnosticStep) => void;
}

export class OpenResponsesLoop {
	private agentApi: AgentApiManager;
	private toolExecutor: ToolExecutor;
	private maxSteps: number;
	private autoApprove: boolean;
	private maxToolResultTokens: number;
	private requestResponseReserveTokens: number;
	private onTextDelta?: (text: string) => void;
	private onToolCall?: (call: ToolCall) => void;
	private requestApproval?: (call: ToolCall) => Promise<ToolResult | null>;
	private onToolResult?: (call: ToolCall, result: ToolResult) => void;
	private onTokenUpdate?: (runningTotal: number) => void;
	private onDiagnosticStep?: (step: ChatDiagnosticStep) => void;

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
		this.maxToolResultTokens = options.maxToolResultTokens ?? 4000;
		this.requestResponseReserveTokens =
			options.requestResponseReserveTokens ?? 4096;
		this.onTextDelta = options.onTextDelta;
		this.onToolCall = options.onToolCall;
		this.requestApproval = options.requestApproval;
		this.onToolResult = options.onToolResult;
		this.onTokenUpdate = options.onTokenUpdate;
		this.onDiagnosticStep = options.onDiagnosticStep;
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
		messages: Array<{
			role: "user" | "assistant" | "system";
			content: string;
		}>,
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
		let diagnosticStepNumber = 1;
		let activeDiagnosticStep: ChatDiagnosticStep | undefined;

		const consumeStream = async (
			events: AsyncIterable<OpenResponsesEvent>,
			diagnosticStep?: ChatDiagnosticStep,
		): Promise<void> => {
			// Reset per-response state, but keep totalAccumulatedText for the UI.
			this.accumulatedText = "";
			this.pendingFunctionCalls.clear();

			try {
				for await (const event of events) {
					if (signal?.aborted) throw abortError();

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
							if (diagnosticStep) {
								diagnosticStep.providerUsage = event.usage
									? {
											inputTokens:
												event.usage.input_tokens,
											outputTokens:
												event.usage.output_tokens,
											totalTokens:
												event.usage.total_tokens,
										}
									: undefined;
								diagnosticStep.finishReason = "completed";
							}
							break;

						case "error":
							throw new Error(event.message);
					}
				}
			} catch (error) {
				if (signal?.aborted && diagnosticStep) {
					this.onDiagnosticStep?.(
						finishDiagnosticStep(diagnosticStep, {
							response: diagnosticStep.response,
							providerUsage: diagnosticStep.providerUsage,
							finishReason: "aborted",
						}),
					);
				}
				throw error;
			}

			finalText = this.accumulatedText;
			if (diagnosticStep) {
				diagnosticStep.response = {
					text: this.accumulatedText,
					toolCalls: Array.from(
						this.pendingFunctionCalls.entries(),
					).map(([call_id, call]) => ({ call_id, ...call })),
					responseId: lastResponseId || undefined,
				};
			}
		};

		activeDiagnosticStep = this.onDiagnosticStep
			? beginDiagnosticStep(
					1,
					"initial",
					makeDiagnosticRequest("openresponses", input, tools, {
						stream: true,
					}),
				)
			: undefined;

		// The original request must be sent exactly once. Every subsequent
		// response is obtained through a stateful function-call continuation.
		await consumeStream(
			this.agentApi.streamAgentResponse(
				{
					input,
					tools,
					stream: true,
				},
				signal,
			),
			activeDiagnosticStep,
		);
		if (activeDiagnosticStep && this.pendingFunctionCalls.size === 0) {
			this.onDiagnosticStep?.(
				finishDiagnosticStep(activeDiagnosticStep, {
					response: activeDiagnosticStep.response,
					providerUsage: activeDiagnosticStep.providerUsage,
					finishReason: activeDiagnosticStep.finishReason,
				}),
			);
			activeDiagnosticStep = undefined;
		}

		while (
			this.pendingFunctionCalls.size > 0 &&
			step < this.maxSteps &&
			!signal?.aborted
		) {
			step++;
			console.log(
				`[OpenResponsesLoop] Tool round ${step}/${this.maxSteps}`,
			);

			// Tool call detected — count args only (text already counted incrementally)
			const stepArgsTokens = Array.from(
				this.pendingFunctionCalls.values(),
			).reduce((sum, fc) => sum + estimateTokens(fc.arguments || ""), 0);
			runningTotal += stepArgsTokens;
			this.onTokenUpdate?.(runningTotal);

			// Execute pending function calls
			const rawFunctionCallOutputs: Array<{
				call_id: string;
				output: string;
			}> = [];
			const diagnosticExchanges: NonNullable<
				ChatDiagnosticStep["toolExchanges"]
			> = [];

			for (const [call_id, fc] of this.pendingFunctionCalls) {
				let args: Record<string, unknown>;
				let argumentError: string | undefined;
				try {
					args = JSON.parse(fc.arguments || "{}");
					if (
						!args ||
						typeof args !== "object" ||
						Array.isArray(args)
					) {
						argumentError = "tool arguments must be a JSON object";
						args = {};
					}
				} catch {
					argumentError = "tool arguments are not valid JSON";
					args = {};
				}

				const toolCall: ToolCall = {
					toolCallId: call_id,
					toolName: fc.name,
					args,
				};

				this.onToolCall?.(toolCall);

				let result: ToolResult;

				if (argumentError) {
					result = { error: `Invalid arguments: ${argumentError}` };
				} else if (this.autoApprove) {
					result = await this.toolExecutor.execute(toolCall, signal);
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
				const output = JSON.stringify({
					success: result.success ?? !result.error,
					content: result.content,
					error: result.error,
					...result, // include all other fields
				});
				rawFunctionCallOutputs.push({
					call_id,
					output,
				});
				diagnosticExchanges.push({
					call: toolCall,
					rawResult: result,
					replayedResult: output,
					truncated:
						output !==
						JSON.stringify({
							success: result.success ?? !result.error,
							content: result.content,
							error: result.error,
							...result,
						}),
					rawResultSize: measureDiagnosticValue(result),
					replayedResultSize: measureDiagnosticValue(output),
				});
			}
			if (signal?.aborted) throw abortError();

			// The full results remain available through onToolResult and the
			// persisted transcript. Share the continuation allowance across all
			// outputs so parallel tool calls cannot multiply the configured budget.
			const sharedBudget =
				this.maxToolResultTokens > 0 &&
				this.requestResponseReserveTokens > 0
					? Math.min(
							this.maxToolResultTokens *
								rawFunctionCallOutputs.length,
							this.requestResponseReserveTokens,
						)
					: this.maxToolResultTokens;
			const perOutputBudget =
				rawFunctionCallOutputs.length > 0 && sharedBudget > 0
					? Math.max(
							1,
							Math.floor(
								sharedBudget / rawFunctionCallOutputs.length,
							),
						)
					: sharedBudget;
			const functionCallOutputs = rawFunctionCallOutputs.map(
				(output) => ({
					call_id: output.call_id,
					output: truncateTextForTokens(
						output.output,
						perOutputBudget,
					),
				}),
			);
			for (let index = 0; index < diagnosticExchanges.length; index++) {
				diagnosticExchanges[index].replayedResult =
					functionCallOutputs[index].output;
				diagnosticExchanges[index].replayedResultSize =
					measureDiagnosticValue(functionCallOutputs[index].output);
				diagnosticExchanges[index].truncated =
					functionCallOutputs[index].output !==
					rawFunctionCallOutputs[index].output;
			}

			if (activeDiagnosticStep) {
				const completedStep = finishDiagnosticStep(
					activeDiagnosticStep,
					{
						response: activeDiagnosticStep.response,
						toolExchanges: diagnosticExchanges,
						providerUsage: activeDiagnosticStep.providerUsage,
						finishReason: activeDiagnosticStep.finishReason,
					},
				);
				this.onDiagnosticStep?.(completedStep);
				activeDiagnosticStep = undefined;
			}

			// Send tool results back to agent for continuation
			console.log(
				`[OpenResponsesLoop] Sending ${functionCallOutputs.length} tool results for step ${step + 1}`,
			);
			if (!lastResponseId) {
				throw new Error(
					"Cannot continue OpenResponses request without a response ID.",
				);
			}

			// Count tool results
			const stepResultTokens = functionCallOutputs.reduce(
				(sum, output) => sum + estimateTokens(output.output),
				0,
			);
			runningTotal += stepResultTokens;
			this.onTokenUpdate?.(runningTotal);

			// Continue streaming with tool results. consumeStream handles tool
			// calls here as well, allowing multi-round tool chains to remain on
			// the stateful continuation path.
			activeDiagnosticStep = this.onDiagnosticStep
				? beginDiagnosticStep(
						diagnosticStepNumber + 1,
						"tool",
						makeDiagnosticRequest(
							"openresponses",
							functionCallOutputs.map((output) => ({
								type: "function_call_output",
								...output,
							})),
							tools,
							{
								previousResponseId: lastResponseId,
								stream: true,
							},
						),
					)
				: undefined;
			await consumeStream(
				this.agentApi.continueWithToolResult(
					lastResponseId,
					functionCallOutputs,
					tools,
					signal,
				),
				activeDiagnosticStep,
			);
			if (activeDiagnosticStep) {
				const completedStep = finishDiagnosticStep(
					activeDiagnosticStep,
					{
						response: activeDiagnosticStep.response,
						providerUsage: activeDiagnosticStep.providerUsage,
						finishReason: activeDiagnosticStep.finishReason,
					},
				);
				this.onDiagnosticStep?.(completedStep);
				activeDiagnosticStep = undefined;
				diagnosticStepNumber++;
			}
			// Text already counted incrementally during streaming; no need to re-count
			this.onTokenUpdate?.(runningTotal);

			// Track tokens for this step: args + tool results (text counted incrementally)
			stepTokenEstimates.push(stepArgsTokens + stepResultTokens);
		}

		if (this.pendingFunctionCalls.size > 0 && step >= this.maxSteps) {
			console.warn(
				`[OpenResponsesLoop] Max steps (${this.maxSteps}) reached`,
			);
		}
		if (activeDiagnosticStep) {
			this.onDiagnosticStep?.(
				finishDiagnosticStep(activeDiagnosticStep, {
					response: activeDiagnosticStep.response,
					providerUsage: activeDiagnosticStep.providerUsage,
					finishReason: activeDiagnosticStep.finishReason,
				}),
			);
		}

		const totalTokens =
			runningTotal > 0 ? runningTotal : estimateTokens(finalText);
		this.onTokenUpdate?.(totalTokens);

		return finalText;
	}
}
