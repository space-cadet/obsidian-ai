import { ChatSession, ChatMessage } from "../types";
import { ExportScope } from "../components/presentational/ExportModal";

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
	return messages.map((message, index) => messageToMarkdown(message, index)).join("\n---\n\n") + "\n";
}

function sessionToMarkdown(session: ChatSession): string {
	const title = session.title || `Chat ${formatDate(session.createdAt)}`;
	const header = `# ${title}\n\n*Created:* ${formatDate(session.createdAt)}  \n*Updated:* ${formatDate(session.updatedAt)}  \n*Messages:* ${session.messages.length}\n\n---\n\n`;
	const body = session.messages.map((m, i) => messageToMarkdown(m, i)).join("\n---\n\n");
	return header + body + "\n";
}

export function serializeToMarkdown(sessions: ChatSession[], scope: ExportScope): string {
	if (scope === "single" && sessions.length === 1) {
		return sessionToMarkdown(sessions[0]);
	}

	const header = `# Exported Chat Sessions\n\n*Exported:* ${formatDate(Date.now())}  \n*Total sessions:* ${sessions.length}  \n*Total messages:* ${sessions.reduce((sum, s) => sum + s.messages.length, 0)}\n\n---\n\n`;
	const body = sessions
		.map((session, idx) => {
			const title = session.title || `Chat ${formatDate(session.createdAt)}`;
			return `## Session ${idx + 1}: ${title}\n\n*Created:* ${formatDate(session.createdAt)}  \n*Messages:* ${session.messages.length}\n\n${session.messages.map((m, i) => messageToMarkdown(m, i)).join("\n---\n\n")}`;
		})
		.join("\n\n---\n\n");
	return header + body + "\n";
}

/** --- JSON export --- */

export function serializeToJSON(sessions: ChatSession[], scope: ExportScope): string {
	if (scope === "single" && sessions.length === 1) {
		return JSON.stringify(sessions[0], null, 2);
	}
	return JSON.stringify(
		{
			_exportedAt: new Date().toISOString(),
			_exportVersion: "1.0",
			count: sessions.length,
			totalMessages: sessions.reduce((sum, s) => sum + s.messages.length, 0),
			sessions,
		},
		null,
		2,
	);
}

/** --- JSONL export --- */

export function serializeToJSONL(sessions: ChatSession[], scope: ExportScope): string {
	if (scope === "single" && sessions.length === 1) {
		// For a single session, each line is one message
		return sessions[0].messages.map((m) => JSON.stringify(m)).join("\n") + "\n";
	}

	// For multiple/all sessions, each line is one session (with messages nested)
	return sessions.map((s) => JSON.stringify(s)).join("\n") + "\n";
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
	return name
		.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
		.replace(/\s+/g, "_")
		.replace(/_+/g, "_")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80) || "chat";
}
