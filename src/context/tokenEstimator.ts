export const TOKEN_ESTIMATE_RATIO = 4;

/**
 * Rough token estimation for text using characters / 4.
 */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / TOKEN_ESTIMATE_RATIO);
}

/** Approximate tokens per image (OpenAI convention: ~85 per tile, ~765 for 1024x1024) */
const IMAGE_TOKEN_ESTIMATE = 255;

/** Approximate tokens per PDF page (rough heuristic) */
const PDF_PAGE_TOKEN_ESTIMATE = 500;

/** Estimate tokens for a content part (text, image, or file). */
export function estimateContentPartTokens(
	part:
		| { type: "text"; text: string }
		| { type: "image"; image: string }
		| { type: "file"; data: string; mimeType: string }
		| { type: "text"; content: string }, // for ContentPart compatibility
): number {
	if (part.type === "text") {
		const text = "text" in part ? part.text : (part as any).content;
		return estimateTokens(text || "");
	}
	if (part.type === "image") {
		return IMAGE_TOKEN_ESTIMATE;
	}
	if (part.type === "file") {
		if (part.mimeType === "application/pdf") {
			// Rough heuristic: base64 size / 4 ≈ bytes, ~500 tokens per 4KB
			const base64Len = part.data.length;
			const byteSize = Math.ceil(base64Len * 0.75); // base64 → bytes
			return Math.ceil(byteSize / TOKEN_ESTIMATE_RATIO);
		}
		return estimateTokens("[file]");
	}
	return 0;
}

/** Estimate tokens for an array of content parts. */
export function estimateContentPartsTokens(
	parts: Array<
		| { type: "text"; text: string }
		| { type: "image"; image: string }
		| { type: "file"; data: string; mimeType: string }
	>,
): number {
	return parts.reduce((sum, part) => sum + estimateContentPartTokens(part), 0);
}
