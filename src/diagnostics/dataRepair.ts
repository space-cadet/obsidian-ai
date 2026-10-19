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
}
export interface RepairPlan {
	version: 1;
	createdAt: string;
	changes: RepairChange[];
	skipped: { path: string; reason: string }[];
	omittedSkipped: number;
}
interface Write {
	path: string;
	before: string;
	after: string;
	description: string;
}
const object = (v: unknown): v is Record<string, any> =>
	!!v && typeof v === "object" && !Array.isArray(v);
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const requestPath = (root: string) => `${root}/health-repair-request.json`;
const runningPath = (root: string) => `${root}/health-repair-running.json`;
const resultPath = (root: string) => `${root}/health-repair-result.json`;

/** Read-only proposal. Only identical serialized records with the same ID are removed. */
async function prepare(
	adapter: HealthAdapter,
	root: string,
): Promise<{ plan: RepairPlan; writes: Write[] }> {
	const plan: RepairPlan = {
		version: 1,
		createdAt: new Date().toISOString(),
		changes: [],
		skipped: [],
		omittedSkipped: 0,
	};
	const writes: Write[] = [];
	let bytes = 0,
		files = 0;
	const skip = (path: string, reason: string) => {
		if (plan.skipped.length < 500) plan.skipped.push({ path, reason });
		else plan.omittedSkipped++;
	};
	const read = async (path: string) => {
		try {
			if (!(await adapter.exists(path))) {
				skip(path, "File missing; no replacement is guessed.");
				return;
			}
			const stat = await adapter.stat(path);
			if (
				!stat ||
				stat.type !== "file" ||
				stat.size > MAX_FILE_BYTES ||
				bytes + stat.size > MAX_TOTAL_BYTES ||
				++files > 1000
			) {
				skip(
					path,
					"File exceeds repair limits or is not a readable file.",
				);
				return;
			}
			bytes += stat.size;
			const raw = await adapter.read(path);
			await new Promise((resolve) => setTimeout(resolve, 0));
			return raw;
		} catch {
			skip(path, "File could not be read.");
		}
	};
	const change = (
		path: string,
		before: string,
		after: string,
		description: string,
	) => {
		if (before !== after) writes.push({ path, before, after, description });
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
	if (await adapter.exists(indexPath)) {
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
					for (const entry of index.sessions) {
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
							);
						}
						if (entry.messageCount !== result.kept.length) {
							entry.messageCount = result.kept.length;
							indexChanged = true;
						}
					}
					const known = new Set(index.sessions.map((s: any) => s.id));
					if (
						index.activeSessionId != null &&
						!known.has(index.activeSessionId)
					) {
						index.activeSessionId = null;
						indexChanged = true;
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
							index.openSessionIds = tabs;
							indexChanged = true;
						}
					}
					if (indexChanged)
						change(
							indexPath,
							raw,
							JSON.stringify(index, null, 2),
							"Correct validated transcript counts and stale or repeated tab references.",
						);
				}
			}
		}
	}
	for (const name of ["memory", "core", "staged", "archive"]) {
		const path = `${root}/intelligence/${name}.json`;
		if (!(await adapter.exists(path))) continue;
		const raw = await read(path);
		if (raw === undefined) continue;
		let entries: unknown;
		try {
			entries = JSON.parse(raw);
		} catch {
			skip(path, "Invalid JSON; memory left unchanged.");
			continue;
		}
		if (!Array.isArray(entries)) {
			skip(path, "Memory store is not an array; left unchanged.");
			continue;
		}
		const result = deduplicate(
			entries,
			path,
			(m) =>
				object(m) &&
				typeof m.id === "string" &&
				!!m.id &&
				typeof m.content === "string" &&
				[
					"user_fact",
					"project",
					"preference",
					"insight",
					"reference",
				].includes(m.category) &&
				Array.isArray(m.tags) &&
				m.tags.every((tag: unknown) => typeof tag === "string") &&
				typeof m.timestamp === "string" &&
				Number.isFinite(Date.parse(m.timestamp)) &&
				(name === "memory" ||
					([m.score, m.accessCount].every(
						(value) =>
							typeof value === "number" && Number.isFinite(value),
					) &&
						m.accessCount >= 0 &&
						[m.createdAt, m.lastAccessed].every(
							(value) =>
								typeof value === "string" &&
								Number.isFinite(Date.parse(value)),
						))),
		);
		if (result?.removed)
			change(
				path,
				raw,
				JSON.stringify(result.kept, null, 2),
				`Remove ${result.removed} identical duplicate memory record(s).`,
			);
	}
	for (const w of writes)
		plan.changes.push({
			path: w.path,
			beforeHash: await checksum(w.before),
			afterHash: await checksum(w.after),
			description: w.description,
		});
	return { plan, writes };
}
export async function previewDataRepair(
	adapter: HealthAdapter,
	root: string,
): Promise<RepairPlan> {
	return (await prepare(adapter, root)).plan;
}

/** Scheduling changes only the request file; user data is touched during the next cold load. */
export async function scheduleDataRepair(
	adapter: RepairAdapter,
	root: string,
	plan: RepairPlan,
): Promise<void> {
	if (!plan.changes.length) throw new Error("No safe repairs to schedule.");
	if (await adapter.exists(runningPath(root)))
		throw new Error(
			"An interrupted repair needs review first. Check health-repair-running.json and its backup folder.",
		);
	const current = await previewDataRepair(adapter, root);
	if (JSON.stringify(current.changes) !== JSON.stringify(plan.changes))
		throw new Error("Files changed since the preview. Preview again.");
	await adapter.write(requestPath(root), JSON.stringify(plan, null, 2));
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
			!Array.isArray(approved.changes)
		)
			throw new Error("Invalid repair request.");
		const { plan, writes } = await prepare(adapter, root);
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
