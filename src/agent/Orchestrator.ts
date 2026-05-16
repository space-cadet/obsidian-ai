import { ChatApiManager } from "../api";
import { ChatMessage, GroupChatParticipant } from "../types";
import { ProviderProfile } from "../settings";
import { parseMentions, ParsedMention } from "./MentionParser";
import type { ToolCall, ToolResult } from "./types";

export type DispatchMode = "sequential" | "parallel";
export type ContextStrategy = "full" | "isolated";

export interface AgentResponse {
	agentId: string;
	agentName: string;
	agentColor: string;
	text: string;
	toolCalls?: Array<{ call: ToolCall; result?: ToolResult }>;
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
	parseAndRoute(text: string): { targets: AgentEngine[]; cleanText: string } {
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
	 * Build message context for a specific agent based on strategy.
	 */
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
	): AsyncGenerator<AgentResponse> {
		const { targets, cleanText } = this.parseAndRoute(text);

		if (this.mode === "parallel") {
			// Launch all in parallel, yield as they complete
			const promises = targets.map(async (engine) => {
				const response = await this.sendToAgent(engine, thread, cleanText);
				return response;
			});

			for (const promise of promises) {
				yield await promise;
			}
		} else {
			// Sequential: one at a time
			for (const engine of targets) {
				yield await this.sendToAgent(engine, thread, cleanText);
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
	): Promise<AgentResponse> {
		try {
			const messages = this.buildContext(engine.id, thread, cleanText);
			let fullText = "";

			// Simple non-tooling path for MVP
			const stream = this.api.streamChat(messages, undefined, engine.profile);
			for await (const chunk of stream) {
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
		return (
			`You are ${name}, participating in a group conversation with other AI assistants. ` +
			`Respond naturally as yourself. If you have nothing to add, say so briefly.` +
			`\n\nYou are integrated into an Obsidian note-taking app and can help with notes, research, and tasks.`
		);
	}
}
