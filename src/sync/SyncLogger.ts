import type { App } from "obsidian";
import type { SyncResult } from "./StorageAdapter";
import type { StorageAdapter } from "./StorageAdapter";

export interface SyncLogEntry {
	timestamp: number;
	deviceId: string;
	action: "upload" | "download" | "conflict" | "skip" | "error";
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

/**
 * Logs sync operations to both local file and remote storage.
 *
 * Local: `${pluginDir}/sync.log`
 * Remote: `${prefix}/sync.log` (via StorageAdapter.writeText)
 */
export class SyncLogger {
	private app: App;
	private pluginId: string;
	readonly deviceId: string;
	private logBuffer: string[] = [];

	constructor(app: App, pluginId: string) {
		this.app = app;
		this.pluginId = pluginId;
		this.deviceId = this.getDeviceId();
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
		const line = `${ts} [${device}] SESSION  ↑${result.uploaded} ↓${result.downloaded} ⚡${result.conflicts} ⊘${result.skipped} ⚠️${result.errors.length} | ${result.message} | ${durationMs}ms`;
		this.logBuffer.push(line);
	}

	/** Flush buffered logs to local file */
	async flushLocal(): Promise<void> {
		if (this.logBuffer.length === 0) return;

		const pluginDir = `${this.app.vault.configDir}/plugins/${this.pluginId}`;
		const logPath = `${pluginDir}/sync.log`;

		try {
			let existing = "";
			if (await this.app.vault.adapter.exists(logPath)) {
				existing = await this.app.vault.adapter.read(logPath);
			}
			// Keep last 500 lines
			const lines = existing.split("\n").filter(Boolean);
			const trimmed = lines.slice(-400);
			const newContent =
				[...trimmed, ...this.logBuffer].join("\n") + "\n";
			await this.app.vault.adapter.write(logPath, newContent);
			this.logBuffer = [];
		} catch (err: any) {
			console.error(
				"[SyncLogger] Failed to write local log:",
				err.message,
			);
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
