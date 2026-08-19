/**
 * PDF text extraction utility for obsidian-ai.
 *
 * Supports two extraction methods:
 * 1. Server-side (default): Calls the PyMuPDF extraction endpoint
 * 2. Client-side (fallback): Uses pdfjs-dist in the browser/Electron environment
 *
 * Users can configure the method in settings. "auto" tries server first, falls back to client.
 */

import * as pdfjs from "pdfjs-dist";

// Text extraction works without worker — we don't need rendering

export interface PdfExtractionOptions {
	/** Max pages to extract (default: 50) */
	maxPages?: number;
	/** Server endpoint URL */
	serverUrl?: string;
	/** Extraction method */
	method?: "auto" | "server" | "client";
}

export interface PdfExtractionResult {
	success: boolean;
	metadata?: {
		title: string;
		author: string;
		subject: string;
		creator: string;
		totalPages: number;
		extractedPages: number;
	};
	pages?: Array<{
		pageNumber: number;
		text: string;
		wordCount: number;
	}>;
	fullText?: string;
	totalWordCount?: number;
	error?: string;
}

/**
 * Extract text from a PDF URL using the server endpoint (PyMuPDF).
 */
async function extractFromServer(
	url: string,
	options: PdfExtractionOptions = {},
): Promise<PdfExtractionResult> {
	const serverUrl =
		options.serverUrl || "https://quantumofgravity.com/relay/pdf-extract/";
	const maxPages = options.maxPages ?? 50;

	try {
		const response = await fetch(`${serverUrl}extract`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url, max_pages: maxPages }),
		});

		if (!response.ok) {
			const error = await response
				.json()
				.catch(() => ({ error: `HTTP ${response.status}` }));
			return {
				success: false,
				error: error.error || `Server error: ${response.status}`,
			};
		}

		const data = await response.json();

		if (!data.success) {
			return {
				success: false,
				error: data.error || "Unknown server error",
			};
		}

		return {
			success: true,
			metadata: data.metadata
				? {
						title: data.metadata.title || "",
						author: data.metadata.author || "",
						subject: data.metadata.subject || "",
						creator: data.metadata.creator || "",
						totalPages: data.metadata.total_pages || 0,
						extractedPages: data.metadata.extracted_pages || 0,
					}
				: undefined,
			pages: data.pages?.map((p: any) => ({
				pageNumber: p.page_number,
				text: p.text,
				wordCount: p.word_count,
			})),
			fullText: data.full_text,
			totalWordCount: data.total_word_count,
		};
	} catch (err: any) {
		return {
			success: false,
			error: `Server extraction failed: ${err.message}`,
		};
	}
}

/**
 * Extract text from a PDF ArrayBuffer using pdfjs-dist (client-side).
 */
async function extractFromClient(
	arrayBuffer: ArrayBuffer,
	options: PdfExtractionOptions = {},
): Promise<PdfExtractionResult> {
	const maxPages = options.maxPages ?? 50;

	try {
		const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
		const pdf = await loadingTask.promise;

		const totalPages = pdf.numPages;
		const pagesToExtract = Math.min(maxPages, totalPages);

		const pages: Array<{
			pageNumber: number;
			text: string;
			wordCount: number;
		}> = [];

		for (let i = 1; i <= pagesToExtract; i++) {
			const page = await pdf.getPage(i);
			const textContent = await page.getTextContent();
			const text = textContent.items
				.map((item: any) => ("str" in item ? item.str : ""))
				.join(" ");
			pages.push({
				pageNumber: i,
				text,
				wordCount: text.split(/\s+/).filter(Boolean).length,
			});
		}

		const fullText = pages.map((p) => p.text).join("\n\n");

		return {
			success: true,
			metadata: {
				title: "",
				author: "",
				subject: "",
				creator: "",
				totalPages,
				extractedPages: pagesToExtract,
			},
			pages,
			fullText,
			totalWordCount: fullText.split(/\s+/).filter(Boolean).length,
		};
	} catch (err: any) {
		return {
			success: false,
			error: `Client extraction failed: ${err.message}`,
		};
	}
}

/**
 * Extract text from a PDF by URL.
 * Uses server-side extraction by default, falls back to client-side if configured or server fails.
 */
export async function extractPdfFromUrl(
	url: string,
	options: PdfExtractionOptions = {},
): Promise<PdfExtractionResult> {
	const method = options.method || "auto";

	if (method === "server" || method === "auto") {
		const result = await extractFromServer(url, options);
		if (result.success || method === "server") {
			return result;
		}
		// Auto: fall through to client-side
	}

	// Client-side: fetch PDF then extract
	try {
		const response = await fetch(url);
		if (!response.ok) {
			return {
				success: false,
				error: `Failed to fetch PDF: HTTP ${response.status}`,
			};
		}
		const arrayBuffer = await response.arrayBuffer();
		return extractFromClient(arrayBuffer, options);
	} catch (err: any) {
		return {
			success: false,
			error: `Failed to fetch/extract PDF: ${err.message}`,
		};
	}
}

/**
 * Extract text from a PDF ArrayBuffer (vault file or drag-and-drop).
 * Uses client-side extraction (server requires URL).
 */
export async function extractPdfFromBuffer(
	arrayBuffer: ArrayBuffer,
	options: PdfExtractionOptions = {},
): Promise<PdfExtractionResult> {
	return extractFromClient(arrayBuffer, options);
}
