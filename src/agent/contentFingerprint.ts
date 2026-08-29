/**
 * Make a stable fingerprint for note content.
 * SHA-256 is used when the host provides Web Crypto; the small fallback keeps
 * tests and older hosts deterministic without making this a security feature.
 */
export async function contentFingerprint(content: string): Promise<string> {
	const cryptoApi = globalThis.crypto;
	if (cryptoApi?.subtle && typeof TextEncoder !== "undefined") {
		const bytes = await cryptoApi.subtle.digest(
			"SHA-256",
			new TextEncoder().encode(content),
		);
		return `sha256:${Array.from(new Uint8Array(bytes))
			.map((byte) => byte.toString(16).padStart(2, "0"))
			.join("")}`;
	}

	let hash = 2166136261;
	for (let i = 0; i < content.length; i++) {
		hash ^= content.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
