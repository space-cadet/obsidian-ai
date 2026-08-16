/**
 * Zero-knowledge encryption layer for remote chat storage.
 *
 * Uses AES-256-GCM with a key derived from a user passphrase via PBKDF2.
 * The passphrase is never persisted — only kept in memory while sync is active.
 */

export interface EncryptedPayload {
	iv: string; // Base64
	ciphertext: string; // Base64
	tag: string; // Base64 (GCM auth tag)
	salt: string; // Base64 (PBKDF2 salt)
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

	/** True if a key has been derived and is ready for use. */
	get isReady(): boolean {
		return this.key !== null;
	}

	/**
	 * Derive an AES-256-GCM key from a passphrase.
	 * @param passphrase User-provided passphrase
	 * @param existingSalt Optional existing salt (for decryption). If omitted, a new random salt is generated.
	 */
	async deriveKey(
		passphrase: string,
		existingSalt?: Uint8Array,
	): Promise<Uint8Array> {
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
				salt,
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

	/** Forget the derived key (e.g., on lock/logout). */
	clear(): void {
		this.key = null;
		this.salt = null;
	}

	/**
	 * Encrypt a plaintext string.
	 * @returns The encrypted payload + base64 salt for storage.
	 */
	async encrypt(plaintext: string): Promise<EncryptedPayload> {
		if (!this.key) {
			throw new Error("Encryption key not derived. Call deriveKey() first.");
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
	 * @param payload The encrypted data + IV + tag + salt.
	 * @param passphrase Required if key not already derived.
	 */
	async decrypt(
		payload: EncryptedPayload,
		passphrase?: string,
	): Promise<string> {
		// If no key in memory, derive it from passphrase + stored salt
		if (!this.key) {
			if (!passphrase) {
				throw new Error(
					"Passphrase required when key is not in memory.",
				);
			}
			const salt = new Uint8Array(
				Array.from(atob(payload.salt), (c) => c.charCodeAt(0)),
			);
			await this.deriveKey(passphrase, salt);
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
			this.key,
			combined,
		);

		const decoder = new TextDecoder();
		return decoder.decode(decrypted);
	}
}
