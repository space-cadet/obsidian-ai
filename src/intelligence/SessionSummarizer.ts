import { ChatMessage } from "../types";
import { ProviderProfile } from "../settings";
import { ChatApiManager } from "../api";
import { PersonaLoader } from "./PersonaLoader";

export interface SummarizeOptions {
	/** Minimum number of messages before summarizing */
	minMessages?: number;
	/** Maximum tokens for the summarization prompt context */
	maxContextTokens?: number;
}

export interface MemoryEntry {
	date: string;
	category: "user_fact" | "project" | "preference" | "insight" | "reference";
	content: string;
	tags?: string[];
}

/**
 * Automatically summarizes chat sessions into persistent memory entries.
 *
 * Triggered when a session ends (user starts a new session). Uses a cheap
 * LLM call to extract 3–5 bullet points worth remembering, then appends
 * them to memory.md via PersonaLoader.
 */
export class SessionSummarizer {
	private personaLoader: PersonaLoader;
	private chatapi: ChatApiManager;

	constructor(personaLoader: PersonaLoader, chatapi: ChatApiManager) {
		this.personaLoader = personaLoader;
		this.chatapi = chatapi;
	}

	/**
	 * Check if a session has enough content to be worth summarizing.
	 */
	shouldSummarize(
		messages: ChatMessage[],
		minMessages: number = 4,
	): boolean {
		if (!messages || messages.length < minMessages) return false;

		// Count non-system messages
		const chatMessages = messages.filter(
			(m) => m.role === "user" || m.role === "assistant",
		);
		return chatMessages.length >= minMessages;
	}

	/**
	 * Summarize a session's messages into memory entries and persist them.
	 *
	 * @returns Array of memory entries that were saved (may be empty)
	 */
	async summarizeSession(
		sessionId: string,
		messages: ChatMessage[],
		profile: ProviderProfile,
		options?: SummarizeOptions,
	): Promise<MemoryEntry[]> {
		const { minMessages = 4, maxContextTokens = 2000 } = options ?? {};

		if (!this.shouldSummarize(messages, minMessages)) {
			return [];
		}

		// Build a condensed context from the session
		const context = this._buildContext(messages, maxContextTokens);

		const system =
			"You are a memory extraction assistant. Your job is to read a conversation " +
			"and extract 0–5 concise bullet points of things worth remembering for future sessions. " +
			"Focus on: user preferences, project updates, decisions made, facts shared, " +
			"or recurring topics. Skip trivialities like greetings. " +
			"Output ONLY valid JSON in this exact format:\n" +
			'[{"category": "user_fact|project|preference|insight|reference", "content": "...", "tags": ["tag1"]}]\n' +
			"If nothing is worth remembering, output: []";

		const prompt = `Conversation context:\n${context}\n\nExtract memories as JSON:`;

		let raw: string;
		try {
			raw = await this.chatapi.callApi(system, prompt, profile);
		} catch (e) {
			console.error("[SessionSummarizer] LLM call failed:", e);
			return [];
		}

		const entries = this._parseJsonEntries(raw);
		if (entries.length === 0) return [];

		// Persist each entry to memory store
		const saved: MemoryEntry[] = [];
		for (const entry of entries) {
			try {
				await this.personaLoader.memoryStore.create(
					entry.category,
					entry.content,
					entry.tags,
				);
				saved.push(entry);
			} catch (e) {
				console.error("[SessionSummarizer] Failed to save memory:", e);
			}
		}

		return saved;
	}

	/**
	 * Build a condensed text context from messages, respecting token budget.
	 */
	private _buildContext(
		messages: ChatMessage[],
		maxTokens: number,
	): string {
		// Filter to user + assistant only, skip system/tool
		const chatMessages = messages.filter(
			(m) => m.role === "user" || m.role === "assistant",
		);

		// Rough heuristic: 4 chars ≈ 1 token
		const maxChars = maxTokens * 4;
		let result = "";

		// Include most recent messages first (they're most relevant)
		for (let i = chatMessages.length - 1; i >= 0; i--) {
			const m = chatMessages[i];
			let content = m.content.slice(0, 500); // cap individual messages
			// Strip heavy artifacts
			content = content.replace(/```[\s\S]*?```/g, "[code block]");
			content = content.replace(/<context>[\s\S]*?<\/context>/g, "");
			const line = `${m.role}: ${content}\n`;

			if (result.length + line.length > maxChars) {
				// If we've already included some messages, prepend "..."
				if (result) {
					result = "...\n" + result;
				}
				break;
			}
			result = line + result;
		}

		return result.trim();
	}

	/**
	 * Parse JSON array from LLM response, with lenient fallback.
	 */
	private _parseJsonEntries(raw: string): MemoryEntry[] {
		// Try to extract JSON array from the response
		let jsonStr = raw.trim();

		// Sometimes models wrap in markdown code blocks
		const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
		if (codeBlockMatch) {
			jsonStr = codeBlockMatch[1].trim();
		}

		// Try parsing as JSON array
		try {
			const parsed = JSON.parse(jsonStr);
			if (Array.isArray(parsed)) {
				return parsed
					.filter(
						(e: any) =>
							e &&
							typeof e.content === "string" &&
							e.content.trim().length > 0,
					)
					.map((e: any) => ({
						date: new Date().toISOString().split("T")[0],
						category: this._normalizeCategory(e.category),
						content: e.content.trim(),
						tags: Array.isArray(e.tags)
							? e.tags.filter((t: any) => typeof t === "string")
							: [],
					}));
			}
		} catch {
			// Not valid JSON — try line-by-line heuristic
		}

		// Fallback: try to parse as bullet points
		const lines = jsonStr
			.split("\n")
			.map((l) => l.trim())
			.filter((l) => l.length > 5 && (l.startsWith("-") || l.startsWith("*")));

		if (lines.length > 0) {
			return lines.map((line) => ({
				date: new Date().toISOString().split("T")[0],
				category: "insight" as const,
				content: line.replace(/^[-*]\s*/, "").trim(),
				tags: [],
			}));
		}

		return [];
	}

	private _normalizeCategory(
		cat: string,
	): MemoryEntry["category"] {
		const valid = new Set([
			"user_fact",
			"project",
			"preference",
			"insight",
			"reference",
		]);
		if (valid.has(cat)) return cat as MemoryEntry["category"];
		return "insight";
	}

	/**
	 * Format a memory entry as a markdown bullet for memory.md.
	 */
	private _formatEntry(entry: MemoryEntry): string {
		const tagStr = entry.tags?.length ? " " + entry.tags.map((t) => `#${t}`).join(" ") : "";
		return `- [${entry.date}] **${entry.category}**: ${entry.content}${tagStr}`;
	}
}
