// src/api/AgentApiManager.ts
// OpenResponses API client for connecting to remote OpenClaw agents

import { App, Notice } from "obsidian";
import {
	parseOpenResponsesStream,
	parseSseEvent,
	type OpenResponsesEvent,
} from "./OpenResponsesParser";

export interface AgentProviderProfile {
	id: string;
	name: string;
	provider: "agent";
	endpointUrl: string;
	authToken?: string;
	agentId: string;
	sessionKey?: string;
	autoApprove: boolean;
	maxSteps: number;
	model: string; // e.g. "openclaw"
}

export interface AgentApiOptions {
	input: string | Array<OpenResponsesInputItem>;
	model?: string;
	instructions?: string;
	tools?: Array<OpenResponsesTool>;
	stream?: boolean;
	maxOutputTokens?: number;
}

export type OpenResponsesInputItem =
	| { role: "user" | "assistant" | "system"; content: string }
	| { type: "function_call_output"; call_id: string; output: string };

export interface OpenResponsesTool {
	type: "function";
	function: {
		name: string;
		description?: string;
		parameters?: object;
	};
}

export interface AgentStreamResult {
	text: string;
	responseId: string;
	functionCalls: Array<{
		call_id: string;
		name: string;
		arguments: Record<string, unknown>;
	}>;
	usage?: {
		input_tokens?: number;
		output_tokens?: number;
		total_tokens?: number;
	};
}

/**
 * Manages connections to remote OpenClaw agents via the OpenResponses API.
 */
export class AgentApiManager {
	private profile: AgentProviderProfile;
	private app: App;

	constructor(profile: AgentProviderProfile, app: App) {
		this.profile = profile;
		this.app = app;
	}

	/**
	 * Streams a conversation with the agent.
	 * Yields text deltas and function call events.
	 */
	public async *streamAgentResponse(
		options: AgentApiOptions,
		signal?: AbortSignal,
	): AsyncIterable<OpenResponsesEvent> {
		const url = this.profile.endpointUrl;

		const body: Record<string, unknown> = {
			model: options.model || this.profile.model || "openclaw",
			input: options.input,
		};

		if (options.instructions) {
			body.instructions = options.instructions;
		}
		if (options.tools && options.tools.length > 0) {
			body.tools = options.tools;
		}
		if (options.stream !== false) {
			body.stream = true;
		}
		if (options.maxOutputTokens) {
			body.max_output_tokens = options.maxOutputTokens;
		}
		// Session continuity: derive stable session from profile sessionKey
		if (this.profile.sessionKey) {
			body.user = this.profile.sessionKey;
		}

		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (this.profile.authToken) {
			headers["Authorization"] = `Bearer ${this.profile.authToken}`;
		}
		if (this.profile.agentId) {
			headers["x-openclaw-agent-id"] = this.profile.agentId;
		}

		try {
			const response = await fetch(url, {
				method: "POST",
				headers,
				body: JSON.stringify(body),
				signal,
			});

			if (!response.ok) {
				let errMsg = `HTTP ${response.status}`;
				try {
					const errBody = await response.json();
					errMsg = errBody.error?.message || errMsg;
				} catch {
					/* ignore */
				}
				yield { type: "error", message: errMsg };
				return;
			}

			const reader = response.body?.getReader();
			if (!reader) {
				yield { type: "error", message: "No response body" };
				return;
			}

			for await (const event of parseOpenResponsesStream(reader)) {
				yield event;
			}
		} catch (e: any) {
			if (e.name === "AbortError") {
				return;
			}
			yield { type: "error", message: e.message || String(e) };
		}
	}

	/**
	 * Non-streaming request. Collects full response.
	 */
	public async callAgent(
		options: AgentApiOptions,
	): Promise<AgentStreamResult> {
		const events: OpenResponsesEvent[] = [];
		let text = "";
		let responseId = "";
		const functionCalls: AgentStreamResult["functionCalls"] = [];
		let usage: AgentStreamResult["usage"];

		for await (const event of this.streamAgentResponse({
			...options,
			stream: false,
		})) {
			switch (event.type) {
				case "text-delta":
					text += event.delta;
					break;
				case "function_call_done":
					functionCalls.push({
						call_id: event.call_id,
						name: event.name,
						arguments: JSON.parse(event.arguments || "{}"),
					});
					break;
				case "finish":
					responseId = event.response_id;
					usage = event.usage;
					break;
				case "error":
					throw new Error(event.message);
			}
		}

		return { text, responseId, functionCalls, usage };
	}

	/**
	 * Sends a follow-up request with function call output.
	 */
	public async *continueWithToolResult(
		previousResponseId: string,
		functionCallOutputs: Array<{ call_id: string; output: string }>,
		signal?: AbortSignal,
	): AsyncIterable<OpenResponsesEvent> {
		const input: OpenResponsesInputItem[] = functionCallOutputs.map(
			(fc) => ({
				type: "function_call_output",
				call_id: fc.call_id,
				output: fc.output,
			}),
		);

		for await (const event of this.streamAgentResponse(
			{
				input,
				// previous_response_id is accepted but currently ignored by OpenClaw
			},
			signal,
		)) {
			yield event;
		}
	}

	/**
	 * Lightweight health check.
	 */
	public async testConnection(): Promise<{
		ok: boolean;
		message: string;
	}> {
		if (!this.profile.endpointUrl) {
			return { ok: false, message: "Agent endpoint URL is required." };
		}

		try {
			const response = await fetch(this.profile.endpointUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...(this.profile.authToken
						? { Authorization: `Bearer ${this.profile.authToken}` }
						: {}),
					...(this.profile.agentId
						? { "x-openclaw-agent-id": this.profile.agentId }
						: {}),
				},
				body: JSON.stringify({
					model: this.profile.model || "openclaw",
					input: "ping",
					max_output_tokens: 10,
				}),
			});

			if (!response.ok) {
				let errMsg = `HTTP ${response.status}`;
				try {
					const errBody = await response.json();
					errMsg = errBody.error?.message || errMsg;
				} catch {
					/* ignore */
				}
				return { ok: false, message: errMsg };
			}

			return {
				ok: true,
				message: `${this.profile.name} is connected and responding.`,
			};
		} catch (e: any) {
			if (e.message?.includes("ENOTFOUND") || e.message?.includes("ECONNREFUSED")) {
				return {
					ok: false,
					message:
						"Could not reach agent. Check Tailscale connection and endpoint URL.",
				};
			}
			return {
				ok: false,
				message: `Connection failed: ${e.message || String(e)}`,
			};
		}
	}

	public updateProfile(profile: AgentProviderProfile): void {
		this.profile = profile;
	}
}

/**
 * Validate an agent profile.
 */
export function validateAgentProfile(profile: AgentProviderProfile): string | null {
	if (!profile.endpointUrl) {
		return "Agent endpoint URL is required (e.g. http://ember:18789/v1/responses).";
	}
	if (!profile.agentId) {
		return "Agent ID is required (e.g. 'main').";
	}
	return null;
}
