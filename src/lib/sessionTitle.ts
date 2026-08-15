import { ChatMessage } from "../types";
import { ProviderProfile } from "../settings";
import { ChatApiManager } from "../api";

export function generateSessionTitle(messages: ChatMessage[]): string {
	const userMsgs = messages.filter((m) => m.role === "user");
	const assistantMsgs = messages.filter((m) => m.role === "assistant");
	if (userMsgs.length === 0) return `Chat ${new Date().toLocaleDateString()}`;

	// Prefer user messages for titles — they're the actual intent
	const candidateTexts: string[] = [];

	// Try first 2 user messages
	for (const msg of userMsgs.slice(0, 2)) {
		let text = msg.content;
		// Strip context tags
		text = text.replace(/<context>[\s\S]*?<\/context>/g, "").trim();
		// Strip markdown links/images
		text = text.replace(/!?\[([^\]]*)\]\([^)]+\)/g, "$1").trim();
		// Strip code blocks
		text = text.replace(/```[\s\S]*?```/g, "").trim();
		// Strip inline code
		text = text.replace(/`([^`]+)`/g, "$1").trim();
		// Strip JSON
		text = text.replace(/\{[\s\S]*?\}/g, "").trim();
		if (text.length >= 3) candidateTexts.push(text);
	}

	// Fallback to assistant if no good user candidate
	if (candidateTexts.length === 0) {
		for (const msg of assistantMsgs.slice(0, 1)) {
			let text = msg.content.replace(/```[\s\S]*?```/g, "").trim();
			text = text.replace(/\{[\s\S]*?\}/g, "").trim();
			if (text.length >= 3) candidateTexts.push(text);
		}
	}

	if (candidateTexts.length === 0)
		return `Chat ${new Date().toLocaleDateString()}`;

	// Generic words that make bad titles — check AFTER stripping punctuation
	const genericWords = new Set([
		"hello",
		"hi",
		"hey",
		"help",
		"please",
		"thanks",
		"thank you",
		"ok",
		"okay",
		"sure",
		"yes",
		"no",
		"what",
		"how",
		"why",
		"when",
		"where",
		"who",
		"good morning",
		"good afternoon",
		"good evening",
	]);

	// Stop words to strip from the START of text (with optional punctuation)
	const stopWords =
		/^(please\s+|can\s+you\s+|could\s+you\s+|hey[.!?\s]*|hi[.!?\s]*|hello[.!?\s]*|so\s+|um\s+|uh\s+|okay\s+|ok\s+|well\s+|now\s+|then\s+)/i;

	for (let text of candidateTexts) {
		// Extract first sentence-ish chunk
		const sentenceMatch = text.match(/^([^.!?\n]{2,80}[.!?\n]?)/);
		let title = sentenceMatch ? sentenceMatch[1].trim() : text.slice(0, 80);

		// Strip leading stop words (handles "Hello." → "", "Hello " → "")
		title = title.replace(stopWords, "").trim();

		// Skip if too short after stripping
		if (title.length < 3) continue;

		// Check if remaining title is just generic words (strip punctuation for check)
		const cleanForCheck = title
			.replace(/[.!?,;:"'\-]+$/, "")
			.trim()
			.toLowerCase();
		if (genericWords.has(cleanForCheck)) continue;

		// Capitalize first letter
		title = title.charAt(0).toUpperCase() + title.slice(1);

		// Truncate at word boundary near 40 chars
		if (title.length > 45) {
			const truncated = title.slice(0, 45);
			const lastSpace = truncated.lastIndexOf(" ");
			if (lastSpace > 25) {
				title = truncated.slice(0, lastSpace) + "…";
			} else {
				title = truncated + "…";
			}
		}

		return title;
	}

	return `Chat ${new Date().toLocaleDateString()}`;
}

/** Ask the LLM to suggest a short title for the conversation.
 *  Falls back to heuristic naming on error or if LLM returns nothing useful. */
export async function generateSessionTitleLLM(
	messages: ChatMessage[],
	profile: ProviderProfile,
	chatapi: ChatApiManager,
): Promise<string | null> {
	if (messages.length === 0) return null;

	// Build a minimal context: first 3 user + 3 assistant messages
	const context = messages
		.slice(0, 6)
		.map((m) => {
			let content = m.content.slice(0, 200); // cap each message
			// Strip heavy artifacts
			content = content.replace(/```[\s\S]*?```/g, "[code]");
			content = content.replace(/\{[\s\S]*?\}/g, "[data]");
			content = content.replace(/<context>[\s\S]*?<\/context>/g, "");
			return `${m.role}: ${content}`;
		})
		.join("\n");

	const system =
		"You are a helpful assistant. Given a short conversation, produce a concise, descriptive title (3–6 words). " +
		"Use the user's language. Output ONLY the title text, no quotes, no explanation.";

	const prompt = `Conversation:\n${context}\n\nTitle:`;

	try {
		const result = await chatapi.callApi(system, prompt, profile);
		let title = result.trim();
		// Strip quotes if the model added them
		title = title.replace(/^["']|["']$/g, "").trim();
		if (title.length < 2 || title.length > 60) return null;
		return title;
	} catch (e) {
		console.error("[generateSessionTitleLLM] failed, falling back", e);
		return null;
	}
}
