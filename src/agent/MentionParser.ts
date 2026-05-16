import { ChatMessage } from "../types";

export interface ParsedMention {
	/** The text with @mentions stripped */
	cleanText: string;
	/** Agent IDs explicitly mentioned */
	mentions: string[];
}

/**
 * Parses @AgentName mentions from user input.
 * Matches @ followed by alphanumeric/hyphen/underscore names.
 * Returns cleaned text and list of agent IDs.
 */
export function parseMentions(text: string): ParsedMention {
	const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
	const mentions: string[] = [];
	let match: RegExpExecArray | null;

	while ((match = mentionRegex.exec(text)) !== null) {
		mentions.push(match[1]);
	}

	// Remove mentions from text for clean display
	const cleanText = text.replace(mentionRegex, "").replace(/\s+/g, " ").trim();

	return { cleanText, mentions };
}

/**
 * Checks if a message contains any @mentions.
 */
export function hasMentions(text: string): boolean {
	return /@([a-zA-Z0-9_-]+)/.test(text);
}
