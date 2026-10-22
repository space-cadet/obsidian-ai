/** Read-only checks. Never use storage loaders: they can migrate or mutate caches. */
export interface HealthAdapter {
	exists(path: string): Promise<boolean>;
	read(path: string): Promise<string>;
	stat(path: string): Promise<{ size: number; type: string } | null>;
	list(path: string): Promise<{ files: string[]; folders: string[] }>;
}
export interface HealthFinding {
	severity: "error" | "warning" | "info";
	code: string;
	path: string;
	line?: number;
	message: string;
	suggestion: string;
}
export interface HealthReport {
	startedAt: string;
	finishedAt: string;
	filesChecked: number;
	filesSkipped: number;
	counts: Record<HealthFinding["severity"], number>;
	findings: HealthFinding[];
	omittedFindings: number;
	limitations: string[];
}
const object = (v: unknown): v is Record<string, any> =>
	!!v && typeof v === "object" && !Array.isArray(v);
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 3000;
const categories = new Set([
	"user_fact",
	"project",
	"preference",
	"insight",
	"reference",
]);

export async function checkDataHealth(
	adapter: HealthAdapter,
	root: string,
	expectedId: string,
	progress?: (files: number) => void,
): Promise<HealthReport> {
	const report: HealthReport = {
		startedAt: new Date().toISOString(),
		finishedAt: "",
		filesChecked: 0,
		filesSkipped: 0,
		counts: { error: 0, warning: 0, info: 0 },
		findings: [],
		omittedFindings: 0,
		limitations: [
			"Read-only snapshot; files can change during a scan. Pause chat and sync for consistent results.",
			"Checks structure and references, not code authenticity, semantic correctness, remote copies, or every nested tool payload.",
			"Reads at most 3000 files, up to 8 MiB each; oversized or unreadable files are reported. Reports contain paths and record numbers, never message text, memory content, or settings values.",
		],
	};
	const add = (
		severity: HealthFinding["severity"],
		code: string,
		path: string,
		message: string,
		suggestion = "Back up plugin data before any manual repair.",
		line?: number,
	) => {
		report.counts[severity]++;
		if (report.findings.length < 500)
			report.findings.push({
				severity,
				code,
				path,
				message,
				suggestion,
				...(line == null ? {} : { line }),
			});
		else report.omittedFindings++;
	};
	const exists = async (path: string) => {
		try {
			return await adapter.exists(path);
		} catch {
			report.filesSkipped++;
			add(
				"error",
				"unreadable",
				path,
				"Could not check file existence.",
				"Check device storage and file permissions, then rerun.",
			);
			return false;
		}
	};
	const read = async (path: string): Promise<string | undefined> => {
		if (report.filesChecked + report.filesSkipped >= MAX_FILES) {
			report.filesSkipped++;
			add(
				"warning",
				"scan-limit",
				path,
				"File skipped because the scan limit was reached.",
			);
			return;
		}
		try {
			const stat = await adapter.stat(path);
			if (!stat || stat.type !== "file") {
				add("error", "missing-file", path, "Expected a readable file.");
				return;
			}
			if (stat.size > MAX_BYTES) {
				report.filesSkipped++;
				add(
					"warning",
					"oversized-file",
					path,
					"File exceeds the 8 MiB scan limit; contents were not checked.",
					"Inspect a backup on desktop; file size alone does not establish corruption.",
				);
				return;
			}
			const raw = await adapter.read(path);
			report.filesChecked++;
			progress?.(report.filesChecked);
			// Yield between files so the mobile UI can update.
			await new Promise((resolve) => window.setTimeout(resolve, 0));
			return raw;
		} catch {
			report.filesSkipped++;
			add(
				"error",
				"unreadable",
				path,
				"File could not be read.",
				"Check device storage and permissions; retry after sync has finished.",
			);
		}
	};
	const json = async (path: string) => {
		const raw = await read(path);
		if (raw === undefined) return undefined;
		try {
			return JSON.parse(raw) as unknown;
		} catch {
			add(
				"error",
				"invalid-json",
				path,
				"File is not valid JSON.",
				"Compare with a known-good backup; do not overwrite the original.",
			);
			return undefined;
		}
	};
	const localPath = (value: unknown, owner: string): string | undefined => {
		if (
			typeof value !== "string" ||
			!value ||
			value.startsWith("/") ||
			/[\\\x00-\x1f]/.test(value) ||
			value.split("/").some((p) => p === ".." || p === "." || !p)
		) {
			add(
				"error",
				"invalid-path",
				owner,
				"Invalid plugin-relative file reference; it was not followed.",
			);
			return;
		}
		return `${root}/${value}`;
	};
	const lines = (
		raw: string,
		path: string,
		visit: (value: unknown, line: number) => void,
	) => {
		let start = 0,
			line = 1;
		while (start < raw.length) {
			let end = raw.indexOf("\n", start);
			if (end < 0) end = raw.length;
			const text = raw.slice(start, end).trim();
			if (text) {
				try {
					visit(JSON.parse(text), line);
				} catch {
					add(
						"error",
						"invalid-jsonl",
						path,
						"Record is not valid JSON.",
						"Compare this record with a backup; retain the original file.",
						line,
					);
				}
			}
			start = end + 1;
			line++;
		}
	};
	const validateMessages = (values: unknown[], path: string) => {
		const ids = new Set<string>();
		let valid = 0;
		values.forEach((m, i) => {
			if (
				!object(m) ||
				typeof m.id !== "string" ||
				!m.id ||
				!["user", "assistant", "system"].includes(m.role) ||
				typeof m.content !== "string"
			) {
				add(
					"error",
					"invalid-message",
					path,
					`Message ${i + 1} has invalid id, role, or content.`,
				);
				return;
			}
			valid++;
			if (ids.has(m.id))
				add(
					"warning",
					"duplicate-message-id",
					path,
					`Message ${i + 1} repeats an ID; this can represent an append/update history and needs review.`,
					"Compare repeated records before deciding whether any are redundant.",
				);
			ids.add(m.id);
		});
		return valid;
	};
	const inspectTranscript = (
		path: string,
		raw: string,
		expectedMessageCount?: number,
	) => {
		let records = 0;
		let valid = 0;
		const ids = new Set<string>();
		lines(raw, path, (m, line) => {
			records++;
			if (
				!object(m) ||
				typeof m.id !== "string" ||
				!m.id ||
				!["user", "assistant", "system"].includes(m.role) ||
				typeof m.content !== "string"
			) {
				add(
					"error",
					"invalid-message",
					path,
					"Message has invalid id, role, or content.",
					undefined,
					line,
				);
				return;
			}
			valid++;
			if (ids.has(m.id))
				add(
					"warning",
					"duplicate-message-id",
					path,
					"Repeated message ID; review append/update history.",
					"Compare repeated records before deciding whether any are redundant.",
					line,
				);
			ids.add(m.id);
		});
		if (
			expectedMessageCount !== undefined &&
			valid !== expectedMessageCount
		)
			add(
				"warning",
				"message-count-mismatch",
				path,
				`Index expects ${expectedMessageCount} messages; found ${valid} structurally valid records (${records} parsed records).`,
				"Pause sync and rerun; compare index and transcript backups if the mismatch persists.",
			);
	};
	for (const file of [
		"manifest.json",
		"main.js",
		"styles.css",
		"data.json",
	]) {
		const path = `${root}/${file}`;
		if (!(await exists(path))) {
			add(
				file === "data.json" ? "warning" : "error",
				"missing-plugin-file",
				path,
				"Plugin file is missing.",
				file === "data.json"
					? "A fresh installation may not have saved settings yet."
					: "Reinstall the same plugin version after backing up plugin data.",
			);
			continue;
		}
		if (file === "main.js" || file === "styles.css") {
			try {
				const stat = await adapter.stat(path);
				if (!stat || stat.type !== "file" || stat.size === 0)
					add(
						"error",
						"empty-plugin-file",
						path,
						"Plugin asset is empty or is not a file.",
					);
			} catch {
				report.filesSkipped++;
				add(
					"error",
					"unreadable",
					path,
					"Plugin asset metadata could not be read.",
				);
			}
			continue;
		}
		const data = await json(path);
		if (data !== undefined && !object(data))
			add("error", "invalid-object", path, "Expected a JSON object.");
		if (
			object(data) &&
			file === "manifest.json" &&
			(data.id !== expectedId || typeof data.version !== "string")
		)
			add(
				"error",
				"invalid-manifest",
				path,
				"Manifest identity or version is invalid.",
			);
		if (object(data) && file === "data.json") {
			if (object(data.chatData) && Array.isArray(data.chatData.sessions))
				for (const s of data.chatData.sessions) {
					if (!object(s) || !Array.isArray(s.messages))
						add(
							"error",
							"invalid-legacy-session",
							path,
							"Legacy session is missing its messages array.",
						);
					else validateMessages(s.messages, path);
				}
			if (Array.isArray(data.chatMessages))
				validateMessages(data.chatMessages, path);
		}
	}
	const indexPath = `${root}/sessions/index.json`;
	const referenced = new Set<string>();
	let indexKnown = false;
	if (await exists(indexPath)) {
		const index = await json(indexPath);
		if (!object(index) || !Array.isArray(index.sessions))
			add(
				"error",
				"invalid-session-index",
				indexPath,
				"Session index must contain a sessions array.",
			);
		else {
			indexKnown = true;
			if (index.version !== 1)
				add(
					"warning",
					"index-version",
					indexPath,
					"Unrecognized session index version; checks may be incomplete.",
				);
			const ids = new Set<string>();
			for (const entry of index.sessions) {
				if (
					!object(entry) ||
					typeof entry.id !== "string" ||
					!entry.id
				) {
					add(
						"error",
						"invalid-session",
						indexPath,
						"Session entry has no valid ID.",
					);
					continue;
				}
				if (ids.has(entry.id))
					add(
						"error",
						"duplicate-session-id",
						indexPath,
						"Multiple session entries have the same ID.",
					);
				ids.add(entry.id);
				const path = localPath(entry.filePath, indexPath);
				if (!path) continue;
				if (referenced.has(path))
					add(
						"error",
						"shared-transcript",
						path,
						"Multiple index entries reference this transcript.",
					);
				referenced.add(path);
				if (
					!Number.isInteger(entry.messageCount) ||
					entry.messageCount < 0
				)
					add(
						"error",
						"invalid-message-count",
						indexPath,
						"Session has an invalid expected message count.",
					);
				if (!(await exists(path))) {
					// Draft-only sessions with no messages intentionally have no
					// transcript file. Missing content is a finding only when the
					// index says messages should exist.
					if (entry.messageCount !== 0) {
						add(
							"error",
							"missing-transcript",
							path,
							"Indexed session transcript is missing.",
							"Check sync completion and backups; do not delete the index entry automatically.",
						);
					}
				} else {
					const raw = await read(path);
					if (raw !== undefined)
						inspectTranscript(path, raw, entry.messageCount);
				}
				if (entry.draftAttachmentsFile != null) {
					const draft = localPath(
						entry.draftAttachmentsFile,
						indexPath,
					);
					if (draft) {
						referenced.add(draft);
						if (!(await exists(draft)))
							add(
								"warning",
								"missing-draft",
								draft,
								"Referenced attachment draft file is missing.",
							);
						else {
							const value = await json(draft);
							if (value !== undefined && !Array.isArray(value))
								add(
									"error",
									"invalid-draft",
									draft,
									"Attachment draft must be an array.",
								);
						}
					}
				}
			}
			if (
				index.activeSessionId != null &&
				!ids.has(index.activeSessionId)
			)
				add(
					"warning",
					"unknown-active-session",
					indexPath,
					"Active session reference is absent from the index.",
				);
			if (index.openSessionIds != null) {
				if (!Array.isArray(index.openSessionIds))
					add(
						"error",
						"invalid-tabs",
						indexPath,
						"Open session references must be an array.",
					);
				else {
					const seen = new Set();
					for (const id of index.openSessionIds) {
						if (!ids.has(id))
							add(
								"warning",
								"unknown-tab",
								indexPath,
								"Open tab references an unknown session.",
							);
						if (seen.has(id))
							add(
								"warning",
								"duplicate-tab",
								indexPath,
								"Open tab reference is repeated.",
							);
						seen.add(id);
					}
				}
			}
		}
	}
	const sessionDir = `${root}/sessions`;
	if (await exists(sessionDir)) {
		try {
			const listing = await adapter.list(sessionDir);
			for (const path of listing.files) {
				if (path.endsWith(".jsonl") && !referenced.has(path)) {
					add(
						"warning",
						"unindexed-transcript",
						path,
						indexKnown
							? "Transcript is not referenced by the session index."
							: "Transcript could not be matched to a valid session index.",
						"Keep the file; check whether it should be recovered into history.",
					);
					const raw = await read(path);
					if (raw !== undefined) {
						if (!raw.trim())
							add(
								"info",
								"empty-unindexed-transcript",
								path,
								"Unindexed transcript contains no records.",
								"Keep it until you confirm it is not part of an interrupted write.",
							);
						else inspectTranscript(path, raw);
					}
				}
			}
			if (listing.folders.length)
				add(
					"info",
					"unscanned-session-folders",
					sessionDir,
					"Nested folders are not searched for unindexed transcripts.",
				);
		} catch {
			report.filesSkipped++;
			add(
				"error",
				"unreadable-directory",
				sessionDir,
				"Session directory could not be listed.",
			);
		}
	}
	const tierIds = new Set<string>();
	for (const name of ["memory", "core", "staged", "archive"]) {
		const path = `${root}/intelligence/${name}.json`;
		if (!(await exists(path))) continue;
		const entries = await json(path);
		if (entries === undefined) continue;
		if (!Array.isArray(entries)) {
			add(
				"error",
				"invalid-memory-store",
				path,
				"Memory store must be an array.",
			);
			continue;
		}
		const ids = new Set<string>();
		entries.forEach((entry, i) => {
			if (
				!object(entry) ||
				typeof entry.id !== "string" ||
				!entry.id ||
				typeof entry.content !== "string" ||
				!categories.has(entry.category) ||
				!Array.isArray(entry.tags) ||
				!entry.tags.every((t: unknown) => typeof t === "string") ||
				typeof entry.timestamp !== "string" ||
				!Number.isFinite(Date.parse(entry.timestamp))
			) {
				add(
					"error",
					"invalid-memory-entry",
					path,
					`Memory entry ${i + 1} has invalid required fields.`,
				);
				return;
			}
			if (ids.has(entry.id))
				add(
					"error",
					"duplicate-memory-id",
					path,
					`Memory entry ${i + 1} repeats an ID.`,
				);
			ids.add(entry.id);
			if (name !== "memory") {
				if (tierIds.has(entry.id))
					add(
						"warning",
						"cross-tier-memory-id",
						path,
						`Memory entry ${i + 1} also occurs in another tier.`,
					);
				tierIds.add(entry.id);
				if (
					![entry.score, entry.accessCount].every(
						(n) => typeof n === "number" && Number.isFinite(n),
					) ||
					entry.accessCount < 0 ||
					![entry.createdAt, entry.lastAccessed].every(
						(t) =>
							typeof t === "string" &&
							Number.isFinite(Date.parse(t)),
					)
				)
					add(
						"warning",
						"invalid-memory-metadata",
						path,
						`Memory entry ${i + 1} has invalid scoring or access metadata.`,
					);
			}
		});
	}
	const metadata = `${root}/intelligence/memory-metadata.json`;
	if (await exists(metadata)) {
		const value = await json(metadata);
		if (
			value !== undefined &&
			(!object(value) ||
				value.version !== 1 ||
				!["initialized", "migrated"].includes(value.status) ||
				![value.coreCount, value.stagedCount, value.archiveCount].every(
					(n) => Number.isInteger(n) && n >= 0,
				))
		)
			add(
				"warning",
				"invalid-memory-metadata",
				metadata,
				"Memory metadata has an unexpected structure.",
			);
	}
	const audit = `${root}/intelligence/memory-audit.jsonl`;
	if (await exists(audit)) {
		const raw = await read(audit);
		if (raw !== undefined)
			lines(raw, audit, (entry, line) => {
				if (
					!object(entry) ||
					typeof entry.timestamp !== "string" ||
					!Number.isFinite(Date.parse(entry.timestamp)) ||
					typeof entry.operation !== "string"
				)
					add(
						"error",
						"invalid-memory-audit",
						audit,
						"Audit entry has invalid timestamp or operation.",
						undefined,
						line,
					);
			});
	}
	report.finishedAt = new Date().toISOString();
	return report;
}
