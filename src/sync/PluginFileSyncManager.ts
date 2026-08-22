import type { DataAdapter } from "obsidian";
import { createTempPath } from "./AtomicWrite";
import {
	checksum,
	EncryptionLayer,
	type EncryptedPayload,
} from "./EncryptionLayer";
import type { SyncRetryRecord } from "./SyncRetryStore";
import { DurableSyncRetryStore } from "./SyncRetryStore";

export type PluginFileSyncDirection = "upload" | "download" | "both";

export interface PluginFileSyncRemote {
	readText(path: string): Promise<string | null>;
	deleteText?(path: string): Promise<void>;
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
	/** Save a durable local recovery copy before replacing or deleting data. */
	backupLocal?(
		content: string,
		reason: "replacement" | "conflict",
	): Promise<void>;
	/** Delete the local item after a confirmed remote deletion. */
	deleteLocal?(): Promise<void>;
	/** Save the remote value when the user chooses to keep both versions. */
	writeConflictCopy?(content: string): Promise<void>;
}

export type PluginFileSyncStatus =
	| "uploaded"
	| "downloaded"
	| "synced"
	| "conflict"
	| "skipped"
	| "failed";

export type PluginFileConflictChoice = "local" | "remote" | "both" | "cancel";

export interface PluginFileSyncStateEntry {
	exists: boolean;
	checksum?: string;
	version?: number;
	lastSharedAt: number;
}

export interface PluginFileDeletionRecord {
	id: string;
	checksum?: string;
	deletedAt: number;
	source: "local" | "remote";
}

export interface PluginFileSyncState {
	schemaVersion: 1;
	identity?: string;
	entries: Record<string, PluginFileSyncStateEntry>;
	deletions: PluginFileDeletionRecord[];
}

export interface PluginFileSyncStateStore {
	load(): Promise<PluginFileSyncState | null>;
	save(state: PluginFileSyncState): Promise<void>;
}

export interface PluginFileSyncConflict {
	target: PluginFileSyncTarget;
	localContent: string | null;
	remoteContent: string | null;
	baseChecksum?: string;
	localChecksum?: string;
	remoteChecksum?: string;
	remoteDeletionKnown: boolean;
	unknownRemoteDisappearance: boolean;
}

export interface PluginFileSyncItemResult {
	id: string;
	remotePath: string;
	status: PluginFileSyncStatus;
	uploaded: boolean;
	downloaded: boolean;
	checksum?: string;
	version?: number;
	error?: string;
	resolution?: PluginFileConflictChoice;
}

export interface PluginFileSyncBatchResult {
	items: PluginFileSyncItemResult[];
	uploaded: number;
	downloaded: number;
	failed: number;
	conflicts: number;
	skipped: number;
	errors: string[];
	status: "complete" | "partial" | "failed";
	retryable: SyncRetryRecord[];
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

const STATE_ITEM_ID = "__plugin-file-sync-state__";
const DEFAULT_STATE_PATH = "plugin-data-sync-state.json";

interface LocalTextAdapter {
	exists(path: string): Promise<boolean>;
	read(path: string): Promise<string>;
	write(path: string, content: string): Promise<void>;
	mkdir?(path: string): Promise<void>;
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
	const recoveryPath = (kind: string) =>
		`${localPath}.${kind}-${Date.now()}.bak`;
	const writeRecovery = async (content: string, kind: string) => {
		const separator = localPath.lastIndexOf("/");
		if (separator >= 0 && adapter.mkdir) {
			await adapter.mkdir(localPath.slice(0, separator));
		}
		await adapter.write(recoveryPath(kind), content);
	};

	return {
		id,
		remotePath,
		readLocal: async () => {
			if (!(await adapter.exists(localPath))) return null;
			return adapter.read(localPath);
		},
		writeLocal: (content) =>
			writeVaultTextAtomically(adapter, localPath, content),
		backupLocal: (content, reason) => writeRecovery(content, reason),
		writeConflictCopy: (content) => writeRecovery(content, "conflict"),
		deleteLocal: async () => {
			if (adapter.remove && (await adapter.exists(localPath))) {
				await adapter.remove(localPath);
			}
		},
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
	private readonly stateStore?: PluginFileSyncStateStore;
	private readonly remoteStatePath: string;
	private readonly resolveConflict?: (
		conflict: PluginFileSyncConflict,
	) => Promise<PluginFileConflictChoice>;

	constructor(
		private readonly options: {
			remote: PluginFileSyncRemote;
			crypto: EncryptionLayer;
			now?: () => number;
			stateStore?: PluginFileSyncStateStore;
			remoteStatePath?: string;
			resolveConflict?: (
				conflict: PluginFileSyncConflict,
			) => Promise<PluginFileConflictChoice>;
			identity?: string;
			retryStore?: DurableSyncRetryStore;
			progress?: (event: {
				id: string;
				direction: "upload" | "download" | "conflict";
				status: "start" | "done" | "error";
				error?: string;
			}) => void;
		},
	) {
		this.now = options.now ?? Date.now;
		this.stateStore = options.stateStore;
		this.remoteStatePath = options.remoteStatePath ?? DEFAULT_STATE_PATH;
		this.resolveConflict = options.resolveConflict;
	}

	async sync(
		targets: PluginFileSyncTarget[],
		direction: PluginFileSyncDirection,
	): Promise<PluginFileSyncBatchResult> {
		const items: PluginFileSyncItemResult[] = [];
		const stateContext = this.stateStore
			? await this.loadStateContext()
			: null;

		for (const target of targets) {
			this.options.progress?.({
				id: target.id,
				direction: direction === "both" ? "upload" : direction,
				status: "start",
			});
			try {
				const item = stateContext
					? await this.syncOneWithState(
							target,
							direction,
							stateContext,
						)
					: await this.syncOneLegacy(target, direction);
				items.push(item);
				if (item.status === "failed" || item.status === "conflict") {
					await this.options.retryStore?.record(
						"plugin-data",
						target.id,
						item.error ?? "plugin data sync requires retry",
					);
					this.options.progress?.({
						id: target.id,
						direction:
							item.status === "conflict"
								? "conflict"
								: direction === "download"
									? "download"
									: "upload",
						status: "error",
						error: item.error,
					});
				} else {
					await this.options.retryStore?.clear(
						"plugin-data",
						target.id,
					);
					this.options.progress?.({
						id: target.id,
						direction: item.downloaded ? "download" : "upload",
						status: "done",
					});
				}
			} catch (error: any) {
				const message = error?.message ?? String(error);
				items.push({
					id: target.id,
					remotePath: target.remotePath,
					status: "failed",
					uploaded: false,
					downloaded: false,
					error: message,
				});
				await this.options.retryStore?.record(
					"plugin-data",
					target.id,
					message,
				);
				this.options.progress?.({
					id: target.id,
					direction: direction === "download" ? "download" : "upload",
					status: "error",
					error: message,
				});
			}
		}

		const failed = items.filter((item) => item.status === "failed").length;
		const conflicts = items.filter(
			(item) => item.status === "conflict",
		).length;
		const retryable =
			(await this.options.retryStore?.list())?.filter(
				(record) => record.scope === "plugin-data",
			) ?? [];
		return {
			items,
			uploaded: items.filter((item) => item.uploaded).length,
			downloaded: items.filter((item) => item.downloaded).length,
			failed,
			conflicts,
			skipped: items.filter((item) => item.status === "skipped").length,
			errors: items
				.filter((item) => item.status === "failed")
				.map((item) => `${item.id}: ${item.error ?? "sync failed"}`),
			status:
				failed === items.length && items.length > 0
					? "failed"
					: failed > 0 || conflicts > 0
						? "partial"
						: "complete",
			retryable,
		};
	}

	private async loadStateContext(): Promise<{
		local: PluginFileSyncState;
		remote: PluginFileSyncState;
	}> {
		const local = this.normalizeState(await this.stateStore!.load());
		const remoteText = await this.options.remote.readText(
			this.remoteStatePath,
		);
		if (!remoteText) {
			return { local, remote: this.emptyState() };
		}

		try {
			const envelope = await this.readEnvelopeForId(
				STATE_ITEM_ID,
				remoteText,
			);
			return {
				local,
				remote: this.normalizeState(JSON.parse(envelope.plaintext)),
			};
		} catch {
			// A missing or legacy state file must never authorize a deletion. Treat
			// it as unknown state; the per-file rules below will stop safely.
			return { local, remote: this.emptyState() };
		}
	}

	private emptyState(): PluginFileSyncState {
		return {
			schemaVersion: 1,
			...(this.options.identity
				? { identity: this.options.identity }
				: {}),
			entries: {},
			deletions: [],
		};
	}

	private normalizeState(
		value: PluginFileSyncState | null,
	): PluginFileSyncState {
		if (!value) return this.emptyState();
		if (this.options.identity && value.identity !== this.options.identity) {
			return this.emptyState();
		}
		if (
			value.schemaVersion !== 1 ||
			typeof value.entries !== "object" ||
			!Array.isArray(value.deletions)
		) {
			throw new Error("plugin-file sync state is invalid");
		}
		return {
			schemaVersion: 1,
			...(this.options.identity
				? { identity: this.options.identity }
				: value.identity
					? { identity: value.identity }
					: {}),
			entries: { ...value.entries },
			deletions: value.deletions.slice(-100),
		};
	}

	private async persistState(context: {
		local: PluginFileSyncState;
		remote: PluginFileSyncState;
	}): Promise<void> {
		const envelope = await this.createEnvelope(
			STATE_ITEM_ID,
			JSON.stringify(context.remote),
		);
		// Publish the shared state first. If this fails, the local state remains
		// behind and the next run retries or stops rather than assuming success.
		await this.options.remote.writeTextAtomic(
			this.remoteStatePath,
			JSON.stringify(envelope),
			"application/json",
		);
		await this.stateStore!.save(context.local);
	}

	private async makeStateEntry(
		content: string | null,
		version?: number,
	): Promise<PluginFileSyncStateEntry> {
		return {
			exists: content !== null,
			...(content === null ? {} : { checksum: await checksum(content) }),
			version,
			lastSharedAt: this.now(),
		};
	}

	private recordDeletion(
		state: PluginFileSyncState,
		id: string,
		checksumValue: string | undefined,
		source: "local" | "remote",
	): void {
		state.deletions = state.deletions
			.filter((record) => record.id !== id)
			.concat({
				id,
				checksum: checksumValue,
				deletedAt: this.now(),
				source,
			})
			.slice(-100);
	}

	private async updateState(
		context: { local: PluginFileSyncState; remote: PluginFileSyncState },
		target: PluginFileSyncTarget,
		content: string | null,
		version: number | undefined,
		source?: "local" | "remote",
	): Promise<void> {
		const previousChecksum =
			context.local.entries[target.id]?.checksum ??
			context.remote.entries[target.id]?.checksum;
		const entry = await this.makeStateEntry(content, version);
		if (!entry.exists && previousChecksum) {
			// A tombstone carries the shared value it deletes. That is what lets
			// another device distinguish an intentional deletion from a missing
			// file caused by a stale scan or failed transfer.
			entry.checksum = previousChecksum;
		}
		context.local.entries[target.id] = entry;
		context.remote.entries[target.id] = { ...entry };
		if (!entry.exists) {
			this.recordDeletion(
				context.local,
				target.id,
				previousChecksum,
				source ?? "remote",
			);
			this.recordDeletion(
				context.remote,
				target.id,
				entry.checksum,
				source ?? "remote",
			);
		} else {
			context.local.deletions = context.local.deletions.filter(
				(record) => record.id !== target.id,
			);
			context.remote.deletions = context.remote.deletions.filter(
				(record) => record.id !== target.id,
			);
		}
		await this.persistState(context);
	}

	private async uploadContent(
		target: PluginFileSyncTarget,
		content: string,
	): Promise<{ checksum: string; version: number }> {
		const envelope = await this.createEnvelope(target.id, content);
		await this.options.remote.writeTextAtomic(
			target.remotePath,
			JSON.stringify(envelope),
			"application/json",
		);
		return { checksum: envelope.checksum, version: envelope.fileVersion };
	}

	private async backupBeforeReplacement(
		target: PluginFileSyncTarget,
		local: string | null,
		reason: "replacement" | "conflict",
	): Promise<void> {
		if (local === null) return;
		if (!target.backupLocal) {
			throw new Error(
				`No recovery-copy hook is configured for ${target.id}`,
			);
		}
		await target.backupLocal(local, reason);
	}

	private async deleteRemote(target: PluginFileSyncTarget): Promise<void> {
		if (!this.options.remote.deleteText) {
			throw new Error(
				"Remote backend cannot record plugin-file deletions",
			);
		}
		await this.options.remote.deleteText(target.remotePath);
	}

	private async deleteLocal(
		target: PluginFileSyncTarget,
		local: string | null,
	): Promise<void> {
		if (local === null) return;
		await this.backupBeforeReplacement(target, local, "replacement");
		if (!target.deleteLocal) {
			throw new Error(
				`No local deletion hook is configured for ${target.id}`,
			);
		}
		await target.deleteLocal();
	}

	private conflictResult(
		target: PluginFileSyncTarget,
		message: string,
		resolution: PluginFileConflictChoice = "cancel",
	): PluginFileSyncItemResult {
		return {
			id: target.id,
			remotePath: target.remotePath,
			status: "conflict",
			uploaded: false,
			downloaded: false,
			error: message,
			resolution,
		};
	}

	private async syncOneWithState(
		target: PluginFileSyncTarget,
		direction: PluginFileSyncDirection,
		context: { local: PluginFileSyncState; remote: PluginFileSyncState },
	): Promise<PluginFileSyncItemResult> {
		if (target.allowDownload === false && direction === "download") {
			return this.skippedResult(target);
		}

		const local = await target.readLocal();
		const localChecksum =
			local === null ? undefined : await checksum(local);

		if (direction === "upload") {
			if (local === null) return this.skippedResult(target);
			const uploaded = await this.uploadContent(target, local);
			await this.updateState(context, target, local, uploaded.version);
			return {
				id: target.id,
				remotePath: target.remotePath,
				status: "uploaded",
				uploaded: true,
				downloaded: false,
				checksum: uploaded.checksum,
				version: uploaded.version,
			};
		}

		const remoteText = await this.options.remote.readText(
			target.remotePath,
		);
		const remote = remoteText
			? await this.readEnvelope(target, remoteText)
			: null;

		if (direction === "download") {
			if (!remote) return this.skippedResult(target);
			if (local !== remote.plaintext) {
				await this.backupBeforeReplacement(
					target,
					local,
					"replacement",
				);
				await target.writeLocal(remote.plaintext);
			}
			await this.updateState(
				context,
				target,
				remote.plaintext,
				remote.version,
			);
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

		if (target.allowDownload === false) {
			if (local === null) return this.skippedResult(target);
			const uploaded = await this.uploadContent(target, local);
			await this.updateState(context, target, local, uploaded.version);
			return {
				id: target.id,
				remotePath: target.remotePath,
				status: "uploaded",
				uploaded: true,
				downloaded: false,
				checksum: uploaded.checksum,
				version: uploaded.version,
			};
		}

		const previous =
			context.local.entries[target.id] ??
			context.remote.entries[target.id];
		const localStateEntry = context.local.entries[target.id];
		const remoteStateEntry = context.remote.entries[target.id];
		const remoteDeletionKnown = Boolean(
			!remote &&
			remoteStateEntry &&
			!remoteStateEntry.exists &&
			(!previous?.checksum ||
				remoteStateEntry.checksum === previous.checksum),
		);
		const unknownRemoteDisappearance = Boolean(
			!remote && previous?.exists && !remoteDeletionKnown,
		);

		if (!previous) {
			if (!local && !remote) return this.skippedResult(target);
			if (!local && remote) {
				await target.writeLocal(remote.plaintext);
				await this.updateState(
					context,
					target,
					remote.plaintext,
					remote.version,
				);
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
			if (local && !remote) {
				const uploaded = await this.uploadContent(target, local);
				await this.updateState(
					context,
					target,
					local,
					uploaded.version,
				);
				return {
					id: target.id,
					remotePath: target.remotePath,
					status: "uploaded",
					uploaded: true,
					downloaded: false,
					checksum: uploaded.checksum,
					version: uploaded.version,
				};
			}
			if (local && remote) {
				if (localChecksum === remote.checksum) {
					await this.updateState(
						context,
						target,
						local,
						remote.version,
					);
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
				return this.resolvePluginConflict(
					target,
					local,
					remote.plaintext,
					undefined,
					localChecksum,
					remote.checksum,
					false,
					false,
					context,
				);
			}
		}

		// A new device has no local observation yet. An absent local file is not
		// a deletion until this device has recorded the file locally.
		if (!localStateEntry && local === null && remote) {
			await target.writeLocal(remote.plaintext);
			await this.updateState(
				context,
				target,
				remote.plaintext,
				remote.version,
			);
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

		const localChanged = localStateEntry
			? (local !== null) !== localStateEntry.exists ||
				(localChecksum ?? "") !== (localStateEntry.checksum ?? "")
			: Boolean(
					local !== null &&
					(!previous ||
						!previous.exists ||
						localChecksum !== previous.checksum),
				);
		const remoteChanged = remote
			? !previous ||
				!previous.exists ||
				remote.checksum !== previous.checksum
			: remoteDeletionKnown;

		if (unknownRemoteDisappearance || (localChanged && remoteChanged)) {
			return this.resolvePluginConflict(
				target,
				local,
				remote?.plaintext ?? null,
				previous?.checksum,
				localChecksum,
				remote?.checksum,
				remoteDeletionKnown,
				unknownRemoteDisappearance,
				context,
			);
		}

		if (!localChanged && !remoteChanged) {
			if (!previous && (local || remote)) {
				await this.updateState(
					context,
					target,
					local ?? remote!.plaintext,
					remote?.version,
				);
			}
			return {
				id: target.id,
				remotePath: target.remotePath,
				status: "skipped",
				uploaded: false,
				downloaded: false,
				checksum: localChecksum ?? remote?.checksum,
				version: remote?.version,
			};
		}

		if (localChanged) {
			if (local === null) {
				await this.deleteRemote(target);
				await this.updateState(
					context,
					target,
					null,
					undefined,
					"local",
				);
				return {
					id: target.id,
					remotePath: target.remotePath,
					status: "uploaded",
					uploaded: true,
					downloaded: false,
				};
			}
			const uploaded = await this.uploadContent(target, local);
			await this.updateState(context, target, local, uploaded.version);
			return {
				id: target.id,
				remotePath: target.remotePath,
				status: "uploaded",
				uploaded: true,
				downloaded: false,
				checksum: uploaded.checksum,
				version: uploaded.version,
			};
		}

		if (remote) {
			await this.backupBeforeReplacement(target, local, "replacement");
			await target.writeLocal(remote.plaintext);
			await this.updateState(
				context,
				target,
				remote.plaintext,
				remote.version,
			);
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

		await this.deleteLocal(target, local);
		await this.updateState(context, target, null, undefined, "remote");
		return {
			id: target.id,
			remotePath: target.remotePath,
			status: "downloaded",
			uploaded: false,
			downloaded: true,
		};
	}

	private async resolvePluginConflict(
		target: PluginFileSyncTarget,
		local: string | null,
		remote: string | null,
		baseChecksum: string | undefined,
		localChecksum: string | undefined,
		remoteChecksum: string | undefined,
		remoteDeletionKnown: boolean,
		unknownRemoteDisappearance: boolean,
		context: { local: PluginFileSyncState; remote: PluginFileSyncState },
	): Promise<PluginFileSyncItemResult> {
		const choice = this.resolveConflict
			? await this.resolveConflict({
					target,
					localContent: local,
					remoteContent: remote,
					baseChecksum,
					localChecksum,
					remoteChecksum,
					remoteDeletionKnown,
					unknownRemoteDisappearance,
				})
			: "cancel";

		if (choice === "cancel") {
			return this.conflictResult(
				target,
				unknownRemoteDisappearance
					? "remote item disappeared without a deletion record"
					: "local and remote contents both changed",
				choice,
			);
		}

		if (choice === "both") {
			if (remote !== null) {
				if (target.writeConflictCopy) {
					await target.writeConflictCopy(remote);
				} else {
					await this.backupBeforeReplacement(
						target,
						remote,
						"conflict",
					);
				}
			}
			return this.conflictResult(
				target,
				"kept local and remote versions; no shared state was advanced",
				choice,
			);
		}

		if (choice === "local") {
			if (local === null) {
				await this.deleteRemote(target);
				await this.updateState(
					context,
					target,
					null,
					undefined,
					"local",
				);
				return {
					id: target.id,
					remotePath: target.remotePath,
					status: "uploaded",
					uploaded: true,
					downloaded: false,
					resolution: choice,
				};
			}
			const uploaded = await this.uploadContent(target, local);
			await this.updateState(
				context,
				target,
				local,
				uploaded.version,
				"local",
			);
			return {
				id: target.id,
				remotePath: target.remotePath,
				status: "uploaded",
				uploaded: true,
				downloaded: false,
				checksum: uploaded.checksum,
				version: uploaded.version,
				resolution: choice,
			};
		}

		if (remote !== null) {
			await this.backupBeforeReplacement(target, local, "replacement");
			await target.writeLocal(remote);
			await this.updateState(
				context,
				target,
				remote,
				undefined,
				"remote",
			);
			return {
				id: target.id,
				remotePath: target.remotePath,
				status: "downloaded",
				uploaded: false,
				downloaded: true,
				checksum: remoteChecksum,
				resolution: choice,
			};
		}

		await this.deleteLocal(target, local);
		await this.updateState(context, target, null, undefined, "remote");
		return {
			id: target.id,
			remotePath: target.remotePath,
			status: "downloaded",
			uploaded: false,
			downloaded: true,
			resolution: choice,
		};
	}

	private async syncOneLegacy(
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
		return this.readEnvelopeForId(target.id, remoteText);
	}

	private async readEnvelopeForId(
		itemId: string,
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
			envelope.itemId !== itemId ||
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
	"exists" | "read" | "write" | "process" | "rename" | "remove" | "mkdir"
>;
