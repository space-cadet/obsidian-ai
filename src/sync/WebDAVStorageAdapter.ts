import type {
	StorageAdapter,
	EncryptedSession,
	RemoteSessionMeta,
} from "./StorageAdapter";
import { requestUrl } from "obsidian";

export interface WebDAVConfig {
	url: string;
	username: string;
	password: string;
	/** Path prefix for storing sessions (default: obsidian-ai-sync/) */
	prefix?: string;
	/** Timeout in ms for requests (default: 30000) */
	timeout?: number;
}

/**
 * WebDAV storage adapter for Nextcloud, ownCloud, and generic WebDAV servers.
 *
 * Uses Obsidian's requestUrl for reliable network requests in the Electron sandbox.
 * Stores encrypted sessions as JSON files in a configurable prefix directory.
 */
export class WebDAVStorageAdapter implements StorageAdapter {
	readonly name = "WebDAV";
	private config: WebDAVConfig | null = null;
	private baseUrl: string = "";
	private prefix: string = "";
	private timeout: number = 30000;

	async initialize(config: WebDAVConfig): Promise<void> {
		this.config = config;
		this.prefix =
			(config.prefix || "obsidian-ai-sync/").replace(/\/$/, "") + "/";
		this.timeout = config.timeout ?? 30000;

		// Normalize base URL: ensure trailing slash on the WebDAV root
		let url = config.url.trim();
		if (!url.endsWith("/")) {
			url += "/";
		}
		this.baseUrl = url;

		// Verify connection by listing (probing the root directory)
		await this.propfind("", 0);

		// Ensure prefix directory exists (creates if missing, no-op if exists)
		await this.mkcol(this.prefix);
	}

	async disconnect(): Promise<void> {
		this.config = null;
		this.baseUrl = "";
	}

	async listSessions(): Promise<RemoteSessionMeta[]> {
		const prefixPath = this.prefix + "sessions/";
		try {
			const responses = await this.propfind(prefixPath, 1);
			const results: RemoteSessionMeta[] = [];
			for (const item of responses) {
				// Skip the directory itself
				if (
					item.href.endsWith("/sessions/") ||
					item.href.endsWith("/" + prefixPath)
				) {
					continue;
				}
				// Extract session ID from filename (e.g., "session-abc.json" -> "session-abc")
				const filename = item.href.split("/").pop() || "";
				const id = filename.replace(/\.json$/, "");
				if (!id) continue;

				results.push({
					id,
					modifiedAt: item.lastModified
						? new Date(item.lastModified).getTime()
						: Date.now(),
					etag: item.etag,
					size: item.contentLength,
				});
			}
			return results;
		} catch (err: any) {
			// 404 = sessions directory doesn't exist yet (first sync) → empty list
			if (err.status === 404 || err.message?.includes("404")) {
				return [];
			}
			throw err;
		}
	}

	async getSession(id: string): Promise<EncryptedSession | null> {
		const path = this.prefix + "sessions/" + id + ".json";
		try {
			const content = await this.get(path);
			return JSON.parse(content) as EncryptedSession;
		} catch (err: any) {
			// 404 = not found
			if (err.status === 404 || err.message?.includes("404")) {
				return null;
			}
			throw err;
		}
	}

	async putSession(
		session: EncryptedSession,
	): Promise<{ etag?: string; modifiedAt?: number }> {
		// Ensure prefix and sessions directories exist
		await this.mkcol(this.prefix);
		await this.mkcol(this.prefix + "sessions/");

		const path = this.prefix + "sessions/" + session.id + ".json";
		const body = JSON.stringify(session);
		const res = await this.put(path, body, "application/json");

		// Extract ETag from response headers (Nextcloud returns it on PUT)
		const etag = res.headers.etag || res.headers.ETag;
		return { etag, modifiedAt: session.modifiedAt };
	}

	async deleteSession(id: string): Promise<void> {
		const path = this.prefix + "sessions/" + id + ".json";
		await this.del(path);
	}

	async getLastSyncTime(): Promise<number | null> {
		try {
			const path = this.prefix + "last-sync-time.txt";
			const content = await this.get(path);
			const time = parseInt(content.trim(), 10);
			return Number.isNaN(time) ? null : time;
		} catch {
			return null;
		}
	}

	async setLastSyncTime(time: number): Promise<void> {
		await this.mkcol(this.prefix);
		const path = this.prefix + "last-sync-time.txt";
		await this.put(path, String(time), "text/plain");
	}

	async writeText(path: string, content: string): Promise<void> {
		const fullPath = this.prefix + path;
		// Ensure parent directory exists
		const parent = fullPath.split("/").slice(0, -1).join("/") + "/";
		if (parent && parent !== "/") {
			await this.mkcol(parent);
		}
		await this.put(fullPath, content, "text/plain");
	}

	// ─── Internal WebDAV operations ───

	private getAuthHeader(): string {
		if (!this.config) {
			throw new Error("WebDAV adapter not initialized");
		}
		// UTF-8 safe base64 encoding for non-Latin-1 credentials
		const encoder = new TextEncoder();
		const bytes = encoder.encode(
			this.config.username + ":" + this.config.password,
		);
		const base64 = Array.from(bytes)
			.map((b) => String.fromCharCode(b))
			.join("");
		return "Basic " + btoa(base64);
	}

	private async request(
		method: string,
		path: string,
		options: {
			body?: string;
			contentType?: string;
			headers?: Record<string, string>;
		} = {},
	): Promise<{
		status: number;
		text: string;
		headers: Record<string, string>;
	}> {
		if (!this.config) {
			throw new Error("WebDAV adapter not initialized");
		}

		const url = this.baseUrl + path;
		const headers: Record<string, string> = {
			Authorization: this.getAuthHeader(),
			...(options.contentType
				? { "Content-Type": options.contentType }
				: {}),
			...options.headers,
		};

		try {
			const res = await requestUrl({
				url,
				method,
				headers,
				body: options.body,
				throw: false,
			});

			const responseHeaders: Record<string, string> = {};
			if (res.headers) {
				for (const [key, value] of Object.entries(res.headers)) {
					responseHeaders[key] = String(value);
				}
			}

			if (res.status >= 400) {
				const err = new Error(
					`WebDAV ${method} failed: ${res.status} — ${res.text.slice(0, 200)}`,
				) as Error & { status: number; debugInfo?: string };
				err.status = res.status;
				err.debugInfo = JSON.stringify({
					url,
					method,
					status: res.status,
					responseText: res.text.slice(0, 500),
				});
				throw err;
			}

			return {
				status: res.status,
				text: res.text,
				headers: responseHeaders,
			};
		} catch (err: any) {
			// If requestUrl itself fails (network error), wrap it
			if (!err.status) {
				const wrapped = new Error(
					`WebDAV ${method} network error: ${err.message}`,
				) as Error & { status: number };
				wrapped.status = 0;
				throw wrapped;
			}
			throw err;
		}
	}

	private async get(path: string): Promise<string> {
		const res = await this.request("GET", path);
		return res.text;
	}

	private async put(
		path: string,
		body: string,
		contentType: string,
	): Promise<{ status: number; headers: Record<string, string> }> {
		return await this.request("PUT", path, { body, contentType });
	}

	private async del(path: string): Promise<void> {
		await this.request("DELETE", path);
	}

	private async mkcol(path: string): Promise<void> {
		try {
			await this.request("MKCOL", path);
		} catch (err: any) {
			// 405 = Method Not Allowed = directory already exists
			if (err.status === 405) {
				return;
			}
			// 409 = Conflict = parent directory doesn't exist
			// Try creating parent directories recursively
			if (err.status === 409) {
				const parent =
					path.replace(/\/$/, "").split("/").slice(0, -1).join("/") +
					"/";
				if (parent && parent !== "/" && parent !== path) {
					await this.mkcol(parent);
					await this.request("MKCOL", path);
					return;
				}
			}
			throw err;
		}
	}

	private async propfind(
		path: string,
		depth: number,
	): Promise<
		Array<{
			href: string;
			lastModified?: string;
			etag?: string;
			contentLength?: number;
		}>
	> {
		const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:getlastmodified/>
    <D:getetag/>
    <D:getcontentlength/>
  </D:prop>
</D:propfind>`;

		const res = await this.request("PROPFIND", path, {
			body: xml,
			contentType: "application/xml; charset=utf-8",
			headers: { Depth: String(depth) },
		});

		return this.parsePropfind(res.text);
	}

	private parsePropfind(xml: string): Array<{
		href: string;
		lastModified?: string;
		etag?: string;
		contentLength?: number;
	}> {
		const parser = new DOMParser();
		const doc = parser.parseFromString(xml, "application/xml");
		// Use namespace-aware lookup for DAV: responses
		const responses = doc.getElementsByTagNameNS("DAV:", "response");

		const results: Array<{
			href: string;
			lastModified?: string;
			etag?: string;
			contentLength?: number;
		}> = [];

		for (const response of Array.from(responses)) {
			const href =
				response.getElementsByTagNameNS("DAV:", "href")[0]
					?.textContent || "";
			const propstat = response.getElementsByTagNameNS(
				"DAV:",
				"propstat",
			)[0];
			if (!propstat) continue;
			const prop = propstat.getElementsByTagNameNS("DAV:", "prop")[0];
			if (!prop) continue;

			const lastModified =
				prop.getElementsByTagNameNS("DAV:", "getlastmodified")[0]
					?.textContent || undefined;
			const etag =
				prop.getElementsByTagNameNS("DAV:", "getetag")[0]
					?.textContent || undefined;
			const contentLengthStr = prop.getElementsByTagNameNS(
				"DAV:",
				"getcontentlength",
			)[0]?.textContent;
			const contentLength = contentLengthStr
				? parseInt(contentLengthStr, 10)
				: undefined;

			results.push({
				href,
				lastModified,
				etag,
				contentLength,
			});
		}

		return results;
	}
}
