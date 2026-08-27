import { requestUrl, TFile } from "obsidian";
import type { ToolResult } from "../../types";
import {
	ToolHandlerBase,
	type ToolHandlerContext,
} from "../ToolHandlerContext";
import { requestFingerprint } from "../../pagination";

/** Search the web and extract text from PDF files. */
export class WebHandlers extends ToolHandlerBase {
	constructor(context: ToolHandlerContext) {
		super(context);
	}

	async searchWeb(args: {
		query: string;
		limit?: number;
		cursor?: string;
	}): Promise<ToolResult> {
		const provider = this.settings?.webSearchProvider ?? "duckduckgo";
		const limit = Math.min(args.limit ?? 5, 20);

		try {
			let results: Array<{
				title: string;
				url: string;
				snippet: string;
			}> = [];

			if (!args.cursor) {
				const snapshotLimit = 20;
				if (provider === "brave") {
					results = await this.searchBrave(args.query, snapshotLimit);
				} else if (provider === "duckduckgo") {
					results = await this.searchDuckDuckGo(
						args.query,
						snapshotLimit,
					);
				} else if (provider === "searxng") {
					results = await this.searchSearXNG(
						args.query,
						snapshotLimit,
					);
				} else if (provider === "tavily") {
					results = await this.searchTavily(
						args.query,
						snapshotLimit,
					);
				} else if (provider === "exa") {
					results = await this.searchExa(args.query, snapshotLimit);
				}
			}

			const page = this.continuations.page({
				toolName: "search_web",
				fingerprint: requestFingerprint("search_web", {
					query: args.query,
					provider,
				}),
				items: results,
				limit,
				cursor: args.cursor,
			});
			if ("error" in page) return page;
			if (page.items.length === 0) {
				return { error: "No search results found." };
			}

			// Format as markdown for the LLM
			const formatted = page.items
				.map(
					(r, i) =>
						`${i + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.snippet}`,
				)
				.join("\n\n");

			return {
				success: true,
				content: formatted,
				query: args.query,
				count: page.items.length,
				total_count: page.total,
				has_more: page.hasMore,
				next_cursor: page.nextCursor,
			};
		} catch (e: any) {
			return {
				error: `Web search failed (${provider}): ${e.message || String(e)}`,
			};
		}
	}

	async readPdf(args: {
		source: string;
		max_pages?: number;
		start_page?: number;
	}): Promise<ToolResult> {
		const { extractPdfFromUrl, extractPdfFromBuffer } =
			await import("../../../utils/PdfExtractor");

		const maxPages = Math.min(Math.max(args.max_pages ?? 50, 1), 50);
		const startPage = Math.max(Math.floor(args.start_page ?? 1), 1);
		const source = args.source;

		try {
			let result;

			if (source.startsWith("http://") || source.startsWith("https://")) {
				// Online PDF
				result = await extractPdfFromUrl(source, {
					maxPages,
					startPage,
					method:
						(this.settings as any)?.pdfExtractionMethod || "auto",
					serverUrl: (this.settings as any)?.pdfExtractionServerUrl,
				});
			} else {
				// Vault file path
				const file = this.app.vault.getAbstractFileByPath(source);
				if (!file || !(file instanceof TFile)) {
					return { error: `PDF not found in vault: ${source}` };
				}
				const buffer = await this.app.vault.readBinary(file);
				result = await extractPdfFromBuffer(buffer, {
					maxPages,
					startPage,
				});
			}

			if (!result.success) {
				return { error: result.error || "PDF extraction failed" };
			}

			// Format as markdown for the LLM
			const meta = result.metadata;
			let header = `## PDF: ${source}\n\n`;
			if (meta?.title) header += `**Title:** ${meta.title}\n`;
			if (meta?.author) header += `**Author:** ${meta.author}\n`;
			const extractedPages = meta?.extractedPages ?? 0;
			const pageEnd =
				extractedPages > 0
					? startPage + extractedPages - 1
					: startPage - 1;
			const totalPages = meta?.totalPages ?? 0;
			if (totalPages) {
				header += `**Pages:** ${startPage}–${pageEnd} of ${totalPages} extracted\n`;
			}
			header += `**Word count:** ~${result.totalWordCount ?? "?"}\n\n---\n\n`;

			const body = result.fullText || "(No text extracted)";

			return {
				content: header + body,
				page_start: startPage,
				page_end: pageEnd,
				total_pages: totalPages || undefined,
				has_more: totalPages > 0 && pageEnd < totalPages,
				next_page:
					totalPages > 0 && pageEnd < totalPages
						? pageEnd + 1
						: undefined,
			};
		} catch (e: any) {
			return {
				error: `PDF read failed: ${e.message || String(e)}`,
			};
		}
	}

	private async searchBrave(
		query: string,
		limit: number,
	): Promise<Array<{ title: string; url: string; snippet: string }>> {
		const apiKey = this.settings?.braveApiKey;
		if (!apiKey) {
			throw new Error(
				"Brave Search API key not configured. Add it in Settings → Web Search.",
			);
		}

		const url = new URL("https://api.search.brave.com/res/v1/web/search");
		url.searchParams.set("q", query);
		url.searchParams.set("count", String(limit));
		url.searchParams.set("offset", "0");

		const res = await requestUrl({
			url: url.toString(),
			method: "GET",
			headers: {
				"X-Subscription-Token": apiKey,
				Accept: "application/json",
			},
		});

		if (res.status < 200 || res.status >= 300) {
			const text = res.text || "";
			throw new Error(`Brave API ${res.status}: ${text}`);
		}

		const data = JSON.parse(res.text);
		const results = data.web?.results ?? [];

		return results.slice(0, limit).map((r: any) => ({
			title: r.title ?? "Untitled",
			url: r.url ?? "",
			snippet: r.description ?? "",
		}));
	}

	private async searchDuckDuckGo(
		query: string,
		limit: number,
	): Promise<Array<{ title: string; url: string; snippet: string }>> {
		// DuckDuckGo HTML scraping — no API key needed
		const url = new URL("https://html.duckduckgo.com/html/");
		url.searchParams.set("q", query);
		url.searchParams.set("kl", "us-en"); // region

		const res = await requestUrl({
			url: url.toString(),
			method: "GET",
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0",
			},
		});

		if (res.status < 200 || res.status >= 300) {
			throw new Error(`DuckDuckGo ${res.status}`);
		}

		const html = res.text;
		const results: Array<{ title: string; url: string; snippet: string }> =
			[];

		// Parse using DOMParser instead of regex to avoid ReDoS
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, "text/html");

		// Find all result containers
		const resultDivs = doc.querySelectorAll(
			".result, .result__a, .result__snippet",
		);

		// Collect links and snippets
		const linkElements = doc.querySelectorAll("a.result__a");
		const snippetElements = doc.querySelectorAll("a.result__snippet");

		for (
			let i = 0;
			i < linkElements.length && results.length < limit;
			i++
		) {
			const linkEl = linkElements[i];
			const rawUrl = linkEl.getAttribute("href") ?? "";
			const title = this.stripHtml(linkEl.textContent ?? "");

			// Try to find matching snippet
			let snippet = "";
			if (snippetElements[i]) {
				snippet = this.stripHtml(snippetElements[i].textContent ?? "");
			}

			// DuckDuckGo redirects through their own URL — try to extract real URL
			let url = rawUrl;
			if (rawUrl.startsWith("//duckduckgo.com/l/")) {
				try {
					const u = new URL("https:" + rawUrl);
					url = u.searchParams.get("uddg") ?? rawUrl;
				} catch {
					// keep rawUrl
				}
			}

			if (title && url) {
				results.push({ title, url, snippet });
			}
		}

		return results;
	}

	private async searchSearXNG(
		query: string,
		limit: number,
	): Promise<Array<{ title: string; url: string; snippet: string }>> {
		const baseUrl = this.settings?.searxngUrl?.replace(/\/$/, "");
		if (!baseUrl) {
			throw new Error(
				"SearXNG URL not configured. Add it in Settings → Web Search.",
			);
		}

		const url = new URL(`${baseUrl}/search`);
		url.searchParams.set("q", query);
		url.searchParams.set("format", "json");
		url.searchParams.set("language", "en");

		const res = await requestUrl({ url: url.toString(), method: "GET" });
		if (res.status < 200 || res.status >= 300) {
			throw new Error(`SearXNG ${res.status}`);
		}

		const data = JSON.parse(res.text);
		const results = data.results ?? [];

		return results.slice(0, limit).map((r: any) => ({
			title: r.title ?? "Untitled",
			url: r.url ?? "",
			snippet: r.content ?? r.abstract ?? "",
		}));
	}

	private async searchTavily(
		query: string,
		limit: number,
	): Promise<Array<{ title: string; url: string; snippet: string }>> {
		const apiKey = this.settings?.tavilyApiKey;
		if (!apiKey) {
			throw new Error(
				"Tavily API key not configured. Add it in Settings → Web Search.",
			);
		}

		const res = await requestUrl({
			url: "https://api.tavily.com/search",
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				api_key: apiKey,
				query,
				search_depth: "basic",
				max_results: limit,
				include_answer: false,
				include_images: false,
				include_raw_content: false,
			}),
		});

		if (res.status < 200 || res.status >= 300) {
			const text = res.text || "";
			throw new Error(`Tavily API ${res.status}: ${text}`);
		}

		const data = JSON.parse(res.text);
		const results = data.results ?? [];

		return results.slice(0, limit).map((r: any) => ({
			title: r.title ?? "Untitled",
			url: r.url ?? "",
			snippet: r.content ?? r.snippet ?? "",
		}));
	}

	private async searchExa(
		query: string,
		limit: number,
	): Promise<Array<{ title: string; url: string; snippet: string }>> {
		const apiKey = this.settings?.exaApiKey;
		if (!apiKey) {
			throw new Error(
				"Exa API key not configured. Add it in Settings → Web Search.",
			);
		}

		const res = await requestUrl({
			url: "https://api.exa.ai/search",
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				query,
				num_results: limit,
				use_autoprompt: false,
				contents: {
					text: { max_characters: 500 },
				},
			}),
		});

		if (res.status < 200 || res.status >= 300) {
			const text = res.text || "";
			throw new Error(`Exa API ${res.status}: ${text}`);
		}

		const data = JSON.parse(res.text);
		const results = data.results ?? [];

		return results.slice(0, limit).map((r: any) => ({
			title: r.title ?? r.author ?? "Untitled",
			url: r.url ?? "",
			snippet: r.text ?? r.highlight ?? "",
		}));
	}

	private stripHtml(html: string): string {
		return html
			.replace(/<[^>]+>/g, "")
			.replace(/&amp;/g, "&")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/&nbsp;/g, " ")
			.trim();
	}

	/* ───────────────────────────────────────────────────────────
	 * Memory (T26 Intelligence Layer)
	 * ─────────────────────────────────────────────────────────── */

	/* ───────────────────────────────────────────────────────────
	 * Memory CRUD (T26 Intelligence Layer)
	 * ─────────────────────────────────────────────────────────── */
}
