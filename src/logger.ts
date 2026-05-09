import { App } from "obsidian";

const ORIGINAL = {
	log: console.log,
	error: console.error,
	warn: console.warn,
	info: console.info,
};

export class FileLogger {
	private buffer: string[] = [];
	private flushTimer: number | null = null;
	private memoryTimer: number | null = null;
	private logPath: string;
	private readonly maxSize: number;
	private readonly app: App;
	private initialized = false;

	constructor(app: App, pluginId: string, maxSizeBytes = 5 * 1024 * 1024) {
		this.app = app;
		this.logPath = `${app.vault.configDir}/plugins/${pluginId}/debug.log`;
		this.maxSize = maxSizeBytes;
	}

	async init() {
		if (this.initialized) return;
		this.initialized = true;

		// Expose globally so React ErrorBoundary can log even if plugin ref is unavailable
		(window as any).__obsidianAiLogger = this;

		this.wrapConsole();
		this.setupErrorHandlers();

		this.writeDirect("info", "=== Obsidian AI debug log started ===");
		this.writeDirect("info", `User agent: ${navigator.userAgent}`);
		this.writeDirect("info", `Obsidian version: ${(window as any).app?.version || "unknown"}`);

		// Log initial memory snapshot and start periodic logging
		this.logMemorySnapshot();
		this.memoryTimer = window.setInterval(() => {
			this.logMemorySnapshot();
		}, 10000);
	}

	/**
	 * Log a message. Buffers by default; errors are flushed immediately.
	 */
	log(level: string, ...args: any[]) {
		const line = this.formatLine(level, ...args);
		this.buffer.push(line);

		if (level === "error" || level === "fatal") {
			this.flushNow();
		} else {
			this.scheduleFlush();
		}
	}

	/**
	 * Force flush the buffer to disk. Fire-and-forget; safe to call anytime.
	 */
	flushNow() {
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}
		// Fire-and-forget; don't block or throw.
		this.flush().catch(() => {});
	}

	/**
	 * Erase the log file on disk.
	 */
	async clear() {
		this.buffer = [];
		try {
			await (this.app.vault.adapter as any).write(this.logPath, "");
		} catch {
			/* ignore */
		}
	}

	/**
	 * Stop the periodic memory logger. Call from plugin onunload.
	 */
	stopMemoryLogging() {
		if (this.memoryTimer) {
			clearInterval(this.memoryTimer);
			this.memoryTimer = null;
		}
	}

	/**
	 * Log a snapshot of memory and DOM usage.
	 */
	logMemorySnapshot() {
		const mem = (performance as any).memory;
		const domNodes = document.getElementsByTagName("*").length;
		if (mem) {
			this.log(
				"metric",
				`Memory — used: ${(mem.usedJSHeapSize / 1024 / 1024).toFixed(1)} MB, ` +
					`total: ${(mem.totalJSHeapSize / 1024 / 1024).toFixed(1)} MB, ` +
					`limit: ${(mem.jsHeapSizeLimit / 1024 / 1024).toFixed(1)} MB, ` +
					`DOM nodes: ${domNodes}`,
			);
		} else {
			this.log("metric", `Memory — N/A, DOM nodes: ${domNodes}`);
		}
	}

	private formatLine(level: string, ...args: any[]): string {
		const timestamp = new Date().toISOString();
		const message = args
			.map((a) => {
				if (a instanceof Error) return a.stack || a.message;
				if (typeof a === "object") {
					try {
						return JSON.stringify(a);
					} catch {
						return String(a);
					}
				}
				return String(a);
			})
			.join(" ");
		return `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
	}

	/**
	 * Log and flush immediately. Use for crash-critical paths where
	 * the buffer must hit disk before the next line of code runs.
	 */
	writeDirect(level: string, ...args: any[]) {
		const line = this.formatLine(level, ...args);
		this.buffer.push(line);
		this.flushNow();
	}

	private wrapConsole() {
		console.log = (...args: any[]) => {
			ORIGINAL.log.apply(console, args);
			this.log("log", ...args);
		};
		console.error = (...args: any[]) => {
			ORIGINAL.error.apply(console, args);
			this.log("error", ...args);
		};
		console.warn = (...args: any[]) => {
			ORIGINAL.warn.apply(console, args);
			this.log("warn", ...args);
		};
		console.info = (...args: any[]) => {
			ORIGINAL.info.apply(console, args);
			this.log("info", ...args);
		};
	}

	private setupErrorHandlers() {
		const origOnError = window.onerror;
		window.onerror = (msg, url, line, col, err) => {
			this.writeDirect(
				"fatal",
				`window.onerror: ${msg} at ${url}:${line}:${col}`,
				err?.stack || "",
			);
			if (origOnError) {
				return origOnError.call(window, msg, url, line, col, err);
			}
			return false;
		};

		const origOnRejection = window.onunhandledrejection;
		window.onunhandledrejection = (event) => {
			this.writeDirect(
				"fatal",
				`Unhandled rejection:`,
				event.reason instanceof Error
					? event.reason.stack || event.reason.message
					: String(event.reason),
			);
			if (origOnRejection) {
				return origOnRejection.call(window, event);
			}
		};
	}

	private scheduleFlush() {
		if (this.flushTimer) return;
		this.flushTimer = window.setTimeout(() => {
			this.flushTimer = null;
			this.flush().catch(() => {});
		}, 250);
	}

	private async flush() {
		if (this.buffer.length === 0) return;

		const content = this.buffer.join("");
		this.buffer = [];

		try {
			const adapter = this.app.vault.adapter as any;

			if (typeof adapter.append === "function") {
				await adapter.append(this.logPath, content);
			} else {
				let existing = "";
				try {
					existing = await adapter.read(this.logPath);
				} catch {
					/* file may not exist yet */
				}

				const combined = existing + content;
				if (combined.length > this.maxSize) {
					// Keep the last half + a truncation marker
					const half = Math.floor(this.maxSize / 2);
					const truncated = combined.slice(-half);
					await adapter.write(
						this.logPath,
						`...[truncated]...\n${truncated}`,
					);
				} else {
					await adapter.write(this.logPath, combined);
				}
			}
		} catch (e) {
			// Never use console here (would recurse). Use original silently.
			ORIGINAL.error("[FileLogger] flush failed:", e);
		}
	}
}

export function createFileLogger(app: App, pluginId: string): FileLogger {
	return new FileLogger(app, pluginId);
}
