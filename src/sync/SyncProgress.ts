export type SyncProgressPhase =
	| "planning"
	| "syncing"
	| "rebuilding"
	| "complete"
	| "error";

export type SyncProgressOperation =
	| "upload"
	| "download"
	| "conflict"
	| "skip"
	| "error"
	| "system";

export type SyncProgressItemStatus =
	| "pending"
	| "active"
	| "done"
	| "error"
	| "skipped";

export interface SyncProgressSnapshot {
	phase: SyncProgressPhase;
	stage: string;
	total: number;
	completed: number;
	uploaded: number;
	downloaded: number;
	conflicts: number;
	skipped: number;
	elapsedMs: number;
	/** Planning can be visible before its total is known. */
	indeterminate?: boolean;
}

export interface SyncLogEntry {
	/** Stable operation identity. Start and terminal events update one row. */
	id: string;
	operation: SyncProgressOperation;
	title: string;
	status: SyncProgressItemStatus;
	message?: string;
	timestamp: number;
}

export interface SyncEngineProgressEvent {
	type: "session" | "stage";
	id: string;
	direction?: "upload" | "download" | "conflict";
	status: "start" | "done" | "error";
	error?: string;
	phase?: SyncProgressPhase;
	stage?: string;
	total?: number;
	completed?: number;
	indeterminate?: boolean;
}
