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
	| "delete"
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
	deleted?: number;
	conflicts: number;
	skipped: number;
	elapsedMs: number;
	/** Planning can be visible before its total is known. */
	indeterminate?: boolean;
	/** Bytes transferred so far (T42g). */
	uploadedBytes?: number;
	downloadedBytes?: number;
	/** Planned bytes from the sync plan (T42g). */
	plannedUploadBytes?: number;
	plannedDownloadBytes?: number;
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
	direction?: "upload" | "download" | "conflict" | "delete";
	status: "start" | "done" | "error";
	error?: string;
	phase?: SyncProgressPhase;
	stage?: string;
	total?: number;
	completed?: number;
	indeterminate?: boolean;
	/** Payload bytes for this operation (session done events, T42g). */
	bytes?: number;
	/** Planned byte totals (stage events carrying a plan, T42g). */
	planBytes?: { upload: number; download: number };
}

/** Structured per-operation failure for surfacing in the UI (T42g). */
export interface SyncOperationFailure {
	operation: "upload" | "download" | "conflict" | "delete";
	title: string;
	sessionId?: string;
	phase: "transfer" | "resolve" | "plan" | "delete";
	message: string;
	timestamp: number;
}
