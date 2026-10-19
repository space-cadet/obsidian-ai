import type { HealthAdapter } from "./dataHealth";
import { checksum } from "../sync/EncryptionLayer";

export interface RepairAdapter extends HealthAdapter {
	write(path: string, data: string): Promise<void>;
	mkdir(path: string): Promise<void>;
	remove(path: string): Promise<void>;
}
export interface RepairChange {
	path: string;
	beforeHash: string;
	afterHash: string;
	description: string;
	repairCount: number;
}
export interface RepairPlan {
	version: 1;
	createdAt: string;
	changes: RepairChange[];
	safeRepairCount: number;
	recoverableChats: RecoverableChat[];
	skipped: { path: string; reason: string }[];
	omittedSkipped: number;
}
export interface RepairProgress {
	phase: string;
	completed: number;
	total: number;
}
export interface RecoverableChat {
	path: string;
	id: string;
	title: string;
	messageCount: number;
	duplicateCount: number;
	createdAt: number;
	updatedAt: number;
}
interface Write {
	path: string;
	before: string;
	after: string;
	description: string;
	repairCount: number;
}
const object = (v: unknown): v is Record<string, any> =>
	!!v && typeof v === "object" && !Array.isArray(v);
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 1000;
const requestPath = (root: string) => `${root}/health-repair-request.json`;
const runningPath = (root: string) => `${root}/health-repair-running.json`;
const resultPath = (root: string) => `${root}/health-repair-result.json`;

/** Read-only proposal. Only identical serialized records with the same ID are removed. */
async function prepare(
	adapter: HealthAdapter,
	root: string,
	selectedRecoveryPaths: string[] = [],
	onProgress?: (progress: RepairProgress) => void,
): Promise<{ plan: RepairPlan; writes: Write[] }> {
	const plan: RepairPlan = {
		version: 1,
		createdAt: new Date().toISOString(),
		changes: [],
		safeRepairCount: 0,
		recoverableChats: [],
		skipped: [],
		omittedSkipped: 0,
	};
	const writes: Write[] = [];
	let files = 0;
	const skip = (path: string, reason: string) => {
		if (plan.skipped.length < 500) plan.skipped.push({ path, reason });
		else plan.omittedSkipped++;
	};
	const reportProgress = async (
		phase: string,
		completed: number,
		total: number,
	) => {
		onProgress?.({ phase, completed, total });
		// Give Obsidian a chance to paint the progress update before reading the next file.
		await new Promise((resolve) => setTimeout(resolve, 0));
	};
	const read = async (path: string) => {
		try {
			if (!(await adapter.exists(path))) {
				skip(path, "File missing; no replacement is guessed.");
				return;
			}
			const stat = await adapter.stat(path);
			if (!stat) {
				skip(
					path,
					"File metadata could not be read; file left unchanged.",
				);
				return;
			}
			if (stat.type !== "file") {
				skip(path, `Expected a regular file, found ${stat.type}.`);
				return;
			}
			if (!Number.isFinite(stat.size) || stat.size < 0) {
				skip(
					path,
					"File size could not be determined; file left unchanged.",
				);
				return;
			}
			if (stat.size > MAX_FILE_BYTES) {
				const sizeMiB = (stat.size / (1024 * 1024)).toFixed(1);
				skip(
					path,
					`File is ${sizeMiB} MiB; the per-file preview limit is 8 MiB. File left unchanged.`,
				);
				return;
			}
			if (files >= MAX_FILES) {
				skip(
					path,
					`Repair scan limit reached after ${MAX_FILES} files; this file was left unchanged.`,
				);
				return;
			}
			files++;
			const raw = await adapter.read(path);
			await new Promise((resolve) => setTimeout(resolve, 0));
			return raw;
		} catch (error) {
			const detail =
				error instanceof Error && error.message
					? error.message
					: "storage access error";
			skip(path, `Could not read file metadata or contents: ${detail}.`);
		}
	};
	const change = (
		path: string,
		before: string,
		after: string,
		description: string,
		repairCount = 1,
	) => {
		if (before !== after)
			writes.push({ path, before, after, description, repairCount });
	};
	const deduplicate = (
		records: unknown[],
		path: string,
		valid: (v: unknown) => boolean,
	) => {
		const seen = new Map<string, string>();
		const kept: unknown[] = [];
		let removed = 0;
		for (const record of records) {
			if (!object(record) || !valid(record)) {
				skip(path, "Invalid record; entire file left unchanged.");
				return;
			}
			const serialized = JSON.stringify(record);
			if (seen.has(record.id)) {
				if (seen.get(record.id) !== serialized) {
					skip(
						path,
						"Same ID has different content; entire file left unchanged.",
					);
					return;
				}
				removed++;
			} else {
				seen.set(record.id, serialized);
				kept.push(record);
			}
		}
		return { kept, removed };
	};
	const indexPath = `${root}/sessions/index.json`;
	if (!(await adapter.exists(indexPath))) {
		skip(
			indexPath,
			"Session index is missing; unindexed transcripts cannot be recovered automatically.",
		);
	} else {
		const raw = await read(indexPath);
		if (raw !== undefined) {
			let index: any;
			try {
				index = JSON.parse(raw);
			} catch {
				skip(indexPath, "Invalid JSON; index left unchanged.");
			}
			if (index !== undefined) {
				const entriesValid =
					object(index) &&
					index.version === 1 &&
					Array.isArray(index.sessions) &&
					index.sessions.every(
						(s: unknown) =>
							object(s) &&
							typeof s.id === "string" &&
							s.id &&
							typeof s.filePath === "string" &&
							/^sessions\/[^/\\\x00-\x1f]+\.jsonl$/.test(
								s.filePath,
							),
					);
				const uniqueIndex =
					entriesValid &&
					new Set(index.sessions.map((s: any) => s.id)).size ===
						index.sessions.length &&
					new Set(index.sessions.map((s: any) => s.filePath)).size ===
						index.sessions.length;
				if (!uniqueIndex)
					skip(
						indexPath,
						"Invalid or ambiguous session index; session repairs skipped.",
					);
				else {
					let indexChanged = false;
					let indexRepairCount = 0;
					const referenced = new Set<string>(
						index.sessions.map(
							(entry: any) => `${root}/${entry.filePath}`,
						),
					);
					for (let i = 0; i < index.sessions.length; i++) {
						await reportProgress(
							"Checking indexed chats",
							i + 1,
							index.sessions.length,
						);
						const entry = index.sessions[i];
						const path = `${root}/${entry.filePath}`;
						const text = await read(path);
						if (text === undefined) continue;
						const originalLines = text
							.split("\n")
							.filter((l) => l.trim());
						let records: unknown[];
						try {
							records = originalLines.map((l) => JSON.parse(l));
						} catch {
							skip(
								path,
								"Invalid JSONL; entire file left unchanged.",
							);
							continue;
						}
						const result = deduplicate(
							records,
							path,
							(m) =>
								object(m) &&
								typeof m.id === "string" &&
								!!m.id &&
								["user", "assistant", "system"].includes(
									m.role,
								) &&
								typeof m.content === "string",
						);
						if (!result) continue;
						if (
							typeof entry.messageCount === "number" &&
							entry.messageCount > records.length
						) {
							skip(
								path,
								"Index expects more records than exist; possible missing history needs review.",
							);
							continue;
						}
						// Empty files with a positive expected count may represent a failed sync.
						if (
							result.kept.length === 0 &&
							entry.messageCount !== 0
						) {
							skip(
								path,
								"Empty transcript disagrees with index; no history is discarded.",
							);
							continue;
						}
						if (result.removed) {
							const seen = new Set<string>();
							const keptLines = originalLines.filter(
								(line, i) => {
									const id = (records[i] as any).id;
									if (seen.has(id)) return false;
									seen.add(id);
									return true;
								},
							);
							change(
								path,
								text,
								keptLines.join("\n") + "\n",
								`Remove ${result.removed} identical duplicate message record(s).`,
								result.removed,
							);
						}
						// Reconcile a count only when exact duplicate removal fully
						// explains the difference. A count mismatch on its own can
						// indicate missing or unsaved chat history.
						if (
							entry.messageCount !== result.kept.length &&
							result.removed > 0 &&
							entry.messageCount === records.length
						) {
							entry.messageCount = result.kept.length;
							indexChanged = true;
							indexRepairCount++;
						} else if (
							entry.messageCount !== result.kept.length &&
							entry.messageCount !== records.length
						) {
							skip(
								path,
								"Message count does not match the transcript or the exact-duplicate cleanup; left for review.",
							);
						}
					}
					const known = new Set(index.sessions.map((s: any) => s.id));
					const selected = new Set(selectedRecoveryPaths);
					const sessionsDir = `${root}/sessions`;
					try {
						const listing = await adapter.list(sessionsDir);
						const unindexedFiles = listing.files.filter(
							(path) =>
								path.endsWith(".jsonl") &&
								!referenced.has(path),
						);
						for (let i = 0; i < unindexedFiles.length; i++) {
							await reportProgress(
								"Checking unindexed chats",
								i + 1,
								unindexedFiles.length,
							);
							const path = unindexedFiles[i];
							const fileName = path.slice(
								path.lastIndexOf("/") + 1,
							);
							const id = fileName.slice(0, -".jsonl".length);
							if (!/^[A-Za-z0-9_-]+$/.test(id)) {
								skip(
									path,
									"Unsafe transcript name; left unchanged.",
								);
								continue;
							}
							if (known.has(id)) {
								skip(
									path,
									"Transcript ID conflicts with an indexed chat; left unchanged.",
								);
								continue;
							}
							const text = await read(path);
							if (text === undefined) continue;
							const originalLines = text
								.split("\n")
								.filter((line) => line.trim());
							if (!originalLines.length) {
								skip(
									path,
									"Empty unindexed transcript; kept for review.",
								);
								continue;
							}
							let records: unknown[];
							try {
								records = originalLines.map((line) =>
									JSON.parse(line),
								);
							} catch {
								skip(path, "Malformed JSONL; kept for review.");
								continue;
							}
							const result = deduplicate(
								records,
								path,
								(message) =>
									object(message) &&
									typeof message.id === "string" &&
									!!message.id &&
									["user", "assistant", "system"].includes(
										message.role,
									) &&
									typeof message.content === "string",
							);
							if (!result || result.kept.length === 0) continue;
							const timestamps = result.kept
								.map((message: any) => message.timestamp)
								.filter(
									(value: unknown) =>
										typeof value === "number" &&
										Number.isFinite(value),
								);
							if (timestamps.length !== result.kept.length) {
								skip(
									path,
									"Messages lack usable timestamps; chat metadata cannot be reconstructed safely.",
								);
								continue;
							}
							const recovery: RecoverableChat = {
								path,
								id,
								title: `Recovered chat ${id.slice(0, 8)}`,
								messageCount: result.kept.length,
								duplicateCount: result.removed,
								createdAt: Math.min(...timestamps),
								updatedAt: Math.max(...timestamps),
							};
							plan.recoverableChats.push(recovery);
							if (!selected.has(path)) continue;
							if (result.removed) {
								const seenIds = new Set<string>();
								const keptLines = originalLines.filter(
									(line, i) => {
										const messageId = (records[i] as any)
											.id;
										if (seenIds.has(messageId))
											return false;
										seenIds.add(messageId);
										return true;
									},
								);
								change(
									path,
									text,
									keptLines.join("\n") + "\n",
									`Remove ${result.removed} identical duplicate message record(s) while recovering this chat.`,
									result.removed,
								);
							}
							index.sessions.push({
								id,
								title: recovery.title,
								createdAt: recovery.createdAt,
								updatedAt: recovery.updatedAt,
								messageCount: recovery.messageCount,
								filePath: `sessions/${fileName}`,
							});
							known.add(id);
							indexChanged = true;
							indexRepairCount++;
						}
					} catch {
						skip(
							sessionsDir,
							"Session folder could not be scanned for recoverable chats.",
						);
					}
					if (
						index.activeSessionId != null &&
						!known.has(index.activeSessionId)
					) {
						index.activeSessionId = null;
						indexChanged = true;
						indexRepairCount++;
					}
					if (Array.isArray(index.openSessionIds)) {
						const tabs = [
							...new Set(
								index.openSessionIds.filter(
									(id: unknown) =>
										typeof id === "string" && known.has(id),
								),
							),
						];
						if (
							JSON.stringify(tabs) !==
							JSON.stringify(index.openSessionIds)
						) {
							const removedTabs =
								index.openSessionIds.length - tabs.length;
							index.openSessionIds = tabs;
							indexChanged = true;
							indexRepairCount += Math.max(1, removedTabs);
						}
					}
					if (indexChanged)
						change(
							indexPath,
							raw,
							JSON.stringify(index, null, 2),
							"Update verified session counts, recover selected chats, and clear stale or repeated tab references.",
							indexRepairCount,
						);
				}
			}
		}
	}
	for (const w of writes) {
		plan.changes.push({
			path: w.path,
			beforeHash: await checksum(w.before),
			afterHash: await checksum(w.after),
			description: w.description,
			repairCount: w.repairCount,
		});
		plan.safeRepairCount += w.repairCount;
	}
	return { plan, writes };
}
export async function previewDataRepair(
	adapter: HealthAdapter,
	root: string,
	onProgress?: (progress: RepairProgress) => void,
): Promise<RepairPlan> {
	return (await prepare(adapter, root, [], onProgress)).plan;
}

/** Scheduling changes only the request file; user data is touched during the next cold load. */
export async function scheduleDataRepair(
	adapter: RepairAdapter,
	root: string,
	plan: RepairPlan,
	selectedRecoveryPaths: string[] = [],
): Promise<void> {
	if (!plan.changes.length && !selectedRecoveryPaths.length)
		throw new Error("No repairs selected.");
	if (await adapter.exists(runningPath(root)))
		throw new Error(
			"An interrupted repair needs review first. Check health-repair-running.json and its backup folder.",
		);
	if (await adapter.exists(requestPath(root)))
		throw new Error(
			"A repair is already scheduled. Cancel it before scheduling another.",
		);
	const current = await prepare(adapter, root);
	const selectedPlan = await prepare(adapter, root, selectedRecoveryPaths);
	const staleSafeChange = plan.changes.some((approved) => {
		const refreshed = current.plan.changes.find(
			(change) => change.path === approved.path,
		);
		return JSON.stringify(refreshed) !== JSON.stringify(approved);
	});
	const staleSelectedChange = current.plan.changes.some((approved) => {
		const refreshed = selectedPlan.plan.changes.find(
			(change) => change.path === approved.path,
		);
		if (!refreshed || refreshed.beforeHash !== approved.beforeHash)
			return true;
		// Recovering chats also changes the index, so its after hash and
		// operation count naturally differ from the unselected preview.
		return (
			approved.path !== `${root}/sessions/index.json` &&
			(refreshed.afterHash !== approved.afterHash ||
				refreshed.description !== approved.description)
		);
	});
	if (
		staleSafeChange ||
		staleSelectedChange ||
		selectedRecoveryPaths.some(
			(path) =>
				!current.plan.recoverableChats.some(
					(chat) => chat.path === path,
				),
		)
	)
		throw new Error("Files changed since the preview. Preview again.");
	await adapter.write(
		requestPath(root),
		JSON.stringify(
			{
				version: 1,
				changes: selectedPlan.plan.changes,
				selectedRecoveryPaths,
			},
			null,
			2,
		),
	);
	if (await adapter.exists(resultPath(root)))
		await adapter.remove(resultPath(root));
}
export async function cancelDataRepair(
	adapter: RepairAdapter,
	root: string,
): Promise<void> {
	if (await adapter.exists(requestPath(root)))
		await adapter.remove(requestPath(root));
}
export interface RepairResult {
	status: "repaired" | "cancelled" | "failed" | "interrupted";
	message: string;
	backupDir?: string;
	filesChanged: number;
}

/** Must run before storage caches, chat views, intelligence initialization and sync. */
export async function applyPendingDataRepair(
	adapter: RepairAdapter,
	root: string,
): Promise<RepairResult | null> {
	if (await adapter.exists(runningPath(root)))
		return {
			status: "interrupted",
			message:
				"A previous data repair was interrupted. Review health-repair-running.json and its backup folder before scheduling another repair.",
			filesChanged: 0,
		};
	if (!(await adapter.exists(requestPath(root)))) return null;
	let backupDir: string | undefined;
	const written: Write[] = [];
	let markerWritten = false;
	const finish = async (result: RepairResult) => {
		await adapter.write(resultPath(root), JSON.stringify(result, null, 2));
		return result;
	};
	try {
		const stat = await adapter.stat(requestPath(root));
		if (!stat || stat.size > 1024 * 1024)
			throw new Error("Invalid repair request.");
		const approved = JSON.parse(await adapter.read(requestPath(root)));
		if (
			!object(approved) ||
			approved.version !== 1 ||
			!Array.isArray(approved.changes) ||
			!Array.isArray(approved.selectedRecoveryPaths) ||
			!approved.selectedRecoveryPaths.every(
				(path: unknown) => typeof path === "string",
			)
		)
			throw new Error("Invalid repair request.");
		const { plan, writes } = await prepare(
			adapter,
			root,
			approved.selectedRecoveryPaths,
		);
		if (
			JSON.stringify(approved.changes) !== JSON.stringify(plan.changes) ||
			!writes.length
		) {
			await cancelDataRepair(adapter, root);
			return finish({
				status: "cancelled",
				message:
					"Files changed since the preview, or there is nothing left to repair. No data files changed. Preview again.",
				filesChanged: 0,
			});
		}
		const backupRoot = `${root}/health-backups`;
		if (!(await adapter.exists(backupRoot)))
			await adapter.mkdir(backupRoot);
		backupDir = `${backupRoot}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
		await adapter.mkdir(backupDir);
		// All backups are written AND verified before touching any source file.
		for (let i = 0; i < writes.length; i++) {
			const path = `${backupDir}/${i}.original`;
			await adapter.write(path, writes[i].before);
			if (
				(await checksum(await adapter.read(path))) !==
				plan.changes[i].beforeHash
			)
				throw new Error("Backup verification failed.");
		}
		await adapter.write(
			`${backupDir}/manifest.json`,
			JSON.stringify(
				{
					createdAt: plan.createdAt,
					files: plan.changes.map((c, i) => ({
						...c,
						backup: `${i}.original`,
					})),
				},
				null,
				2,
			),
		);
		await adapter.write(
			runningPath(root),
			JSON.stringify({ backupDir, changes: plan.changes }, null, 2),
		);
		markerWritten = true;
		// Consume before mutation so a crash cannot silently replay the repair.
		await cancelDataRepair(adapter, root);
		for (let i = 0; i < writes.length; i++) {
			const w = writes[i];
			if (
				(await checksum(await adapter.read(w.path))) !==
				plan.changes[i].beforeHash
			)
				throw new Error("Source changed during repair.");
			// Track attempted writes as a failed write can still partially modify a file.
			written.push(w);
			await adapter.write(w.path, w.after);
			if (
				(await checksum(await adapter.read(w.path))) !==
				plan.changes[i].afterHash
			)
				throw new Error("Repaired file verification failed.");
		}
		const result = await finish({
			status: "repaired",
			message: `Repaired ${writes.length} file(s). Originals are preserved in ${backupDir}. Run a new health check; ambiguous findings remain unchanged.`,
			backupDir,
			filesChanged: writes.length,
		});
		await adapter.remove(runningPath(root));
		return result;
	} catch {
		// Do not overwrite concurrent external changes during rollback.
		let incomplete = false;
		for (const w of written.reverse()) {
			try {
				const raw = await adapter.read(w.path);
				if (raw === w.before) continue;
				if (raw !== w.after) {
					incomplete = true;
					continue;
				}
				await adapter.write(w.path, w.before);
				if ((await adapter.read(w.path)) !== w.before)
					incomplete = true;
			} catch {
				incomplete = true;
			}
		}
		if (markerWritten && !incomplete) {
			try {
				await adapter.remove(runningPath(root));
			} catch {
				incomplete = true;
			}
		}
		try {
			await cancelDataRepair(adapter, root);
		} catch {
			/* Preserve the request if storage is unavailable. */
		}
		return finish({
			status: incomplete ? "interrupted" : "failed",
			message: incomplete
				? "Repair did not complete and needs manual recovery from the backup folder. An interrupted-repair marker blocks automatic retry."
				: "Repair did not complete. No completed repairs remain; review storage access and preview again.",
			backupDir,
			filesChanged: 0,
		});
	}
}
