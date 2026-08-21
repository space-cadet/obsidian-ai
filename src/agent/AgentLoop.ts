import { ChatApiManager } from "../api";
import { ToolExecutor } from "./ToolExecutor";
import type { ToolCall, ToolResult, StreamEvent } from "./types";
import { estimateTokens } from "../context/tokenEstimator";
import type { ProviderProfile } from "../settings";

export interface AgentLoopOptions {
	chatApi: ChatApiManager;
	toolExecutor: ToolExecutor;
	maxSteps: number;
	autoApprove: boolean;
	/** Optional profile to use for API calls. */
	profile?: ProviderProfile;
	/** Whether to enable thinking/reasoning mode for LLM requests. */
	thinkingEnabled?: boolean;
	/** Called with accumulated text whenever a text-delta arrives. */
	onTextDelta: (accumulatedText: string) => void;
	/** Called when a tool call is detected (before execution/approval). */
	onToolCall: (call: ToolCall) => void;
	/** Called when a tool result is available (after execution/approval). */
	onToolResult?: (call: ToolCall, result: ToolResult) => void;
	/** Called with the running total token count after each step (tool call + result). */
	onTokenUpdate?: (runningTotal: number) => void;
	/** Called to request user approval. Return result to approve, null to reject. */
	requestApproval: (call: ToolCall) => Promise<ToolResult | null>;
}

export interface AgentLoopResult {
	text: string;
	tokenEstimate: number;
	stepsTaken: number;
	/** Token estimates for each step's assistant message (text + tool calls) */
	stepTokenEstimates?: number[];
}

/**
 * Formats a ToolResult into a human-readable markdown string based on the tool type.
 * This prevents the LLM from dumping raw JSON in its response.
 */
function formatToolResult(toolName: string, result: ToolResult): string {
	if (result.error) {
		return `Error: ${result.error}`;
	}

	switch (toolName) {
		case "search_notes": {
			const matches = result.matches ?? [];
			if (matches.length === 0) return "No matching notes found.";
			let md = `Found ${matches.length} note${matches.length !== 1 ? "s" : ""}:\n\n`;
			md += "| Note | Modified | Size |\n";
			md += "|------|----------|------|\n";
			for (const m of matches) {
				const date = m.modified
					? new Date(m.modified).toLocaleDateString()
					: "—";
				const wikiPath = m.path.replace(/\.md$/, "");
				md += `| [[${wikiPath}]] | ${date} | ${m.size ?? "—"} |\n`;
			}
			return md;
		}

		case "list_notes": {
			const notes = result.notes ?? [];
			if (notes.length === 0) return "No notes found in this location.";
			let md = `${result.count ?? notes.length} note${notes.length !== 1 ? "s" : ""} in ${result.folder ?? "vault"}:\n\n`;
			md += "| Note | Modified | Size |\n";
			md += "|------|----------|------|\n";
			for (const n of notes) {
				const date = n.modified
					? new Date(n.modified).toLocaleDateString()
					: "—";
				const wikiPath = n.path.replace(/\.md$/, "");
				md += `| [[${wikiPath}]] | ${date} | ${n.size ?? "—"} |\n`;
			}
			return md;
		}

		case "list_folders": {
			const folders = result.folders ?? [];
			if (folders.length === 0) return "No subfolders found.";
			let md = `${folders.length} folder${folders.length !== 1 ? "s" : ""} under ${result.parent ?? "root"}:\n\n`;
			for (const f of folders) {
				md += `- ${f}\n`;
			}
			return md;
		}

		case "get_note_metadata": {
			const date = (ts: number | undefined) =>
				ts ? new Date(ts).toLocaleString() : "—";
			const wikiPath = (result.path ?? "").replace(/\.md$/, "");
			return (
				`**[[${wikiPath}]]**\n\n` +
				`- Size: ${result.size ?? "—"} bytes\n` +
				`- Created: ${date(result.created)}\n` +
				`- Modified: ${date(result.modified)}\n` +
				`- Words: ${result.wordCount ?? "—"}`
			);
		}

		case "read_note": {
			let output = result.content ?? "(empty note)";
			if (result.warning) {
				output = `\n\n> ${result.warning}\n\n---\n\n` + output;
			}
			return output;
		}

		case "create_notes": {
			const created = result.createdPaths?.length ?? result.count ?? 0;
			const skipped = result.skippedPaths?.length ?? 0;
			return result.success
				? `✓ create_notes completed: created ${created} new note${created === 1 ? "" : "s"}${skipped ? `; skipped ${skipped} already-existing note${skipped === 1 ? "" : "s"}` : ""}.`
				: `✗ create_notes failed: ${result.error ?? "unknown error"}`;
		}
		case "create_note":
		case "edit_note":
		case "append_to_note":
		case "patch_note":
		case "edit_section":
		case "create_folder":
		case "move_note":
		case "delete_note":
			return result.success
				? `✓ ${toolName.replace(/_/g, " ")} completed successfully.`
				: `✗ ${toolName.replace(/_/g, " ")} failed: ${result.error ?? "unknown error"}`;

		default:
			return JSON.stringify(result, null, 2);
	}
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
		const stepTokenEstimates: number[] = [];

		let runningTotal = 0;

		for (let step = 0; step < maxSteps; step++) {
			let stepText = "";
			let stepReasoning = "";
			let pendingCall: ToolCall | null = null;

			for await (const event of chatApi.streamChatWithTools(
				currentMessages,
				tools,
				signal,
				this.opts.profile,
				this.opts.thinkingEnabled,
			)) {
				if (signal.aborted) break;

				switch (event.type) {
					case "text-delta":
						stepText += event.text;
						fullText += event.text;
						onTextDelta(fullText);
						// Incremental token counting during streaming
						runningTotal += estimateTokens(event.text);
						this.opts.onTokenUpdate?.(runningTotal);
						break;
					case "reasoning-delta":
						stepReasoning += event.text;
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
				// Text already counted incrementally during streaming
				this.opts.onTokenUpdate?.(runningTotal);
				break;
			}

			if (!pendingCall) {
				console.log(
					`[AgentLoop] done — no tool call at step ${step}, ${fullText.length} chars`,
				);
				// Text already counted incrementally during streaming
				this.opts.onTokenUpdate?.(runningTotal);
				break;
			}

			console.log(
				`[AgentLoop] step ${step} tool-call: ${pendingCall.toolName}`,
				pendingCall.args,
			);
			this.opts.onToolCall(pendingCall);

			// Count tokens for tool call args only (text already counted incrementally)
			const toolCallTokens = estimateTokens(
				JSON.stringify(pendingCall.args),
			);
			runningTotal += toolCallTokens;
			this.opts.onTokenUpdate?.(runningTotal);

			let result: ToolResult;
			if (autoApprove) {
				result = await toolExecutor.execute(pendingCall);
			} else {
				result = (await this.opts.requestApproval(pendingCall)) ?? {
					error: "User rejected the tool call",
				};
			}

			console.log(
				`[AgentLoop] step ${step} tool-result:`,
				result.error ?? "success",
			);
			this.opts.onToolResult?.(pendingCall, result);

			// Build assistant message (text + tool call only — reasoning is NOT included
			// because the Vercel AI SDK's OpenAI provider strips reasoning parts when
			// converting to the API format, causing "reasoning_content missing" errors)
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
				// Gemini function calls include a thought signature in provider metadata.
				// Preserve it on the original call part for the next agent step.
				providerMetadata: pendingCall.providerMetadata,
			});

			const assistantMsg: any = {
				role: "assistant",
				content: assistantParts,
			};

			// Build tool result message with formatted text (not raw JSON)
			const formattedResult = formatToolResult(
				pendingCall.toolName,
				result,
			);
			const toolMsg: any = {
				role: "tool",
				content: [
					{
						type: "tool-result",
						toolCallId: pendingCall.toolCallId,
						toolName: pendingCall.toolName,
						output: {
							type: "text",
							value: formattedResult,
						},
					},
				],
			};

			currentMessages = [...currentMessages, assistantMsg, toolMsg];

			// Count tokens for tool result
			const resultTokens = estimateTokens(formattedResult);
			runningTotal += resultTokens;
			this.opts.onTokenUpdate?.(runningTotal);

			// Track tokens for this step: tool call args + tool result (text counted incrementally)
			stepTokenEstimates.push(toolCallTokens + resultTokens);
		}

		// No more tool calls — compute final total.
		const totalTokens =
			runningTotal > 0 ? runningTotal : estimateTokens(fullText);

		// Report final total
		this.opts.onTokenUpdate?.(totalTokens);

		return {
			text: fullText,
			tokenEstimate: totalTokens,
			stepsTaken: maxSteps, // Simplified; could track actual
			stepTokenEstimates,
		};
	}
}
