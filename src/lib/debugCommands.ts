import type { ChatMessage, ChatSession } from "../types";
import type { ProviderProfile } from "../settings";
import { estimateTokens } from "../context/tokenEstimator";
import { buildHistoryWithTools } from "./historyBuilder";

export interface DebugCommandResult {
	handled: boolean;
	response?: string;
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
	},
): DebugCommandResult {
	const trimmed = text.trim();
	if (!trimmed.startsWith("!")) return { handled: false };

	const command = trimmed.slice(1).trim().toLowerCase();

	switch (command) {
		case "debug history":
			return {
				handled: true,
				response: formatHistoryDebug(session, settings.toolHistoryMode),
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
		case "debug help":
			return {
				handled: true,
				response: formatDebugHelp(),
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
	toolHistoryMode: "elide" | "preserve",
): string {
	if (!session || session.messages.length === 0) {
		return "**History Debug**\n\nNo messages in current session.";
	}

	const history = buildHistoryWithTools(
		session.messages,
		50, // generous limit for debug view
		4000,
		toolHistoryMode,
	);

	let output = `**History Debug** — ${history.length} message(s) in model-facing history\n\n`;

	history.forEach((msg, i) => {
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
		"**Debug Commands**",
		"",
		"These commands show internal state without sending anything to the model:",
		"",
		"| Command | Description |",
		"|---------|-------------|",
		"| `!debug history` | Show model-facing message history |",
		"| `!debug tokens` | Show token estimates and counts |",
		"| `!debug context` | Show context items/attachments |",
		"| `!debug help` | Show this help message |",
		"",
		"> 🔒 Debug output is local-only — never sent to the AI model.",
	].join("\n");
}
