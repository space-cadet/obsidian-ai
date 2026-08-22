/**
 * The complete identity of one remote sync destination.
 *
 * The passphrase is accepted only to derive an identity marker; the raw
 * credential is never returned or persisted.
 */
export interface SyncIdentityInput {
	vaultId: string;
	backend: string;
	server: string;
	account: string;
	remotePath: string;
	encryptionIdentity: string;
}

function stableHash(value: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < value.length; i++) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Return a non-secret, deterministic marker for a complete sync identity. */
export function makeSyncIdentity(input: SyncIdentityInput): string {
	const normalized = {
		vaultId: input.vaultId.trim(),
		backend: input.backend.trim().toLowerCase(),
		server: input.server.trim().replace(/\/$/, ""),
		account: input.account.trim(),
		remotePath: input.remotePath.trim().replace(/^\/+|\/+$/g, ""),
		encryptionIdentity: input.encryptionIdentity
			? stableHash(input.encryptionIdentity)
			: "none",
	};
	return `sync-v1-${stableHash(JSON.stringify(normalized))}`;
}
