export const TOKEN_ESTIMATE_RATIO = 4;

/** Maximum size for full content-based token estimation (100KB) */
const MAX_INLINE_FILE_SIZE = 100 * 1024;

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

/** Estimate tokens for an Attachment object without full resolution.
 *  Uses inline data size when available, with a size-based fallback for large files.
 */
export function estimateAttachmentTokens(attachment: {
	type: string;
	data?: string;
	name: string;
}): number {
	// Images: fixed estimate regardless of size (APIs tokenize by dimensions)
	if (attachment.type === "image") {
		return IMAGE_TOKEN_ESTIMATE;
	}

	// PDFs: estimate from base64 data size or fallback
	if (attachment.type === "pdf") {
		if (attachment.data) {
			const base64Len = attachment.data.length;
			const byteSize = Math.ceil(base64Len * 0.75); // base64 → bytes
			return Math.ceil(byteSize / TOKEN_ESTIMATE_RATIO);
		}
		return PDF_PAGE_TOKEN_ESTIMATE;
	}

	// Text/markdown/generic files with inline data
	if (attachment.data) {
		const base64Len = attachment.data.length;
		const byteSize = Math.ceil(base64Len * 0.75);

		// For large files, use size-based estimate without decoding
		if (byteSize > MAX_INLINE_FILE_SIZE) {
			return Math.ceil(byteSize / TOKEN_ESTIMATE_RATIO);
		}

		try {
			const text = atob(attachment.data);
			return estimateTokens(text);
		} catch {
			// Binary data that can't be decoded as text
			return Math.ceil(byteSize / TOKEN_ESTIMATE_RATIO);
		}
	}

	// Vault files without inline data: rough estimate from name
	return estimateTokens(attachment.name) + 10;
}

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
		// Estimate from data size for any file type (PDFs, generic files, etc.)
		const base64Len = part.data.length;
		const byteSize = Math.ceil(base64Len * 0.75); // base64 → bytes
		return Math.ceil(byteSize / TOKEN_ESTIMATE_RATIO);
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
	return parts.reduce(
		(sum, part) => sum + estimateContentPartTokens(part),
		0,
	);
}
