import { App, Modal } from "obsidian";
import type { SyncResult } from "./StorageAdapter";
import type { StorageAdapter } from "./StorageAdapter";

export interface SyncLogEntry {
	timestamp: number;
	deviceId: string;
	action: "upload" | "download" | "conflict" | "delete" | "skip" | "error";
	sessionId?: string;
	sessionTitle?: string;
	message: string;
}

export interface SyncSessionRecord {
	timestamp: number;
	deviceId: string;
	result: SyncResult & { message: string };
	durationMs: number;
}

/** T42g rotation policy (obsidian-syncit SyncLogger parity). */
const MAX_LOG_LINES = 1000;
const MAX_LOG_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const MAX_LOG_BYTES = 512 * 1024; // 512 KB
const BACKUP_NAME = "sync.log.1";

export interface SyncLoggerOptions {
	maxLines?: number;
	maxAgeMs?: number;
	maxBytes?: number;
}

/**
 * Logs sync operations to both local file and remote storage.
 *
 * Local: `${pluginDir}/sync.log` (rotated to `sync.log.1` when oversized;
 * pruned by line count and entry age on every flush)
 * Remote: `${prefix}/sync.log` (via StorageAdapter.writeText)
 */
export class SyncLogger {
	private app: App;
	private pluginId: string;
	readonly deviceId: string;
	private logBuffer: string[] = [];
	private opts: Required<SyncLoggerOptions>;

	constructor(app: App, pluginId: string, opts?: SyncLoggerOptions) {
		this.app = app;
		this.pluginId = pluginId;
		this.deviceId = this.getDeviceId();
		this.opts = {
			maxLines: opts?.maxLines ?? MAX_LOG_LINES,
			maxAgeMs: opts?.maxAgeMs ?? MAX_LOG_AGE_MS,
			maxBytes: opts?.maxBytes ?? MAX_LOG_BYTES,
		};
	}

	private getDeviceId(): string {
		const key = `obsidian-ai:device-id`;
		let id = localStorage.getItem(key);
		if (!id) {
			id = Math.random().toString(36).slice(2, 10);
			localStorage.setItem(key, id);
		}
		return id;
	}

	/** Log a single operation */
	log(entry: SyncLogEntry): void {
		const ts = new Date(entry.timestamp).toISOString();
		const device = entry.deviceId.slice(0, 6);
		const action = (entry.action || "unknown").padEnd(8);
		const id = entry.sessionId ? entry.sessionId.slice(0, 8) : "--------";
		const title = entry.sessionTitle ? ` "${entry.sessionTitle}"` : "";
		const line = `${ts} [${device}] ${action} ${id}${title} — ${entry.message}`;
		this.logBuffer.push(line);
	}

	/** Record a full sync session result */
	recordSession(record: SyncSessionRecord): void {
		const ts = new Date(record.timestamp).toISOString();
		const device = record.deviceId.slice(0, 6);
		const { result, durationMs } = record;
		const line = `${ts} [${device}] SESSION  ↑${result.uploaded} ↓${result.downloaded} ⌫${result.deleted ?? 0} ⚡${result.conflicts} ⊘${result.skipped} ⚠️${result.errors.length} | ${result.message} | ${durationMs}ms`;
		this.logBuffer.push(line);
	}

	/**
	 * Prune combined log content: drop entries older than maxAge, cap at
	 * maxLines, and enforce the byte budget (dropping oldest lines first).
	 */
	pruneLines(lines: string[]): string[] {
		const cutoff = Date.now() - this.opts.maxAgeMs;
		const fresh = lines.filter((line) => {
			const ts = Date.parse(line.slice(0, 24));
			return Number.isNaN(ts) || ts >= cutoff;
		});
		let kept = fresh.slice(-this.opts.maxLines);
		let bytes = kept.reduce((n, l) => n + l.length + 1, 0);
		while (kept.length > 0 && bytes > this.opts.maxBytes) {
			bytes -= kept[0].length + 1;
			kept.shift();
		}
		return kept;
	}

	/** Flush buffered logs to local file, rotating to backup if oversized. */
	async flushLocal(): Promise<void> {
		if (this.logBuffer.length === 0) return;

		const pluginDir = `${this.app.vault.configDir}/plugins/${this.pluginId}`;
		const logPath = `${pluginDir}/sync.log`;
		const backupPath = `${pluginDir}/${BACKUP_NAME}`;

		try {
			let existing = "";
			if (await this.app.vault.adapter.exists(logPath)) {
				existing = await this.app.vault.adapter.read(logPath);
			}

			// Rotate the previous file to the single backup slot before
			// rewriting, if it already exceeds the byte budget.
			if (
				existing.length > this.opts.maxBytes &&
				!(await this.app.vault.adapter.exists(backupPath))
			) {
				await this.app.vault.adapter.copy(logPath, backupPath);
			}

			const lines = existing.split("\n").filter(Boolean);
			const kept = this.pruneLines([...lines, ...this.logBuffer]);
			await this.app.vault.adapter.write(logPath, kept.join("\n") + "\n");
			this.logBuffer = [];
		} catch (err: any) {
			console.error(
				"[SyncLogger] Failed to write local log:",
				err.message,
			);
		}
	}

	/** Read recent log lines for the in-app viewer (newest last). */
	async readRecent(lineCount = 200): Promise<string[]> {
		const logPath = `${this.app.vault.configDir}/plugins/${this.pluginId}/sync.log`;
		try {
			if (!(await this.app.vault.adapter.exists(logPath))) return [];
			const content = await this.app.vault.adapter.read(logPath);
			return content.split("\n").filter(Boolean).slice(-lineCount);
		} catch {
			return [];
		}
	}

	/** Append a session record to remote sync log */
	async appendRemote(
		adapter: StorageAdapter,
		record: SyncSessionRecord,
	): Promise<void> {
		try {
			const ts = new Date(record.timestamp).toISOString();
			const device = record.deviceId.slice(0, 6);
			const { result, durationMs } = record;
			const line = `${ts} [${device}] ↑${result.uploaded} ↓${result.downloaded} ⚡${result.conflicts} ⊘${result.skipped} ⚠️${result.errors.length} | ${result.message} | ${durationMs}ms\n`;
			await adapter.writeText("sync.log", line);
		} catch (err: any) {
			console.error(
				"[SyncLogger] Failed to write remote log:",
				err.message,
			);
		}
	}
}

/** Minimal in-app viewer for the local sync log history (T42g). */
export class SyncLogModal extends Modal {
	private lines: string[];

	constructor(app: App, lines: string[]) {
		super(app);
		this.lines = lines;
	}

	onOpen(): void {
		this.setTitle("Sync log");
		const { contentEl } = this;
		contentEl.addClass("obsidian-ai-sync-log-modal");
		const pre = contentEl.createEl("pre", {
			cls: "obsidian-ai-sync-log-modal__body",
		});
		pre.setText(this.lines.join("\n") || "No log entries yet.");
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
