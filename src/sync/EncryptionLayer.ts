/**
 * Zero-knowledge encryption layer for remote chat storage.
 *
 * Uses AES-256-GCM with a key derived from a user passphrase via PBKDF2.
 * The passphrase is never persisted — only kept in memory while sync is active.
 *
 * If passphrase is empty, encryption is skipped (plaintext mode for testing).
 */

export interface EncryptedPayload {
	iv?: string; // Base64 — omitted in plaintext mode
	ciphertext: string; // Base64 encrypted — or plaintext JSON
	tag?: string; // Base64 — omitted in plaintext mode
	salt?: string; // Base64 — omitted in plaintext mode
	/** If true, ciphertext contains plaintext JSON (no encryption). */
	unencrypted?: boolean;
}

/** SHA-256 checksum of plaintext (hex string). */
export async function checksum(plaintext: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(plaintext);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

export class EncryptionLayer {
	private key: CryptoKey | null = null;
	private salt: Uint8Array | null = null;
	private passphrase: string = "";

	/** True if a key has been derived and is ready for use. */
	get isReady(): boolean {
		return this.key !== null || this.passphrase === "";
	}

	/**
	 * Derive an AES-256-GCM key from a passphrase.
	 * If passphrase is empty, encryption is disabled (plaintext mode).
	 * @param passphrase User-provided passphrase
	 * @param existingSalt Optional existing salt (for decryption). If omitted, a new random salt is generated.
	 */
	async deriveKey(
		passphrase: string,
		existingSalt?: Uint8Array,
	): Promise<Uint8Array | null> {
		this.passphrase = passphrase;

		// Plaintext mode: no key derivation needed
		if (!passphrase) {
			this.key = null;
			this.salt = null;
			return null;
		}

		const salt = existingSalt ?? crypto.getRandomValues(new Uint8Array(16));
		this.salt = salt;

		const encoder = new TextEncoder();
		const keyMaterial = await crypto.subtle.importKey(
			"raw",
			encoder.encode(passphrase),
			{ name: "PBKDF2" },
			false,
			["deriveBits", "deriveKey"],
		);

		this.key = await crypto.subtle.deriveKey(
			{
				name: "PBKDF2",
				salt: salt as BufferSource,
				iterations: 100_000,
				hash: "SHA-256",
			},
			keyMaterial,
			{ name: "AES-GCM", length: 256 },
			false,
			["encrypt", "decrypt"],
		);

		return salt;
	}

	/** True if encryption is enabled (passphrase was provided). */
	get encryptionEnabled(): boolean {
		return this.passphrase !== "";
	}

	/** Forget the derived key (e.g., on lock/logout). */
	clear(): void {
		this.key = null;
		this.salt = null;
		this.passphrase = "";
	}

	/**
	 * Encrypt a plaintext string.
	 * If encryption is disabled (empty passphrase), returns plaintext with unencrypted flag.
	 */
	async encrypt(plaintext: string): Promise<EncryptedPayload> {
		// Plaintext mode: skip encryption
		if (!this.encryptionEnabled || !this.key) {
			return {
				ciphertext: plaintext,
				unencrypted: true,
			};
		}

		const iv = crypto.getRandomValues(new Uint8Array(12));
		const encoder = new TextEncoder();
		const data = encoder.encode(plaintext);

		const encrypted = await crypto.subtle.encrypt(
			{ name: "AES-GCM", iv },
			this.key,
			data,
		);

		// AES-GCM in Web Crypto appends the 16-byte auth tag to the ciphertext
		const combined = new Uint8Array(encrypted);
		const ciphertext = combined.slice(0, -16);
		const tag = combined.slice(-16);

		return {
			iv: btoa(String.fromCharCode(...iv)),
			ciphertext: btoa(String.fromCharCode(...ciphertext)),
			tag: btoa(String.fromCharCode(...tag)),
			salt: btoa(String.fromCharCode(...this.salt!)),
		};
	}

	/**
	 * Decrypt an encrypted payload.
	 * If payload is marked unencrypted, returns plaintext directly.
	 * @param payload The encrypted data + IV + tag + salt.
	 * @param passphrase Required if key not already derived.
	 */
	async decrypt(
		payload: EncryptedPayload,
		passphrase?: string,
	): Promise<string> {
		// Plaintext mode: return directly
		if (payload.unencrypted) {
			return payload.ciphertext;
		}

		// Derive key from payload salt + passphrase (ensures cross-device/restart compatibility)
		if (!this.key || !this.salt) {
			if (!passphrase) {
				throw new Error(
					"Passphrase required when key is not in memory.",
				);
			}
			if (!payload.salt) {
				throw new Error("Salt missing in encrypted payload.");
			}
			const salt = new Uint8Array(
				Array.from(atob(payload.salt), (c) => c.charCodeAt(0)),
			);
			await this.deriveKey(passphrase, salt);
		}

		if (!payload.iv || !payload.tag) {
			throw new Error("IV or tag missing in encrypted payload.");
		}

		const iv = new Uint8Array(
			Array.from(atob(payload.iv), (c) => c.charCodeAt(0)),
		);
		const ciphertext = new Uint8Array(
			Array.from(atob(payload.ciphertext), (c) => c.charCodeAt(0)),
		);
		const tag = new Uint8Array(
			Array.from(atob(payload.tag), (c) => c.charCodeAt(0)),
		);

		// Reconstruct: ciphertext + tag
		const combined = new Uint8Array(ciphertext.length + tag.length);
		combined.set(ciphertext, 0);
		combined.set(tag, ciphertext.length);

		const decrypted = await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv },
			this.key!,
			combined,
		);

		const decoder = new TextDecoder();
		return decoder.decode(decrypted);
	}
}
