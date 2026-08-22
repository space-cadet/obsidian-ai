import type { ChatSession } from "../types";
import type { SyncRetryRecord } from "./SyncRetryStore";

/**
 * Encrypted session payload stored on remote backends.
 * The server never sees plaintext (unless encryption is disabled for testing).
 */
export interface EncryptedSession {
	id: string;
	/** Base64 nonce. Omitted if data is unencrypted (test mode). */
	iv?: string;
	/** Base64 encrypted data — or plaintext JSON if unencrypted. */
	ciphertext: string;
	/** Base64 auth tag. Omitted if unencrypted. */
	tag?: string;
	/** Base64 salt for PBKDF2. Omitted if unencrypted. */
	salt?: string;
	checksum: string; // SHA-256 of plaintext
	modifiedAt: number;
	version: number; // For conflict detection
}

/**
 * Lightweight metadata for a remote session (from list operations).
 */
export interface RemoteSessionMeta {
	id: string;
	modifiedAt: number;
	etag?: string; // Backend-specific version identifier
	size?: number; // Content length in bytes
}

/**
 * Result of a sync operation.
 */
export interface SyncResult {
	uploaded: number;
	downloaded: number;
	conflicts: number;
	skipped: number;
	errors: string[];
	status?: "complete" | "partial" | "failed";
	retryable?: SyncRetryRecord[];
}

/**
 * Pluggable storage backend for remote chat session persistence.
 *
 * Implementations: S3StorageAdapter, WebDAVStorageAdapter, CustomServerAdapter.
 */
export interface StorageAdapter {
	readonly name: string;

	/** Initialize the adapter with backend-specific configuration. */
	initialize(config: unknown): Promise<void>;

	/** Disconnect and clean up resources. */
	disconnect(): Promise<void>;

	/** List all remote session metadata. */
	listSessions(): Promise<RemoteSessionMeta[]>;

	/** Fetch a single encrypted session by ID. */
	getSession(id: string): Promise<EncryptedSession | null>;

	/** Upload an encrypted session. Returns server metadata (etag, etc.). */
	putSession(
		session: EncryptedSession,
	): Promise<{ etag?: string; modifiedAt?: number }>;

	/** Write raw text to a file at the given path (for logs, metadata). */
	writeText(path: string, content: string): Promise<void>;

	/**
	 * Write text through a temporary path and replace the final path only after
	 * the temporary write succeeds.
	 */
	writeTextAtomic(
		path: string,
		content: string,
		contentType?: string,
	): Promise<{ etag?: string; modifiedAt?: number }>;

	/** Read raw text from a file at the given path. */
	readText(path: string): Promise<string | null>;

	/** Delete a raw text file, used for explicit plugin-data tombstones. */
	deleteText(path: string): Promise<void>;

	/** Delete a remote session. */
	deleteSession(id: string): Promise<void>;

	/** Get the last successful sync timestamp (stored remotely as metadata). */
	getLastSyncTime(): Promise<number | null>;

	/** Set the last successful sync timestamp. */
	setLastSyncTime(time: number): Promise<void>;
}

/**
 * Local cache entry for a session, including sync status.
 */
export interface CachedSession extends ChatSession {
	_syncStatus: "synced" | "pending" | "conflict";
	_localModifiedAt: number;
	_remoteModifiedAt?: number;
	_version: number;
	/** Server ETag at time of last sync — used to detect remote changes */
	_etag?: string;
}

/**
 * Sync plan computed by SyncEngine.
 */
export interface SyncPlan {
	upload: ChatSession[];
	download: RemoteSessionMeta[];
	conflicts: Array<{ local: ChatSession; remote: RemoteSessionMeta }>;
	skipped: number;
}
