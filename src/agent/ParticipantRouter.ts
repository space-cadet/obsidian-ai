import type { ChatMessage } from "../types";
import type { SyncAdapter } from "../sync/SyncAdapter";
import { Orchestrator } from "./Orchestrator";

export interface Participant {
	type: "agent" | "remote" | "local";
	id: string;
	name: string;
}

/**
 * Routes messages to all participants in a chat — both AI agents and remote users.
 *
 * Step 1 wrapper: delegates agent dispatch to existing Orchestrator,
 * adds relay routing for remote users. If this works, we may refactor
 * Orchestrator to be participant-agnostic in Step 2.
 */
export class ParticipantRouter {
	constructor(
		private readonly orchestrator: Orchestrator,
		private readonly syncAdapter: SyncAdapter | null,
		private readonly localUserId: string,
	) {}

	/**
	 * Dispatch a user message to all participants.
	 *
	 * Yields agent responses as they arrive. Remote user messages are
	 * sent via relay (fire-and-forget, not yielded).
	 */
	async *dispatch(
		text: string,
		thread: ChatMessage[],
		participants: Participant[],
		signal?: AbortSignal,
	): AsyncGenerator<{
		agentId: string;
		agentName: string;
		agentColor: string;
		text: string;
		toolCalls?: Array<{
			call: import("./types").ToolCall;
			result?: import("./types").ToolResult;
		}>;
		tokenEstimate?: number;
		error?: string;
	}> {
		// 1. Route to agents via existing Orchestrator
		const agents = participants.filter((p) => p.type === "agent");
		if (agents.length > 0) {
			yield* this.orchestrator.dispatch(text, thread, signal);
		}

		// 2. Route to remote users via relay
		const remoteUsers = participants.filter((p) => p.type === "remote");
		if (remoteUsers.length > 0 && this.syncAdapter) {
			const relayMsg: ChatMessage = {
				id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
				role: "user",
				content: text,
				timestamp: Date.now(),
			};
			this.syncAdapter.sendMessage(relayMsg).catch((err) => {
				console.warn("[ParticipantRouter] Failed to send to relay:", err);
			});
		}
	}

	/**
	 * Parse @mentions and determine target participants.
	 * If no mentions: all participants respond.
	 * If mentions: only mentioned participants respond.
	 */
	parseAndRoute(
		text: string,
		participants: Participant[],
	): { targets: Participant[]; cleanText: string } {
		// For now, delegate mention parsing to Orchestrator for agents
		// and handle remote users separately
		const mentionRegex = /@(\w+)/g;
		const mentions: string[] = [];
		let match;
		while ((match = mentionRegex.exec(text)) !== null) {
			mentions.push(match[1]);
		}

		const cleanText = text.replace(mentionRegex, "").trim();

		if (mentions.length > 0) {
			const targets = participants.filter(
				(p) =>
					mentions.includes(p.id) || mentions.includes(p.name),
			);
			return {
				targets: targets.length > 0 ? targets : participants,
				cleanText,
			};
		}

		return { targets: participants, cleanText };
	}
}
