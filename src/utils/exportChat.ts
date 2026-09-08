import { ChatSession, ChatMessage } from "../types";
import type { DebugTelemetrySettings } from "../settings";

export type ExportScope = "single" | "multiple" | "all";
export type ExportFormat = "md" | "json" | "jsonl";

export interface ChatExportOptions {
	debugMode?: boolean;
	debugTelemetry?: DebugTelemetrySettings;
}

export type ChatExportRequest =
	| {
			kind: "sessions";
			sessions: ChatSession[];
			scope: ExportScope;
			format: ExportFormat;
			options?: ChatExportOptions;
		}
	| {
			kind: "messages";
			messages: ChatMessage[];
			format: "md";
		};

function getToolParts(message: ChatMessage) {
	if (message.contentParts?.length) {
		return message.contentParts.filter((part) => part.type === "tool_call");
	}
	return (message.toolCalls ?? []).map((entry) => ({
		type: "tool_call" as const,
		call: entry.call,
		result: entry.result,
	}));
}

/** Build export-only telemetry without copying complete tool result content. */
function buildDebugTelemetry(
	sessions: ChatSession[],
	options?: ChatExportOptions,
) {
	if (!options?.debugMode || !options.debugTelemetry) return undefined;

	const fields = options.debugTelemetry;
	return {
		enabled: true,
		included: { ...fields },
		sessions: sessions.map((session) => ({
			sessionId: session.id,
			messages: session.messages.map((message, index) => {
				const telemetry: Record<string, unknown> = {
					messageId: message.id,
					index,
					role: message.role,
				};

				if (fields.includeProviderUsage && message.providerUsage) {
					telemetry.providerUsage = message.providerUsage;
				}
				if (fields.includeRequestEstimates) {
					telemetry.messageEstimatedTokens = message.estimatedTokens;
					telemetry.requestTokenEstimate =
						message.requestTokenEstimate;
				}
				if (fields.includeToolDetails) {
					telemetry.toolCalls = getToolParts(message).map((part) => ({
						callId: part.call.toolCallId,
						toolName: part.call.toolName,
						args: part.call.args,
						result: part.result
							? {
									ok: !part.result.error,
									resultChars: part.result.error
										? undefined
										: (part.result.content ?? "").length,
									error: part.result.error,
									hasMore: part.result.has_more,
								}
							: undefined,
					}));
				}
				if (fields.includeContextMetadata && message.contextItems) {
					telemetry.contextItems = message.contextItems;
				}
				if (fields.includeModelTiming) {
					telemetry.modelName = message.modelName;
					telemetry.responseTimeMs = message.responseTimeMs;
				}

				return telemetry;
			}),
		})),
	};
}

function formatTimestamp(ts: number): string {
	return new Date(ts).toISOString();
}

function formatDate(ts: number): string {
	return new Date(ts).toLocaleString();
}

function formatDateForFilename(ts: number): string {
	const d = new Date(ts);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
}

/** --- Markdown export --- */

export function messageToMarkdown(msg: ChatMessage, index: number): string {
	const roleLabel = msg.role === "user" ? "👤 User" : "🤖 Assistant";
	const ts = formatTimestamp(msg.timestamp);
	const modelTag = msg.modelName ? ` *(model: ${msg.modelName})*` : "";
	const errorTag = msg.isError ? " *(error)*" : "";
	const agentTag = msg.agentName ? ` *(agent: ${msg.agentName})*` : "";

	let body = msg.content;

	// If there are content parts (tool calls interleaved), render them
	if (msg.contentParts && msg.contentParts.length > 0) {
		body = msg.contentParts
			.map((part) => {
				if (part.type === "text") {
					return part.content;
				}
				if (part.type === "tool_call") {
					const call = part.call;
					const result = part.result;
					let toolBlock = `\n\n---\n**🔧 Tool call:** \`${call.toolName}\`\n\n\`\`\`json\n${JSON.stringify(call.args, null, 2)}\n\`\`\`\n`;
					if (result) {
						toolBlock += `\n**Result:**\n\n\`\`\`${result.error ? "error" : "text"}\n${result.error ?? result.content ?? "(no output)"}\n\`\`\`\n`;
					}
					toolBlock += `---\n`;
					return toolBlock;
				}
				return "";
			})
			.join("");
	}

	// Also append inline tool calls not in contentParts
	if (msg.toolCalls && msg.toolCalls.length > 0 && !msg.contentParts) {
		for (const tc of msg.toolCalls) {
			body += `\n\n---\n**🔧 Tool call:** \`${tc.call.toolName}\`\n\n\`\`\`json\n${JSON.stringify(tc.call.args, null, 2)}\n\`\`\`\n`;
			if (tc.result) {
				body += `\n**Result:**\n\n\`\`\`${tc.result.error ? "error" : "text"}\n${tc.result.error ?? tc.result.content ?? "(no output)"}\n\`\`\`\n`;
			}
			body += `---\n`;
		}
	}

	return `### ${index + 1}. ${roleLabel}${modelTag}${agentTag}${errorTag}\n*${ts}*\n\n${body}\n`;
}

/** Serialize an ordered subset of messages using the same Markdown format as chat exports. */
export function serializeMessagesToMarkdown(messages: ChatMessage[]): string {
	return (
		messages
			.map((message, index) => messageToMarkdown(message, index))
			.join("\n---\n\n") + "\n"
	);
}

function sessionToMarkdown(session: ChatSession): string {
	const title = session.title || `Chat ${formatDate(session.createdAt)}`;
	const header = `# ${title}\n\n*Created:* ${formatDate(session.createdAt)}  \n*Updated:* ${formatDate(session.updatedAt)}  \n*Messages:* ${session.messages.length}\n\n---\n\n`;
	const body = session.messages
		.map((m, i) => messageToMarkdown(m, i))
		.join("\n---\n\n");
	return header + body + "\n";
}

function debugTelemetryToMarkdown(
	sessions: ChatSession[],
	options?: ChatExportOptions,
): string {
	const telemetry = buildDebugTelemetry(sessions, options);
	return telemetry
		? `\n## Debug telemetry\n\n\`\`\`json\n${JSON.stringify(telemetry, null, 2)}\n\`\`\`\n`
		: "";
}

export function serializeToMarkdown(
	sessions: ChatSession[],
	scope: ExportScope,
	options?: ChatExportOptions,
): string {
	if (scope === "single" && sessions.length === 1) {
		return (
			sessionToMarkdown(sessions[0]) +
			debugTelemetryToMarkdown(sessions, options)
		);
	}

	const header = `# Exported Chat Sessions\n\n*Exported:* ${formatDate(Date.now())}  \n*Total sessions:* ${sessions.length}  \n*Total messages:* ${sessions.reduce((sum, s) => sum + s.messages.length, 0)}\n\n---\n\n`;
	const body = sessions
		.map((session, idx) => {
			const title =
				session.title || `Chat ${formatDate(session.createdAt)}`;
			return `## Session ${idx + 1}: ${title}\n\n*Created:* ${formatDate(session.createdAt)}  \n*Messages:* ${session.messages.length}\n\n${session.messages.map((m, i) => messageToMarkdown(m, i)).join("\n---\n\n")}`;
		})
		.join("\n\n---\n\n");
	return header + body + debugTelemetryToMarkdown(sessions, options) + "\n";
}

/** --- JSON export --- */

export function serializeToJSON(
	sessions: ChatSession[],
	scope: ExportScope,
	options?: ChatExportOptions,
): string {
	const telemetry = buildDebugTelemetry(sessions, options);
	if (scope === "single" && sessions.length === 1) {
		return JSON.stringify(
			telemetry
				? { ...sessions[0], _debugTelemetry: telemetry }
				: sessions[0],
			null,
			2,
		);
	}
	return JSON.stringify(
		{
			_exportedAt: new Date().toISOString(),
			_exportVersion: "1.0",
			count: sessions.length,
			totalMessages: sessions.reduce(
				(sum, s) => sum + s.messages.length,
				0,
			),
			sessions,
			...(telemetry ? { _debugTelemetry: telemetry } : {}),
		},
		null,
		2,
	);
}

/** --- JSONL export --- */

export function serializeToJSONL(
	sessions: ChatSession[],
	scope: ExportScope,
	options?: ChatExportOptions,
): string {
	const telemetry = buildDebugTelemetry(sessions, options);
	if (scope === "single" && sessions.length === 1) {
		// For a single session, each line is one message
		return (
			sessions[0].messages
				.map((m, index) =>
					JSON.stringify(
						telemetry
							? {
									...m,
									_debugTelemetry:
										telemetry.sessions[0].messages[index],
								}
							: m,
					),
				)
				.join("\n") + "\n"
		);
	}

	// For multiple/all sessions, each line is one session (with messages nested)
	return (
		sessions
			.map((s, index) =>
				JSON.stringify(
					telemetry
						? {
								...s,
								_debugTelemetry: telemetry.sessions[index],
							}
						: s,
				),
			)
			.join("\n") + "\n"
	);
}

/**
 * Canonical serialization entry point for all chat copy and export actions.
 * UI callers select a destination (clipboard or vault); this function owns
 * consistent formatting for every supported export shape.
 */
export function serializeChatExport(request: ChatExportRequest): string {
	if (request.kind === "messages") {
		return serializeMessagesToMarkdown(request.messages);
	}

	switch (request.format) {
		case "md":
			return serializeToMarkdown(
				request.sessions,
				request.scope,
				request.options,
			);
		case "json":
			return serializeToJSON(
				request.sessions,
				request.scope,
				request.options,
			);
		case "jsonl":
			return serializeToJSONL(
				request.sessions,
				request.scope,
				request.options,
			);
	}
}

/** --- Filename generation --- */

export function generateFilename(
	scope: ExportScope,
	format: "md" | "json" | "jsonl",
	sessionTitle?: string,
	appendTimestamp = false,
): string {
	const ts = appendTimestamp ? `_${formatDateForFilename(Date.now())}` : "";
	const ext = format;
	switch (scope) {
		case "single":
			return `${sanitizeFilename(sessionTitle || "chat")}${ts}.${ext}`;
		case "multiple":
			return `chats_export${ts}.${ext}`;
		case "all":
			return `all_chats_export${ts}.${ext}`;
	}
}

function sanitizeFilename(name: string): string {
	return (
		name
			.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
			.replace(/\s+/g, "_")
			.replace(/_+/g, "_")
			.replace(/^-+|-+$/g, "")
			.slice(0, 80) || "chat"
	);
}
