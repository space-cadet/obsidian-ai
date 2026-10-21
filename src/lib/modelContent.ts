import type { MessageContentPart } from "../api";

/** Normalize persisted file parts before sending model messages to the AI SDK. */
export function normalizeModelContentPart(part: unknown): MessageContentPart {
	if (typeof part !== "object" || part === null) {
		return part as MessageContentPart;
	}

	const candidate = part as Record<string, unknown>;
	if (candidate.type !== "file" || typeof candidate.data !== "string") {
		return part as MessageContentPart;
	}

	// Older transcripts stored `mimeType`; the SDK's ModelMessage schema uses
	// `mediaType`. Keep any other file-part fields when translating the legacy key.
	const mediaType =
		typeof candidate.mediaType === "string"
			? candidate.mediaType
			: typeof candidate.mimeType === "string"
				? candidate.mimeType
				: "application/pdf";
	const normalized = { ...candidate, mediaType };
	delete (normalized as Record<string, unknown>).mimeType;
	return normalized as MessageContentPart;
}
