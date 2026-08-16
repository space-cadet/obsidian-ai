import type {
	StorageAdapter,
	EncryptedSession,
	RemoteSessionMeta,
} from "./StorageAdapter";

export interface WebDAVConfig {
	url: string; // e.g. https://nextcloud.example.com/remote.php/dav/files/username/
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
		this.prefix = (config.prefix || "obsidian-ai-sync/").replace(/\/$/, "") + "/";
		this.timeout = config.timeout ?? 30000;

		// Normalize base URL: ensure trailing slash on the WebDAV root
		let url = config.url.trim();
		if (!url.endsWith("/")) {
			url += "/";
		}
		this.baseUrl = url;

		// Verify connection by listing (probing the root directory)
		await this.propfind("", 0);
	}

	async disconnect(): Promise<void> {
		this.config = null;
		this.baseUrl = "";
	}

	async listSessions(): Promise<RemoteSessionMeta[]> {
		const prefixPath = this.prefix + "sessions/";
		const responses = await this.propfind(prefixPath, 1);

		const results: RemoteSessionMeta[] = [];
		for (const item of responses) {
			// Skip the directory itself
			if (item.href.endsWith("/sessions/") || item.href.endsWith("/" + prefixPath)) {
				continue;
			}
			// Extract session ID from filename (e.g., "session-abc.json" -> "session-abc")
			const filename = item.href.split("/").pop() || "";
			const id = filename.replace(/\.json$/, "");
			if (!id) continue;

			results.push({
				id,
				modifiedAt: item.lastModified ? new Date(item.lastModified).getTime() : Date.now(),
				etag: item.etag,
				size: item.contentLength,
			});
		}
		return results;
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

	async putSession(session: EncryptedSession): Promise<void> {
		// Ensure sessions directory exists
		await this.mkcol(this.prefix + "sessions/");

		const path = this.prefix + "sessions/" + session.id + ".json";
		const body = JSON.stringify(session);
		await this.put(path, body, "application/json");
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
		const path = this.prefix + "last-sync-time.txt";
		await this.put(path, String(time), "text/plain");
	}

	// ─── Internal WebDAV operations ───

	private async request(
		method: string,
		path: string,
		options: {
			body?: string;
			contentType?: string;
			headers?: Record<string, string>;
		} = {},
	): Promise<{ status: number; text: string; headers: Record<string, string> }> {
		if (!this.config) {
			throw new Error("WebDAV adapter not initialized");
		}

		const url = this.baseUrl + path;
		const headers: Record<string, string> = {
			Authorization:
				"Basic " +
				btoa(this.config.username + ":" + this.config.password),
			...(options.contentType ? { "Content-Type": options.contentType } : {}),
			...options.headers,
		};

		const response = await fetch(url, {
			method,
			headers,
			body: options.body,
			signal: AbortSignal.timeout(this.timeout),
		});

		const text = await response.text();
		const responseHeaders: Record<string, string> = {};
		response.headers.forEach((value, key) => {
			responseHeaders[key] = value;
		});

		if (!response.ok) {
			const err = new Error(
				`WebDAV ${method} failed: ${response.status} ${response.statusText} — ${text.slice(0, 200)}`,
			) as Error & { status: number };
			err.status = response.status;
			throw err;
		}

		return { status: response.status, text, headers: responseHeaders };
	}

	private async get(path: string): Promise<string> {
		const res = await this.request("GET", path);
		return res.text;
	}

	private async put(path: string, body: string, contentType: string): Promise<void> {
		await this.request("PUT", path, { body, contentType });
	}

	private async del(path: string): Promise<void> {
		await this.request("DELETE", path);
	}

	private async mkcol(path: string): Promise<void> {
		try {
			await this.request("MKCOL", path);
		} catch (err: any) {
			// 405 = Method Not Allowed = directory already exists
			if (err.status !== 405) {
				throw err;
			}
		}
	}

	private async propfind(
		path: string,
		depth: number,
	): Promise<Array<{ href: string; lastModified?: string; etag?: string; contentLength?: number }>> {
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
		const responses = doc.querySelectorAll("response");

		const results: Array<{
			href: string;
			lastModified?: string;
			etag?: string;
			contentLength?: number;
		}> = [];

		for (const response of Array.from(responses)) {
			const href = response.querySelector("href")?.textContent || "";
			const prop = response.querySelector("propstat prop");
			if (!prop) continue;

			const lastModified = prop.querySelector("getlastmodified")?.textContent || undefined;
			const etag = prop.querySelector("getetag")?.textContent || undefined;
			const contentLengthStr = prop.querySelector("getcontentlength")?.textContent;
			const contentLength = contentLengthStr ? parseInt(contentLengthStr, 10) : undefined;

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
