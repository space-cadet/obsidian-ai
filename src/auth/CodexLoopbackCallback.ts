import type { IncomingMessage, Server, ServerResponse } from "http";

export const CODEX_REDIRECT_URI = "http://127.0.0.1:1455/auth/callback";
const CALLBACK_TIMEOUT_MS = 10 * 60 * 1000;

export interface CodexLoopbackCallbackListener {
	callbackUrl: Promise<string | null>;
	close: () => void;
}

const respond = (
	response: ServerResponse,
	status: number,
	body: string,
): void => {
	response.writeHead(status, {
		"Content-Type": "text/html; charset=utf-8",
		"Cache-Control": "no-store",
		"X-Content-Type-Options": "nosniff",
	});
	response.end(body);
};

const handleCallback = (
	request: IncomingMessage,
	response: ServerResponse,
	finish: (url: string | null) => void,
): void => {
	if (request.method !== "GET") {
		respond(response, 405, "<p>Use the sign-in link from Chat Lab.</p>");
		return;
	}
	const callback = new URL(request.url ?? "/", CODEX_REDIRECT_URI);
	if (callback.pathname !== "/auth/callback") {
		respond(response, 404, "<p>Not found.</p>");
		return;
	}
	respond(
		response,
		200,
		'<!doctype html><meta name="viewport" content="width=device-width"><title>Chat Lab sign-in</title><p>Sign-in response received. Return to Obsidian to finish connecting Codex.</p>',
	);
	finish(
		`${new URL(CODEX_REDIRECT_URI).origin}${callback.pathname}${callback.search}`,
	);
};

/**
 * Start the SIWC loopback callback on desktop. Mobile uses the same redirect
 * URI and asks the user to paste the browser's final URL because Obsidian
 * mobile does not expose a local HTTP server to plugins.
 */
export async function startCodexLoopbackCallbackListener(
	isMobile: boolean,
): Promise<CodexLoopbackCallbackListener | null> {
	if (isMobile || typeof require !== "function") return null;

	let http: typeof import("http");
	try {
		http = require("http") as typeof import("http");
	} catch {
		return null;
	}

	return new Promise((resolve) => {
		let listening = false;
		let finished = false;
		let timeout: ReturnType<typeof setTimeout> | undefined;
		let resolveCallback!: (url: string | null) => void;
		const callbackUrl = new Promise<string | null>((settle) => {
			resolveCallback = settle;
		});
		let server: Server;
		const finish = (url: string | null): void => {
			if (finished) return;
			finished = true;
			if (timeout) clearTimeout(timeout);
			resolveCallback(url);
			server.close();
		};
		server = http.createServer((request, response) =>
			handleCallback(request, response, finish),
		);
		server.once("error", () => {
			if (!listening) {
				resolve(null);
				return;
			}
			finish(null);
		});
		try {
			server.listen(1455, "127.0.0.1", () => {
				listening = true;
				timeout = setTimeout(() => finish(null), CALLBACK_TIMEOUT_MS);
				resolve({ callbackUrl, close: () => finish(null) });
			});
		} catch {
			resolve(null);
		}
	});
}
