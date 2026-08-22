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
	private remoteUsers: string[] = [];

	constructor(
		private readonly orchestrator: Orchestrator | null,
		private readonly syncAdapter: SyncAdapter | null,
		private readonly localUserId: string,
	) {}

	/** Update the list of remote user IDs participating in this chat */
	setRemoteUsers(users: string[]) {
		this.remoteUsers = users;
		this.orchestrator?.setRemoteUsers(users);
	}

	/**
	 * Dispatch a user message to all participants.
	 *
	 * Yields agent responses as they arrive. Remote user messages are
	 * sent via relay (fire-and-forget, not yielded).
	 */
	async *dispatch(
		text: string,
		thread: ChatMessage[],
		signal?: AbortSignal,
		resolvedParts: import("../types").ResolvedMessagePart[] = [],
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
		providerUsage?: import("../types").ProviderTokenUsage;
		error?: string;
	}> {
		// Route to remote users immediately so relay delivery does not wait for
		// an agent response or fail when this is a human-only tab.
		if (this.remoteUsers.length > 0 && this.syncAdapter) {
			const relayMsg: ChatMessage = {
				id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
				role: "user",
				content: text,
				timestamp: Date.now(),
				resolvedParts:
					resolvedParts.length > 0 ? resolvedParts : undefined,
				remote: true,
				fromUserId: this.localUserId,
			};
			this.syncAdapter.sendMessage(relayMsg).catch((err) => {
				console.warn(
					"[ParticipantRouter] Failed to send to relay:",
					err,
				);
			});
		}

		// Route to agents via the existing Orchestrator when this tab has agents.
		if (this.orchestrator) {
			yield* this.orchestrator.dispatch(
				text,
				thread,
				signal,
				resolvedParts,
			);
		}
	}

	/**
	 * Parse @mentions and determine target participants.
	 * Delegates to Orchestrator for agent targets.
	 */
	parseAndRoute(
		text: string,
		attachments?: import("../types").Attachment[],
	): { targets: Array<{ id: string; name: string }>; cleanText: string } {
		if (this.orchestrator) {
			return this.orchestrator.parseAndRoute(text, attachments);
		}
		return { targets: [], cleanText: text };
	}
}
