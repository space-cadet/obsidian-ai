// src/sync/SyncStatusHub.ts
// T42g: app-wide sync visibility hub. Every sync path (panel, auto-sync,
// settings "Sync Now", command palette, rebuild) publishes here; the status
// bar and the sync panel subscribe for a single source of truth.
import type {
	SyncLogEntry,
	SyncOperationFailure,
	SyncProgressSnapshot,
} from "./SyncProgress";

export type SyncStatusState =
	| "disabled"
	| "idle"
	| "connecting"
	| "syncing"
	| "error";

export type SyncRunTrigger = "manual" | "auto" | "rebuild";

export interface SyncLastResult {
	ok: boolean;
	message: string;
	uploaded: number;
	downloaded: number;
	conflicts: number;
	skipped: number;
	uploadedBytes: number;
	downloadedBytes: number;
	errors: string[];
	dryRun: boolean;
	trigger: SyncRunTrigger;
	startedAt: number;
	finishedAt: number;
	durationMs: number;
}

export interface SyncStatusSnapshot {
	state: SyncStatusState;
	progress: SyncProgressSnapshot | null;
	runLog: SyncLogEntry[];
	failures: SyncOperationFailure[];
	lastResult: SyncLastResult | null;
}

type Listener = (snap: SyncStatusSnapshot) => void;

const MAX_RUN_LOG = 300;
const MAX_FAILURES = 100;

/** Human-readable byte size (e.g. 4.2 MB, 318 KB). */
export function formatBytes(bytes: number): string {
	if (!bytes || bytes <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB"];
	const exp = Math.min(
		units.length - 1,
		Math.floor(Math.log(bytes) / Math.log(1024)),
	);
	const value = bytes / Math.pow(1024, exp);
	const digits = value >= 10 || exp === 0 ? 0 : 1;
	return `${value.toFixed(digits)} ${units[exp]}`;
}

/** Derived transfer rate from elapsed time (no streaming hooks exist). */
export function formatRate(bytes: number, elapsedMs: number): string {
	if (!bytes || elapsedMs <= 0) return "—";
	return `${formatBytes((bytes * 1000) / elapsedMs)}/s`;
}

export class SyncStatusHub {
	private listeners = new Set<Listener>();
	private snap: SyncStatusSnapshot = {
		state: "disabled",
		progress: null,
		runLog: [],
		failures: [],
		lastResult: null,
	};

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		listener(this.snap);
		return () => {
			this.listeners.delete(listener);
		};
	}

	getSnapshot(): SyncStatusSnapshot {
		return this.snap;
	}

	setState(state: SyncStatusState): void {
		if (this.snap.state === state) return;
		this.snap = { ...this.snap, state };
		this.emit();
	}

	/** Start tracking a new sync run. Clears transient run state. */
	beginRun(trigger: SyncRunTrigger): void {
		this.snap = {
			...this.snap,
			state: "syncing",
			progress: null,
			runLog: [],
			failures: [],
		};
		this.emit();
	}

	publishProgress(progress: SyncProgressSnapshot): void {
		this.snap = { ...this.snap, progress };
		this.emit();
	}

	publishLog(entry: SyncLogEntry): void {
		const runLog = [...this.snap.runLog];
		const idx = runLog.findIndex((l) => l.id === entry.id);
		if (idx >= 0) runLog[idx] = { ...runLog[idx], ...entry };
		else {
			runLog.push(entry);
			if (runLog.length > MAX_RUN_LOG) runLog.shift();
		}

		let failures = this.snap.failures;
		if (entry.status === "error") {
			const operation: SyncOperationFailure["operation"] =
				entry.operation === "download"
					? "download"
					: entry.operation === "conflict"
						? "conflict"
						: "upload";
			const failure: SyncOperationFailure = {
				operation,
				title: entry.title,
				sessionId: entry.id.startsWith("session:")
					? entry.id.slice("session:".length)
					: undefined,
				phase: "transfer",
				message: entry.message ?? "unknown error",
				timestamp: entry.timestamp,
			};
			failures = [...failures, failure].slice(-MAX_FAILURES);
		}

		this.snap = { ...this.snap, runLog, failures };
		this.emit();
	}

	/** Finish the current run and publish the terminal result. */
	endRun(result: SyncLastResult): void {
		this.snap = {
			...this.snap,
			state: result.ok ? "idle" : "error",
			progress: null,
			lastResult: result,
		};
		this.emit();
	}

	private emit(): void {
		const snap = this.snap;
		for (const listener of this.listeners) {
			try {
				listener(snap);
			} catch (err) {
				console.error("[SyncStatusHub] listener error", err);
			}
		}
	}
}
