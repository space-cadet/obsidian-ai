import type { ChatSession } from "../types";

/**
 * Encrypted session payload stored on remote backends.
 * The server never sees plaintext.
 */
export interface EncryptedSession {
	id: string;
	iv: string; // Base64 nonce
	ciphertext: string; // Base64 encrypted data
	tag: string; // Base64 auth tag
	/** Base64 salt used for PBKDF2 key derivation (stored with ciphertext). */
	salt: string;
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

	/** Upload an encrypted session. */
	putSession(session: EncryptedSession): Promise<void>;

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
