import type { ChatMessage, ChatSession } from "../types";
import type { ProviderProfile } from "../settings";
import { estimateTokens } from "../context/tokenEstimator";
import { buildModelHistory } from "../context/modelHistory";
import {
	compactionMetadataMatchesTranscript,
	formatCompactionSummary,
	parseCompactionMetadata,
} from "../context/semanticCompaction";
import { formatBuiltinCommandReference } from "./builtinCommands";

export interface DebugCommandResult {
	handled: boolean;
	response?: string;
	action?: "compact";
}

/**
 * Parse and handle debug commands (prefix: !).
 * These commands show internal state without sending anything to the model.
 */
export function handleDebugCommand(
	text: string,
	session: ChatSession | undefined,
	profile: ProviderProfile,
	settings: {
		toolHistoryMode: "elide" | "preserve";
		maxRequestTokens?: number;
		maxContextMessages?: number;
		maxToolResultTokens?: number;
		preserveRecentMessages?: number;
		requestResponseReserveTokens?: number;
		enableAgentTools?: boolean;
	},
): DebugCommandResult {
	const trimmed = text.trim();
	if (!trimmed.startsWith("!")) return { handled: false };

	const command = trimmed.slice(1).trim().toLowerCase();

	switch (command) {
		case "help":
		case "debug":
		case "debug help":
			return {
				handled: true,
				response: formatDebugHelp(),
			};
		case "debug history":
			return {
				handled: true,
				response: formatHistoryDebug(session, profile, settings),
			};
		case "debug tokens":
			return {
				handled: true,
				response: formatTokenDebug(
					session,
					profile,
					settings.maxRequestTokens,
				),
			};
		case "debug context":
			return {
				handled: true,
				response: formatContextDebug(session),
			};
		case "debug compact":
			return {
				handled: true,
				action: "compact",
			};
		default:
			return {
				handled: true,
				response: `Unknown debug command: "${command}". Type \`!debug help\` for available commands.`,
			};
	}
}

function formatHistoryDebug(
	session: ChatSession | undefined,
	profile: ProviderProfile,
	settings: {
		toolHistoryMode: "elide" | "preserve";
		maxRequestTokens?: number;
		maxContextMessages?: number;
		maxToolResultTokens?: number;
		preserveRecentMessages?: number;
		requestResponseReserveTokens?: number;
		enableAgentTools?: boolean;
	},
): string {
	if (!session || session.messages.length === 0) {
		return "**History Debug**\n\nNo messages in current session.";
	}

	const modelMessages = session.messages.filter(
		(message) => !message.isDebug,
	);
	const parsedCompaction = session.compactionMetadata
		? parseCompactionMetadata(session.compactionMetadata)
		: null;
	const compaction =
		parsedCompaction &&
		compactionMetadataMatchesTranscript(parsedCompaction, modelMessages)
			? parsedCompaction
			: null;
	const preserveRecentMessages = Math.max(
		3,
		settings.preserveRecentMessages ?? 4,
	);
	const projectedHistory = compaction
		? modelMessages.slice(-preserveRecentMessages)
		: modelMessages;

	let modelHistory: ReturnType<typeof buildModelHistory>;
	try {
		modelHistory = buildModelHistory({
			systemPrompt: compaction
				? formatCompactionSummary(compaction.summary)
				: "",
			currentMessage: "",
			history: projectedHistory,
			maxMessages: settings.maxContextMessages || 10,
			maxToolResultTokens: settings.maxToolResultTokens ?? 4000,
			toolHistoryMode: settings.toolHistoryMode,
			agentMode:
				profile.provider === "agent" ||
				Boolean(settings.enableAgentTools),
			sessionId: session.id,
			resultCatalogTokens: 600,
			budget: {
				maxRequestTokens: settings.maxRequestTokens ?? 32000,
				maxMessages: settings.maxContextMessages || 10,
				preserveRecentMessages,
				responseReserveTokens:
					settings.requestResponseReserveTokens ?? 4096,
			},
		});
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return `**History Debug**\n\nUnable to build model-facing history: ${detail}`;
	}

	let output = `**History Debug** — ${modelHistory.history.length} message(s) in model-facing history\n\n`;
	if (compaction) {
		output += `**Compaction:** applied — summary covers ${compaction.sourceMessageIds.length} older message(s); the newest ${Math.min(preserveRecentMessages, modelMessages.length)} message(s) are replayed exactly.\n\n`;
		output += `**Compaction summary**\n\n${formatCompactionSummary(compaction.summary)}\n\n`;
	} else if (session.compactionMetadata) {
		output +=
			"**Compaction:** not applied — saved metadata is invalid or no longer matches the transcript.\n\n";
	} else {
		output +=
			"**Compaction:** not applied — no saved summary for this session.\n\n";
	}

	modelHistory.history.forEach((msg, i) => {
		const role = msg.role;
		const preview =
			typeof msg.content === "string"
				? msg.content.slice(0, 200)
				: JSON.stringify(msg.content).slice(0, 200);
		const truncated =
			typeof msg.content === "string" && msg.content.length > 200
				? "…"
				: "";
		output += `**[${i}] ${role}:** ${preview}${truncated}\n\n`;
	});

	return output;
}

function formatTokenDebug(
	session: ChatSession | undefined,
	profile: ProviderProfile,
	maxRequestTokens?: number,
): string {
	if (!session || session.messages.length === 0) {
		return "**Token Debug**\n\nNo messages in current session.";
	}

	let totalChars = 0;
	let toolCallCount = 0;
	let toolResultCount = 0;

	session.messages.forEach((msg) => {
		if (typeof msg.content === "string") {
			totalChars += msg.content.length;
		}
		if (msg.contentParts) {
			msg.contentParts.forEach((part) => {
				if (part.type === "tool_call") {
					toolCallCount++;
					if (part.result) toolResultCount++;
				}
			});
		}
		if (msg.toolCalls) {
			toolCallCount += msg.toolCalls.length;
			toolResultCount += msg.toolCalls.filter((t) => t.result).length;
		}
	});

	const estimatedTokens = Math.ceil(totalChars / 4);
	const model = profile.model || "unknown";
	const maxTokens = maxRequestTokens || 32000;

	return [
		"**Token Debug**",
		"",
		`| Metric | Value |`,
		`|--------|-------|`,
		`| Model | ${model} |`,
		`| Max request tokens | ${maxTokens.toLocaleString()} |`,
		`| Messages | ${session.messages.length} |`,
		`| Total chars | ${totalChars.toLocaleString()} |`,
		`| Est. tokens (chars/4) | ${estimatedTokens.toLocaleString()} |`,
		`| Tool calls | ${toolCallCount} |`,
		`| Tool results | ${toolResultCount} |`,
		"",
		"> 💡 **Tip:** Switch to `!debug history` to see the actual messages being sent.",
	].join("\n");
}

function formatContextDebug(session: ChatSession | undefined): string {
	if (!session) {
		return "**Context Debug**\n\nNo active session.";
	}

	// Look at the last user message for context items
	const lastUserMsg = [...session.messages]
		.reverse()
		.find((m) => m.role === "user");

	if (!lastUserMsg) {
		return "**Context Debug**\n\nNo user messages yet.";
	}

	// Context items are typically stored in the session or passed at send time
	// For now, show what we can infer
	const attachments = lastUserMsg.attachments || [];
	const resolvedParts = lastUserMsg.resolvedParts || [];

	let output = "**Context Debug** — Last user message\n\n";

	if (attachments.length === 0 && resolvedParts.length === 0) {
		output += "No attachments or context items in last message.\n";
	} else {
		output += `**Attachments:** ${attachments.length}\n`;
		attachments.forEach((att, i) => {
			output += `- [${i}] ${att.name || "unnamed"} (${att.type || "unknown"})\n`;
		});
		output += "\n";
	}

	return output;
}

function formatDebugHelp(): string {
	return [
		formatBuiltinCommandReference(),
		"",
		"**Notes**",
		"",
		"- `!debug tokens` is a local estimate; provider-reported usage is shown in session telemetry when available.",
		"- `!debug compact` summarizes older messages immediately, preserves the full transcript, and reports success or failure in the chat.",
	].join("\n");
}
