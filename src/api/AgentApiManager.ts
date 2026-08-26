// src/api/AgentApiManager.ts
// OpenResponses API client for connecting to remote OpenClaw agents

import { App, Notice, requestUrl } from "obsidian";
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
	previousResponseId?: string;
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

		// SSRF validation
		const urlCheck = validateAgentUrl(url);
		if (!urlCheck.ok) {
			yield { type: "error", message: `SSRF blocked: ${urlCheck.error}` };
			return;
		}

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
		if (options.previousResponseId) {
			body.previous_response_id = options.previousResponseId;
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
				// Let the chat loop record an interrupted generation instead of
				// treating a stopped request as a completed empty response.
				throw e;
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
		tools: OpenResponsesTool[],
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
				tools,
				previousResponseId,
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
			const response = await requestUrl({
				url: this.profile.endpointUrl,
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

			if (response.status < 200 || response.status >= 300) {
				let errMsg = `HTTP ${response.status}`;
				try {
					const errBody = JSON.parse(response.text);
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
			if (
				e.message?.includes("ENOTFOUND") ||
				e.message?.includes("ECONNREFUSED")
			) {
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
export function validateAgentProfile(
	profile: AgentProviderProfile,
): string | null {
	if (!profile.endpointUrl) {
		return "Agent endpoint URL is required (e.g. http://ember:18789/v1/responses).";
	}
	if (!profile.agentId) {
		return "Agent ID is required (e.g. 'main').";
	}
	return null;
}

/* ── SSRF Protection ── */

/** Blocked URL patterns for agent endpoints */
const SSRF_BLOCK_PATTERNS = [
	/^file:/i,
	/^ftp:/i,
	/^data:/i,
	/^javascript:/i,
	/^blob:/i,
];

/** Private IP ranges that should not be accessible */
const PRIVATE_IP_RANGES = [
	/^127\./, // loopback
	/^10\./, // private A
	/^172\.(1[6-9]|2\d|3[01])\./, // private B
	/^192\.168\./, // private C
	/^169\.254\./, // link-local
	/^0\./, // current network
	/^::1$/, // IPv6 loopback
	/^fc00:/i, // IPv6 unique local
	/^fe80:/i, // IPv6 link-local
];

/**
 * Validates an agent endpoint URL to prevent SSRF attacks.
 * Blocks: non-HTTP(S) schemes, private IPs, localhost, file URLs.
 */
export function validateAgentUrl(urlStr: string): {
	ok: boolean;
	error?: string;
} {
	let url: URL;
	try {
		url = new URL(urlStr);
	} catch {
		return { ok: false, error: "Invalid URL format." };
	}

	// Scheme check
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		return {
			ok: false,
			error: `Unsupported scheme: ${url.protocol}. Only http:// and https:// are allowed.`,
		};
	}

	// Blocked patterns
	if (SSRF_BLOCK_PATTERNS.some((re) => re.test(urlStr))) {
		return { ok: false, error: "URL scheme is not allowed." };
	}

	// Hostname checks
	const hostname = url.hostname.toLowerCase();

	if (hostname === "localhost" || hostname === "[::1]") {
		return {
			ok: false,
			error: "localhost is not allowed as an agent endpoint.",
		};
	}

	if (PRIVATE_IP_RANGES.some((re) => re.test(hostname))) {
		return {
			ok: false,
			error: "Private IP addresses are not allowed as agent endpoints.",
		};
	}

	return { ok: true };
}
