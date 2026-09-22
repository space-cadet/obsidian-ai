/**
 * Plain remote metadata used to display session titles without downloading
 * every session payload. This is intentionally not encrypted: it is the
 * current plaintext-mode product contract and makes sync review useful.
 */
export const SYNC_MANIFEST_PATH = "sync-manifest.json";

export interface SyncManifestEntry {
	title?: string;
	modifiedAt: number;
	size?: number;
	etag?: string;
}

export interface SyncManifest {
	version: 1;
	generatedAt: number;
	entries: Record<string, SyncManifestEntry>;
}

export function parseSyncManifest(raw: string | null): SyncManifest | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as Partial<SyncManifest>;
		if (
			parsed.version !== 1 ||
			typeof parsed.generatedAt !== "number" ||
			!parsed.entries ||
			typeof parsed.entries !== "object"
		) {
			return null;
		}
		return parsed as SyncManifest;
	} catch {
		return null;
	}
}
