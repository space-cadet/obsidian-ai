import type { DataAdapter } from "obsidian";
import { createTempPath } from "./AtomicWrite";
import {
	checksum,
	EncryptionLayer,
	type EncryptedPayload,
} from "./EncryptionLayer";

export type PluginFileSyncDirection = "upload" | "download" | "both";

export interface PluginFileSyncRemote {
	readText(path: string): Promise<string | null>;
	writeTextAtomic(
		path: string,
		content: string,
		contentType?: string,
	): Promise<{ etag?: string; modifiedAt?: number }>;
}

export interface PluginFileSyncTarget {
	id: string;
	remotePath: string;
	/** Some derived data, such as usage stats, is upload-only. */
	allowDownload?: boolean;
	readLocal(): Promise<string | null>;
	writeLocal(content: string): Promise<void>;
}

export type PluginFileSyncStatus =
	| "uploaded"
	| "downloaded"
	| "synced"
	| "conflict"
	| "skipped"
	| "failed";

export interface PluginFileSyncItemResult {
	id: string;
	remotePath: string;
	status: PluginFileSyncStatus;
	uploaded: boolean;
	downloaded: boolean;
	checksum?: string;
	version?: number;
	error?: string;
}

export interface PluginFileSyncBatchResult {
	items: PluginFileSyncItemResult[];
	uploaded: number;
	downloaded: number;
	failed: number;
	conflicts: number;
	skipped: number;
	errors: string[];
}

export interface PluginFileEnvelope {
	format: "obsidian-ai-plugin-file";
	schemaVersion: 1;
	fileVersion: 1;
	itemId: string;
	modifiedAt: number;
	checksum: string;
	payload: EncryptedPayload;
}

interface LocalTextAdapter {
	exists(path: string): Promise<boolean>;
	read(path: string): Promise<string>;
	write(path: string, content: string): Promise<void>;
	process?(path: string, fn: (data: string) => string): Promise<string>;
	rename?(from: string, to: string): Promise<void>;
	remove?(path: string): Promise<void>;
}

/**
 * Build a target for a normal text file in the Obsidian plugin data folder.
 * Downloads use Obsidian's atomic `process` operation when available.
 */
export function createVaultTextSyncTarget(
	id: string,
	remotePath: string,
	localPath: string,
	adapter: LocalTextAdapter,
): PluginFileSyncTarget {
	return {
		id,
		remotePath,
		readLocal: async () => {
			if (!(await adapter.exists(localPath))) return null;
			return adapter.read(localPath);
		},
		writeLocal: (content) =>
			writeVaultTextAtomically(adapter, localPath, content),
	};
}

/**
 * Replace a local text file without leaving a half-written file behind.
 * Obsidian's adapter provides an atomic process operation. The temporary-file
 * fallback is kept for small test adapters and older host implementations.
 */
export async function writeVaultTextAtomically(
	adapter: LocalTextAdapter,
	path: string,
	content: string,
): Promise<void> {
	if (adapter.process && (await adapter.exists(path))) {
		await adapter.process(path, () => content);
		return;
	}

	if (!adapter.rename) {
		throw new Error(
			"Local adapter does not support atomic text replacement",
		);
	}

	const tempPath = createTempPath(path);
	try {
		await adapter.write(tempPath, content);
		await adapter.rename(tempPath, path);
	} catch (error) {
		try {
			if (adapter.remove && (await adapter.exists(tempPath))) {
				await adapter.remove(tempPath);
			}
		} catch {
			// Cleanup is best effort; keep the original error.
		}
		throw error;
	}
}

/**
 * Shared transfer layer for Chat Lab's auxiliary plugin files.
 * It puts every remote item in the same versioned, checksummed envelope and
 * keeps failures separate so one bad file does not stop the other files.
 */
export class PluginFileSyncManager {
	private readonly now: () => number;

	constructor(
		private readonly options: {
			remote: PluginFileSyncRemote;
			crypto: EncryptionLayer;
			now?: () => number;
		},
	) {
		this.now = options.now ?? Date.now;
	}

	async sync(
		targets: PluginFileSyncTarget[],
		direction: PluginFileSyncDirection,
	): Promise<PluginFileSyncBatchResult> {
		const items: PluginFileSyncItemResult[] = [];

		for (const target of targets) {
			try {
				items.push(await this.syncOne(target, direction));
			} catch (error: any) {
				items.push({
					id: target.id,
					remotePath: target.remotePath,
					status: "failed",
					uploaded: false,
					downloaded: false,
					error: error?.message ?? String(error),
				});
			}
		}

		return {
			items,
			uploaded: items.filter((item) => item.uploaded).length,
			downloaded: items.filter((item) => item.downloaded).length,
			failed: items.filter((item) => item.status === "failed").length,
			conflicts: items.filter((item) => item.status === "conflict")
				.length,
			skipped: items.filter((item) => item.status === "skipped").length,
			errors: items
				.filter((item) => item.status === "failed")
				.map((item) => `${item.id}: ${item.error ?? "sync failed"}`),
		};
	}

	private async syncOne(
		target: PluginFileSyncTarget,
		direction: PluginFileSyncDirection,
	): Promise<PluginFileSyncItemResult> {
		if (target.allowDownload === false && direction === "download") {
			return this.skippedResult(target);
		}
		if (direction === "both" && target.allowDownload !== false) {
			return this.syncBoth(target);
		}

		let uploaded = false;
		let downloaded = false;
		let itemChecksum: string | undefined;
		let version: number | undefined;

		if (direction === "upload" || direction === "both") {
			const local = await target.readLocal();
			if (local !== null) {
				const envelope = await this.createEnvelope(target.id, local);
				await this.options.remote.writeTextAtomic(
					target.remotePath,
					JSON.stringify(envelope),
					"application/json",
				);
				uploaded = true;
				itemChecksum = envelope.checksum;
				version = envelope.fileVersion;
			}
		}

		if (direction === "download") {
			const remote = await this.options.remote.readText(
				target.remotePath,
			);
			if (remote !== null) {
				const result = await this.applyEnvelope(target, remote);
				downloaded = true;
				itemChecksum = result.checksum;
				version = result.version;
			}
		}

		let status: PluginFileSyncStatus;
		if (uploaded && downloaded) status = "synced";
		else if (uploaded) status = "uploaded";
		else if (downloaded) status = "downloaded";
		else status = "skipped";

		return {
			id: target.id,
			remotePath: target.remotePath,
			status,
			uploaded,
			downloaded,
			checksum: itemChecksum,
			version,
		};
	}

	private async syncBoth(
		target: PluginFileSyncTarget,
	): Promise<PluginFileSyncItemResult> {
		const local = await target.readLocal();
		const remoteText = await this.options.remote.readText(
			target.remotePath,
		);

		if (local === null && remoteText === null) {
			return this.skippedResult(target);
		}

		if (local === null && remoteText !== null) {
			const remote = await this.readEnvelope(target, remoteText);
			await target.writeLocal(remote.plaintext);
			return {
				id: target.id,
				remotePath: target.remotePath,
				status: "downloaded",
				uploaded: false,
				downloaded: true,
				checksum: remote.checksum,
				version: remote.version,
			};
		}

		if (local !== null && remoteText === null) {
			const envelope = await this.createEnvelope(target.id, local);
			await this.options.remote.writeTextAtomic(
				target.remotePath,
				JSON.stringify(envelope),
				"application/json",
			);
			return {
				id: target.id,
				remotePath: target.remotePath,
				status: "uploaded",
				uploaded: true,
				downloaded: false,
				checksum: envelope.checksum,
				version: envelope.fileVersion,
			};
		}

		const remote = await this.readEnvelope(target, remoteText!);
		const localChecksum = await checksum(local!);
		if (localChecksum.toLowerCase() === remote.checksum.toLowerCase()) {
			return {
				id: target.id,
				remotePath: target.remotePath,
				status: "skipped",
				uploaded: false,
				downloaded: false,
				checksum: remote.checksum,
				version: remote.version,
			};
		}

		return {
			id: target.id,
			remotePath: target.remotePath,
			status: "conflict",
			uploaded: false,
			downloaded: false,
			checksum: remote.checksum,
			version: remote.version,
			error: "local and remote contents differ",
		};
	}

	private skippedResult(
		target: PluginFileSyncTarget,
	): PluginFileSyncItemResult {
		return {
			id: target.id,
			remotePath: target.remotePath,
			status: "skipped",
			uploaded: false,
			downloaded: false,
		};
	}

	private async createEnvelope(
		itemId: string,
		plaintext: string,
	): Promise<PluginFileEnvelope> {
		const encrypted = await this.options.crypto.encrypt(plaintext);
		return {
			format: "obsidian-ai-plugin-file",
			schemaVersion: 1,
			fileVersion: 1,
			itemId,
			modifiedAt: this.now(),
			checksum: await checksum(plaintext),
			payload: encrypted,
		};
	}

	private async applyEnvelope(
		target: PluginFileSyncTarget,
		remoteText: string,
	): Promise<{ checksum: string; version: number }> {
		const remote = await this.readEnvelope(target, remoteText);
		await target.writeLocal(remote.plaintext);
		return { checksum: remote.checksum, version: remote.version };
	}

	private async readEnvelope(
		target: PluginFileSyncTarget,
		remoteText: string,
	): Promise<{ plaintext: string; checksum: string; version: number }> {
		let envelope: PluginFileEnvelope;
		try {
			envelope = JSON.parse(remoteText) as PluginFileEnvelope;
		} catch {
			throw new Error("remote file is not valid JSON");
		}

		if (
			envelope?.format !== "obsidian-ai-plugin-file" ||
			envelope.schemaVersion !== 1 ||
			envelope.fileVersion !== 1 ||
			envelope.itemId !== target.id ||
			!Number.isFinite(envelope.modifiedAt) ||
			!/^[a-f0-9]{64}$/i.test(envelope.checksum) ||
			!envelope.payload ||
			typeof envelope.payload.ciphertext !== "string"
		) {
			throw new Error(
				"remote file has an unsupported or incomplete envelope",
			);
		}

		const plaintext = await this.options.crypto.decrypt(envelope.payload);
		const actualChecksum = await checksum(plaintext);
		if (actualChecksum.toLowerCase() !== envelope.checksum.toLowerCase()) {
			throw new Error("remote file checksum does not match its contents");
		}

		return {
			plaintext,
			checksum: envelope.checksum,
			version: envelope.fileVersion,
		};
	}
}

/** Compile-time check that the Obsidian adapter has the methods we use. */
export type ObsidianVaultTextAdapter = Pick<
	DataAdapter,
	"exists" | "read" | "write" | "process" | "rename" | "remove"
>;
