export interface ToolCall {
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
	/**
	 * Provider-owned data associated with this exact call. Gemini stores its
	 * required thought signature here, so an agent loop must return it unchanged
	 * with the matching function call on the next step.
	 */
	providerMetadata?: Record<string, unknown>;
}

import type { ProviderTokenUsage } from "../types";

export interface ToolResult {
	success?: boolean;
	content?: string;
	error?: string;
	warning?: string;
	path?: string;
	oldPath?: string;
	entry?: string;
	matches?: Array<{
		path: string;
		basename: string;
		modified?: number;
		created?: number;
		size?: number;
	}>;
	count?: number;
	totalCount?: number;
	markdownCount?: number;
	directCount?: number;
	directMarkdownCount?: number;
	subfolderCount?: number;
	subfolders?: string[];
	query?: string;
	folder?: string;
	/** Total number of matches found (may exceed returned count if truncated). */
	total_matches?: number;
	/** Whether results were truncated due to limit. */
	truncated?: boolean;
	/** Whether another bounded result page is available. */
	has_more?: boolean;
	/** Opaque cursor for requesting the next bounded result page. */
	next_cursor?: string;
	/** Total number of items in the bounded result set. */
	total_count?: number;
	/** Starting PDF page for an extracted page range. */
	page_start?: number;
	/** Ending PDF page for an extracted page range. */
	page_end?: number;
	/** Total pages in a PDF, when known. */
	total_pages?: number;
	/** Next PDF page to request, when more pages are available. */
	next_page?: number;
	/** Array of paths for count-only search results. */
	paths?: string[];
	/** Results array for batch operations like check_paths. */
	results?: Array<Record<string, unknown>>;
	/** Summary string for batch operations. */
	summary?: string;
	notes?: Array<{
		path: string;
		basename: string;
		modified?: number;
		created?: number;
		size?: number;
	}>;
	folders?: string[];
	parent?: string;
	basename?: string;
	wordCount?: number;
	created?: number;
	modified?: number;
	size?: number;
	sessionResults?: Array<{
		sessionId: string;
		messageId: string;
		timestamp: number;
		snippet: string;
	}>;
	createdPaths?: string[];
	skippedPaths?: string[];
	/** Memory entry ID returned by memory CRUD operations. */
	id?: string;
	/** Public provider metadata for a redacted tool-result card. */
	providerId?: string;
	providerName?: string;
	capabilityTitle?: string;
	risk?: "read" | "write" | "remote-write" | "destructive";
	/** Sanitized plugin settings returned by read_settings. */
	settings?: Record<string, unknown>;
	/** Updated setting key returned by update_setting. */
	key?: string;
	/** Updated setting value returned by update_setting. */
	value?: unknown;
}

export type StreamEvent =
	| { type: "text-delta"; text: string }
	| { type: "reasoning-delta"; text: string }
	| { type: "tool-call"; call: ToolCall }
	| { type: "tool-result"; callId: string; result: unknown }
	| { type: "tool-error"; callId: string; error: string }
	| { type: "finish"; reason: string; providerUsage?: ProviderTokenUsage }
	| { type: "error"; message: string };
