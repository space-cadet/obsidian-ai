import { ChatApiManager } from "../api";
import { ChatMessage, GroupChatParticipant } from "../types";
import { ProviderProfile } from "../settings";
import { parseMentions, ParsedMention } from "./MentionParser";
import type { ToolCall, ToolResult } from "./types";
import { AgentLoop } from "./AgentLoop";
import { ToolExecutor } from "./ToolExecutor";
import { noteTools } from "./tools";

export type DispatchMode = "sequential" | "parallel";
export type ContextStrategy = "full" | "isolated";

export interface AgentResponse {
	agentId: string;
	agentName: string;
	agentColor: string;
	text: string;
	toolCalls?: Array<{ call: ToolCall; result?: ToolResult }>;
	tokenEstimate?: number;
	error?: string;
}

export interface AgentEngine {
	id: string;
	name: string;
	color: string;
	profile: ProviderProfile;
}

export interface OrchestratorOptions {
	api: ChatApiManager;
	participants: GroupChatParticipant[];
	mode?: DispatchMode;
	contextStrategy?: ContextStrategy;
	enableTools?: boolean;
	autoApprove?: boolean;
	maxSteps?: number;
	/** Tool executor for running Obsidian note tools. If provided with enableTools=true, agents will use tool calling. */
	toolExecutor?: ToolExecutor;
	/** IDs of remote users participating in this chat (relay user IDs) */
	remoteUsers?: string[];
}

/**
 * Coordinates multiple agent responses in a group chat.
 *
 * Usage:
 *   const orch = new Orchestrator({ api, participants });
 *   const responses = await orch.dispatch(userMessage, thread);
 */
export class Orchestrator {
	api: ChatApiManager;
	engines: AgentEngine[];
	mode: DispatchMode;
	contextStrategy: ContextStrategy;
	enableTools: boolean;
	autoApprove: boolean;
	maxSteps: number;
	toolExecutor?: ToolExecutor;

	constructor(options: OrchestratorOptions) {
		this.api = options.api;
		this.engines = options.participants.map((p) => ({
			id: p.id,
			name: p.name,
			color: p.color,
			profile: this.resolveProfile(p.profileId),
		}));
		this.mode = options.mode ?? "sequential";
		this.contextStrategy = options.contextStrategy ?? "full";
		this.enableTools = options.enableTools ?? false;
		this.autoApprove = options.autoApprove ?? false;
		this.maxSteps = options.maxSteps ?? 5;
		this.remoteUsers = options.remoteUsers ?? [];
	}

	remoteUsers: string[] = [];

	setRemoteUsers(users: string[]) {
		this.remoteUsers = users;
	}

	private resolveProfile(profileId: string): ProviderProfile {
		// This will be wired to plugin.settings.providerProfiles
		// For now, return a minimal stub — the caller should override
		return {
			id: profileId,
			name: profileId,
			provider: "custom",
			model: "default",
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};
	}

	/**
	 * Parse user input and determine target agents.
	 * If no mentions: all agents respond.
	 * If mentions: only mentioned agents respond.
	 */
	parseAndRoute(text: string, attachments?: import("../types").Attachment[]): { targets: AgentEngine[]; cleanText: string } {
		const parsed = parseMentions(text);
		if (parsed.mentions.length > 0) {
			const targets = this.engines.filter((e) =>
				parsed.mentions.includes(e.id) || parsed.mentions.includes(e.name),
			);
			return { targets: targets.length > 0 ? targets : this.engines, cleanText: parsed.cleanText };
		}
		return { targets: this.engines, cleanText: parsed.cleanText };
	}

	/**
	 * Run a multi-round debate where agents respond to each other.
	 * Round 1: all agents respond to user message.
	 * Round 2+: agents see all previous responses and can add follow-ups.
	 * Stops when maxRounds reached or no agent has anything to add.
	 */
	async *debate(
		text: string,
		thread: ChatMessage[],
		signal?: AbortSignal,
		maxRounds: number = 2,
	): AsyncGenerator<AgentResponse> {
		const { targets, cleanText } = this.parseAndRoute(text);
		const workingThread = [...thread];

		// Round 1: all agents respond to user
		const round1Responses: AgentResponse[] = [];
		for (const engine of targets) {
			const response = await this.sendToAgent(engine, workingThread, cleanText, signal);
			round1Responses.push(response);
			yield response;
			if (signal?.aborted) return;
		}

		// Add round 1 responses to thread context
		for (const r of round1Responses) {
			workingThread.push({
				id: `round1-${r.agentId}`,
				role: "assistant",
				content: r.text,
				timestamp: Date.now(),
				agentId: r.agentId,
				agentName: r.agentName,
				agentColor: r.agentColor,
			});
		}

		// Round 2+: agents can respond to each other
		for (let round = 2; round <= maxRounds; round++) {
			const roundResponses: AgentResponse[] = [];
			let anyResponse = false;

			for (const engine of targets) {
				// Ask agent if it wants to respond to the conversation
				const prompt = this.buildDebatePrompt(engine.name, round, round1Responses, cleanText);
				const response = await this.sendToAgent(engine, workingThread, prompt, signal);

				// Only include if agent actually wants to add something
				const trimmed = response.text.trim();
				if (trimmed && !this.isPass(trimmed)) {
					response.text = trimmed;
					roundResponses.push(response);
					yield response;
					anyResponse = true;
				}
				if (signal?.aborted) return;
			}

			if (!anyResponse) break; // No one had anything to say

			// Add round responses to thread
			for (const r of roundResponses) {
				workingThread.push({
					id: `round${round}-${r.agentId}`,
					role: "assistant",
					content: r.text,
					timestamp: Date.now(),
					agentId: r.agentId,
					agentName: r.agentName,
					agentColor: r.agentColor,
				});
			}
		}
	}

	private buildDebatePrompt(agentName: string, round: number, prevResponses: AgentResponse[], originalQuestion: string): string {
		const otherResponses = prevResponses
			.filter((r) => r.agentName !== agentName)
			.map((r) => `${r.agentName}: ${r.text}`)
			.join("\n\n");

		return (
			`The user asked: "${originalQuestion}"` +
			`\n\nOther assistants shared these perspectives:` +
			`\n\n${otherResponses}` +
			`\n\n---` +
			`\n\nBased on your knowledge and perspective, what would you add? ` +
			`Do you agree, disagree, want to correct something, or offer a different angle? ` +
			`Be concise (2-3 sentences).` +
			`\n\nIf you're satisfied with what's been said and have nothing new to add, reply with exactly: PASS` +
			`\n\nYour response:`
		);
	}

	private isPass(text: string): boolean {
		return /^\s*PASS\s*$/i.test(text) || /^\s*pass\s*$/i.test(text);
	}
	buildContext(
		agentId: string,
		thread: ChatMessage[],
		cleanText: string,
	): Array<{ role: "user" | "assistant" | "system"; content: string }> {
		const systemPrompt = this.buildSystemPrompt(agentId);
		const context: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
			{ role: "system", content: systemPrompt },
		];

		for (const msg of thread) {
			if (this.contextStrategy === "isolated") {
				// Isolated: agent only sees user messages + its own responses
				if (msg.role === "user" || msg.agentId === agentId) {
					context.push({
						role: msg.role === "user" ? "user" : "assistant",
						content: msg.content,
					});
				}
			} else {
				// Full transparency: agent sees everything with attribution
				let content = msg.content;
				if (msg.role === "assistant" && msg.agentName) {
					content = `[${msg.agentName}]: ${msg.content}`;
				}
				// Attribute remote user messages
				if (msg.role === "user" && msg.remote && msg.fromUserId && this.remoteUsers.includes(msg.fromUserId)) {
					content = `[Remote User ${msg.fromUserId}]: ${msg.content}`;
				}
				context.push({
					role: msg.role === "user" ? "user" : "assistant",
					content,
				});
			}
		}

		context.push({ role: "user", content: cleanText });
		return context;
	}

	/**
	 * Dispatch a user message to target agents.
	 * Returns responses as they arrive (streaming-compatible).
	 */
	async *dispatch(
		text: string,
		thread: ChatMessage[],
		signal?: AbortSignal,
	): AsyncGenerator<AgentResponse> {
		const { targets, cleanText } = this.parseAndRoute(text);

		if (this.mode === "parallel") {
			// Launch all in parallel, yield as they complete
			const promises = targets.map(async (engine) => {
				const response = await this.sendToAgent(engine, thread, cleanText, signal);
				return response;
			});

			for (const promise of promises) {
				yield await promise;
			}
		} else {
			// Sequential: one at a time
			for (const engine of targets) {
				yield await this.sendToAgent(engine, thread, cleanText, signal);
			}
		}
	}

	/**
	 * Send a message to a single agent and collect its response.
	 */
	private async sendToAgent(
		engine: AgentEngine,
		thread: ChatMessage[],
		cleanText: string,
		signal?: AbortSignal,
	): Promise<AgentResponse> {
		try {
			const messages = this.buildContext(engine.id, thread, cleanText);

			// Tool-enabled path: use AgentLoop (same as single-user chat)
			if (this.enableTools && this.toolExecutor) {
				let fullText = "";
				const toolCallsLog: Array<{ call: ToolCall; result?: ToolResult }> = [];

				const agent = new AgentLoop({
					chatApi: this.api,
					toolExecutor: this.toolExecutor,
					maxSteps: this.maxSteps,
					autoApprove: this.autoApprove,
					profile: engine.profile,
					onTextDelta: (text) => {
						fullText = text;
					},
					onToolCall: (call) => {
						toolCallsLog.push({ call });
					},
					requestApproval: async (call) => {
						// In group chat, auto-approve if enabled; otherwise reject with a note.
						// Manual approval UI for group chat is a future enhancement.
						if (this.autoApprove) {
							return await this.toolExecutor!.execute(call);
						}
						return { error: "Tool call rejected: manual approval is not supported in group chat. Enable auto-approve to use tools in council mode." };
					},
					onToolResult: (call, result) => {
						const idx = toolCallsLog.findIndex(
							(tc) => tc.call.toolCallId === call.toolCallId,
						);
						if (idx >= 0) {
							toolCallsLog[idx] = { ...toolCallsLog[idx], result };
						}
					},
				});

				const result = await agent.run(
					messages,
					noteTools,
					signal ?? new AbortController().signal,
				);

				return {
					agentId: engine.id,
					agentName: engine.name,
					agentColor: engine.color,
					text: result.text || fullText,
					toolCalls: toolCallsLog.length > 0 ? toolCallsLog : undefined,
					tokenEstimate: result.tokenEstimate,
				};
			}

			// Simple non-tooling path (original MVP behavior preserved)
			let fullText = "";
			const stream = this.api.streamChat(messages, undefined, engine.profile);
			for await (const chunk of stream) {
				if (signal?.aborted) break;
				fullText += chunk;
			}

			return {
				agentId: engine.id,
				agentName: engine.name,
				agentColor: engine.color,
				text: fullText,
			};
		} catch (error: any) {
			return {
				agentId: engine.id,
				agentName: engine.name,
				agentColor: engine.color,
				text: "",
				error: error.message || "Unknown error",
			};
		}
	}

	private buildSystemPrompt(agentId: string): string {
		const engine = this.engines.find((e) => e.id === agentId);
		const name = engine?.name ?? "Assistant";
		let prompt = (
			`You are ${name}, participating in a collaborative discussion with other AI assistants. ` +
			`You each bring different strengths and knowledge. ` +
			`When asked to compare or review other assistants' perspectives, offer your own view — ` +
			`agree, disagree, add nuance, or correct errors. This is normal collaborative discussion. ` +
			`Be concise and helpful.` +
			`\n\nYou are integrated into an Obsidian note-taking app and can help with notes, research, and tasks.`
		);

		// Add [Participants] section with agents and remote users
		prompt += "\n\n[Participants]";
		if (this.engines.length > 0) {
			prompt += `\n- AI assistants: ${this.engines.map((e) => e.name).join(", ")}`;
		}
		if (this.remoteUsers.length > 0) {
			prompt += `\n- Remote users: ${this.remoteUsers.join(", ")}`;
		}
		prompt += "\n\nMessages from other participants will be prefixed with their name.";

		if (this.enableTools) {
			prompt += (
				"\n\nYou have access to the following tools for managing Obsidian notes:" +
				"\n- read_note: Read the full content of a note. Use this before editing to understand current content." +
				"\n- edit_note: Overwrite the entire content of a note. Provide COMPLETE new content." +
				"\n- append_to_note: Add content to the end of a note without changing existing content." +
				"\n- create_note: Create a new note in the vault." +
				"\n- patch_note: Find and replace text inside a note (small precise edits)." +
				"\n- edit_section: Rewrite content under a specific heading." +
				"\n- search_notes: Search for notes by filename or path." +
				"\n- list_notes: Browse all notes in the vault or a folder." +
				"\n- get_note_metadata: Get file stats (size, dates, word count) for a specific note." +
				"\n- create_folder: Create a new folder in the vault." +
				"\n- move_note: Move or rename a note to a new folder or name." +
				"\n- delete_note: Delete a note from the vault." +
				"\n- list_folders: List folders in the vault." +
				"\n- search_past_sessions: Search the user's saved previous chat conversations by topic or keywords. This is for chat history, not vault notes." +
				"\n\nWhen the user asks to find, list, or search for notes, ALWAYS use search_notes or list_notes first." +
				" When the user asks whether you can search past sessions, chats, conversations, or what you discussed previously, say that you can search saved chat history and call search_past_sessions with the relevant keywords." +
				" Do not say you cannot search — you have the search_notes and list_notes tools." +
				" Before editing a note you are unfamiliar with, use read_note to see its current content." +
				"\n\nImportant: When using edit_note, provide the COMPLETE new note content." +
				" Do not use diff syntax or markdown code blocks."
			);
		}

		return prompt;
	}
}
