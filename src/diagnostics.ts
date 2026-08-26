import type { ProviderTokenUsage } from "./types";
import { estimateTokens } from "./context/tokenEstimator";

export type DiagnosticTransport = "ai-sdk" | "openresponses";

export interface DiagnosticSize {
	characters: number;
	bytes: number;
	estimatedTokens: number;
}

export interface DiagnosticRequest {
	/** The exact logical request assembled by the chat loop. */
	payload: unknown;
	/** The provider-facing message split, without credentials or headers. */
	providerProjection: {
		system?: unknown;
		messages: unknown;
	};
	components: Record<string, DiagnosticSize>;
}

export interface ChatDiagnosticStep {
	step: number;
	continuation: "initial" | "tool";
	startedAt: number;
	completedAt?: number;
	durationMs?: number;
	request: DiagnosticRequest;
	response?: {
		text?: string;
		reasoning?: string;
		toolCalls?: unknown[];
		responseId?: string;
	};
	toolExchanges?: Array<{
		call?: unknown;
		rawResult?: unknown;
		replayedResult?: string;
		truncated?: boolean;
		rawResultSize?: DiagnosticSize;
		replayedResultSize?: DiagnosticSize;
	}>;
	providerUsage?: ProviderTokenUsage;
	finishReason?: string;
	error?: string;
}

export interface ChatDiagnostics {
	version: 1;
	enabled: true;
	transport: DiagnosticTransport;
	startedAt: number;
	completedAt?: number;
	profile: {
		id: string;
		name: string;
		provider: string;
		model: string;
	};
	settings: {
		maxRequestTokens?: number;
		maxContextMessages?: number;
		preserveRecentMessages?: number;
		requestResponseReserveTokens?: number;
		maxToolResultTokens?: number;
	};
	steps: ChatDiagnosticStep[];
}

function serialize(value: unknown): string {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value) ?? "";
	} catch {
		return String(value);
	}
}

export function measureDiagnosticValue(value: unknown): DiagnosticSize {
	const serialized = serialize(value);
	return {
		characters: serialized.length,
		bytes: new TextEncoder().encode(serialized).length,
		estimatedTokens: estimateTokens(serialized),
	};
}

function clone(value: unknown): unknown {
	try {
		return JSON.parse(JSON.stringify(value));
	} catch {
		return value;
	}
}

function messageContent(message: any): unknown {
	return message?.content ?? message;
}

/** Capture the payload and the provider's system/chat message projection. */
export function makeDiagnosticRequest(
	transport: DiagnosticTransport,
	messages: unknown[],
	tools?: unknown,
	extra: Record<string, unknown> = {},
): DiagnosticRequest {
	const systemMessages = messages.filter(
		(message: any) => message?.role === "system",
	);
	const chatMessages = messages.filter(
		(message: any) => message?.role !== "system",
	);
	const system = systemMessages.map(messageContent).join("\n\n");
	const history = chatMessages.slice(0, -1);
	const currentMessage = chatMessages[chatMessages.length - 1];
	const payload = {
		transport,
		messages: clone(messages),
		...(tools === undefined ? {} : { tools: clone(tools) }),
		...(clone(extra) as Record<string, unknown>),
	};

	return {
		payload,
		providerProjection: {
			system: system || undefined,
			messages: clone(chatMessages),
		},
		components: {
			fullPayload: measureDiagnosticValue(payload),
			systemPrompt: measureDiagnosticValue(system),
			history: measureDiagnosticValue(history),
			currentMessage: measureDiagnosticValue(currentMessage),
			tools: measureDiagnosticValue(tools),
			providerMessages: measureDiagnosticValue({
				system: system || undefined,
				messages: chatMessages,
			}),
		},
	};
}

export function beginDiagnosticStep(
	step: number,
	continuation: "initial" | "tool",
	request: DiagnosticRequest,
): ChatDiagnosticStep {
	return {
		step,
		continuation,
		startedAt: Date.now(),
		request,
	};
}

export function finishDiagnosticStep(
	step: ChatDiagnosticStep,
	patch: Omit<
		ChatDiagnosticStep,
		"step" | "continuation" | "startedAt" | "request"
	>,
): ChatDiagnosticStep {
	const completedAt = Date.now();
	return {
		...step,
		...patch,
		completedAt,
		durationMs: completedAt - step.startedAt,
	};
}

export function createChatDiagnostics(args: {
	transport: DiagnosticTransport;
	profile: { id: string; name: string; provider: string; model: string };
	settings?: ChatDiagnostics["settings"];
}): ChatDiagnostics {
	return {
		version: 1,
		enabled: true,
		transport: args.transport,
		startedAt: Date.now(),
		profile: args.profile,
		settings: args.settings ?? {},
		steps: [],
	};
}

export function completeChatDiagnostics(
	diagnostics: ChatDiagnostics,
	steps: ChatDiagnosticStep[],
): ChatDiagnostics {
	return {
		...diagnostics,
		completedAt: Date.now(),
		steps,
	};
}

/** Return a stable message-level summary for Markdown exports. */
export function diagnosticSummary(diagnostics: ChatDiagnostics): string {
	const providerInput = diagnostics.steps.reduce(
		(sum, step) => sum + (step.providerUsage?.inputTokens ?? 0),
		0,
	);
	const providerOutput = diagnostics.steps.reduce(
		(sum, step) => sum + (step.providerUsage?.outputTokens ?? 0),
		0,
	);
	return [
		`transport=${diagnostics.transport}`,
		`steps=${diagnostics.steps.length}`,
		`provider input=${providerInput || "unknown"}`,
		`provider output=${providerOutput || "unknown"}`,
	].join(", ");
}
