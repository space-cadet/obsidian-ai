import type { ChatMessage } from "../types";
import type { PersonaLoader } from "./PersonaLoader";
import type { ChatApiManager } from "../api";
import type { ProviderProfile } from "../settings";

export interface MemoryEntry {
	timestamp: string;
	category: "user_fact" | "project" | "preference" | "insight" | "reference";
	content: string;
	tags?: string[];
}

interface SummarizeSessionOptions {
	/** Minimum number of messages before summarization triggers */
	minMessages?: number;
	/** Max messages to include in the summary context (from the end) */
	maxMessages?: number;
}

const SUMMARIZATION_PROMPT = `You are a session summarizer. Your job is to extract key information from a conversation that would be useful to remember for future sessions.

Read the conversation below and produce a concise summary with 3-5 bullet points. Each bullet should capture:
- A specific fact about the user (preferences, projects, goals)
- A decision or conclusion reached
- A topic that was discussed in depth
- Any personal information the user shared

Format each bullet as:
- **[CATEGORY]**: Content #tag1 #tag2

Categories: user_fact, project, preference, insight, reference

Keep bullets under 120 characters. Be specific and actionable. Do not include generic pleasantries.

CONVERSATION:
`;

/**
 * Automatically summarizes chat sessions and persists key memories.
 *
 * Called at session boundaries (e.g. when user starts a new session) or
 * on demand (e.g. user clicks "Save Memory"). Uses a cheap/fast model
 * call to extract salient points and appends them to memory.md.
 */
export class SessionSummarizer {
	constructor(
		private personaLoader: PersonaLoader,
		private chatApi: ChatApiManager,
	) {}

	/**
	 * Summarize a session's messages and append key points to memory.
	 *
	 * @param sessionId - Unique session identifier
	 * @param messages - Full message array for the session
	 * @param profile - Provider profile to use for the summarization API call
	 * @param opts - Options controlling summarization behavior
	 * @returns The generated memory entries, or empty array if skipped
	 */
	async summarizeSession(
		sessionId: string,
		messages: ChatMessage[],
		profile: ProviderProfile,
		opts: SummarizeSessionOptions = {},
	): Promise<MemoryEntry[]> {
		const minMessages = opts.minMessages ?? 4;
		const maxMessages = opts.maxMessages ?? 30;

		// Filter to user + assistant messages only, skip system/tool
		const chatMessages = messages.filter(
			(m) => m.role === "user" || m.role === "assistant",
		);

		if (chatMessages.length < minMessages) {
			return [];
		}

		// Take the last N messages to stay within context limits
		const recentMessages = chatMessages.slice(-maxMessages);
		const conversationText = recentMessages
			.map((m) => {
				const role = m.role === "user" ? "User" : "Assistant";
				const text =
					typeof m.content === "string"
						? m.content
						: JSON.stringify(m.content);
				return `${role}: ${text.slice(0, 500)}`;
			})
			.join("\n\n");

		const prompt = SUMMARIZATION_PROMPT + conversationText;

		try {
			const summary = await this.callSummarizer(prompt, profile);
			const entries = this.parseSummary(summary, sessionId);

			// Persist each entry to memory.md
			for (const entry of entries) {
				const tagStr = entry.tags?.length
					? " " + entry.tags.map((t) => `#${t}`).join(" ")
					: "";
				const line = `- [${entry.timestamp}] **${entry.category}**: ${entry.content}${tagStr}`;
				await this.personaLoader.appendMemory(line);
			}

			return entries;
		} catch (e) {
			console.error("[SessionSummarizer] summarization failed:", e);
			return [];
		}
	}

	/**
	 * Extract memories from a session without making an API call.
	 * Useful for manual "Save Memory" actions where the user
	 * provides the summary text directly.
	 */
	async saveManualMemory(entry: MemoryEntry): Promise<void> {
		const tagStr = entry.tags?.length
			? " " + entry.tags.map((t) => `#${t}`).join(" ")
			: "";
		const line = `- [${entry.timestamp}] **${entry.category}**: ${entry.content}${tagStr}`;
		await this.personaLoader.appendMemory(line);
	}

	/**
	 * Check whether a session has enough content to be worth summarizing.
	 */
	shouldSummarize(messages: ChatMessage[], minMessages = 4): boolean {
		const chatMessages = messages.filter(
			(m) => m.role === "user" || m.role === "assistant",
		);
		return chatMessages.length >= minMessages;
	}

	/* ─── Private ─── */

	private async callSummarizer(
		prompt: string,
		profile: ProviderProfile,
	): Promise<string> {
		// Use the chat API with a simple single-turn completion
		const messages = [
			{ role: "system" as const, content: "You are a concise session summarizer." },
			{ role: "user" as const, content: prompt },
		];

		// Stream not needed — just grab the text
		let result = "";
		for await (const event of this.chatApi.streamChat(
			messages,
			new AbortController().signal,
			profile,
			false, // thinking disabled for cheap summarization
		)) {
			if (event.type === "text-delta") {
				result += event.text;
			}
		}

		return result.trim();
	}

	private parseSummary(summary: string, sessionId: string): MemoryEntry[] {
		const lines = summary.split("\n").filter((l) => l.trim().startsWith("- "));
		const entries: MemoryEntry[] = [];
		const timestamp = new Date().toISOString().split("T")[0];

		for (const line of lines) {
			// Parse: - **[CATEGORY]**: Content #tag1 #tag2
			const match = line.match(
				/^-\s*\*?\*?\[?\*?\*?\s*(\w+)\s*\*?\*?\]?\*?\*?\s*:\s*(.+)$/,
			);
			if (!match) continue;

			const rawCategory = match[1].toLowerCase();
			const rest = match[2].trim();

			// Validate category
			const validCategories: MemoryEntry["category"][] = [
				"user_fact",
				"project",
				"preference",
				"insight",
				"reference",
			];
			const category = validCategories.includes(rawCategory as any)
				? (rawCategory as MemoryEntry["category"])
				: "insight";

			// Extract trailing hashtags as tags
			const tagRegex = /#(\w+)/g;
			const tags: string[] = [];
			let tagMatch;
			while ((tagMatch = tagRegex.exec(rest)) !== null) {
				tags.push(tagMatch[1]);
			}

			// Strip tags from content
			const content = rest.replace(/#\w+/g, "").replace(/\s+/g, " ").trim();

			if (content.length > 10) {
				entries.push({ timestamp, category, content, tags });
			}
		}

		return entries;
	}
}
