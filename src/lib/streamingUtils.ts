import type { ContentPart } from "../types";

/**
 * Extract pending text since the last checkpoint and append it as a text part.
 * Used when a tool call boundary is detected during streaming.
 */
export function appendPendingText(
	fullText: string,
	textCheckpoint: number,
	contentParts: ContentPart[],
): { parts: ContentPart[]; checkpoint: number } {
	const pendingText = fullText.slice(textCheckpoint);
	if (!pendingText)
		return { parts: contentParts, checkpoint: textCheckpoint };
	return {
		parts: [...contentParts, { type: "text", content: pendingText }],
		checkpoint: fullText.length,
	};
}

/**
 * Get the text remaining after the last text content part.
 * Returns empty string if no remaining text or if last text part not found.
 */
export function getRemainingText(
	content: string,
	lastTextPart: string,
): string {
	if (!lastTextPart) return content;
	const idx = content.lastIndexOf(lastTextPart);
	if (idx < 0) return content;
	return content.slice(idx + lastTextPart.length);
}

/**
 * Rebuild content parts from accumulated state.
 * Call at the end of streaming to ensure all text is captured.
 */
export function finalizeContentParts(
	fullText: string,
	textCheckpoint: number,
	contentParts: ContentPart[],
	additionalParts: ContentPart[] = [],
): ContentPart[] {
	const pendingText = fullText.slice(textCheckpoint);
	const result = [...contentParts];
	if (pendingText) {
		result.push({ type: "text", content: pendingText });
	}
	if (additionalParts.length > 0) {
		result.push(...additionalParts);
	}
	return result;
}
